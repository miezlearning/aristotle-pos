/**
 * Kasir Mami - Main Application Entry Point & Module Orchestrator
 */

import { 
  initState, 
  state, 
  getSavedStoresList, 
  registerStoreOnDevice, 
  removeStoreFromDevice, 
  saveStoreAuth, 
  verifyStorePin, 
  setUserRole 
} from './state.js';
import { getStorageKeys, GLOBAL_STORAGE_KEYS, DEFAULT_PRODUCTS, DEFAULT_PRINTER_CONFIG } from './config.js';
import { showToast, playClick, escapeHtml, showConfirmDialog } from './utils.js';
import * as pos from './modules/pos.js';
import * as payment from './modules/payment.js';
import * as admin from './modules/admin.js';
import * as report from './modules/report.js';
import * as tour from './modules/tour.js';
import * as superadmin from './modules/superadmin.js';
import * as printer from './modules/printer.js';
import * as updater from './modules/updater.js';
import * as shift from './modules/shift.js';
import { initErrorTelemetry, sendTelemetryToDiscord } from './modules/telemetry.js';

// Activate Enterprise Crash Telemetry Watchdog
initErrorTelemetry();
import { 
  initFirebaseSync, 
  setRemoteUpdateCallback, 
  forceUploadAllToCloud,
  syncSaveStoreAuth,
  syncSaveStoreProfile,
  setupRealtimeListeners,
  unsubscribeAllListeners,
  authenticateStoreLogin,
  superAdminUpdateStorePin,
  syncStoreToRegistry
} from './firebase.js';

let pendingTargetView = null;

// ================= VIEW NAVIGATION =================
export function switchView(viewName) {
  playClick('switch');

  // Proteksi PIN untuk Menu & Laporan jika diaktifkan oleh pemilik toko
  if ((viewName === 'admin' || viewName === 'report') && state.auth?.requirePinForAdmin && !state.isUnlockedOwner) {
    pendingTargetView = viewName;
    openPinSecurityModal(viewName);
    return;
  }

  const viewPos = document.getElementById('viewPos');
  const viewAdmin = document.getElementById('viewAdmin');
  const viewReport = document.getElementById('viewReport');
  const viewSuperAdmin = document.getElementById('viewSuperAdmin');

  const btnPosM = document.getElementById('btnNavPosMobile') || document.getElementById('btnNavPos');
  const btnReportM = document.getElementById('btnNavReportMobile') || document.getElementById('btnNavReport');
  const btnAdminM = document.getElementById('btnNavAdminMobile') || document.getElementById('btnNavAdmin');
  
  // Hide all screens
  if (viewPos) viewPos.classList.add('hidden');
  if (viewAdmin) viewAdmin.classList.add('hidden');
  if (viewReport) viewReport.classList.add('hidden');
  if (viewSuperAdmin) viewSuperAdmin.classList.add('hidden');

  // Reset Mobile Navigation Buttons
  const navInactiveClass = 'flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-stone-500 hover:text-stone-800 font-bold text-xs touch-target-large transition active:scale-95';
  const navActiveClass = 'flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-emerald-800 bg-emerald-50 font-black text-xs touch-target-large transition active:scale-95 shadow-2xs';

  [btnPosM, btnReportM, btnAdminM].forEach(b => {
    if (b) b.className = navInactiveClass;
  });

  const mobileNav = document.getElementById('mobileBottomNav') || document.querySelector('nav.lg\\:hidden') || document.querySelector('nav.md\\:hidden');
  const mainHeader = document.getElementById('mainAppHeader');
  const mobileFloating = document.getElementById('mobileFloatingCart');

  if (mobileFloating && viewName !== 'pos') {
    mobileFloating.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
  }

  if (viewName === 'pos') {
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (viewPos) viewPos.classList.remove('hidden');
    if (btnPosM) btnPosM.className = navActiveClass;
    pos.renderOrderQueueTabs();
    pos.renderProducts();
    pos.renderCart();
    if (state.storeId) {
      window.history.replaceState(null, '', `${window.location.pathname}?store=${encodeURIComponent(state.storeId)}`);
    }
  } else if (viewName === 'admin') {
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (viewAdmin) viewAdmin.classList.remove('hidden');
    if (btnAdminM) btnAdminM.className = navActiveClass;
    admin.renderAdminTable();
    if (state.storeId) {
      window.history.replaceState(null, '', `${window.location.pathname}?store=${encodeURIComponent(state.storeId)}`);
    }
  } else if (viewName === 'report') {
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (viewReport) viewReport.classList.remove('hidden');
    if (btnReportM) btnReportM.className = navActiveClass;
    report.renderFinancialReport();
    if (state.storeId) {
      window.history.replaceState(null, '', `${window.location.pathname}?store=${encodeURIComponent(state.storeId)}`);
    }
  } else if (viewName === 'superadmin') {
    if (mainHeader) mainHeader.classList.add('hidden'); // Sembunyikan header utama toko agar tidak double header dengan M3 Top Bar
    if (mobileNav) mobileNav.classList.add('hidden'); // Sembunyikan bottom bar kasir saat mode Super Admin
    if (viewSuperAdmin) viewSuperAdmin.classList.remove('hidden');
    window.history.replaceState(null, '', `${window.location.pathname}?view=superadmin`);
    superadmin.renderSuperAdminDashboard();
  }

  // Update M3 Navigation Rail active destination
  updateM3NavRailUI(viewName);
}

export function handleSearchInput(e) {
  const clearBtn = document.getElementById('clearSearchBtn');
  const val = (e && e.target) ? e.target.value : (document.getElementById('searchInput')?.value || '');
  if (clearBtn) {
    if (val.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }
  pos.renderProducts();
}

export function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  if (clearBtn) {
    clearBtn.classList.add('hidden');
  }
  pos.renderProducts();
}

/**
 * Update active destination indicator on M3 Navigation Rail
 */
export function updateM3NavRailUI(viewName) {
  const pillPos = document.getElementById('railPillPos');
  const labelPos = document.getElementById('railLabelPos');
  const pillReport = document.getElementById('railPillReport');
  const labelReport = document.getElementById('railLabelReport');
  const pillAdmin = document.getElementById('railPillAdmin');
  const labelAdmin = document.getElementById('railLabelAdmin');

  if (!pillPos) return;

  // Reset all rail destinations to unselected
  [pillPos, pillReport, pillAdmin].forEach(p => {
    if (p) p.className = 'w-12 h-8 rounded-full text-stone-600 group-hover:bg-stone-100 flex items-center justify-center transition';
  });
  [labelPos, labelReport, labelAdmin].forEach(l => {
    if (l) l.className = 'text-[10px] font-bold text-stone-500 group-hover:text-stone-900 tracking-tight mt-1';
  });

  if (viewName === 'pos') {
    if (pillPos) pillPos.className = 'w-12 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center transition shadow-xs';
    if (labelPos) labelPos.className = 'text-[10px] font-black text-emerald-800 tracking-tight mt-1';
  } else if (viewName === 'report') {
    if (pillReport) pillReport.className = 'w-12 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center transition shadow-xs';
    if (labelReport) labelReport.className = 'text-[10px] font-black text-emerald-800 tracking-tight mt-1';
  } else if (viewName === 'admin') {
    if (pillAdmin) pillAdmin.className = 'w-12 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center transition shadow-xs';
    if (labelAdmin) labelAdmin.className = 'text-[10px] font-black text-emerald-800 tracking-tight mt-1';
  }
}

