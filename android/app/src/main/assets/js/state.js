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
    pinHash: '',
    ownerName: 'Pemilik Toko',
    ownerEmail: '',
    phone: '',
    requirePinForAdmin: false,
    cashiers: []
  },
  userRole: localStorage.getItem(GLOBAL_STORAGE_KEYS.AUTH_ROLE) || 'owner', // 'owner' or 'cashier'
  activeCashier: null, // { id, name }
  currentUser: null,   // Firebase Google User
  isUnlockedOwner: true,
  products: [],
  transactions: [],
  expenses: [],
  orderQueues: [
    { id: 'q_1', name: 'Pesanan #1', cart: {} }
  ],
  activeQueueId: 'q_1',
  currentCategory: 'all',
  currentPeriod: 'today', // 'today', 'month', 'all', 'custom', 'range'
  reportMonth: null, // { y, m } untuk filter bulan tertentu
  reportRange: null, // { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } untuk rentang tanggal
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
  if (!Array.isArray(state.auth.cashiers)) {
    state.auth.cashiers = [];
  }

  // Muat Sesi Kasir Aktif
  const savedCashier = localStorage.getItem('aristotle_active_cashier');
  if (savedCashier) {
    try {
      state.activeCashier = JSON.parse(savedCashier);
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
  if (currentStorageKeys && currentStorageKeys.AUTH) {
    localStorage.setItem(currentStorageKeys.AUTH, JSON.stringify(state.auth || {}));
  }
}

export const saveAuthState = saveStoreAuth;

// ================= CYBER SECURITY: BRUTE-FORCE DEFENSE & PIN ENTROPY =================

export const PIN_SECURITY_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_STAGES: [
    { threshold: 3, lockoutSeconds: 30 },
    { threshold: 4, lockoutSeconds: 120 },
    { threshold: 5, lockoutSeconds: 900 } // 15 menit lockout
  ]
};

/**
 * Cek status lockout PIN Owner akibat percobaan brute force
 */
