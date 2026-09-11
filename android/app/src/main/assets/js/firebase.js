/**
 * Kasir Mami - Real-time Cloud Synchronization with Firebase Firestore
 * Enables seamless multi-device usage (Tablet Kasir & HP Mami)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc, 
  getDocs, 
  onSnapshot, 
  writeBatch,
  query,
  where,
  limit,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { DEFAULT_PRODUCTS, getStorageKeys, MASTER_DEV_HASH, DEFAULT_PRINTER_CONFIG } from './config.js';
import { state, currentStorageKeys, updateUIStoreBranding, getSavedStoresList, removeStoreFromDevice, registerStoreOnDevice } from './state.js';
import { showToast, hashSha256 } from './utils.js';

// Firebase Configuration (Google Firebase Web Public Project Identifier)
export const firebaseConfig = {
  apiKey: "AIzaSyBkSoXy_F41bOdz4U9gldw0zQIaK1FHMNQ",
  authDomain: "kedai-mami.firebaseapp.com",
  projectId: "kedai-mami",
  storageBucket: "kedai-mami.firebasestorage.app",
  messagingSenderId: "827309609612",
  appId: "1:827309609612:web:0a37ebf2c49696d0ace1a9",
  measurementId: "G-QW6CMQMM6P"
};

// Store Identification getter
export function getStoreId() {
  return state.storeId || null;
}

export function unsubscribeAllListeners() {
  listenersUnsubscribe.forEach(unsub => {
    try { if (typeof unsub === 'function') unsub(); } catch (e) {}
  });
  listenersUnsubscribe = [];
}

// Internal Firebase & Firestore instance
let app = null;
let db = null;
let auth = null;
let isInitialized = false;
let isSyncing = false;
let syncStatus = 'connecting'; // 'connecting', 'online', 'offline', 'error'
let listenersUnsubscribe = [];

// Callback for UI updates on remote changes
let onRemoteUpdateCallback = null;
let onRemotePrintJobListener = null;

export function setRemoteUpdateCallback(cb) {
  onRemoteUpdateCallback = cb;
}

export function registerRemotePrintListener(fn) {
  onRemotePrintJobListener = fn;
}

/**
 * Update the UI Cloud Sync indicator
 */
export function updateSyncStatusUI(status, message) {
  syncStatus = status;
  const dotEl = document.getElementById('cloudStatusDot');
  const textEl = document.getElementById('cloudStatusText');
  const modalStatusEl = document.getElementById('cloudModalStatusText');

  const statusMap = {
    online: {
      dot: 'bg-emerald-500',
      pulse: true,
      text: 'Cloud Sinkron',
      color: 'text-emerald-700'
    },
    syncing: {
      dot: 'bg-emerald-600',
      pulse: true,
      text: 'Menyinkronkan...',
      color: 'text-emerald-800'
    },
    offline: {
      dot: 'bg-stone-400',
      pulse: false,
      text: 'Mode Offline',
      color: 'text-stone-600'
    },
    error: {
      dot: 'bg-rose-500',
      pulse: false,
      text: 'Koneksi Gangguan',
      color: 'text-rose-700'
    }
  };

  const current = statusMap[status] || statusMap.offline;

  if (dotEl) {
    dotEl.className = `w-2 h-2 rounded-full ${current.dot} ${current.pulse ? 'animate-pulse' : ''}`;
  }
  const desktopDotEl = document.getElementById('desktopStoreSyncDot');
  if (desktopDotEl) {
    desktopDotEl.className = `w-2 h-2 rounded-full shrink-0 shadow-2xs ${current.dot} ${current.pulse ? 'animate-pulse' : ''}`;
  }
  const mobileDotEl = document.getElementById('mobileStoreSyncDot');
  if (mobileDotEl) {
    mobileDotEl.className = `absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-xs ${current.dot} ${current.pulse ? 'animate-pulse' : ''}`;
  }
  if (textEl) {
    textEl.innerText = current.text;
  }
  const modalStatusDot = document.getElementById('cloudModalStatusDot');
  if (modalStatusDot) {
    modalStatusDot.className = `inline-block align-middle w-2 h-2 rounded-full ${current.dot}`;
  }
  if (modalStatusEl) {
    const label = (message || current.text).replace('Online & Terhubung', 'Online').replace('Mode Offline (Lokal)', 'Offline');
    modalStatusEl.innerText = label;
    modalStatusEl.className = `text-xs ${status === 'error' ? 'text-rose-600' : (status === 'online' || status === 'syncing' ? 'text-emerald-700' : 'text-stone-500')}`;
  }
}

/**
 * Initialize Firebase & Firestore Realtime Listeners
 */
export async function initFirebaseSync() {
  if (isInitialized) return;

  try {
    updateSyncStatusUI('syncing', 'Menghubungkan ke Google Firebase...');

    // Initialize Firebase App
    app = initializeApp(firebaseConfig);
    
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheErr) {
      db = getFirestore(app);
    }

    try {
      auth = getAuth(app);
      onAuthStateChanged(auth, (user) => {
        state.currentUser = user ? {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email || 'Owner',
          photoURL: user.photoURL || ''
        } : null;
        if (typeof window.KasirApp?.updateCloudOwnerAccountUI === 'function') {
          window.KasirApp.updateCloudOwnerAccountUI();
        }
      });
    } catch (authErr) {
      console.warn('Firebase Auth init note:', authErr.message);
    }

    isInitialized = true;

    // Only subscribe to Firestore if a store is actively selected
    if (state.storeId) {
      updateSyncStatusUI('online', 'Online & Terhubung');
      setupRealtimeListeners();
    } else {
      updateSyncStatusUI('offline', 'Belum Masuk Toko');
    }

    // Listen for online/offline browser events
    window.addEventListener('online', () => {
      if (state.storeId) {
        updateSyncStatusUI('online', 'Online & Terhubung');
      } else {
        updateSyncStatusUI('offline', 'Belum Masuk Toko');
      }
    });

    window.addEventListener('offline', () => {
      updateSyncStatusUI('offline', 'Mode Offline (Lokal)');
    });

  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    updateSyncStatusUI('offline', 'Mode Offline (Lokal)');
  }
}

/**
 * Setup Realtime Listeners for Products, Transactions, Expenses, Queues, and Store Profile
 */