// ================= CLOUD SYNC & MULTI-STORE MODAL =================
export function openCloudModal() {
  playClick('pop');
  if (!state.storeId) {
    openUniversalLoginModal('login');
    return;
  }

  const modal = document.getElementById('cloudModal');
  if (modal) {
    const storeDisplay = document.getElementById('cloudStoreIdDisplay');
    const storeNameDisplay = document.getElementById('cloudStoreNameDisplay');
    const storeIdShort = document.getElementById('cloudStoreIdShort');
    const modalStatusEl = document.getElementById('cloudModalStatusText');
    const modalStatusDot = document.getElementById('cloudModalStatusDot');
    const modalStatusBadge = document.getElementById('cloudModalStatusBadge');
    
    if (storeDisplay) {
      storeDisplay.innerText = `${state.storeProfile?.name || 'Toko UMKM'} (${state.storeId})`;
    }
    if (storeNameDisplay) {
      storeNameDisplay.innerText = state.storeProfile?.name || state.storeId;
    }
    if (storeIdShort) {
      storeIdShort.innerText = state.storeId;
    }
    if (modalStatusDot) {
      modalStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
    }
    if (modalStatusBadge) {
      modalStatusBadge.className = 'flex items-center gap-1.5 pt-1 shrink-0';
    }
    if (modalStatusEl) {
      modalStatusEl.innerText = 'Online';
      modalStatusEl.className = 'text-xs font-medium text-stone-500';
    }
    updatePinButtonUI();
    modal.classList.remove('hidden');
  }
}

export function closeCloudModal() {
  playClick('pop');
  const modal = document.getElementById('cloudModal');
  if (modal) modal.classList.add('hidden');
}

export function copyStoreShareLink() {
  const baseUrl = window.location.origin + window.location.pathname;
  let hostIp = '';
  if (window.AndroidBridge && typeof window.AndroidBridge.getLocalIpAddress === 'function') {
    try {
      const ip = window.AndroidBridge.getLocalIpAddress();
      if (ip && ip !== '127.0.0.1') hostIp = ip;
    } catch (_) {}
  }
  const hostParam = hostIp ? `&hostIp=${encodeURIComponent(hostIp)}` : '';
  const storeUrl = `${baseUrl}?store=${encodeURIComponent(state.storeId)}${hostParam}`;
  const storeName = state.storeProfile?.name || 'Kasir UMKM';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(storeUrl).then(() => {
      showToast(`Link Toko [${storeName}] berhasil disalin ke clipboard!`, 'success');
    }).catch(() => {
      prompt(`Salin link untuk Toko [${storeName}]:`, storeUrl);
    });
  } else {
    prompt(`Salin link untuk Toko [${storeName}]:`, storeUrl);
  }
}

export function switchStore(newStoreId) {
  if (!newStoreId) return;
  const cleanId = newStoreId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (cleanId) {
    const baseUrl = window.location.origin + window.location.pathname;
    window.location.href = `${baseUrl}?store=${encodeURIComponent(cleanId)}`;
  }
}

// ================= UNIVERSAL LOGIN & REGISTRATION =================
export function openUniversalLoginModal(defaultTab = 'login') {
  playClick('pop');
  const modal = document.getElementById('universalLoginModal');
  if (!modal) return;

  switchAuthTab(defaultTab);
  renderSavedStoresList();
  modal.classList.remove('hidden');
}

export function closeUniversalLoginModal() {
  playClick('pop');
  const modal = document.getElementById('universalLoginModal');
  if (modal) modal.classList.add('hidden');
}

export function switchAuthTab(tab) {
  playClick('pop');
  const tabLogin = document.getElementById('authTabLogin');
  const tabRegister = document.getElementById('authTabRegister');
  const contentLogin = document.getElementById('authContentLogin');
  const contentRegister = document.getElementById('authContentRegister');

  if (tab === 'login') {
    if (tabLogin) tabLogin.className = 'flex-1 py-2 rounded-lg text-xs font-black transition bg-emerald-600 text-white shadow-sm';
    if (tabRegister) tabRegister.className = 'flex-1 py-2 rounded-lg text-xs font-bold transition text-emerald-300 hover:text-white';
    if (contentLogin) contentLogin.classList.remove('hidden');
    if (contentRegister) contentRegister.classList.add('hidden');
    renderSavedStoresList();
  } else {
    if (tabLogin) tabLogin.className = 'flex-1 py-2 rounded-lg text-xs font-bold transition text-emerald-300 hover:text-white';
    if (tabRegister) tabRegister.className = 'flex-1 py-2 rounded-lg text-xs font-black transition bg-emerald-600 text-white shadow-sm';
    if (contentLogin) contentLogin.classList.add('hidden');
    if (contentRegister) contentRegister.classList.remove('hidden');
  }
}

export function renderSavedStoresList() {
  const container = document.getElementById('savedStoresList');
  if (!container) return;

  const stores = getSavedStoresList();
  if (stores.length === 0) {
    container.innerHTML = `
      <div class="py-4 px-3 text-center flex flex-col items-center justify-center bg-stone-50 rounded-2xl border border-dashed border-stone-300">
        <p class="text-xs font-bold text-stone-700">Belum Ada Toko Terdaftar di HP Ini</p>
        <p class="text-[11px] text-stone-500 mt-1 max-w-xs leading-relaxed">
          Silakan daftarkan toko baru Anda dalam 10 detik atau coba akun demo kasir.
        </p>
        <div class="flex items-center gap-2 mt-3 w-full">
          <button type="button" onclick="KasirApp.switchAuthTab('register')"
            class="flex-1 py-2 px-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition active:scale-95">
            + Daftar Toko Baru
          </button>
          <button type="button" onclick="KasirApp.quickDemoStore()"
            class="py-2 px-2.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs border border-stone-300 transition active:scale-95">
            Coba Demo
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = stores.map(s => {
    const isCurrent = state.isSessionActive && s.id === state.storeId;
    return `
      <div class="flex items-center justify-between p-2.5 rounded-xl border ${isCurrent ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-stone-200 hover:border-emerald-200'} transition">
        <div class="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0" onclick="KasirApp.selectStoreForLogin('${escapeHtml(s.id)}', '${escapeHtml(s.name)}')">
          <div class="w-8 h-8 rounded-lg ${isCurrent ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700'} flex items-center justify-center font-black text-xs shrink-0">
            <span class="material-symbols-rounded text-lg">storefront</span>
          </div>
          <div class="min-w-0">
            <h5 class="text-xs font-black text-stone-900 truncate">${escapeHtml(s.name)}</h5>
            <p class="text-[10px] text-stone-500 truncate">${escapeHtml(s.id)} ${s.ownerName ? `• ${escapeHtml(s.ownerName)}` : ''}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="KasirApp.selectStoreForLogin('${escapeHtml(s.id)}', '${escapeHtml(s.name)}')"
            class="px-2.5 py-1 rounded-lg ${isCurrent ? 'bg-emerald-700 text-white' : 'bg-stone-100 hover:bg-emerald-100 text-stone-800'} font-bold text-[11px] transition">
            ${isCurrent ? 'Aktif' : 'Buka'}
          </button>
          <button type="button" onclick="KasirApp.deleteSavedStoreCard('${escapeHtml(s.id)}')" title="Hapus dari daftar cepat"
            class="p-1 text-stone-400 hover:text-rose-600 rounded-md transition">
            <span class="material-symbols-rounded text-base">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Buat toko demo lokal terisolasi untuk uji coba langsung tanpa registrasi
 */
export function quickDemoStore() {
  playClick('pop');
  const demoId = 'toko_demo';
  const demoProfile = {
    id: demoId,
    name: 'Toko Demo Aristotle',
    city: 'Indonesia',
    nmid: '',
    acquirer: 'Aristotle POS'
  };
  const demoAuth = {
    pin: '123456',
    ownerName: 'Pemilik Demo',
    phone: '',
    requirePinForAdmin: false
  };
  const demoKeys = getStorageKeys(demoId);
  try {
    localStorage.setItem(demoKeys.PROFILE, JSON.stringify(demoProfile));
    localStorage.setItem(demoKeys.AUTH, JSON.stringify(demoAuth));
    localStorage.setItem(demoKeys.PRODUCTS, JSON.stringify(DEFAULT_PRODUCTS));
    localStorage.setItem(demoKeys.PRINTER, JSON.stringify({
      ...DEFAULT_PRINTER_CONFIG,
      headerStoreName: 'Toko Demo Aristotle',
      cashierName: 'Kasir Demo'
    }));
    localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, demoId);
    registerStoreOnDevice({
      id: demoId,
      name: demoProfile.name,
      ownerName: demoAuth.ownerName,
      phone: demoAuth.phone
    });
  } catch (_) {}

  quickSelectStore(demoId);
  showToast('Masuk ke Toko Demo. Silakan coba semua fitur kasir!', 'success', 3500);
}

export function selectStoreForLogin(storeId, storeName) {
  playClick('tap');
  const storeInput = document.getElementById('loginStoreIdInput');
  const pinInput = document.getElementById('loginPinInput');
  if (storeInput) {
    storeInput.value = storeId;
  }
  if (pinInput) {
    pinInput.value = '';
    pinInput.focus();
  }
  showToast(`Ketik 6 digit PIN toko [${storeName || storeId}] lalu klik Buka Kasir`, 'info', 3000);
}

export function quickSelectStore(storeId) {
  if (!storeId) return;
  const cleanId = storeId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!cleanId) return;

  sessionStorage.removeItem('is_logged_out_state');
  localStorage.setItem('auth_store_session_' + cleanId, '1');
  localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, cleanId);
  window.history.replaceState(null, '', `${window.location.pathname}?store=${encodeURIComponent(cleanId)}`);

  state.storeId = cleanId;
  state.isSessionActive = true;
  state.currentCategory = 'all';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  initState();
  setupRealtimeListeners();
  pos.syncCategoryPillsUI();
  pos.renderOrderQueueTabs();
  pos.renderCart();
  pos.renderProducts();
  admin.renderAdminTable();
  report.renderFinancialReport();
  updatePinButtonUI();
  closeUniversalLoginModal();
  showToast(`Kasir [${state.storeProfile?.name || cleanId}] siap melayani`, 'success');
}

