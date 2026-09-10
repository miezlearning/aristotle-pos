/**
 * Kasir Mami - Central State Management & Multi-Tenant Storage
 */

import { 
  getStorageKeys, 
  GLOBAL_STORAGE_KEYS,
  MASTER_DEV_HASH,
  DEFAULT_PRODUCTS, 
  DEFAULT_QRIS_PAYLOAD, 
  MAMI_QRIS_PAYLOAD,
  DEFAULT_STORE_PROFILE,
  DEFAULT_PRINTER_CONFIG
} from './config.js';
import { parseQRISMetadata } from './qris.js';
import { hashSha256 } from './utils.js';

/**
 * Dapatkan daftar toko yang tersimpan / pernah dibuka di perangkat ini
 */
export function getSavedStoresList() {
  try {
    const raw = localStorage.getItem(GLOBAL_STORAGE_KEYS.SAVED_STORES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  
  // Lembaran bersih (Clean Slate) untuk perangkat baru, siap untuk pendaftaran mandiri UMKM apa pun
  return [];
}

export function registerStoreOnDevice(storeInfo) {
  if (!storeInfo || !storeInfo.id) return;
  const list = getSavedStoresList().filter(s => s.id !== storeInfo.id);
  list.unshift({
    id: storeInfo.id,
    name: storeInfo.name || storeInfo.id,
    ownerName: storeInfo.ownerName || 'Pemilik Toko',
    phone: storeInfo.phone || '',
    lastOpened: new Date().toISOString()
  });
  try {
    localStorage.setItem(GLOBAL_STORAGE_KEYS.SAVED_STORES, JSON.stringify(list));
  } catch (e) {}
}

export function removeStoreFromDevice(storeId) {
  if (!storeId) return;
  const list = getSavedStoresList().filter(s => s.id !== storeId);
  try {
    localStorage.setItem(GLOBAL_STORAGE_KEYS.SAVED_STORES, JSON.stringify(list));
  } catch (e) {}
}

/**
 * Deteksi Store ID dari URL query string (?store=...) atau localStorage
 */
export function resolveActiveStoreId() {
  if (sessionStorage.getItem('is_logged_out_state') === '1') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const storeParam = params.get('store');
    if (storeParam && storeParam.trim()) {
      const sanitized = storeParam.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const roleParam = params.get('role');
      const authParam = params.get('auth');
      const isPairingLink = (roleParam === 'client' || roleParam === 'pelayan' || authParam === '1');

      // Auto-authorize jika dibuka dari tautan/QR pairing kasir
      if (isPairingLink) {
        sessionStorage.removeItem('is_logged_out_state');
        localStorage.setItem('auth_store_session_' + sanitized, '1');
        localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, sanitized);
        localStorage.setItem('aristotle_device_role', 'pelayan');
        localStorage.setItem('aristotle_printer_mode', 'pelayan');
        const hostIp = params.get('hostIp');
        if (hostIp) {
          localStorage.setItem('aristotle_local_host_ip', hostIp);
        }
        return sanitized;
      }
      
      // Auto-restore hanya jika perangkat ini sudah memiliki sesi auth terverifikasi
      const isDeviceAuth = localStorage.getItem('auth_store_session_' + sanitized) === '1';
      if (isDeviceAuth) {
        localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, sanitized);
        return sanitized;
      }
      return null;
    }
  } catch (e) {}

  const savedActive = localStorage.getItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID);
  if (savedActive && localStorage.getItem('auth_store_session_' + savedActive) === '1') {
    return savedActive;
  }

  return null;
}

export const activeStoreId = resolveActiveStoreId();
export const currentStorageKeys = getStorageKeys(activeStoreId || 'toko_utama');