export function setupRealtimeListeners() {
  if (!db) return;

  const currentStoreId = getStoreId();

  // Clear existing listeners if any
  unsubscribeAllListeners();

  if (!currentStoreId) {
    updateSyncStatusUI('offline', 'Belum Masuk Toko');
    return;
  }

  updateSyncStatusUI('online', 'Online & Terhubung');

  // 1. PRODUCTS LISTENER
  const productsCol = collection(db, 'stores', currentStoreId, 'products');
  const unsubProducts = onSnapshot(productsCol, (snapshot) => {
    if (snapshot.empty) {
      const savedProds = localStorage.getItem(currentStorageKeys.PRODUCTS);
      // Hanya lakukan seeding jika ini adalah inisialisasi awal toko pertama kali (belum pernah ada key products)
      if (savedProds === null) {
        seedInitialProducts();
      } else {
        // Pengguna sengaja menghapus semua produk atau mengosongkan katalog
        state.products = [];
        localStorage.setItem(currentStorageKeys.PRODUCTS, JSON.stringify([]));
        if (onRemoteUpdateCallback) onRemoteUpdateCallback('products');
      }
    } else {
      const cloudProducts = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isDeleted === true || data.name === '[DELETED]') {
          return; // Lewati menu yang ditandai terhapus
        }
        cloudProducts.push({ 
          id: docSnap.id, 
          name: data.name || 'Menu',
          price: Number(data.price) || 0,
          category: data.category || 'makanan',
          icon: data.icon || 'lunch_dining',
          image: typeof data.image === 'string' ? data.image : '',
          isAvailable: data.isAvailable !== false,
          trackStock: !!data.trackStock,
          stock: data.trackStock ? (data.stock !== undefined && data.stock !== null ? Number(data.stock) : null) : null,
          addOns: Array.isArray(data.addOns) ? data.addOns : [],
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      });

      // Update state and localStorage
      state.products = cloudProducts;
      localStorage.setItem(currentStorageKeys.PRODUCTS, JSON.stringify(cloudProducts));

      if (onRemoteUpdateCallback) onRemoteUpdateCallback('products');
    }
  }, (error) => {
    console.error('Products onSnapshot error:', error);
  });
  listenersUnsubscribe.push(unsubProducts);

  // 2. TRANSACTIONS LISTENER
  const txCol = collection(db, 'stores', currentStoreId, 'transactions');
  const unsubTx = onSnapshot(txCol, (snapshot) => {
    const cloudTransactions = [];
    snapshot.forEach(docSnap => {
      cloudTransactions.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort newest first
    cloudTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update state and localStorage
    state.transactions = cloudTransactions;
    localStorage.setItem(currentStorageKeys.HISTORY, JSON.stringify(cloudTransactions));

    if (onRemoteUpdateCallback) onRemoteUpdateCallback('transactions');
  }, (error) => {
    console.error('Transactions onSnapshot error:', error);
  });
  listenersUnsubscribe.push(unsubTx);

  // 3. EXPENSES LISTENER
  const expCol = collection(db, 'stores', currentStoreId, 'expenses');
  const unsubExp = onSnapshot(expCol, (snapshot) => {
    const cloudExpenses = [];
    snapshot.forEach(docSnap => {
      cloudExpenses.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort newest first
    cloudExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update state and localStorage
    state.expenses = cloudExpenses;
    localStorage.setItem(currentStorageKeys.EXPENSES, JSON.stringify(cloudExpenses));

    if (onRemoteUpdateCallback) onRemoteUpdateCallback('expenses');
  }, (error) => {
    console.error('Expenses onSnapshot error:', error);
  });
  listenersUnsubscribe.push(unsubExp);

  // 4. ORDER QUEUES LISTENER (Shared Antrian / Meja)
  const queuesDocRef = doc(db, 'stores', currentStoreId, 'data', 'queues');
  const unsubQueues = onSnapshot(queuesDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.list) && data.list.length > 0) {
        state.orderQueues = data.list;
        if (!state.orderQueues.some(q => q.id === state.activeQueueId)) {
          state.activeQueueId = state.orderQueues[0].id;
        }
        localStorage.setItem(currentStorageKeys.QUEUES, JSON.stringify(state.orderQueues));
        if (onRemoteUpdateCallback) onRemoteUpdateCallback('queues');
      }
    }
  }, (error) => {
    console.error('Queues onSnapshot error:', error);
  });
  listenersUnsubscribe.push(unsubQueues);

  // 5. CONFIG (QRIS Payload) LISTENER
  const configDocRef = doc(db, 'stores', currentStoreId, 'data', 'config');
  const unsubConfig = onSnapshot(configDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.qrisPayload) {
        state.qrisPayload = data.qrisPayload;
        localStorage.setItem(currentStorageKeys.QRIS, data.qrisPayload);
        if (onRemoteUpdateCallback) onRemoteUpdateCallback('config');
      }
      if (data && data.profile) {
        state.storeProfile = { ...state.storeProfile, ...data.profile };
        localStorage.setItem(currentStorageKeys.PROFILE, JSON.stringify(state.storeProfile));
        updateUIStoreBranding();
      }
      if (data && data.auth) {
        state.auth = { ...state.auth, ...data.auth };
        localStorage.setItem(currentStorageKeys.AUTH, JSON.stringify(state.auth));
      }
      if (data && data.printerConfig) {
        state.printerConfig = { ...state.printerConfig, ...data.printerConfig };
        localStorage.setItem(currentStorageKeys.PRINTER, JSON.stringify(state.printerConfig));
        if (onRemoteUpdateCallback) onRemoteUpdateCallback('printerConfig');
      }
    }
  }, (error) => {
    console.error('Config onSnapshot error:', error);
  });
  listenersUnsubscribe.push(unsubConfig);

  // 6. AUTO ATTACH REMOTE PRINT HOST LISTENER
  try {
    if (typeof onRemotePrintJobListener === 'function') {
      onRemotePrintJobListener();
    }
    if (typeof window.KasirApp?.setupRemotePrintHostListener === 'function') {
      window.KasirApp.setupRemotePrintHostListener();
    }
    if (typeof window.KasirApp?.updatePrinterUIStatus === 'function') {
      window.KasirApp.updatePrinterUIStatus();
    }
  } catch (e) {
    console.warn('Auto attach print host listener note:', e);
  }
}