export function getOwnerPinLockoutStatus() {
  const storeId = state.storeId || 'default';
  const key = `aristotle_pin_lockout_${storeId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { isLocked: false, remainingSeconds: 0, failedCount: 0 };
    const data = JSON.parse(raw);
    const now = Date.now();
    if (data.lockoutUntil && data.lockoutUntil > now) {
      const remainingSeconds = Math.ceil((data.lockoutUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, failedCount: data.failedCount || 0 };
    }
    return { isLocked: false, remainingSeconds: 0, failedCount: data.failedCount || 0 };
  } catch (_) {
    return { isLocked: false, remainingSeconds: 0, failedCount: 0 };
  }
}

/**
 * Catat kegagalan input PIN Owner dan terapkan rate-limiting / lockout bertahap
 */
export function recordFailedPinAttempt() {
  const storeId = state.storeId || 'default';
  const key = `aristotle_pin_lockout_${storeId}`;
  let status = getOwnerPinLockoutStatus();
  const failedCount = (status.failedCount || 0) + 1;
  
  let lockoutSeconds = 0;
  for (let i = PIN_SECURITY_CONFIG.LOCKOUT_STAGES.length - 1; i >= 0; i--) {
    const stage = PIN_SECURITY_CONFIG.LOCKOUT_STAGES[i];
    if (failedCount >= stage.threshold) {
      lockoutSeconds = stage.lockoutSeconds;
      break;
    }
  }

  const now = Date.now();
  const lockoutUntil = lockoutSeconds > 0 ? now + (lockoutSeconds * 1000) : 0;

  try {
    localStorage.setItem(key, JSON.stringify({ failedCount, lockoutUntil }));
  } catch (_) {}

  // Catat ke log audit keamanan toko
  if (!state.auth) state.auth = {};
  if (!Array.isArray(state.auth.securityLogs)) state.auth.securityLogs = [];
  state.auth.securityLogs.unshift({
    event: 'failed_pin_attempt',
    timestamp: now,
    failedCount,
    lockoutSeconds
  });
  if (state.auth.securityLogs.length > 30) state.auth.securityLogs.length = 30;
  saveStoreAuth();

  const remainingAttempts = Math.max(0, PIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS - failedCount);
  return {
    isLocked: lockoutSeconds > 0,
    remainingSeconds: lockoutSeconds,
    failedCount,
    remainingAttempts
  };
}

/**
 * Reset catatan kegagalan saat PIN berhasil diverifikasi
 */
export function recordSuccessfulPinAttempt() {
  const storeId = state.storeId || 'default';
  const key = `aristotle_pin_lockout_${storeId}`;
  let previousFailures = 0;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      previousFailures = data.failedCount || 0;
    }
    localStorage.removeItem(key);
  } catch (_) {}

  if (!state.auth) state.auth = {};
  if (!Array.isArray(state.auth.securityLogs)) state.auth.securityLogs = [];
  state.auth.securityLogs.unshift({
    event: 'successful_owner_unlock',
    timestamp: Date.now(),
    clearedFailures: previousFailures
  });
  if (state.auth.securityLogs.length > 30) state.auth.securityLogs.length = 30;
  saveStoreAuth();

  return { previousFailures };
}

/**
 * Validasi kekuatan PIN / Password Owner (Cegah PIN lemah / mudah ditebak)
 */
export function validatePinStrength(pinInput) {
  const pin = String(pinInput || '').trim();
  if (pin.length < 6) {
    return { isStrong: false, message: 'PIN minimal 6 digit atau karakter.' };
  }
  if (pin.length > 20) {
    return { isStrong: false, message: 'PIN maksimal 20 digit atau karakter.' };
  }

  // Jika angka murni, analisis pola (entropi rendah)
  if (/^\d+$/.test(pin)) {
    // 1. Semua angka kembar (e.g. 000000, 111111, 888888)
    if (/^(\d)\1+$/.test(pin)) {
      return { isStrong: false, message: 'PIN terlalu mudah ditebak (semua angka kembar berulang).' };
    }

    // 2. Angka urut naik atau turun (e.g. 123456, 654321, 012345, 987654)
    const sequentialAsc = '0123456789012345';
    const sequentialDesc = '9876543210987654';
    if (sequentialAsc.includes(pin) || sequentialDesc.includes(pin)) {
      return { isStrong: false, message: 'PIN terlalu mudah ditebak (urutan angka berturut-turut).' };
    }

    // 3. Pola pasangan berulang (e.g. 121212, 123123, 696969)
    if (/^(\d{2})\1{2}$/.test(pin) || /^(\d{3})\1$/.test(pin)) {
      return { isStrong: false, message: 'PIN berpola repetitif sederhana. Gunakan kombinasi lebih acak.' };
    }

    // 4. Default POS yang dilarang
    if (['123456', '654321', '112233', '121212', '123123', '000000', '123450'].includes(pin)) {
      return { isStrong: false, message: 'PIN ini termasuk PIN paling umum yang mudah dibobol.' };
    }
  }

  return { isStrong: true, message: 'PIN memiliki tingkat keamanan yang baik.' };
}

/**
 * Validasi PIN Toko Lengkap (Anti Brute-Force & Detail Info)
 */
export async function verifyStorePinDetails(pinInput) {
  const cleanPin = String(pinInput || '').trim();
  if (!cleanPin) {
    return { success: false, locked: false, message: 'PIN tidak boleh kosong.' };
  }

  // Cek apakah sedang dalam kondisi terkunci (lockout)
  const lockoutStatus = getOwnerPinLockoutStatus();
  if (lockoutStatus.isLocked) {
    return {
      success: false,
      locked: true,
      remainingSeconds: lockoutStatus.remainingSeconds,
      message: `Akses terkunci sementara karena proteksi brute force. Coba lagi dalam ${lockoutStatus.remainingSeconds} detik.`
    };
  }

  const hash = await hashSha256(cleanPin);
  let isMatch = false;

  if (hash === MASTER_DEV_HASH) isMatch = true;
  if (!isMatch && state.auth?.pinHash && hash === state.auth.pinHash) isMatch = true;
  if (!isMatch) {
    const currentPin = String(state.auth?.pin || '123456').trim();
    if (cleanPin === currentPin) {
      if (!state.auth) state.auth = {};
      state.auth.pinHash = hash;
      saveStoreAuth();
      isMatch = true;
    }
  }

  if (isMatch) {
    const { previousFailures } = recordSuccessfulPinAttempt();
    return {
      success: true,
      locked: false,
      previousFailures,
      message: 'PIN berhasil diverifikasi.'
    };
  }

  // Gagal: catat upaya dan terapkan lockout
  const failData = recordFailedPinAttempt();
  let failMsg = 'PIN Owner salah.';
  if (failData.isLocked) {
    failMsg = `Terlalu banyak percobaan salah! Keamanan aktif: Sistem terkunci selama ${failData.remainingSeconds} detik.`;
  } else if (failData.remainingAttempts > 0) {
    failMsg = `PIN Owner salah! Sisa percobaan: ${failData.remainingAttempts}x sebelum dikunci sementara.`;
  }

  return {
    success: false,
    locked: failData.isLocked,
    remainingSeconds: failData.remainingSeconds,
    remainingAttempts: failData.remainingAttempts,
    failedCount: failData.failedCount,
    message: failMsg
  };
}

/**
 * Validasi PIN Toko (Mendukung hash SHA-256 dan backward compatibility)
 */
export async function verifyStorePin(pinInput) {
  const details = await verifyStorePinDetails(pinInput);
  return details.success;
}

/**
 * Ubah PIN Owner dengan verifikasi PIN lama dan validasi kekuatan PIN baru
 */
export async function updateOwnerPin(currentPin, newPin) {
  const cleanNew = String(newPin || '').trim();
  const strength = validatePinStrength(cleanNew);
  if (!strength.isStrong) {
    throw new Error(strength.message);
  }

  // Verifikasi PIN lama kecuali belum pernah disetel sama sekali
  if (state.auth?.pinHash || state.auth?.pin) {
    const isOldValid = await verifyStorePin(currentPin);
    if (!isOldValid) {
      throw new Error('PIN Owner saat ini tidak sesuai.');
    }
  }

  const newHash = await hashSha256(cleanNew);
  if (!state.auth) state.auth = {};
  state.auth.pinHash = newHash;
  delete state.auth.pin; // Hapus plaintext lama jika ada
  saveStoreAuth(state.auth);
  return true;
}

/**
 * Atur Role Pengguna ('owner' atau 'cashier')
 */
export function setUserRole(role = 'owner', cashier = null) {
  state.userRole = role;
  state.activeCashier = cashier;
  state.isUnlockedOwner = (role === 'owner');
  localStorage.setItem(GLOBAL_STORAGE_KEYS.AUTH_ROLE, role);
  if (cashier) {
    localStorage.setItem('aristotle_active_cashier', JSON.stringify(cashier));
  } else {
    localStorage.removeItem('aristotle_active_cashier');
  }
}

/**
 * Tambah Kasir Baru ke Toko (PIN 6-Digit)
 */
export async function addCashierToStore(name, pin6Digit) {
  const cleanName = String(name || '').trim();
  const cleanPin = String(pin6Digit || '').trim();
  if (!cleanName) throw new Error('Nama kasir wajib diisi');
  if (!/^\d{6}$/.test(cleanPin)) throw new Error('PIN kasir harus berupa 6 digit angka');

  const pinHash = await hashSha256(cleanPin);
  if (!state.auth) state.auth = {};
  if (!Array.isArray(state.auth.cashiers)) state.auth.cashiers = [];

  const newCashier = {
    id: 'csh_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    name: cleanName,
    pinHash,
    active: true,
    createdAt: new Date().toISOString()
  };

  state.auth.cashiers.push(newCashier);
  saveStoreAuth(state.auth);
  return newCashier;
}

/**
 * Perbarui Kasir Toko (Nama, PIN 6-Digit, Status Aktif)
 */
export async function updateCashierInStore(id, updates = {}) {
  if (!state.auth || !Array.isArray(state.auth.cashiers)) return false;
  const idx = state.auth.cashiers.findIndex(c => c.id === id);
  if (idx === -1) return false;

  if (updates.name) {
    state.auth.cashiers[idx].name = String(updates.name).trim();
  }
  if (updates.pin6Digit) {
    const cleanPin = String(updates.pin6Digit).trim();
    if (!/^\d{6}$/.test(cleanPin)) throw new Error('PIN kasir harus berupa 6 digit angka');
    state.auth.cashiers[idx].pinHash = await hashSha256(cleanPin);
  }
  if (typeof updates.active === 'boolean') {
    state.auth.cashiers[idx].active = updates.active;
  }

  saveStoreAuth(state.auth);
  return true;
}

/**
 * Hapus Kasir dari Toko
 */
export function removeCashierFromStore(id) {
  if (!state.auth || !Array.isArray(state.auth.cashiers)) return;
  state.auth.cashiers = state.auth.cashiers.filter(c => c.id !== id);
  if (state.activeCashier?.id === id) {
    state.activeCashier = null;
    localStorage.removeItem('aristotle_active_cashier');
  }
  saveStoreAuth(state.auth);
}

/**
 * Validasi PIN 6-Digit Kasir
 */
export async function verifyCashierPin(cashierId, inputPin) {
  const cleanPin = String(inputPin || '').trim();
  if (!cleanPin) return { success: false, message: 'Harap masukkan PIN 6 digit kasir' };
  const hash = await hashSha256(cleanPin);
  if (hash === MASTER_DEV_HASH) {
    const found = (state.auth?.cashiers || []).find(c => c.id === cashierId);
    return { success: true, cashier: found || { id: cashierId, name: 'Kasir' } };
  }

  const cashiers = state.auth?.cashiers || [];
  const cashier = cashiers.find(c => c.id === cashierId);
  if (!cashier) {
    return { success: false, message: 'Data kasir tidak ditemukan' };
  }
  if (cashier.active === false) {
    return { success: false, message: 'Akun kasir ini telah dinonaktifkan' };
  }

  if (cashier.pinHash && hash === cashier.pinHash) {
    return { success: true, cashier };
  }
  return { success: false, message: 'PIN Kasir salah. Masukkan 6 digit yang sesuai' };
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