export const state = {
  storeId: activeStoreId,
  isSessionActive: !!activeStoreId,
  storeProfile: activeStoreId 
    ? { ...DEFAULT_STORE_PROFILE, id: activeStoreId }
    : { id: '', name: 'Aristotle POS', city: '', nmid: '', acquirer: 'Aristotle POS' },
  auth: {
    pin: '123456',
    ownerName: 'Pemilik Toko',
    phone: '',
    requirePinForAdmin: false
  },
  userRole: localStorage.getItem(GLOBAL_STORAGE_KEYS.AUTH_ROLE) || 'owner', // 'owner' or 'cashier'
  isUnlockedOwner: true,
  products: [],
  transactions: [],
  expenses: [],
  orderQueues: [
    { id: 'q_1', name: 'Pesanan #1', cart: {} }
  ],
  activeQueueId: 'q_1',
  currentCategory: 'all',
  currentPeriod: 'today', // 'today', 'month', 'all'
  qrisPayload: DEFAULT_QRIS_PAYLOAD,
  qrisMode: 'dynamic', // 'dynamic' (nominal pas otomatis) or 'static' (nominal manual)
  printerConfig: { ...DEFAULT_PRINTER_CONFIG },
  activeShift: null,
  shifts: []
};

/**
 * Muat seluruh data dari LocalStorage ke State
 */