export function deleteSavedStoreCard(storeId) {
  removeStoreFromDevice(storeId);
  if (state.storeId === storeId) {
    unsubscribeAllListeners();
    state.storeId = null;
    state.isSessionActive = false;
    state.currentCategory = 'all';
    state.activeQueueId = 'q_1';
    state.orderQueues = [{ id: 'q_1', name: 'Pesanan #1', cart: {} }];

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    localStorage.removeItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID);
    sessionStorage.setItem('is_logged_out_state', '1');
    window.history.replaceState(null, '', window.location.pathname);
    initState();
    pos.syncCategoryPillsUI();
    pos.renderOrderQueueTabs();
    pos.renderCart();
    pos.renderProducts();
  }
  renderSavedStoresList();
  showToast('Toko dihapus dari daftar perangkat.', 'info');
}

export async function handleStoreLoginSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('loginStoreIdInput');
  const pinInput = document.getElementById('loginPinInput');
  const submitBtn = e?.target?.querySelector('button[type="submit"]');

  let rawValue = input ? input.value.trim() : '';
  let inputPin = pinInput ? pinInput.value.trim() : '';

  if (!rawValue) {
    showToast('Harap masukkan nama / ID toko', 'warning');
    if (input) input.focus();
    return;
  }

  // Jika user mem-paste URL lengkap (?store=nama_toko)
  if (rawValue.includes('?store=')) {
    try {
      const url = new URL(rawValue);
      const sp = url.searchParams.get('store');
      if (sp) rawValue = sp;
    } catch (err) {
      const match = rawValue.match(/\?store=([^&]+)/);
      if (match && match[1]) rawValue = match[1];
    }
  }

  const cleanId = rawValue.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleanId) {
    showToast('Harap masukkan nama / ID toko dengan benar', 'warning');
    return;
  }

  if (!inputPin) {
    showToast('Harap masukkan PIN toko.', 'warning', 3000);
    if (pinInput) pinInput.focus();
    return;
  }

  // Disable submit button temporarily during verification
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Memverifikasi Akun & PIN...</span>`;
  }

  try {
    const authResult = await authenticateStoreLogin(cleanId, inputPin);

    if (!authResult.success) {
      playClick('error');
      showToast(authResult.message, 'error', 4500);
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
      return;
    }

    // Autentikasi Berhasil -> Daftarkan ke perangkat dan buka kasir
    try {
      localStorage.setItem('auth_store_session_' + cleanId, '1');
    } catch (e) {}

    registerStoreOnDevice({
      id: cleanId,
      name: authResult.storeName
    });

    quickSelectStore(cleanId);
    if (pinInput) pinInput.value = '';
    showToast(`Login Berhasil! Kasir [${authResult.storeName}] siap melayani.`, 'success');
  } catch (err) {
    console.error('Login error:', err);
    showToast('Terjadi kesalahan saat memverifikasi: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Buka Kasir Toko Ini</span>`;
    }
  }
}

export function handleStoreRegisterSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('regStoreName');
  const ownerInput = document.getElementById('regOwnerName');
  const phoneInput = document.getElementById('regPhone');
  const pinInput = document.getElementById('regPin');

  const storeName = nameInput ? nameInput.value.trim() : '';
  const ownerName = ownerInput ? ownerInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const pin = pinInput ? pinInput.value.trim() : '123456';

  if (!storeName || !ownerName || !phone) {
    showToast('Harap lengkapi semua kolom pendaftaran toko', 'warning');
    return;
  }

  const cleanId = storeName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleanId) {
    showToast('Nama toko tidak valid', 'warning');
    return;
  }

  const newKeys = getStorageKeys(cleanId);
  const newProfile = {
    id: cleanId,
    name: storeName,
    city: 'Indonesia',
    nmid: '',
    acquirer: 'Aristotle POS'
  };

  const newAuth = {
    pin: pin || '123456',
    ownerName,
    phone,
    requirePinForAdmin: false
  };

  try {
    localStorage.setItem(newKeys.PROFILE, JSON.stringify(newProfile));
    localStorage.setItem(newKeys.AUTH, JSON.stringify(newAuth));
    localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, cleanId);
    registerStoreOnDevice({
      id: cleanId,
      name: storeName,
      ownerName,
      phone
    });

    // Berikan starter menu produk contoh untuk toko baru jika masih kosong
    if (!localStorage.getItem(newKeys.PRODUCTS)) {
      localStorage.setItem(newKeys.PRODUCTS, JSON.stringify(DEFAULT_PRODUCTS));
    }
    // Siapkan konfigurasi printer standar menggunakan identitas toko baru
    if (!localStorage.getItem(newKeys.PRINTER)) {
      localStorage.setItem(newKeys.PRINTER, JSON.stringify({
        ...DEFAULT_PRINTER_CONFIG,
        headerStoreName: storeName,
        headerPhone: phone,
        cashierName: ownerName || 'Kasir'
      }));
    }
  } catch (err) {}

  quickSelectStore(cleanId);
  syncSaveStoreProfile(newProfile);
  syncSaveStoreAuth(newAuth);
  syncStoreToRegistry({ id: cleanId, name: storeName, ownerName, phone, pin: pin || '123456' });
  showToast(`Toko [${storeName}] berhasil didaftarkan & dibuka!`, 'success');
}

// ================= PIN SECURITY & ROLE MANAGEMENT =================
// Perubahan pengaturan PIN wajib verifikasi ulang (re-auth), sesuai standar:
// staf yang tidak tahu PIN Owner tidak bisa mematikan proteksi.
let pendingSecurityAction = null; // 'enable_pin' | 'disable_pin' | null
let pinFailCount = 0;
let pinLockUntil = 0;