export async function syncSavePrinterConfig(printerConfig) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'data', 'config');
    await setDoc(docRef, {
      printerConfig,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('Printer configuration synced to cloud successfully!');
  } catch (e) {
    console.error('Failed to sync printer config to cloud:', e);
  }
}

export async function syncSaveQrisPayload(qrisPayload) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'data', 'config');
    await setDoc(docRef, {
      qrisPayload,
      profile: state.storeProfile || null,
      auth: state.auth || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to sync QRIS payload to cloud:', e);
  }
}

export async function syncSaveStoreProfile(profile) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'data', 'config');
    await setDoc(docRef, {
      profile,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to sync store profile to cloud:', e);
  }
}

export async function syncSaveStoreAuth(authData) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'data', 'config');
    await setDoc(docRef, {
      auth: authData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to sync store auth to cloud:', e);
  }
}

// ================= MULTI-DEVICE CLOUD PRINT & DRAWER RELAY =================

/**
 * Mendapatkan ID unik perangkat kasir (persistent di localStorage)
 */
export function getDeviceId() {
  let id = localStorage.getItem('aristotle_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('aristotle_device_id', id);
  }
  return id;
}

/**
 * Mendapatkan label nama perangkat
 */
export function getDeviceName() {
  const customName = localStorage.getItem('aristotle_device_name');
  if (customName) return customName;
  if (window.AndroidBridge) return 'POS Android Kasir';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isMobile ? 'HP Staf' : 'Web Kasir';
}

/**
 * Kirim tugas cetak / buka laci ke antrean Cloud Firestore (Multi-Device Relay)
 */
export async function dispatchRemotePrintJob(jobData) {
  if (!db) throw new Error('Database Firebase belum aktif.');
  const currentStoreId = getStoreId();
  if (!currentStoreId) throw new Error('Belum masuk toko.');

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const docRef = doc(db, 'stores', currentStoreId, 'print_jobs', jobId);

  const payload = {
    id: jobId,
    ...jobData,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: getDeviceId(),
    createdByName: getDeviceName()
  };

  await setDoc(docRef, payload);
  return jobId;
}

/**
 * Pasang listener tugas cetak untuk host yang terhubung ke printer fisik
 */
export function listenToRemotePrintJobs(onJobReceived) {
  if (!db) return () => {};
  const currentStoreId = getStoreId();
  if (!currentStoreId) return () => {};

  const jobsCol = collection(db, 'stores', currentStoreId, 'print_jobs');
  const q = query(jobsCol, where('status', '==', 'pending'), limit(8));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const job = change.doc.data();
        if (job && job.status === 'pending') {
          onJobReceived(job);
        }
      }
    });
  }, (err) => {
    console.warn('listenToRemotePrintJobs error:', err);
  });

  return unsubscribe;
}

/**
 * Update status tugas cetak di Cloud (processing / completed / failed)
 */
export async function updateRemotePrintJobStatus(jobId, status, extra = {}) {
  if (!db) return;
  const currentStoreId = getStoreId();
  if (!currentStoreId) return;

  try {
    const docRef = doc(db, 'stores', currentStoreId, 'print_jobs', jobId);
    await setDoc(docRef, {
      status,
      completedBy: getDeviceId(),
      completedByName: getDeviceName(),
      updatedAt: new Date().toISOString(),
      ...extra
    }, { merge: true });

    // Auto cleanup berkala untuk menjaga database Firestore tetap ringan
    if (status === 'completed' && Math.random() < 0.25) {
      cleanupOldPrintJobs(currentStoreId).catch(() => {});
    }
  } catch (e) {
    console.warn('updateRemotePrintJobStatus error:', e);
  }
}

/**
 * Menunggu konfirmasi bahwa tugas cetak telah diselesaikan oleh printer host
 */
export function waitForRemotePrintJob(jobId, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Koneksi Cloud Firebase belum terhubung.'));
    const currentStoreId = getStoreId();
    if (!currentStoreId) return reject(new Error('Belum masuk toko.'));

    const docRef = doc(db, 'stores', currentStoreId, 'print_jobs', jobId);
    let timer = null;

    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'completed') {
          clearTimeout(timer);
          unsub();
          resolve(data);
        } else if (data.status === 'failed') {
          clearTimeout(timer);
          unsub();
          reject(new Error(data.error || 'Gagal dicetak di printer kasir utama.'));
        }
      }
    }, (err) => {
      clearTimeout(timer);
      unsub();
      reject(err);
    });

    timer = setTimeout(() => {
      unsub();
      reject(new Error('Waktu tunggu habis. Pastikan perangkat kasir utama (Device 1) yang terhubung ke printer dalam kondisi aktif dan terhubung ke internet.'));
    }, timeoutMs);
  });
}

/**
 * Bersihkan tugas cetak yang sudah selesai atau usang (> 15 menit)
 */