export function initState() {
  state.currentCategory = 'all';

  if (!state.storeId) {
    state.isSessionActive = false;
    state.storeProfile = { id: '', name: 'Aristotle POS', city: '', nmid: '', acquirer: 'Aristotle POS' };
    state.products = [];
    state.transactions = [];
    state.expenses = [];
    state.orderQueues = [{ id: 'q_1', name: 'Pesanan #1', cart: {} }];
    state.activeQueueId = 'q_1';
    state.printerConfig = { ...DEFAULT_PRINTER_CONFIG };
    state.activeShift = null;
    state.shifts = [];
    updateUIStoreBranding();
    return;
  }

  state.isSessionActive = true;
  const keys = getStorageKeys(state.storeId);

  // 1. Muat QRIS Payload & Ekstrak Profil Toko
  const savedQris = localStorage.getItem(keys.QRIS);
  if (savedQris && savedQris.trim()) {
    state.qrisPayload = savedQris.trim();
  } else if (state.storeId === 'kedai_usaha_mami') {
    state.qrisPayload = MAMI_QRIS_PAYLOAD;
  } else {
    state.qrisPayload = DEFAULT_QRIS_PAYLOAD;
  }

  // 2. Muat Profil Toko (atau ekstrak dari QRIS)
  const savedProfile = localStorage.getItem(keys.PROFILE);
  if (savedProfile) {
    try {
      state.storeProfile = { ...DEFAULT_STORE_PROFILE, ...JSON.parse(savedProfile), id: state.storeId };
    } catch (e) {
      state.storeProfile = { ...DEFAULT_STORE_PROFILE, id: state.storeId };
    }
  } else if (state.storeId === 'kedai_usaha_mami') {
    state.storeProfile = {
      id: 'kedai_usaha_mami',
      name: 'Kedai Usaha Mami',
      city: 'Samarinda (Kota)',
      nmid: 'ID1025450522335',
      acquirer: "Livin' by Mandiri"
    };
    saveStoreProfile();
  } else {
    // Profil mandiri untuk toko baru
    const autoTitle = state.storeId
      ? state.storeId.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Toko Baru';
    if (state.qrisPayload) {
      const meta = parseQRISMetadata(state.qrisPayload);
      state.storeProfile = {
        id: state.storeId,
        name: meta.merchantName || autoTitle,
        city: meta.city || 'Indonesia',
        nmid: meta.nmid || '',
        acquirer: meta.acquirer || 'Aristotle POS'
      };
    } else {
      state.storeProfile = {
        id: state.storeId,
        name: autoTitle,
        city: 'Indonesia',
        nmid: '',
        acquirer: 'Aristotle POS'
      };
    }
    saveStoreProfile();
  }

  // 3. Muat Produk
  const savedProducts = localStorage.getItem(keys.PRODUCTS);
  if (savedProducts) {
    try {
      state.products = JSON.parse(savedProducts);
      if (Array.isArray(state.products)) {
        state.products.forEach(p => {
          if (!Array.isArray(p.addOns)) p.addOns = [];
          if (typeof p.image !== 'string') p.image = '';
        });
      }
    } catch (e) {
      state.products = [...DEFAULT_PRODUCTS];
    }
  } else {
    state.products = [...DEFAULT_PRODUCTS];
    saveProducts();
  }

  // 4. Muat Transaksi
  const savedHistory = localStorage.getItem(keys.HISTORY);
  if (savedHistory) {
    try {
      state.transactions = JSON.parse(savedHistory);
    } catch (e) {
      state.transactions = [];
    }
  }

  // 5. Muat Pengeluaran
  const savedExpenses = localStorage.getItem(keys.EXPENSES);
  if (savedExpenses) {
    try {
      state.expenses = JSON.parse(savedExpenses);
    } catch (e) {
      state.expenses = [];
    }
  }

  // 6. Muat Antrian Pesanan
  const savedQueues = localStorage.getItem(keys.QUEUES);
  if (savedQueues) {
    try {
      state.orderQueues = JSON.parse(savedQueues);
      if (!state.orderQueues.length) {
        state.orderQueues = [{ id: 'q_1', name: 'Pesanan #1', cart: {} }];
      }
      if (!state.orderQueues.some(q => q.id === state.activeQueueId)) {
        state.activeQueueId = state.orderQueues[0].id;
      }
    } catch (e) {
      state.orderQueues = [{ id: 'q_1', name: 'Pesanan #1', cart: {} }];
    }
  }

  if (
    state.orderQueues.length === 1 &&
    Object.keys(state.orderQueues[0].cart).length === 0 &&
    state.orderQueues[0].name.startsWith('Pesanan #')
  ) {
    state.orderQueues[0].name = 'Pesanan #1';
  }

  // 7. Muat Auth & PIN Toko
  const savedAuth = localStorage.getItem(keys.AUTH);
  if (savedAuth) {
    try {
      state.auth = { ...state.auth, ...JSON.parse(savedAuth) };
    } catch (e) {}
  }

  // 8. Muat Konfigurasi Printer & Struk
  const savedPrinter = localStorage.getItem(keys.PRINTER);
  if (savedPrinter) {
    try {
      state.printerConfig = { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(savedPrinter) };
    } catch (e) {
      state.printerConfig = { ...DEFAULT_PRINTER_CONFIG };
    }
  } else {
    state.printerConfig = { ...DEFAULT_PRINTER_CONFIG };
  }

  // Sinkronkan ke Android Native jika ada alamat printer Bluetooth tersimpan
  if (state.printerConfig?.bluetoothAddress && window.AndroidBridge && typeof window.AndroidBridge.setPreferredPrinter === 'function') {
    window.AndroidBridge.setPreferredPrinter(state.printerConfig.bluetoothAddress);
  }

  // 9. Muat Status Shift Aktif & Riwayat Tutup Shift
  const savedActiveShift = localStorage.getItem(keys.ACTIVE_SHIFT);
  if (savedActiveShift) {
    try {
      state.activeShift = JSON.parse(savedActiveShift);
    } catch (e) {
      state.activeShift = null;
    }
  } else {
    state.activeShift = null;
  }

  const savedShifts = localStorage.getItem(keys.SHIFTS);
  if (savedShifts) {
    try {
      state.shifts = JSON.parse(savedShifts);
      if (!Array.isArray(state.shifts)) state.shifts = [];
    } catch (e) {
      state.shifts = [];
    }
  } else {
    state.shifts = [];
  }

  // Daftarkan toko aktif ini ke registry perangkat
  registerStoreOnDevice({
    id: state.storeId,
    name: state.storeProfile?.name || state.storeId,
    ownerName: state.auth?.ownerName || 'Pemilik Toko',
    phone: state.auth?.phone || ''
  });

  // Update UI Elements with Store Branding
  updateUIStoreBranding();
}

/**
 * Simpan konfigurasi printer & struk
 */