export function openPinSecurityModal(targetView) {
  playClick('pop');
  const modal = document.getElementById('pinSecurityModal');
  const input = document.getElementById('pinSecurityInput');
  const subtitle = document.getElementById('pinChallengeSubtitle');
  
  if (subtitle) {
    if (targetView === 'enable_pin') {
      subtitle.innerText = 'Masukkan PIN Owner untuk mengaktifkan kunci';
    } else if (targetView === 'disable_pin') {
      subtitle.innerText = 'Masukkan PIN Owner untuk mematikan kunci';
    } else {
      const viewLabel = targetView === 'admin' ? 'Kelola Menu & Harga' : 'Laporan Keuangan & Laba';
      subtitle.innerText = `Masukkan PIN Owner untuk membuka ${viewLabel}`;
    }
  }

  if (input) {
    input.value = '';
    input.disabled = false;
  }
  // Update tombol submit state (lockout info)
  updatePinSubmitState();
  if (modal) modal.classList.remove('hidden');
  if (input) {
    requestAnimationFrame(() => input.focus());
  }
}

function updatePinSubmitState() {
  const input = document.getElementById('pinSecurityInput');
  const remaining = Math.ceil((pinLockUntil - Date.now()) / 1000);
  if (remaining > 0 && input) {
    input.placeholder = `Tunggu ${remaining}d...`;
    input.disabled = true;
  }
}

export function closePinSecurityModal() {
  playClick('pop');
  pendingTargetView = null;
  pendingSecurityAction = null;
  const modal = document.getElementById('pinSecurityModal');
  if (modal) modal.classList.add('hidden');
}

export async function handlePinSecuritySubmit(e) {
  if (e) e.preventDefault();

  if (Date.now() < pinLockUntil) {
    const remaining = Math.ceil((pinLockUntil - Date.now()) / 1000);
    showToast(`Terlalu banyak salah. Coba lagi dalam ${remaining} detik.`, 'danger');
    return;
  }

  const input = document.getElementById('pinSecurityInput');
  const entered = input ? input.value.trim() : '';
  if (!entered) return;

  const isOk = await verifyStorePin(entered);
  if (isOk) {
    pinFailCount = 0;
    pinLockUntil = 0;

    // 1. Kasus perubahan pengaturan keamanan (wajib PIN)
    if (pendingSecurityAction === 'enable_pin') {
      state.auth.requirePinForAdmin = true;
      state.isUnlockedOwner = false; // langsung dikunci setelah diaktifkan
      saveStoreAuth(state.auth);
      syncSaveStoreAuth(state.auth);
      updatePinButtonUI();
      pendingSecurityAction = null;
      closePinSecurityModalSilent();
      showToast('Kunci PIN Owner aktif.', 'success');
      return;
    }
    if (pendingSecurityAction === 'disable_pin') {
      state.auth.requirePinForAdmin = false;
      state.isUnlockedOwner = true;
      saveStoreAuth(state.auth);
      syncSaveStoreAuth(state.auth);
      updatePinButtonUI();
      pendingSecurityAction = null;
      closePinSecurityModalSilent();
      showToast('Kunci PIN Owner dimatikan.', 'info');
      return;
    }

    // 2. Kasus buka menu terkunci (sesi saja, pengaturan tetap aktif)
    state.isUnlockedOwner = true;
    closePinSecurityModalSilent();
    showToast('Akses Owner terbuka untuk sesi ini.', 'success');
    if (pendingTargetView) {
      const v = pendingTargetView;
      pendingTargetView = null;
      switchView(v);
    }
  } else {
    pinFailCount += 1;
    if (pinFailCount >= 5) {
      pinLockUntil = Date.now() + 30000;
      pinFailCount = 0;
      showToast('PIN salah 5x. Terkunci 30 detik.', 'danger');
      updatePinSubmitState();
      setTimeout(() => {
        const inp = document.getElementById('pinSecurityInput');
        if (inp) {
          inp.disabled = false;
          inp.placeholder = '••••••';
        }
      }, 30000);
    } else {
      showToast(`PIN salah. (${pinFailCount}/5)`, 'danger');
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function closePinSecurityModalSilent() {
  const modal = document.getElementById('pinSecurityModal');
  if (modal) modal.classList.add('hidden');
  const input = document.getElementById('pinSecurityInput');
  if (input) input.value = '';
}

export function togglePinProtectionSetting() {
  playClick('pop');
  // Jangan langsung toggle. Minta verifikasi PIN dulu.
  // Ini mencegah staf mematikan kunci seenaknya.
  if (!state.auth) return;
  if (state.auth.requirePinForAdmin) {
    pendingSecurityAction = 'disable_pin';
    pendingTargetView = null;
    openPinSecurityModal('disable_pin');
  } else {
    pendingSecurityAction = 'enable_pin';
    pendingTargetView = null;
    openPinSecurityModal('enable_pin');
  }
}

function updatePinButtonUI() {
  const btn = document.getElementById('btnTogglePinSetting');
  if (btn) {
    if (state.auth?.requirePinForAdmin) {
      btn.innerText = 'Aktif';
      btn.className = 'px-2.5 py-1 rounded-lg font-bold text-[11px] transition shrink-0 bg-stone-900 text-white';
    } else {
      btn.innerText = 'Nonaktif';
      btn.className = 'px-2.5 py-1 rounded-lg font-bold text-[11px] transition shrink-0 bg-stone-100 text-stone-500 hover:text-stone-900 border border-stone-200';
    }
  }
}

export async function logoutStore() {
  playClick('pop');
  closeCloudModal();
  const storeName = state.storeProfile?.name || state.storeId || 'Toko';
  const ok = await showConfirmDialog({
    title: 'Keluar dari Toko',
    message: `Keluar dari toko "${storeName}"? Sesi kasir di perangkat ini akan ditutup dan Anda bisa memilih atau mendaftarkan toko lain.`,
    confirmText: 'Ya, Keluar Toko',
    confirmType: 'danger',
    icon: 'logout'
  });

  if (ok) {
    try {
      unsubscribeAllListeners();
      if (state.storeId) {
        localStorage.removeItem('auth_store_session_' + state.storeId);
      }
      localStorage.removeItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID);
      sessionStorage.setItem('is_logged_out_state', '1');
    } catch (err) {}

    state.storeId = null;
    state.isSessionActive = false;
    state.currentCategory = 'all';
    state.activeQueueId = 'q_1';
    state.orderQueues = [{ id: 'q_1', name: 'Pesanan #1', cart: {} }];

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    window.history.replaceState(null, '', window.location.pathname);
    initState();
    pos.syncCategoryPillsUI();
    pos.renderOrderQueueTabs();
    pos.renderCart();
    pos.renderProducts();
    admin.renderAdminTable();
    report.renderFinancialReport();
    updatePinButtonUI();
    openUniversalLoginModal('login');
    showToast(`Berhasil keluar dari ${storeName}. Silakan pilih atau daftarkan toko.`, 'info');
  }
}

export function forceSyncCloud() {
  forceUploadAllToCloud();
}

// ================= SERVICE WORKER REGISTRATION =================
function registerSW() {
  // Hanya daftarkan Service Worker jika didukung dan berjalan di protokol HTTP/HTTPS
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Pantau pembaruan di latar belakang secara senyap TANPA reload otomatis saat startup
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('Aristotle POS: ServiceWorker aktif & siap melayani cache di latar belakang.');
            }
          });
        }
      });
    }).catch(err => {
      console.debug('Aristotle POS: ServiceWorker registration note:', err);
    });
  }
}

// ================= APP INITIALIZATION =================
let isAppInitialized = false;

function updateLoadingProgress(pct, statusText) {
  if (typeof window.updateSplashProgress === 'function') {
    window.updateSplashProgress(pct, statusText);
  }
}

function dismissSplashScreen() {
  const splash = document.getElementById('appSplashScreen');
  if (splash) {
    document.documentElement.classList.remove('fonts-loading');
    setTimeout(() => {
      splash.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        try {
          splash.remove();
        } catch (_) {
          splash.style.display = 'none';
        }
      }, 450);
    }, 250);
  }
}