async function cleanupOldPrintJobs(storeId) {
  if (!db || !storeId) return;
  try {
    const jobsCol = collection(db, 'stores', storeId, 'print_jobs');
    const snap = await getDocs(jobsCol);
    const now = Date.now();
    const batch = writeBatch(db);
    let count = 0;

    snap.forEach((d) => {
      const data = d.data();
      const created = data.createdAt ? new Date(data.createdAt).getTime() : 0;
      if (data.status === 'completed' || (now - created > 15 * 60 * 1000)) {
        batch.delete(d.ref);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Pembersihan: ${count} tugas cetak lama dihapus.`);
    }
  } catch (err) {
    console.warn('cleanupOldPrintJobs note:', err);
  }
}

/**
 * Middleware Autentikasi & Verifikasi PIN Toko (Cloud & Local Multi-Tenant Auth)
 * Menolak toko yang belum terdaftar dan menolak PIN yang salah.
 */
export async function authenticateStoreLogin(storeId, inputPin) {
  const cleanId = (storeId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleanId) {
    return { success: false, exists: false, message: 'Harap masukkan nama / ID toko dengan benar' };
  }

  const trimmedPin = String(inputPin || '').trim();
  if (!trimmedPin) {
    return { success: false, exists: true, message: 'Harap masukkan PIN toko' };
  }

  const inputHash = await hashSha256(trimmedPin);
  const isMasterDev = inputHash === MASTER_DEV_HASH;

  // 1. Cek dari Local Storage
  const localKeys = getStorageKeys(cleanId);
  let localAuth = null;
  let localProfile = null;
  try {
    const authStr = localStorage.getItem(localKeys.AUTH);
    if (authStr) localAuth = JSON.parse(authStr);
    const profStr = localStorage.getItem(localKeys.PROFILE);
    if (profStr) localProfile = JSON.parse(profStr);
  } catch (e) {}

  // 2. Cek dari Cloud Firestore
  let cloudAuth = null;
  let cloudProfile = null;
  let storeDocExists = false;

  if (db) {
    try {
      const configRef = doc(db, 'stores', cleanId, 'data', 'config');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        storeDocExists = true;
        const data = snap.data();
        if (data) {
          cloudAuth = data.auth || null;
          cloudProfile = data.profile || null;
        }
      }
    } catch (e) {
      console.warn('Firestore lookup error:', e);
    }
  }

  const activeAuth = cloudAuth || localAuth;
  const activeProfile = cloudProfile || localProfile;
  const storeName = activeProfile?.name || cleanId.replace(/_/g, ' ').toUpperCase();

  // Jika Master Dev Key cocok -> langsung bypass verifikasi PIN toko
  if (isMasterDev) {
    return {
      success: true,
      exists: true,
      isMaster: true,
      storeName,
      cleanId,
      profile: activeProfile || { id: cleanId, name: storeName }
    };
  }

  // Jika toko tidak ada di local storage dan tidak ada di Firestore
  if (!activeAuth && !storeDocExists) {
    const savedStores = getSavedStoresList();
    const isSaved = savedStores.some(s => s.id === cleanId);
    if (!isSaved) {
      return {
        success: false,
        exists: false,
        storeName,
        message: `Toko "${storeName}" belum terdaftar di sistem. Silakan mendaftar di tab "+ Daftar Toko Baru".`
      };
    }
  }

  // Cek apakah PIN cocok (mendukung pinHash SHA-256 dan legacy pin plaintext)
  let isPinMatch = false;
  if (activeAuth?.pinHash) {
    isPinMatch = inputHash === activeAuth.pinHash;
  } else {
    const expectedPin = String(activeAuth?.pin || '123456').trim();
    isPinMatch = trimmedPin === expectedPin;
    if (isPinMatch) {
      if (!activeAuth) activeAuth = {};
      activeAuth.pinHash = inputHash;
      if (db) {
        try {
          const configRef = doc(db, 'stores', cleanId, 'data', 'config');
          await setDoc(configRef, { auth: { pinHash: inputHash } }, { merge: true });
        } catch (_) {}
      }
    }
  }

  if (!isPinMatch) {
    return {
      success: false,
      exists: true,
      storeName,
      message: `PIN salah untuk toko "${storeName}". Masukkan PIN / sandi toko yang sesuai.`
    };
  }

  // Jika lolos autentikasi -> Cache profile & auth ke local storage
  try {
    if (cloudAuth) localStorage.setItem(localKeys.AUTH, JSON.stringify(cloudAuth));
    if (cloudProfile) localStorage.setItem(localKeys.PROFILE, JSON.stringify(cloudProfile));
  } catch (err) {}

  return {
    success: true,
    exists: true,
    storeName,
    cleanId,
    profile: activeProfile || { id: cleanId, name: storeName }
  };
}

export async function verifyStorePin(storeId, inputPin) {
  const res = await authenticateStoreLogin(storeId, inputPin);
  return res.success;
}

// ================= GOOGLE SSO & MULTI-STORE OWNER MANAGEMENT =================

export function getFirebaseAuth() {
  if (!auth && app) {
    try { auth = getAuth(app); } catch (_) {}
  }
  return auth;
}

/**
 * Login Google SSO untuk Pemilik Toko (Owner)
 */
export async function loginWithGoogleOwner() {
  if (!isInitialized) await initFirebaseSync();
  const authInstance = getFirebaseAuth();
  if (!authInstance) throw new Error('Modul autentikasi Firebase belum siap.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(authInstance, provider);
  if (result && result.user) {
    state.currentUser = {
      uid: result.user.uid,
      email: result.user.email || '',
      displayName: result.user.displayName || result.user.email || 'Owner',
      photoURL: result.user.photoURL || ''
    };
  }
  return result.user;
}

/**
 * Logout Akun Google Pemilik Toko
 */
export async function logoutGoogleOwner() {
  const authInstance = getFirebaseAuth();
  if (authInstance) {
    await fbSignOut(authInstance);
  }
  state.currentUser = null;
}

/**
 * Ambil daftar seluruh toko yang dimiliki oleh akun Google (Multi-UMKM)
 */
export async function fetchStoresByOwner(ownerUid) {
  if (!db || !ownerUid) return [];
  try {
    const q = query(collection(db, 'stores_registry'), where('ownerUid', '==', ownerUid));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    return list;
  } catch (e) {
    console.warn('fetchStoresByOwner error:', e);
    return [];
  }
}

/**
 * Hubungkan toko ke akun Google Pemilik
 */
export async function linkStoreToOwner(storeId, ownerUser) {
  if (!db || !storeId || !ownerUser) return;
  try {
    const regRef = doc(db, 'stores_registry', storeId);
    await setDoc(regRef, {
      ownerUid: ownerUser.uid,
      ownerEmail: ownerUser.email || '',
      ownerName: ownerUser.displayName || ownerUser.email || 'Owner',
      ownerPhoto: ownerUser.photoURL || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.warn('linkStoreToOwner error:', e);
  }
}

/**
 * Ambil konfigurasi (Profile & Auth) toko dari Cloud
 */
export async function fetchStoreConfigFromCloud(storeId) {
  const cleanId = (storeId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!cleanId || !db) return null;
  try {
    const docRef = doc(db, 'stores', cleanId, 'data', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {}
  return null;
}

/**
 * Seed initial products to cloud if Firestore collection is empty
 */
async function seedInitialProducts() {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const localProds = state.products && state.products.length > 0 ? state.products : DEFAULT_PRODUCTS;
    const batch = writeBatch(db);
    localProds.forEach(p => {
      const docRef = doc(db, 'stores', currentStoreId, 'products', p.id);
      batch.set(docRef, {
        name: p.name,
        price: p.price,
        category: p.category,
        icon: p.icon || 'lunch_dining',
        image: typeof p.image === 'string' ? p.image : '',
        isAvailable: p.isAvailable !== false,
        trackStock: !!p.trackStock,
        stock: p.trackStock ? (p.stock !== undefined && p.stock !== null ? Number(p.stock) : null) : null,
        addOns: Array.isArray(p.addOns) ? p.addOns : [],
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.error('Error seeding initial products:', e);
  }
}

// ================= CLOUD MUTATION HELPERS =================

/**
 * Save or update single product in cloud
 */
export async function syncSaveProduct(product) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'products', product.id);
    await setDoc(docRef, {
      name: product.name,
      price: product.price,
      category: product.category,
      icon: product.icon || 'lunch_dining',
      image: typeof product.image === 'string' ? product.image : '',
      isAvailable: product.isAvailable !== false,
      trackStock: !!product.trackStock,
      stock: product.trackStock ? (product.stock !== undefined && product.stock !== null ? Number(product.stock) : null) : null,
      addOns: Array.isArray(product.addOns) ? product.addOns : [],
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to sync product to cloud:', e);
  }
}

/**
 * Delete product in cloud
 */
export async function syncDeleteProduct(productId) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'products', productId);
    
    // 1. Tulis soft-delete flag (didukung oleh aturan Firestore lama & baru)
    try {
      await setDoc(docRef, {
        name: '[DELETED]',
        price: 0,
        category: 'deleted',
        isDeleted: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (softErr) {
      console.warn('Soft-delete cloud mark error:', softErr);
    }

    // 2. Lakukan penghapusan fisik dokumen
    try {
      await deleteDoc(docRef);
    } catch (delErr) {
      // Jika aturan delete di Firebase Console belum di-update, soft-delete di atas sudah menjamin produk tidak muncul lagi
      console.warn('Physical deleteDoc pending Firestore rules update:', delErr);
    }
  } catch (e) {
    console.error('Failed to delete product in cloud:', e);
  }
}

/**
 * Batch delete products in cloud
 */
export async function syncBatchDeleteProducts(productIds) {
  if (!db || !Array.isArray(productIds) || productIds.length === 0) return;
  try {
    const currentStoreId = getStoreId();
    const CHUNK_SIZE = 450;
    for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
      const chunk = productIds.slice(i, i + CHUNK_SIZE);
      
      // 1. Soft-delete batch
      const softBatch = writeBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, 'stores', currentStoreId, 'products', id);
        softBatch.set(docRef, {
          name: '[DELETED]',
          price: 0,
          category: 'deleted',
          isDeleted: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      try {
        await softBatch.commit();
      } catch (e) {
        console.warn('Soft batch delete commit error:', e);
      }

      // 2. Physical delete batch
      const delBatch = writeBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, 'stores', currentStoreId, 'products', id);
        delBatch.delete(docRef);
      });
      try {
        await delBatch.commit();
      } catch (delErr) {
        console.warn('Physical batch delete commit error:', delErr);
      }
    }
  } catch (e) {
    console.error('Failed to batch delete products in cloud:', e);
  }
}

/**
 * Clear all products in cloud
 */
export async function syncClearAllProducts() {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const prodCol = collection(db, 'stores', currentStoreId, 'products');
    const snap = await getDocs(prodCol);
    if (snap.empty) return;
    
    const CHUNK_SIZE = 450;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);

      // 1. Soft-delete batch
      const softBatch = writeBatch(db);
      chunk.forEach(d => {
        softBatch.set(d.ref, {
          name: '[DELETED]',
          price: 0,
          category: 'deleted',
          isDeleted: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      try {
        await softBatch.commit();
      } catch (e) {}

      // 2. Physical delete batch
      const delBatch = writeBatch(db);
      chunk.forEach(d => delBatch.delete(d.ref));
      try {
        await delBatch.commit();
      } catch (e) {}
    }
  } catch (e) {
    console.error('Failed to clear all products in cloud:', e);
  }
}

/**
 * Add new completed transaction to cloud
 */
export async function syncAddTransaction(transaction) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'transactions', transaction.id);
    await setDoc(docRef, {
      ...transaction,
      syncedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to sync transaction to cloud:', e);
  }
}

/**
 * Delete single transaction in cloud
 */
export async function syncDeleteTransaction(transactionId) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'transactions', transactionId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error('Failed to delete transaction in cloud:', e);
  }
}

/**
 * Clear all transaction history in cloud
 */
export async function syncClearAllHistory() {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const txCol = collection(db, 'stores', currentStoreId, 'transactions');
    const snap = await getDocs(txCol);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error('Failed to clear history in cloud:', e);
  }
}

/**
 * Clear today transactions and expenses in cloud
 */
export async function syncClearTodayData() {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const nowStr = new Date().toDateString();
    const batch = writeBatch(db);

    // Filter tx
    const txCol = collection(db, 'stores', currentStoreId, 'transactions');
    const txSnap = await getDocs(txCol);
    txSnap.forEach(d => {
      const data = d.data();
      if (data.date && new Date(data.date).toDateString() === nowStr) {
        batch.delete(d.ref);
      }
    });

    // Filter exp
    const expCol = collection(db, 'stores', currentStoreId, 'expenses');
    const expSnap = await getDocs(expCol);
    expSnap.forEach(d => {
      const data = d.data();
      if (data.date && new Date(data.date).toDateString() === nowStr) {
        batch.delete(d.ref);
      }
    });

    await batch.commit();
  } catch (e) {
    console.error('Failed to clear today data in cloud:', e);
  }
}

/**
 * Add new expense record in cloud
 */
export async function syncAddExpense(expense) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'expenses', expense.id);
    await setDoc(docRef, {
      ...expense,
      syncedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to sync expense to cloud:', e);
  }
}

/**
 * Delete expense record in cloud
 */
export async function syncDeleteExpense(expenseId) {
  if (!db) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'expenses', expenseId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error('Failed to delete expense in cloud:', e);
  }
}

/**
 * Sync Order Queues (Keranjang Antrian Aktif) to Cloud
 */
let syncQueuesTimer = null;
let pendingQueuesToSync = null;

export async function syncSaveQueues(queues, immediate = false) {
  if (!db) return;
  pendingQueuesToSync = queues;

  const doSync = async () => {
    if (!pendingQueuesToSync) return;
    const toSave = pendingQueuesToSync;
    pendingQueuesToSync = null;
    try {
      const currentStoreId = getStoreId();
      if (!currentStoreId) return;
      const docRef = doc(db, 'stores', currentStoreId, 'data', 'queues');
      await setDoc(docRef, {
        list: toSave,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to sync queues to cloud:', e);
    }
  };

  if (immediate) {
    if (syncQueuesTimer) {
      clearTimeout(syncQueuesTimer);
      syncQueuesTimer = null;
    }
    return await doSync();
  }

  if (syncQueuesTimer) clearTimeout(syncQueuesTimer);
  syncQueuesTimer = setTimeout(() => {
    syncQueuesTimer = null;
    doSync();
  }, 400);
}

/**
 * Sync Shift Data (Open / Closed Z-Report) to Cloud
 */
export async function syncSaveShift(shift) {
  if (!db || !shift || !shift.id) return;
  try {
    const currentStoreId = getStoreId();
    const docRef = doc(db, 'stores', currentStoreId, 'shifts', shift.id);
    await setDoc(docRef, {
      ...shift,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to sync shift to cloud:', e);
  }
}

/**
 * Fetch Shifts History from Cloud
 */
export async function syncGetShifts() {
  if (!db) return [];
  try {
    const currentStoreId = getStoreId();
    const shiftCol = collection(db, 'stores', currentStoreId, 'shifts');
    const snap = await getDocs(shiftCol);
    const list = [];
    snap.forEach(d => list.push(d.data()));
    list.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
    return list;
  } catch (e) {
    console.error('Failed to fetch shifts from cloud:', e);
    return [];
  }
}

/**
 * Force Push Local Data to Cloud (Manual Full Sync)
 */
export async function forceUploadAllToCloud() {
  if (!db) {
    showToast('Firebase belum terhubung. Periksa koneksi internet Anda.', 'warning');
    return;
  }

  const currentStoreId = getStoreId();
  updateSyncStatusUI('syncing', 'Mengunggah semua data lokal ke Cloud...');
  try {
    const batch = writeBatch(db);

    // 1. Upload Products
    state.products.forEach(p => {
      const docRef = doc(db, 'stores', currentStoreId, 'products', p.id);
      batch.set(docRef, {
        name: p.name,
        price: p.price,
        category: p.category,
        icon: p.icon || 'lunch_dining',
        image: typeof p.image === 'string' ? p.image : '',
        isAvailable: p.isAvailable !== false,
        trackStock: !!p.trackStock,
        stock: p.trackStock ? (p.stock !== undefined && p.stock !== null ? Number(p.stock) : null) : null,
        addOns: Array.isArray(p.addOns) ? p.addOns : [],
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });

    // 2. Upload Transactions
    state.transactions.forEach(t => {
      const docRef = doc(db, 'stores', currentStoreId, 'transactions', t.id);
      batch.set(docRef, { ...t, syncedAt: new Date().toISOString() }, { merge: true });
    });

    // 3. Upload Expenses
    state.expenses.forEach(e => {
      const docRef = doc(db, 'stores', currentStoreId, 'expenses', e.id);
      batch.set(docRef, { ...e, syncedAt: new Date().toISOString() }, { merge: true });
    });

    // 4. Upload Queues
    const queuesRef = doc(db, 'stores', currentStoreId, 'data', 'queues');
    batch.set(queuesRef, {
      list: state.orderQueues,
      updatedAt: new Date().toISOString()
    });

    // 5. Upload Config (QRIS Payload & Store Profile)
    const configRef = doc(db, 'stores', currentStoreId, 'data', 'config');
    batch.set(configRef, {
      qrisPayload: state.qrisPayload,
      profile: state.storeProfile || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await batch.commit();
    updateSyncStatusUI('online', 'Semua data lokal berhasil diunggah ke Cloud');
    showToast(`Data toko [${state.storeProfile.name}] berhasil disinkronkan ke Cloud!`, 'success');
  } catch (e) {
    console.error('Force upload error:', e);
    updateSyncStatusUI('error', 'Gagal mengunggah data ke cloud');
    showToast('Gagal menyinkronkan data: ' + e.message, 'error');
  }
}

// ================= SUPER ADMIN MONITORING HELPERS =================

/**
 * Catat / Perbarui metadata toko di registry Cloud untuk monitoring tim teknis
 */
export async function syncStoreToRegistry(storeInfo) {
  if (!db || !storeInfo || !storeInfo.id) return;
  try {
    const regRef = doc(db, 'stores_registry', storeInfo.id);
    await setDoc(regRef, {
      id: storeInfo.id,
      name: storeInfo.name || storeInfo.id,
      ownerName: storeInfo.ownerName || 'Owner',
      phone: storeInfo.phone || '',
      pin: storeInfo.pin || '123456',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.warn('Failed to update stores_registry:', e);
  }
}

/**
 * Ambil daftar seluruh UMKM, omzet hari ini, jumlah transaksi, dan menu untuk Super Admin
 */
export async function fetchAllStoresForSuperAdmin() {
  const result = [];
  const knownStoreMap = new Map();

  // 1. Tambahkan toko lokal dari perangkat
  const localStores = getSavedStoresList();
  localStores.forEach(s => {
    knownStoreMap.set(s.id, {
      id: s.id,
      name: s.name,
      ownerName: s.ownerName || 'Owner',
      phone: s.phone || '',
      pin: '123456',
      todayRevenue: 0,
      todayTxCount: 0,
      productCount: 0
    });
  });

  // 2. Query dari Firestore jika online
  if (db) {
    try {
      // Ambil registry toko
      const regSnap = await getDocs(collection(db, 'stores_registry'));
      regSnap.forEach(d => {
        const data = d.data();
        knownStoreMap.set(d.id, {
          id: d.id,
          name: data.name || d.id,
          ownerName: data.ownerName || 'Owner',
          phone: data.phone || '',
          pin: data.pin || '123456',
          todayRevenue: 0,
          todayTxCount: 0,
          productCount: 0
        });
      });

      const todayStr = new Date().toDateString();

      // Ambil metrik untuk setiap toko secara paralel
      const storeEntries = Array.from(knownStoreMap.values());
      await Promise.all(storeEntries.map(async (store) => {
        try {
          // Ambil config jika PIN belum ada di registry
          const confDoc = await getDoc(doc(db, 'stores', store.id, 'data', 'config'));
          if (confDoc.exists()) {
            const confData = confDoc.data();
            if (confData.auth?.pin) store.pin = confData.auth.pin;
            if (confData.auth?.ownerName) store.ownerName = confData.auth.ownerName;
            if (confData.auth?.phone) store.phone = confData.auth.phone;
            if (confData.profile?.name) store.name = confData.profile.name;
            if (confData.profile?.city) store.city = confData.profile.city;
          }

          // Hitung transaksi hari ini & jumlah produk secara bersamaan
          const [txSnap, prodSnap] = await Promise.all([
            getDocs(collection(db, 'stores', store.id, 'transactions')),
            getDocs(collection(db, 'stores', store.id, 'products'))
          ]);

          let todayRev = 0;
          let todayCount = 0;
          txSnap.forEach(tDoc => {
            const tx = tDoc.data();
            if (tx.date && new Date(tx.date).toDateString() === todayStr) {
              todayRev += Number(tx.total) || 0;
              todayCount++;
            }
          });
          store.todayRevenue = todayRev;
          store.todayTxCount = todayCount;
          store.productCount = prodSnap.size;
        } catch (subErr) {
          console.warn(`Error fetching sub-data for store ${store.id}:`, subErr);
        }
      }));
    } catch (err) {
      console.warn('Super Admin Firestore fetch error:', err);
    }
  }

  return Array.from(knownStoreMap.values());
}

/**
 * Super Admin: Ubah PIN toko langsung di Firestore & Local Storage
 */
export async function superAdminUpdateStorePin(storeId, newPin) {
  if (!storeId || !newPin) return false;
  const cleanPin = String(newPin).trim();
  const pinHash = await hashSha256(cleanPin);

  // Update Cloud Firestore
  if (db) {
    try {
      const confRef = doc(db, 'stores', storeId, 'data', 'config');
      await setDoc(confRef, {
        auth: { pinHash: pinHash, pin: cleanPin },
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const regRef = doc(db, 'stores_registry', storeId);
      await setDoc(regRef, {
        pinHash: pinHash,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update PIN in cloud:', e);
    }
  }

  // Update Local Storage jika toko ini ada di perangkat lokal
  try {
    const keys = getStorageKeys(storeId);
    const authStr = localStorage.getItem(keys.AUTH);
    const authObj = authStr ? JSON.parse(authStr) : {};
    authObj.pinHash = pinHash;
    authObj.pin = cleanPin;
    localStorage.setItem(keys.AUTH, JSON.stringify(authObj));

    if (state.storeId === storeId) {
      if (!state.auth) state.auth = {};
      state.auth.pinHash = pinHash;
      state.auth.pin = cleanPin;
    }
  } catch (e) {}

  return true;
}

/**
 * Super Admin: Daftarkan Toko Mitra Baru ke Cloud Firestore & Local Storage
 */
export async function superAdminCreateStore(storeData, includeStarterMenu = true) {
  if (!storeData || !storeData.name) return { success: false, message: 'Nama toko wajib diisi' };
  
  const cleanName = String(storeData.name).trim();
  const cleanId = String(storeData.id || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')).trim();
  const cleanOwner = String(storeData.ownerName || 'Pemilik Toko').trim();
  const cleanPhone = String(storeData.phone || '').trim();
  const cleanCity = String(storeData.city || 'Indonesia').trim();
  const cleanPin = String(storeData.pin || '123456').trim();
  const pinHash = await hashSha256(cleanPin);

  if (!cleanId) return { success: false, message: 'ID Toko tidak valid' };

  // 1. Simpan ke Cloud Firestore jika online
  if (db) {
    try {
      const regRef = doc(db, 'stores_registry', cleanId);
      await setDoc(regRef, {
        id: cleanId,
        name: cleanName,
        ownerName: cleanOwner,
        phone: cleanPhone,
        city: cleanCity,
        pin: cleanPin,
        pinHash: pinHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const confRef = doc(db, 'stores', cleanId, 'data', 'config');
      await setDoc(confRef, {
        profile: {
          id: cleanId,
          name: cleanName,
          city: cleanCity,
          nmid: '',
          acquirer: 'Aristotle POS'
        },
        auth: {
          pin: cleanPin,
          pinHash: pinHash,
          ownerName: cleanOwner,
          phone: cleanPhone,
          requirePinForAdmin: false
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Jika menyertakan starter menu
      if (includeStarterMenu) {
        const batch = writeBatch(db);
        DEFAULT_PRODUCTS.forEach(p => {
          const pRef = doc(db, 'stores', cleanId, 'products', p.id);
          batch.set(pRef, {
            ...p,
            image: typeof p.image === 'string' ? p.image : '',
            addOns: Array.isArray(p.addOns) ? p.addOns : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error('Failed to create store in Firestore:', e);
    }
  }

  // 2. Simpan profil & auth ke Local Storage perangkat
  try {
    const keys = getStorageKeys(cleanId);
    const profile = {
      id: cleanId,
      name: cleanName,
      city: cleanCity,
      nmid: '',
      acquirer: 'Aristotle POS'
    };
    const auth = {
      pin: cleanPin,
      pinHash: pinHash,
      ownerName: cleanOwner,
      phone: cleanPhone,
      requirePinForAdmin: false
    };
    localStorage.setItem(keys.PROFILE, JSON.stringify(profile));
    localStorage.setItem(keys.AUTH, JSON.stringify(auth));
    if (includeStarterMenu && !localStorage.getItem(keys.PRODUCTS)) {
      localStorage.setItem(keys.PRODUCTS, JSON.stringify(DEFAULT_PRODUCTS));
    }
    if (!localStorage.getItem(keys.PRINTER)) {
      localStorage.setItem(keys.PRINTER, JSON.stringify({
        ...DEFAULT_PRINTER_CONFIG,
        headerStoreName: cleanName,
        headerPhone: cleanPhone,
        cashierName: cleanOwner || 'Kasir'
      }));
    }
    registerStoreOnDevice({
      id: cleanId,
      name: cleanName,
      ownerName: cleanOwner,
      phone: cleanPhone,
      city: cleanCity
    });
  } catch (e) {}

  return { success: true, storeId: cleanId, storeName: cleanName };
}

/**
 * Super Admin: Perbarui Profil & Identitas Toko Mitra di Firestore & Local Storage
 */
export async function superAdminUpdateStore(storeData) {
  if (!storeData || !storeData.storeId) return { success: false, message: 'ID Toko tidak valid' };
  const storeId = storeData.storeId;
  const cleanName = String(storeData.name || storeId).trim();
  const cleanOwner = String(storeData.ownerName || 'Pemilik Toko').trim();
  const cleanPhone = String(storeData.phone || '').trim();
  const cleanCity = String(storeData.city || 'Indonesia').trim();
  const cleanPin = storeData.pin ? String(storeData.pin).trim() : '';

  let pinHash = '';
  if (cleanPin) {
    pinHash = await hashSha256(cleanPin);
  }

  // 1. Update Firestore
  if (db) {
    try {
      const regRef = doc(db, 'stores_registry', storeId);
      const patchReg = {
        name: cleanName,
        ownerName: cleanOwner,
        phone: cleanPhone,
        city: cleanCity,
        updatedAt: new Date().toISOString()
      };
      if (cleanPin) {
        patchReg.pin = cleanPin;
        patchReg.pinHash = pinHash;
      }
      await setDoc(regRef, patchReg, { merge: true });

      const confRef = doc(db, 'stores', storeId, 'data', 'config');
      const patchConf = {
        profile: {
          name: cleanName,
          city: cleanCity
        },
        auth: {
          ownerName: cleanOwner,
          phone: cleanPhone
        },
        updatedAt: new Date().toISOString()
      };
      if (cleanPin) {
        patchConf.auth.pin = cleanPin;
        patchConf.auth.pinHash = pinHash;
      }
      await setDoc(confRef, patchConf, { merge: true });
    } catch (e) {
      console.error('Failed to update store in Firestore:', e);
    }
  }

  // 2. Update Local Storage
  try {
    const keys = getStorageKeys(storeId);
    const profStr = localStorage.getItem(keys.PROFILE);
    if (profStr) {
      const pObj = JSON.parse(profStr);
      pObj.name = cleanName;
      pObj.city = cleanCity;
      localStorage.setItem(keys.PROFILE, JSON.stringify(pObj));
    }
    const authStr = localStorage.getItem(keys.AUTH);
    if (authStr) {
      const aObj = JSON.parse(authStr);
      aObj.ownerName = cleanOwner;
      aObj.phone = cleanPhone;
      if (cleanPin) {
        aObj.pin = cleanPin;
        aObj.pinHash = pinHash;
      }
      localStorage.setItem(keys.AUTH, JSON.stringify(aObj));
    }
    registerStoreOnDevice({
      id: storeId,
      name: cleanName,
      ownerName: cleanOwner,
      phone: cleanPhone,
      city: cleanCity
    });

    if (state.storeId === storeId) {
      if (state.storeProfile) {
        state.storeProfile.name = cleanName;
        state.storeProfile.city = cleanCity;
      }
      if (state.auth) {
        state.auth.ownerName = cleanOwner;
        state.auth.phone = cleanPhone;
        if (cleanPin) {
          state.auth.pin = cleanPin;
          state.auth.pinHash = pinHash;
        }
      }
      updateUIStoreBranding();
    }
  } catch (e) {}

  return { success: true, storeId, storeName: cleanName };
}

/**
 * Super Admin: Hapus toko secara menyeluruh dari Cloud Firestore & Perangkat
 */
export async function deleteStoreFromCloud(storeId) {
  if (!storeId) return false;

  // 1. Hapus dari Firestore jika online
  if (db) {
    try {
      const regRef = doc(db, 'stores_registry', storeId);
      await deleteDoc(regRef);

      const confRef = doc(db, 'stores', storeId, 'data', 'config');
      await deleteDoc(confRef);
    } catch (e) {
      console.error('Failed to delete store from registry:', e);
    }
  }

  // 2. Bersihkan dari registry perangkat lokal
  try {
    removeStoreFromDevice(storeId);
    const keys = getStorageKeys(storeId);
    localStorage.removeItem(keys.PROFILE);
    localStorage.removeItem(keys.AUTH);
    localStorage.removeItem(keys.PRODUCTS);
    localStorage.removeItem(keys.TRANSACTIONS);
    localStorage.removeItem(keys.EXPENSES);
    localStorage.removeItem(keys.PRINTER);
  } catch (e) {}

  return true;
}

/**
 * Publikasikan info IP lokal host kasir ke Cloud Firestore
 */
export async function syncPublishHostPresence(hostIp, hostModel = '', isReady = true) {
  if (!db) return;
  const storeId = getStoreId();
  if (!storeId) return;
  try {
    const docRef = doc(db, 'stores', storeId, 'config', 'host_presence');
    await setDoc(docRef, {
      ip: hostIp || '',
      port: 8088,
      model: hostModel || 'Kasir Utama',
      printerName: hostModel || 'Printer Bluetooth Standby',
      isReady: Boolean(isReady),
      updatedAt: Date.now()
    }, { merge: true });
    console.log('Host presence synced to cloud:', hostIp, hostModel, isReady);
  } catch (e) {
    console.warn('Publish host presence note:', e.message);
  }
}

/**
 * Dengarkan keberadaan Host Kasir dari Cloud Firestore
 */
export function listenToHostPresence(callback) {
  if (!db) return null;
  const storeId = getStoreId();
  if (!storeId) return null;
  try {
    const docRef = doc(db, 'stores', storeId, 'config', 'host_presence');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof callback === 'function') callback(data);
      }
    }, (err) => {
      console.warn('Listen host presence error:', err.message);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Ambil status keberadaan Host Kasir secara langsung (one-shot direct fetch)
 */
export async function fetchHostPresenceDirect() {
  if (!db) return null;
  const storeId = getStoreId();
  if (!storeId) return null;
  try {
    const docRef = doc(db, 'stores', storeId, 'config', 'host_presence');
    const snap = await getDoc(docRef);
    if (snap && snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    console.warn('Fetch host presence direct note:', e.message);
  }
  return null;
}