export function savePrinterConfig(newConfig) {
  if (newConfig) {
    state.printerConfig = { ...state.printerConfig, ...newConfig };
  }
  localStorage.setItem(currentStorageKeys.PRINTER, JSON.stringify(state.printerConfig));
  if (state.printerConfig?.bluetoothAddress && window.AndroidBridge && typeof window.AndroidBridge.setPreferredPrinter === 'function') {
    window.AndroidBridge.setPreferredPrinter(state.printerConfig.bluetoothAddress);
  }
}

/**
 * Simpan konfigurasi auth & PIN toko
 */
export function saveStoreAuth(authData) {
  if (authData) {
    state.auth = { ...state.auth, ...authData };
  }
  localStorage.setItem(currentStorageKeys.AUTH, JSON.stringify(state.auth));
}

/**
 * Validasi PIN Toko (Mendukung hash SHA-256 dan backward compatibility)
 */
export async function verifyStorePin(pinInput) {
  const cleanPin = String(pinInput || '').trim();
  if (!cleanPin) return false;
  const hash = await hashSha256(cleanPin);
  if (hash === MASTER_DEV_HASH) return true;
  if (state.auth?.pinHash && hash === state.auth.pinHash) return true;
  // Kompatibilitas mundur jika masih ada data plaintext lama
  const currentPin = String(state.auth?.pin || '123456').trim();
  if (cleanPin === currentPin) {
    if (!state.auth) state.auth = {};
    state.auth.pinHash = hash;
    saveAuthState();
    return true;
  }
  return false;
}

/**
 * Atur Role Pengguna ('owner' atau 'cashier')
 */
export function setUserRole(role = 'owner') {
  state.userRole = role;
  localStorage.setItem(GLOBAL_STORAGE_KEYS.AUTH_ROLE, role);
}

/**
 * Perbarui teks nama toko & branding di seluruh layar (Header, struk, laporan)
 */
export function updateUIStoreBranding() {
  const storeName = state.storeId ? (state.storeProfile?.name || state.storeId) : 'Aristotle POS';
  const nmid = state.storeId ? (state.storeProfile?.nmid || '') : '';

  // Header Title (Desktop, Tablet & Mobile)
  const headerTitleEl = document.getElementById('appHeaderStoreTitle') || document.querySelector('header h1');
  if (headerTitleEl) headerTitleEl.innerText = storeName;
  const mobileHeaderTitleEl = document.getElementById('mobileAppHeaderStoreTitle');
  if (mobileHeaderTitleEl) mobileHeaderTitleEl.innerText = storeName;

  // Struk Header
  const receiptStoreNameEl = document.getElementById('receiptStoreName');
  if (receiptStoreNameEl) receiptStoreNameEl.innerText = storeName;

  // QRIS Payment Card Merchant Info
  const qrisMerchantNameEl = document.getElementById('qrisMerchantName');
  if (qrisMerchantNameEl) qrisMerchantNameEl.innerText = storeName;

  const qrisNmidEl = document.getElementById('qrisNmidDisplay');
  if (qrisNmidEl) {
    qrisNmidEl.innerText = nmid ? `NMID: ${nmid}` : '';
  }

  // Cloud Store Indicator
  const cloudStoreNameDisplay = document.getElementById('cloudStoreNameDisplay');
  if (cloudStoreNameDisplay) {
    cloudStoreNameDisplay.innerText = storeName;
  }
  const cloudStoreIdEl = document.getElementById('cloudStoreIdDisplay');
  if (cloudStoreIdEl) {
    cloudStoreIdEl.innerText = state.storeId ? `${storeName} (${state.storeId})` : 'Belum Ada Toko Terhubung';
  }
}

export function saveStoreProfile(profile) {
  if (profile) {
    state.storeProfile = { ...state.storeProfile, ...profile };
  }
  localStorage.setItem(currentStorageKeys.PROFILE, JSON.stringify(state.storeProfile));
  registerStoreOnDevice({
    id: state.storeId,
    name: state.storeProfile?.name || state.storeId,
    ownerName: state.auth?.ownerName || 'Pemilik Toko',
    phone: state.auth?.phone || ''
  });
  updateUIStoreBranding();
}