export async function init() {
  // Cegah inisialisasi ganda dalam satu lifecycle halaman
  if (isAppInitialized) {
    console.warn('Aristotle POS: init() sudah berjalan, melewati inisialisasi duplikat.');
    return;
  }
  isAppInitialized = true;
  try {
    // 1. Initial skeleton & state loading (20%)
    updateLoadingProgress(20, 'Menyiapkan basis data & konfigurasi...');
    pos.renderProductSkeletons(8);
    initState();

    // Baca parameter pairing (role, hostIp) jika ada di URL (misal dibuka dari scan QR / link WA)
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    if (roleParam) {
      localStorage.setItem('aristotle_device_role', roleParam);
    }
    const hostIpParam = urlParams.get('hostIp');
    if (hostIpParam) {
      localStorage.setItem('aristotle_local_host_ip', hostIpParam);
      if (!state.printerConfig) state.printerConfig = {};
      state.printerConfig.localHostIp = hostIpParam;
    }

    // 2. Render UI katalog, antrean, dan keranjang (45%)
    updateLoadingProgress(45, 'Menyiapkan menu & antrean pesanan...');
    pos.renderOrderQueueTabs();
    pos.renderProducts();
    pos.renderCart();

    // 3. Real Asset Readiness Check (70%) - Tunggu font ikon sistem benar-benar siap
    updateLoadingProgress(70, 'Memuat font aset & ikon sistem...');
    if (document.fonts) {
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load('24px "Material Symbols Rounded"'),
            document.fonts.ready
          ]),
          new Promise(resolve => setTimeout(resolve, 600)) // Maksimal 600ms agar boot instan 0-1 detik
        ]);
      } catch (_) {}
    }
    document.documentElement.classList.remove('fonts-loading');

    // 4. Setup Service Worker for offline PWA & Multi-Device sync (90%)
    updateLoadingProgress(90, 'Menghubungkan layanan sinkronisasi...');
    registerSW();

    // Setup Firebase Realtime Cloud Sync (Smart Smooth Live Update)
    setRemoteUpdateCallback((type) => {
      const viewPos = document.getElementById('viewPos');
      const viewAdmin = document.getElementById('viewAdmin');
      const viewReport = document.getElementById('viewReport');

      if (type === 'products') {
        if (viewPos && !viewPos.classList.contains('hidden')) {
          pos.renderProducts();
          pos.renderCart();
        }
        if (viewAdmin && !viewAdmin.classList.contains('hidden')) {
          admin.renderAdminTable();
        }
      } else if (type === 'transactions' || type === 'expenses') {
        if (viewReport && !viewReport.classList.contains('hidden')) {
          report.renderFinancialReport();
        }
      } else if (type === 'queues') {
        if (viewPos && !viewPos.classList.contains('hidden')) {
          pos.renderOrderQueueTabs();
          pos.renderCart();
          pos.renderProducts();

          // Jika modal bayar sedang terbuka di perangkat ini tapi pesanan sudah dibayar/dikosongkan di perangkat lain:
          const payModal = document.getElementById('paymentModal');
          const currentCart = state.orderQueues.find(q => q.id === state.activeQueueId)?.cart || {};
          if (payModal && !payModal.classList.contains('hidden') && Object.keys(currentCart).length === 0) {
            payment.closePaymentModal();
            showToast('Pesanan ini telah diselesaikan atau dikosongkan dari perangkat lain.', 'info');
          }
        }
      }
    });

    initFirebaseSync();

    // 5. Setup Remote Print Host Listener (Device 1 otomatis mengeksekusi print dari Device 2)
    try {
      printer.setupRemotePrintHostListener();
      printer.updatePrinterUIStatus();
    } catch (e) {
      console.warn('Remote print listener init note:', e);
    }

    // Inisialisasi status Shift Kasir
    try {
      shift.initShift();
    } catch (e) {
      console.warn('Shift init note:', e);
    }

    // 6. Selesai (100%)
    updateLoadingProgress(100, 'Sistem kasir siap digunakan!');
    await new Promise(r => setTimeout(r, 200));

  } catch (err) {
    console.warn('Init non-critical error:', err);
  } finally {
    // 7. Dismiss Splash Screen smoothly (Guaranteed)
    dismissSplashScreen();
    initHeaderClock();
  }

  // 6. Cek Route Super Admin via URL Parameter (?view=superadmin atau ?admin=super atau ?superadmin=1 atau #superadmin)
  try {
    const params = new URLSearchParams(window.location.search);
    const isSuperAdminRoute = params.get('view') === 'superadmin' || 
                              params.get('admin') === 'super' || 
                              params.get('superadmin') === '1' ||
                              window.location.hash === '#superadmin';

    if (isSuperAdminRoute) {
      switchView('superadmin');
      showToast('Masuk ke Super Admin Monitoring Hub', 'info', 3000);
      return;
    }
  } catch (e) {}

  // If no store is active or logged out -> Auto open store selector
  if (!state.storeId || sessionStorage.getItem('is_logged_out_state') === '1') {
    setTimeout(() => {
      const saved = getSavedStoresList();
      // Jika belum ada toko sama sekali di HP ini, langsung sodorkan tab Pendaftaran Toko Baru
      if (saved.length === 0) {
        openUniversalLoginModal('register');
      } else {
        openUniversalLoginModal('login');
      }
      
      // Jika tautan mengandung ?store=..., otomatis isikan nama toko & fokuskan kolom PIN!
      try {
        const params = new URLSearchParams(window.location.search);
        const storeParam = params.get('store');
        if (storeParam && storeParam.trim()) {
          const sanitized = storeParam.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const storeInput = document.getElementById('loginStoreIdInput');
          const pinInput = document.getElementById('loginPinInput');
          if (storeInput) storeInput.value = sanitized;
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
          showToast(`Masukkan PIN 6 digit untuk membuka kasir [${sanitized.replace(/_/g, ' ').toUpperCase()}]`, 'info', 4000);
          return;
        }
      } catch (e) {}

      if (sessionStorage.getItem('is_logged_out_state') === '1') {
        showToast('Sesi kasir ditutup. Silakan pilih atau daftarkan toko.', 'info');
      }
    }, 400);
  } else {
    // Welcome Toast Notification
    setTimeout(() => {
      showToast(`Kasir [${state.storeProfile?.name || 'Toko'}] siap melayani`, 'success', 2500);
    }, 700);
  }

  // Cek Pembaruan Aplikasi Otomatis di Latar Belakang (2.5 detik setelah aplikasi terbuka)
  setTimeout(() => {
    updater.checkForAppUpdates(false);
  }, 2500);

  // Inisialisasi gestur Swipe Down to Refresh (Pull-to-Refresh)
  initPullToRefresh();

  // Inisialisasi Dismiss Modal saat Area Blur / Backdrop Diklik & Back Button Handler
  initModalBackdropDismiss();
}

/**
 * Inisialisasi gestur Swipe Down to Refresh (Pull-to-Refresh)
 */
function initPullToRefresh() {
  const indicator = document.getElementById('pullToRefreshIndicator');
  const icon = document.getElementById('pullToRefreshIcon');
  if (!indicator || !icon) return;

  let startY = 0;
  let isPulling = false;
  let pullDistance = 0;
  const THRESHOLD = 65;

  window.addEventListener('touchstart', (e) => {
    if (window.scrollY <= 0 && e.touches.length === 1) {
      const hasOpenModal = document.querySelector('div[id$="Modal"]:not(.hidden)');
      if (!hasOpenModal) {
        startY = e.touches[0].clientY;
        isPulling = true;
        pullDistance = 0;
      }
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const diff = e.touches[0].clientY - startY;

    if (diff > 0 && window.scrollY <= 0) {
      pullDistance = Math.min(85, diff * 0.45);
      indicator.style.transform = `translate(-50%, ${pullDistance}px) scale(${Math.min(1, 0.8 + pullDistance / 150)})`;
      indicator.style.opacity = String(Math.min(1, pullDistance / 35));
      icon.style.transform = `rotate(${diff * 3}deg)`;
    } else {
      isPulling = false;
      indicator.style.transform = '';
      indicator.style.opacity = '0';
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;

    if (pullDistance >= THRESHOLD) {
      indicator.style.transform = 'translate(-50%, 65px) scale(1)';
      indicator.style.opacity = '1';
      icon.classList.add('animate-spin');
      if (navigator.vibrate) navigator.vibrate(25);
      setTimeout(() => {
        window.location.reload();
      }, 350);
    } else {
      indicator.style.transform = '';
      indicator.style.opacity = '0';
      icon.style.transform = '';
    }
  }, { passive: true });
}

let brandSecretTapCount = 0;
let brandTapActionTimeout = null;

/**
 * Handle klik pada avatar brand / toko di Navigation Rail & Mobile Header.
 * - Klik normal (1x): Buka modal profil toko & cloud sync.
 * - Multi-Tap Gesture (3x cepat): Buka otentikasi Super Admin tanpa memicu popup profil toko.
 */
export function handleBrandLogoClick(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  brandSecretTapCount++;

  // Batalkan pembukaan modal profil biasa jika ada tap beruntun
  if (brandTapActionTimeout) {
    clearTimeout(brandTapActionTimeout);
    brandTapActionTimeout = null;
  }

  if (brandSecretTapCount >= 3) {
    brandSecretTapCount = 0;
    playClick('pop');
    closeCloudModal();
    showToast('Membuka Autentikasi Super Admin...', 'info', 2000);
    openSuperAdmin();
    return;
  }

  // Jika tidak ada tap lanjutan dalam 400ms, baru eksekusi klik tunggal biasa
  brandTapActionTimeout = setTimeout(() => {
    brandSecretTapCount = 0;
    openCloudModal();
  }, 400);
}

/**
 * Toggle Mode Layar Penuh (Kiosk POS) untuk Tablet & Desktop
 */
export function toggleFullscreen() {
  playClick('tap');
  if (!document.fullscreenElement) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

// Fullscreen listener for icon updates
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('headerFullscreenIcon');
    if (icon) {
      icon.textContent = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
    }
  });
}

/**
 * Inisialisasi Jam & Tanggal Realtime di Header Tablet/Desktop
 */