export function saveProducts() {
  localStorage.setItem(currentStorageKeys.PRODUCTS, JSON.stringify(state.products));
}

export function saveHistory() {
  localStorage.setItem(currentStorageKeys.HISTORY, JSON.stringify(state.transactions));
}

export function saveExpenses() {
  localStorage.setItem(currentStorageKeys.EXPENSES, JSON.stringify(state.expenses));
}

export function saveQueues() {
  localStorage.setItem(currentStorageKeys.QUEUES, JSON.stringify(state.orderQueues));
}

export function saveActiveShift() {
  if (state.activeShift) {
    localStorage.setItem(currentStorageKeys.ACTIVE_SHIFT, JSON.stringify(state.activeShift));
  } else {
    localStorage.removeItem(currentStorageKeys.ACTIVE_SHIFT);
  }
}

export function saveShifts() {
  localStorage.setItem(currentStorageKeys.SHIFTS, JSON.stringify(state.shifts || []));
}

export function saveQrisPayload(payload) {
  state.qrisPayload = (payload || DEFAULT_QRIS_PAYLOAD).trim();
  localStorage.setItem(currentStorageKeys.QRIS, state.qrisPayload);

  // Otomatis sinkronkan profil toko dari metadata QRIS yang baru
  const meta = parseQRISMetadata(state.qrisPayload);
  if (meta && meta.merchantName) {
    state.storeProfile.name = meta.merchantName;
    state.storeProfile.city = meta.city;
    state.storeProfile.nmid = meta.nmid;
    state.storeProfile.acquirer = meta.acquirer;
    saveStoreProfile();
  }
}

/**
 * Dapatkan daftar item baris keranjang antrian (Line Items)
 * Mendukung item unik per preferensi catatan & add-on
 */
export function getQueueLineItems(q) {
  if (!q) return [];
  if (Array.isArray(q.items)) {
    return q.items;
  }
  const items = [];
  if (q.cart) {
    Object.entries(q.cart).forEach(([prodId, qty]) => {
      if (qty > 0) {
        items.push({
          lineId: 'line_' + prodId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          productId: prodId,
          qty: qty,
          note: (q.notes && q.notes[prodId]) || '',
          addOns: []
        });
      }
    });
  }
  q.items = items;
  return items;
}

/**
 * Sinkronkan kembali q.cart dan q.notes dari q.items untuk backward compatibility
 */
export function syncQueueCartFromItems(q) {
  if (!q) return;
  if (!Array.isArray(q.items)) q.items = [];
  q.cart = {};
  q.notes = {};
  q.items.forEach(it => {
    q.cart[it.productId] = (q.cart[it.productId] || 0) + it.qty;
    if (it.note) {
      q.notes[it.productId] = it.note;
    }
  });
}

/**
 * Dapatkan objek keranjang antrian yang aktif saat ini
 */
export function getCurrentCart() {
  const q = state.orderQueues.find(item => item.id === state.activeQueueId);
  return q ? (q.cart || {}) : {};
}

/**
 * Dapatkan data antrian aktif
 */
export function getActiveQueue() {
  return state.orderQueues.find(q => q.id === state.activeQueueId);
}

/**
 * Hitung total harga dan jumlah item di keranjang aktif (termasuk harga Add-On)
 */
export function calculateCartTotal() {
  const q = getActiveQueue();
  if (!q) return { total: 0, count: 0 };

  const items = getQueueLineItems(q);
  let total = 0;
  let count = 0;

  items.forEach(item => {
    const p = state.products.find(prod => prod.id === item.productId);
    if (p && item.qty > 0) {
      let unitPrice = p.price;
      if (Array.isArray(item.addOns)) {
        item.addOns.forEach(ao => {
          unitPrice += (Number(ao.price) || 0);
        });
      }
      total += unitPrice * item.qty;
      count += item.qty;
    }
  });

  return { total, count };
}