export function initHeaderClock() {
  const dateEl = document.getElementById('liveHeaderDate');
  const clockEl = document.getElementById('liveHeaderClock');
  if (!dateEl || !clockEl) return;

  function update() {
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${mins}`;
  }

  update();
  setInterval(update, 1000);
}

export function openSuperAdmin() {
  playClick('pop');
  if (!superadmin.isSuperAdminAuthenticated()) {
    superadmin.openSuperAdminAuthModal();
  } else {
    switchView('superadmin');
  }
}

export function impersonateStore(storeId) {
  quickSelectStore(storeId);
  switchView('pos');
  showToast(`Beralih ke kasir [${state.storeProfile?.name || storeId}]`, 'success');
}

export function openReleaseNotesModal() {
  playClick('pop');
  const modal = document.getElementById('releaseNotesModal');
  if (modal) modal.classList.remove('hidden');
}

export function closeReleaseNotesModal() {
  playClick('pop');
  const modal = document.getElementById('releaseNotesModal');
  if (modal) modal.classList.add('hidden');
}

// ================= MODAL BACKDROP DISMISS & ANDROID BACK BUTTON HANDLER =================

/**
 * Peta fungsi penutup resmi untuk masing-masing modal aplikasi
 */
const MODAL_CLOSE_DISPATCHER = {
  'paymentModal': () => payment.closePaymentModal(),
  'discountSelectionModal': () => payment.closeDiscountModal(),
  'receiptModal': () => payment.closeReceiptModal(),
  'itemNoteModal': () => pos.closeItemNoteModal(),
  'renameQueueModal': () => pos.closeRenameQueueModal(),
  'mobileCartDrawer': () => pos.toggleMobileCartDrawer(false),
  'startShiftModal': () => shift.closeStartShiftModal(),
  'closeShiftModal': () => shift.closeCloseShiftModal(),
  'productModal': () => admin.closeProductModal(),
  'bulkImportModal': () => admin.closeBulkImportModal(),
  'qrisConfigModal': () => admin.closeQrisModal(),
  'expenseModal': () => report.closeExpenseModal(),
  'printerConfigModal': () => printer.closePrinterConfigModal(),
  'bluetoothTroubleshootModal': () => printer.closeBluetoothTroubleshootModal(),
  'hostQrPairingModal': () => printer.closeHostQrPairingModal(),
  'qrPairingScannerModal': () => printer.closeQrPairingScannerModal(),
  'cloudModal': () => closeCloudModal(),
  'releaseNotesModal': () => closeReleaseNotesModal(),
  'updateAppModal': () => updater.closeUpdateModal(),
  'pinSecurityModal': () => closePinSecurityModal(),
  'superAdminAuthModal': () => superadmin.closeSuperAdminAuthModal(),
  'superAdminChangePinModal': () => superadmin.closeSuperAdminChangePinModal(),
  'superAdminAddStoreModal': () => superadmin.closeSuperAdminAddStoreModal(),
  'superAdminEditStoreModal': () => superadmin.closeSuperAdminEditStoreModal(),
  'superAdminDeleteStoreModal': () => superadmin.closeSuperAdminDeleteStoreModal(),
  'universalLoginModal': () => closeUniversalLoginModal(),
  'customConfirmModal': () => {
    const cancelBtn = document.getElementById('customConfirmCancelBtn');
    if (cancelBtn) cancelBtn.click();
    else document.getElementById('customConfirmModal')?.classList.add('hidden');
  },
  'deleteAllMenuModal': () => admin.closeDeleteAllModal()
};

/**
 * Tutup elemen modal dengan aman dan jalankan pembersihan resminya
 */
export function dismissModalElement(modal) {
  if (!modal || modal.classList.contains('hidden')) return false;

  // 1. Jangan tutup modal login jika belum ada toko yang aktif
  if (modal.id === 'universalLoginModal' && !state.storeId) {
    return false;
  }

  playClick('pop');

  // 2. Jalankan fungsi penutup resmi dari dispatcher jika ada
  if (modal.id && typeof MODAL_CLOSE_DISPATCHER[modal.id] === 'function') {
    try {
      MODAL_CLOSE_DISPATCHER[modal.id]();
      return true;
    } catch (e) {
      console.warn('Dispatcher close error:', e);
    }
  }

  // 3. Fallback: Cari tombol close dengan onclick
  const closeBtn = modal.querySelector('button[onclick*="close"], button[onclick*="Close"], button[onclick*="toggleMobileCartDrawer"]');
  if (closeBtn) {
    closeBtn.click();
    return true;
  }

  // 4. Fallback: Sembunyikan langsung
  modal.classList.add('hidden');
  return true;
}

/**
 * Handler Tombol Back Android & Web Browser Navigation (Standar Industri UX)
 * 1. Menutup modal paling atas jika ada modal yang sedang terbuka.
 * 2. Mengembalikan ke tab Kasir Utama jika sedang di sub-menu (Menu / Laporan).
 * 3. Mengembalikan false jika sudah di Kasir Utama agar Android memicu "Tekan sekali lagi untuk keluar".
 */
export function handleAppBackPress() {
  // A. Periksa apakah ada modal yang sedang aktif
  const openModals = Array.from(document.querySelectorAll('div[id$="Modal"]:not(.hidden), #mobileCartDrawer:not(.hidden)'));

  if (openModals.length > 0) {
    // Ambil modal paling atas (terakhir di render)
    const topModal = openModals[openModals.length - 1];
    
    // Jangan tutup login modal jika belum ada toko yang login
    if (topModal.id === 'universalLoginModal' && !state.storeId) {
      return false;
    }

    return dismissModalElement(topModal);
  }

  // B. Jika tidak ada modal yang terbuka, periksa apakah berada di tab selain Kasir Utama (pos)
  const viewPos = document.getElementById('viewPos');
  const isPosVisible = viewPos && !viewPos.classList.contains('hidden');
  if (!isPosVisible) {
    switchView('pos');
    return true;
  }

  // C. Berada di Kasir Utama tanpa modal aktif:
  // Kembalikan false agar native Android MainActivity menampilkan toast debounce "Tekan sekali lagi untuk keluar"
  return false;
}

/**
 * Inisialisasi Event Listener untuk Dismiss Modal saat Area Blur / Backdrop Diklik
 */
function initModalBackdropDismiss() {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;

    // Cek jika target yang diklik adalah kontainer backdrop modal (fixed inset-0 dengan overlay gelap/blur)
    const isBackdropContainer = target.classList.contains('fixed') && 
                                target.classList.contains('inset-0') && 
                                !target.classList.contains('hidden') &&
                                (target.id.endsWith('Modal') || target.id === 'mobileCartDrawer');

    if (isBackdropContainer) {
      // Modal yang ditandai non-dismissable lewat atribut data-static-backdrop tidak dapat ditutup
      if (target.getAttribute('data-static-backdrop') === 'true') return;

      dismissModalElement(target);
    }
  });

  // Handler Browser History popstate (Khusus PWA / Mobile Web di Chrome Android)
  window.addEventListener('popstate', () => {
    const handled = handleAppBackPress();
    if (handled) {
      // Jaga riwayat history agar tidak keluar dari halaman web
      try {
        window.history.pushState({ appActive: true }, '');
      } catch (_) {}
    }
  });

  try {
    window.history.replaceState({ appActive: true }, '');
  } catch (_) {}
}

// Expose handleAppBackPress ke global window seketika
if (typeof window !== 'undefined') {
  window.handleAppBackPress = handleAppBackPress;
}

// ================= EXPORT GLOBAL NAMESPACE FOR HTML HANDLERS =================
const KasirApp = {
  // App & Multi-Store & Universal Auth
  init,
  switchView,
  openReleaseNotesModal,
  closeReleaseNotesModal,
  openCloudModal,
  closeCloudModal,
  copyStoreShareLink,
  logoutStore,
  quickDemoStore,
  selectStoreForLogin,
  deleteSavedStoreCard,
  openUniversalLoginModal,
  closeUniversalLoginModal,
  switchAuthTab,
  renderSavedStoresList,
  handleStoreLoginSubmit,
  handleStoreRegisterSubmit,
  logoutStoreSession: logoutStore,
  quickSelectStore,
  openPinSecurityModal,
  closePinSecurityModal,
  handlePinSecuritySubmit,
  togglePinProtectionSetting,
  forceSyncCloud,
  showToast,

  // Super Admin Monitoring
  openSuperAdmin,
  openSuperAdminChangePin: superadmin.openSuperAdminChangePin,
  closeSuperAdminChangePinModal: superadmin.closeSuperAdminChangePinModal,
  handleSuperAdminChangePinSubmit: superadmin.handleSuperAdminChangePinSubmit,
  togglePasskeyVisibility: superadmin.togglePasskeyVisibility,
  impersonateStore,
  openSuperAdminAuthModal: superadmin.openSuperAdminAuthModal,
  closeSuperAdminAuthModal: superadmin.closeSuperAdminAuthModal,
  handleSuperAdminAuthSubmit: superadmin.handleSuperAdminAuthSubmit,
  logoutSuperAdmin: superadmin.logoutSuperAdmin,
  renderSuperAdminDashboard: superadmin.renderSuperAdminDashboard,
  handleSuperAdminSearch: superadmin.handleSuperAdminSearch,
  setSuperAdminStatusFilter: superadmin.setSuperAdminStatusFilter,
  setSuperAdminSort: superadmin.setSuperAdminSort,
  setSuperAdminViewMode: superadmin.setSuperAdminViewMode,
  clearSuperAdminSearch: superadmin.clearSuperAdminSearch,
  openSuperAdminAddStoreModal: superadmin.openSuperAdminAddStoreModal,
  closeSuperAdminAddStoreModal: superadmin.closeSuperAdminAddStoreModal,
  handleSuperAdminStoreNameInput: superadmin.handleSuperAdminStoreNameInput,
  handleSuperAdminAddStoreSubmit: superadmin.handleSuperAdminAddStoreSubmit,
  openSuperAdminEditStoreModal: superadmin.openSuperAdminEditStoreModal,
  closeSuperAdminEditStoreModal: superadmin.closeSuperAdminEditStoreModal,
  handleSuperAdminEditStoreSubmit: superadmin.handleSuperAdminEditStoreSubmit,
  openSuperAdminDeleteStoreModal: superadmin.openSuperAdminDeleteStoreModal,
  closeSuperAdminDeleteStoreModal: superadmin.closeSuperAdminDeleteStoreModal,
  toggleSuperAdminDeleteConfirmCheck: superadmin.toggleSuperAdminDeleteConfirmCheck,
  confirmSuperAdminDeleteStore: superadmin.confirmSuperAdminDeleteStore,

  // POS & Queue Modals
  renderOrderQueueTabs: pos.renderOrderQueueTabs,
  addNewOrderQueue: pos.addNewOrderQueue,
  switchOrderQueue: pos.switchOrderQueue,
  promptRenameQueue: pos.promptRenameQueue,
  openRenameQueueModal: pos.openRenameQueueModal,
  closeRenameQueueModal: pos.closeRenameQueueModal,
  setPresetQueueName: pos.setPresetQueueName,
  saveQueueRename: pos.saveQueueRename,
  deleteCurrentActiveQueue: pos.deleteCurrentActiveQueue,
  deleteOrderQueue: pos.deleteOrderQueue,
  scrollQueueTabs: pos.scrollQueueTabs,
  handleQueueWheel: pos.handleQueueWheel,
  setCategory: pos.setCategory,
  handleSearchInput,
  clearSearch,
  reportErrorToDiscord: sendTelemetryToDiscord,
  renderProducts: pos.renderProducts,
  renderProductSkeletons: pos.renderProductSkeletons,
  addToCart: pos.addToCart,
  updateCartQty: pos.updateCartQty,
  confirmClearCart: pos.confirmClearCart,
  renderCart: pos.renderCart,
  toggleMobileCartDrawer: pos.toggleMobileCartDrawer,
  openItemNoteModal: pos.openItemNoteModal,
  closeItemNoteModal: pos.closeItemNoteModal,
  setItemNoteScope: pos.setItemNoteScope,
  appendQuickNote: pos.appendQuickNote,
  clearItemNote: pos.clearItemNote,
  saveItemNote: pos.saveItemNote,
  updateItemNoteLivePrice: pos.updateItemNoteLivePrice,

  // Payment & QRIS
  openPaymentModal: payment.openPaymentModal,
  closePaymentModal: payment.closePaymentModal,
  setPaymentMethod: payment.setPaymentMethod,
  calculateSplitBill: payment.calculateSplitBill,
  resetSplitBill: payment.resetSplitBill,
  selectQuickCash: payment.selectQuickCash,
  toggleCustomKeypad: payment.toggleCustomKeypad,
  handleManualCashInput: payment.handleManualCashInput,
  addKeypadDigit: payment.addKeypadDigit,
  backspaceKeypad: payment.backspaceKeypad,
  clearManualCash: payment.clearManualCash,
  completeTransaction: payment.completeTransaction,
  showReceipt: payment.showReceipt,
  closeReceiptModal: payment.closeReceiptModal,
  printCurrentReceipt: payment.printCurrentReceipt,
  printCurrentKitchenTicket: payment.printCurrentKitchenTicket,
  kickCurrentDrawer: payment.kickCurrentDrawer,
  toggleQrisPaymentMode: payment.toggleQrisPaymentMode,
  openDiscountModal: payment.openDiscountModal,
  closeDiscountModal: payment.closeDiscountModal,
  applyDiscount: payment.applyDiscount,
  removeDiscount: payment.removeDiscount,
  setDiscountModalType: payment.setDiscountModalType,
  submitCustomDiscount: payment.submitCustomDiscount,
  getActiveDiscount: payment.getActiveDiscount,
  getFinalPayableTotal: payment.getFinalPayableTotal,

  // Shift Management & Rekap Tutup Kasir (Z-Report)
  openStartShiftModal: shift.openStartShiftModal,
  closeStartShiftModal: shift.closeStartShiftModal,
  submitStartShift: shift.submitStartShift,
  setQuickStartCash: shift.setQuickStartCash,
  openCloseShiftModal: shift.openCloseShiftModal,
  closeCloseShiftModal: shift.closeCloseShiftModal,
  handleActualCashInput: shift.handleActualCashInput,
  finalizeCloseShift: shift.finalizeCloseShift,
  printCurrentShiftZReport: shift.printCurrentShiftZReport,
  handleShiftHeaderClick: shift.handleShiftHeaderClick,
  getActiveShift: shift.getActiveShift,
  calculateShiftSummary: shift.calculateShiftSummary,

  // Thermal Printer & Cash Drawer
  printReceipt: printer.printReceipt,
  printKitchenTicket: printer.printKitchenTicket,
  printShiftZReport: printer.printShiftZReport,
  kickCashDrawer: printer.kickCashDrawer,
  isLocalPrinterReady: printer.isLocalPrinterReady,
  testPrintReceipt: printer.testPrintReceipt,
  testPrintKitchenTicket: printer.testPrintKitchenTicket,
  connectBluetoothPrinter: printer.connectBluetoothPrinter,
  connectSerialPrinter: printer.connectSerialPrinter,
  autoReconnectSerial: printer.autoReconnectSerial,
  disconnectSerialPrinter: printer.disconnectSerialPrinter,
  disconnectBluetoothPrinter: printer.disconnectBluetoothPrinter,
  openPrinterConfigModal: printer.openPrinterConfigModal,
  closePrinterConfigModal: printer.closePrinterConfigModal,
  openBluetoothTroubleshootModal: printer.openBluetoothTroubleshootModal,
  closeBluetoothTroubleshootModal: printer.closeBluetoothTroubleshootModal,
  savePrinterSettings: printer.savePrinterSettings,
  updateLiveReceiptPreview: printer.updateLiveReceiptPreview,
  handleLogoUpload: printer.handleLogoUpload,
  removeLogoImage: printer.removeLogoImage,
  updatePrinterUIStatus: printer.updatePrinterUIStatus,
  testCloudRelayPrint: printer.testCloudRelayPrint,
  testLocalLanPing: printer.testLocalLanPing,
  autoDiscoverLocalPrinterHost: printer.autoDiscoverLocalPrinterHost,
  reconnectPrinterHost: printer.reconnectPrinterHost,
  handleLocalHostIpInput: printer.handleLocalHostIpInput,
  setupRemotePrintHostListener: printer.setupRemotePrintHostListener,
  setDevicePrinterRole: printer.setDevicePrinterMode,
  getDevicePrinterMode: printer.getDevicePrinterMode,
  openHostQrPairingModal: printer.openHostQrPairingModal,
  closeHostQrPairingModal: printer.closeHostQrPairingModal,
  openQrPairingScannerModal: printer.openQrPairingScannerModal,
  closeQrPairingScannerModal: printer.closeQrPairingScannerModal,
  handleQrScanFromFile: printer.handleQrScanFromFile,

  // Admin & Backup & QRIS & Menu
  renderAdminTable: admin.renderAdminTable,
  openAddProductModal: admin.openAddProductModal,
  openEditProductModal: admin.openEditProductModal,
  closeProductModal: admin.closeProductModal,
  triggerProductImageUpload: admin.triggerProductImageUpload,
  handleProductImageFile: admin.handleProductImageFile,
  removeProductImage: admin.removeProductImage,
  addNewAddOnRow: admin.addNewAddOnRow,
  saveProduct: admin.saveProduct,
  deleteProduct: admin.deleteProduct,
  deleteSelectedProducts: admin.deleteSelectedProducts,
  openDeleteAllModal: admin.openDeleteAllModal,
  closeDeleteAllModal: admin.closeDeleteAllModal,
  toggleDeleteAllConfirmCheck: admin.toggleDeleteAllConfirmCheck,
  confirmDeleteAllProducts: admin.confirmDeleteAllProducts,
  handleAdminSearch: admin.handleAdminSearch,
  clearAdminSearch: admin.clearAdminSearch,
  setAdminCategoryFilter: admin.setAdminCategoryFilter,
  toggleSelectAdminProduct: admin.toggleSelectAdminProduct,
  toggleSelectAllAdminProducts: admin.toggleSelectAllAdminProducts,
  clearAdminSelection: admin.clearAdminSelection,
  toggleProductAvailability: admin.toggleProductAvailability,
  openQrisModal: admin.openQrisModal,
  closeQrisModal: admin.closeQrisModal,
  handleQrisImageUpload: admin.handleQrisImageUpload,
  saveQrisSettings: admin.saveQrisSettings,
  exportDataBackup: admin.exportDataBackup,
  importDataBackup: admin.importDataBackup,

  // Bulk Menu Text Importer
  openBulkImportModal: admin.openBulkImportModal,
  closeBulkImportModal: admin.closeBulkImportModal,
  loadUserSampleMenu: admin.loadUserSampleMenu,
  handleBulkTextInput: admin.handleBulkTextInput,
  updateBulkPreviewRow: admin.updateBulkPreviewRow,
  deleteBulkPreviewRow: admin.deleteBulkPreviewRow,
  applyBulkMenuImport: admin.applyBulkMenuImport,

  // Report & Bookkeeping
  setReportPeriod: report.setReportPeriod,
  renderFinancialReport: report.renderFinancialReport,
  openExpenseModal: report.openExpenseModal,
  closeExpenseModal: report.closeExpenseModal,
  saveExpense: report.saveExpense,
  deleteExpense: report.deleteExpense,
  deleteTransaction: report.deleteTransaction,
  clearTodayData: report.clearTodayData,
  clearAllHistory: report.clearAllHistory,
  clearTransactionHistory: report.clearTransactionHistory,
  shareReportWhatsApp: report.shareReportWhatsApp,
  exportReportCSV: report.exportReportCSV,
  reprintTx: report.reprintTx,

  // Interactive Senior-Friendly Guide Tour
  openGuideTour: tour.openGuideTour,
  closeGuideTour: tour.closeGuideTour,
  nextTourStep: tour.nextTourStep,
  prevTourStep: tour.prevTourStep,
  goToTourStep: tour.goToTourStep,

  // In-App Auto-Updater
  checkForAppUpdates: updater.checkForAppUpdates,
  startAppUpdate: updater.startAppUpdate,
  installDownloadedUpdate: updater.installDownloadedUpdate,
  closeUpdateModal: updater.closeUpdateModal,
  onUpdateDownloadProgress: updater.onUpdateDownloadProgress,
  onUpdateDownloadError: updater.onUpdateDownloadError,

  // M3 Navigation Rail & Header Actions
  updateM3NavRailUI: updateM3NavRailUI,
  handleBrandLogoClick: handleBrandLogoClick,
  toggleFullscreen: toggleFullscreen,
  initHeaderClock: initHeaderClock,

  // Android Back & Backdrop Dismiss UX
  handleAppBackPress: handleAppBackPress,
  dismissModalElement: dismissModalElement
};

// Expose to window for inline onclick HTML handlers
window.KasirApp = KasirApp;
window.openPrinterConfigModal = printer.openPrinterConfigModal;
window.closePrinterConfigModal = printer.closePrinterConfigModal;

// Auto-bind window shortcuts for standard HTML event handlers
Object.keys(KasirApp).forEach(key => {
  if (typeof window[key] === 'undefined') {
    window[key] = KasirApp[key];
  }
});

// Auto-start on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
