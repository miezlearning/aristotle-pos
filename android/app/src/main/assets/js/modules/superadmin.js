/**
 * Kasir Mami - Super Admin & Multi-UMKM Central Monitoring Module
 * Google Material Design 3 (M3) Architecture
 * Protected by Technical Passkey Gate & Session Validation
 */

import { formatRp, showToast, playClick, escapeHtml, showConfirmDialog, hashSha256 } from '../utils.js';
import { getSavedStoresList, registerStoreOnDevice, state } from '../state.js';
import { getStorageKeys, MASTER_DEV_HASH } from '../config.js';
import { 
  fetchAllStoresForSuperAdmin, 
  superAdminUpdateStorePin,
  superAdminCreateStore,
  superAdminUpdateStore,
  deleteStoreFromCloud,
  superAdminGenerateLicense,
  superAdminFetchAllLicenses,
  superAdminRevokeLicense
} from '../firebase.js';
import { generateOfficialLicenseKey } from './license.js';

let superAdminStores = [];
let superAdminLicenses = [];
let searchQuery = '';
let activeStatusFilter = 'all'; // 'all' | 'active_today' | 'current_store'
let activeSortBy = 'revenue_desc'; // 'revenue_desc' | 'tx_desc' | 'name_asc' | 'id_asc'
let viewMode = 'grid'; // 'grid' | 'table'
let activeSuperAdminTab = 'stores'; // 'stores' | 'licenses'
let lastGeneratedLicense = null;
let isLoading = false;

const SUPERADMIN_SESSION_KEY = 'superadmin_auth_session_v1';

/**
 * Cek apakah sesi Super Admin aktif di browser saat ini
 */
export function isSuperAdminAuthenticated() {
  return sessionStorage.getItem(SUPERADMIN_SESSION_KEY) === '1';
}

/**
 * Buka modal autentikasi Super Admin
 */
export function openSuperAdminAuthModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminAuthModal');
  const input = document.getElementById('superAdminPasskeyInput');
  const eyeIcon = document.getElementById('superAdminPasskeyEyeIcon');
  if (modal) modal.classList.remove('hidden');
  if (input) {
    input.value = '';
    input.type = 'password';
    if (eyeIcon) eyeIcon.innerText = 'visibility';
    requestAnimationFrame(() => input.focus());
  }
}

/**
 * Toggle visibilitas passkey (Show / Hide Password)
 */
export function togglePasskeyVisibility() {
  playClick('tap');
  const input = document.getElementById('superAdminPasskeyInput');
  const eyeIcon = document.getElementById('superAdminPasskeyEyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (eyeIcon) eyeIcon.innerText = 'visibility_off';
  } else {
    input.type = 'password';
    if (eyeIcon) eyeIcon.innerText = 'visibility';
  }
}

/**
 * Tutup modal autentikasi Super Admin dan batalkan akses
 */
export function closeSuperAdminAuthModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminAuthModal');
  if (modal) modal.classList.add('hidden');

  if (!isSuperAdminAuthenticated()) {
    const viewSuperAdmin = document.getElementById('viewSuperAdmin');
    if (viewSuperAdmin && !viewSuperAdmin.classList.contains('hidden')) {
      if (window.KasirApp && window.KasirApp.switchView) {
        window.KasirApp.switchView('pos');
      }
    }
  }
}

/**
 * Verifikasi passkey Super Admin
 */
export async function handleSuperAdminAuthSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('superAdminPasskeyInput');
  const enteredKey = input ? input.value.trim() : '';

  if (!enteredKey) {
    showToast('Masukkan passkey', 'warning');
    return;
  }

  const hash = await hashSha256(enteredKey);

  if (hash === MASTER_DEV_HASH) {
    sessionStorage.setItem(SUPERADMIN_SESSION_KEY, '1');
    const modal = document.getElementById('superAdminAuthModal');
    if (modal) modal.classList.add('hidden');

    showToast('Berhasil masuk', 'success', 2000);
    if (window.KasirApp && window.KasirApp.switchView) {
      window.KasirApp.switchView('superadmin');
    } else {
      renderSuperAdminDashboard();
    }
  } else {
    playClick('error');
    showToast('Passkey salah', 'error', 2500);
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

/**
 * Keluar dari sesi Super Admin
 */
export function logoutSuperAdmin() {
  sessionStorage.removeItem(SUPERADMIN_SESSION_KEY);
  showToast('Terkunci', 'info');
  if (window.KasirApp && window.KasirApp.switchView) {
    window.KasirApp.switchView('pos');
  }
}

/**
 * Muat data seluruh UMKM dan render dashboard monitoring
 */
export async function renderSuperAdminDashboard() {
  if (!isSuperAdminAuthenticated()) {
    openSuperAdminAuthModal();
    return;
  }

  const gridContainer = document.getElementById('superAdminStoreList');
  const tableBody = document.getElementById('superAdminStoreTableBody');
  const refreshBtn = document.getElementById('saRefreshBtn');

  if (refreshBtn) {
    const icon = refreshBtn.querySelector('.material-symbols-rounded');
    if (icon) icon.classList.add('animate-spin');
  }

  isLoading = true;
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="col-span-full p-10 text-center flex flex-col items-center gap-2 text-stone-400 bg-white rounded-2xl border border-stone-200">
        <span class="material-symbols-rounded text-2xl animate-spin">sync</span>
        <p class="text-xs font-bold text-stone-600">Memuat data toko...</p>
      </div>
    `;
  }
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-xs text-stone-500">
          Memuat data toko...
        </td>
      </tr>
    `;
  }

  try {
    superAdminStores = await fetchAllStoresForSuperAdmin();
  } catch (err) {
    console.error('Super Admin fetch error:', err);
    superAdminStores = getSavedStoresList().map(s => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName || 'Owner',
      phone: s.phone || '',
      pin: '123456',
      todayRevenue: 0,
      todayTxCount: 0,
      productCount: 0,
      lastActive: s.lastOpened || null
    }));
  } finally {
    isLoading = false;
    if (refreshBtn) {
      const icon = refreshBtn.querySelector('.material-symbols-rounded');
      if (icon) icon.classList.remove('animate-spin');
    }
  }

  updateMetricsAndList();
}

/**
 * Filter status toko (All, Active Today, Current Store)
 */
export function setSuperAdminStatusFilter(status) {
  playClick('tap');
  activeStatusFilter = status || 'all';

  // Update button active state
  const buttons = document.querySelectorAll('.sa-filter-btn');
  buttons.forEach(btn => {
    const isTarget = btn.getAttribute('data-sa-filter') === activeStatusFilter;
    if (isTarget) {
      btn.className = 'sa-filter-btn px-3 py-1.5 rounded-lg font-bold bg-stone-900 text-white text-xs transition whitespace-nowrap shrink-0 cursor-pointer';
    } else {
      btn.className = 'sa-filter-btn px-3 py-1.5 rounded-lg font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs transition whitespace-nowrap shrink-0 cursor-pointer';
    }
  });

  updateMetricsAndList();
}

/**
 * Pengurutan toko
 */
export function setSuperAdminSort(sortBy) {
  playClick('tap');
  activeSortBy = sortBy || 'revenue_desc';
  const select = document.getElementById('saSortSelect');
  if (select && select.value !== activeSortBy) {
    select.value = activeSortBy;
  }
  updateMetricsAndList();
}

/**
 * Mode Tampilan: Grid Card vs Compact Data Table
 */
export function setSuperAdminViewMode(mode) {
  playClick('tap');
  viewMode = mode === 'table' ? 'table' : 'grid';

  const gridBtn = document.getElementById('saViewModeGridBtn');
  const tableBtn = document.getElementById('saViewModeTableBtn');

  if (viewMode === 'grid') {
    if (gridBtn) gridBtn.className = 'p-1.5 rounded-md bg-white text-stone-900 shadow-sm transition';
    if (tableBtn) tableBtn.className = 'p-1.5 rounded-md text-stone-400 hover:text-stone-700 transition';
  } else {
    if (gridBtn) gridBtn.className = 'p-1.5 rounded-md text-stone-400 hover:text-stone-700 transition';
    if (tableBtn) tableBtn.className = 'p-1.5 rounded-md bg-white text-stone-900 shadow-sm transition';
  }

  updateMetricsAndList();
}

/**
 * Pencarian Toko
 */
export function handleSuperAdminSearch(e) {
  searchQuery = (e?.target?.value || '').trim();
  const clearBtn = document.getElementById('saSearchClearBtn');
  if (clearBtn) {
    if (searchQuery) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  updateMetricsAndList();
}

export function clearSuperAdminSearch() {
  playClick('tap');
  searchQuery = '';
  const input = document.getElementById('superAdminSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('saSearchClearBtn');
  if (clearBtn) clearBtn.classList.add('hidden');
  updateMetricsAndList();
}

/**
 * Update metrik agregat dan render daftar kartu & tabel toko
 */
export function updateMetricsAndList() {
  const gridContainer = document.getElementById('superAdminStoreList');
  const tableContainer = document.getElementById('superAdminStoreTableContainer');
  const tableBody = document.getElementById('superAdminStoreTableBody');

  const statTotalStores = document.getElementById('saStatTotalStores');
  const statTotalRevenue = document.getElementById('saStatTotalRevenue');
  const statTotalTx = document.getElementById('saStatTotalTx');
  const statAvgTxValue = document.getElementById('saStatAvgTxValue');
  const saActiveStoresCount = document.getElementById('saActiveStoresCount');
  const filterAllCount = document.getElementById('saFilterAllCount');
  const filterActiveCount = document.getElementById('saFilterActiveCount');

  const totalStores = superAdminStores.length;
  const totalRevenue = superAdminStores.reduce((acc, s) => acc + (s.todayRevenue || 0), 0);
  const totalTx = superAdminStores.reduce((acc, s) => acc + (s.todayTxCount || 0), 0);
  const activeStoresCount = superAdminStores.filter(s => (s.todayRevenue || 0) > 0 || (s.todayTxCount || 0) > 0).length;
  const avgTxValue = totalTx > 0 ? Math.round(totalRevenue / totalTx) : 0;

  if (statTotalStores) statTotalStores.innerText = totalStores;
  if (saActiveStoresCount) saActiveStoresCount.innerText = activeStoresCount;
  if (statTotalRevenue) statTotalRevenue.innerText = formatRp(totalRevenue);
  if (statTotalTx) statTotalTx.innerText = totalTx;
  if (statAvgTxValue) statAvgTxValue.innerText = formatRp(avgTxValue);
  if (filterAllCount) filterAllCount.innerText = totalStores;
  if (filterActiveCount) filterActiveCount.innerText = activeStoresCount;

  // Filter gabungan (pencarian + filter status)
  let filtered = superAdminStores.filter(s => {
    // 1. Status Filter
    if (activeStatusFilter === 'active_today') {
      const hasRevenue = (s.todayRevenue || 0) > 0 || (s.todayTxCount || 0) > 0;
      if (!hasRevenue) return false;
    } else if (activeStatusFilter === 'current_store') {
      if (s.id !== state.storeId) return false;
    }

    // 2. Search Query
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.id && s.id.toLowerCase().includes(q)) ||
      (s.ownerName && s.ownerName.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  });

  // Sorting
  filtered.sort((a, b) => {
    if (activeSortBy === 'revenue_desc') {
      return (b.todayRevenue || 0) - (a.todayRevenue || 0);
    } else if (activeSortBy === 'tx_desc') {
      return (b.todayTxCount || 0) - (a.todayTxCount || 0);
    } else if (activeSortBy === 'name_asc') {
      return (a.name || a.id).localeCompare(b.name || b.id);
    } else if (activeSortBy === 'id_asc') {
      return (a.id || '').localeCompare(b.id || '');
    }
    return 0;
  });

  // Switch Container Visibility
  if (viewMode === 'table') {
    if (gridContainer) gridContainer.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
  } else {
    if (gridContainer) gridContainer.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
  }

  // Tampilan Kosong
  if (filtered.length === 0) {
    const emptyHtml = `
      <div class="col-span-full p-10 text-center rounded-2xl bg-white border border-stone-200 flex flex-col items-center gap-1.5">
        <span class="material-symbols-rounded text-3xl text-stone-300">storefront</span>
        <p class="text-sm font-bold text-stone-700">Tidak ada toko ditemukan</p>
        <p class="text-xs text-stone-500">
          ${searchQuery ? `Tidak ada hasil untuk "${escapeHtml(searchQuery)}".` : 'Coba ubah filter.'}
        </p>
        <button type="button" onclick="KasirApp.clearSuperAdminSearch(); KasirApp.setSuperAdminStatusFilter('all')"
          class="mt-2 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-bold">
          Tampilkan semua
        </button>
      </div>
    `;
    if (gridContainer) gridContainer.innerHTML = emptyHtml;
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="p-8 text-center text-xs text-stone-500">
            Tidak ada toko ditemukan.
          </td>
        </tr>
      `;
    }
    return;
  }

  // 1. RENDER GRID CARDS
  if (gridContainer) {
    gridContainer.innerHTML = filtered.map(store => {
      const isCurrent = state.isSessionActive && store.id === state.storeId;
      const waLink = store.phone ? `https://wa.me/62${store.phone.replace(/^0/, '')}` : '#';
      const initial = (store.name || store.id || 'T').charAt(0).toUpperCase();

      return `
        <div class="bg-white rounded-2xl border ${isCurrent ? 'border-stone-900 ring-1 ring-stone-900/10 shadow-sm' : 'border-stone-200 shadow-xs'} p-3.5 sm:p-4 flex flex-col gap-3 transition">
          
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-xl ${isCurrent ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-800'} flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                ${escapeHtml(initial)}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <h4 class="font-extrabold text-stone-900 text-sm truncate">${escapeHtml(store.name || store.id)}</h4>
                  ${isCurrent ? '<span class="px-1.5 py-0.5 rounded bg-stone-900 text-white text-[10px] font-bold shrink-0">Aktif</span>' : ''}
                </div>
                <p class="text-[11px] text-stone-500 truncate mt-0.5"><span class="font-mono text-stone-600">${escapeHtml(store.id)}</span> • ${escapeHtml(store.ownerName || 'Owner')}</p>
              </div>
            </div>
            <button type="button" onclick="window.KasirApp.openSuperAdminChangePin('${escapeHtml(store.id)}', '${escapeHtml(store.name || store.id)}', '${escapeHtml(store.pin || '123456')}')"
              class="h-7 px-2 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs flex items-center gap-1 shrink-0 transition active:scale-95"
              title="Ubah PIN (6 Digit)">
              <span class="material-symbols-rounded text-sm text-stone-400">key</span>
              <span class="font-mono font-bold">${escapeHtml(store.pin || '123456')}</span>
            </button>
          </div>

          <div class="grid grid-cols-3 bg-stone-50/80 rounded-xl border border-stone-200/60 text-center divide-x divide-stone-200/70">
            <div class="py-2 px-1">
              <p class="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Omzet</p>
              <p class="font-black text-stone-900 text-xs sm:text-[13px] tabular-nums mt-0.5 truncate">${formatRp(store.todayRevenue || 0)}</p>
            </div>
            <div class="py-2 px-1">
              <p class="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Struk</p>
              <p class="font-black text-stone-900 text-xs sm:text-[13px] tabular-nums mt-0.5">${store.todayTxCount || 0}</p>
            </div>
            <div class="py-2 px-1">
              <p class="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Menu</p>
              <p class="font-black text-stone-900 text-xs sm:text-[13px] tabular-nums mt-0.5">${store.productCount || 0}</p>
            </div>
          </div>

          <div class="flex items-center gap-1.5 pt-1.5 border-t border-stone-100">
            ${store.phone ? `
              <a href="${waLink}" target="_blank"
                class="h-8 w-8 sm:w-auto sm:px-2 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center justify-center gap-1 transition active:scale-95 shrink-0"
                title="Hubungi WhatsApp (${escapeHtml(store.phone)})">
                <span class="material-symbols-rounded text-sm text-emerald-600">chat</span>
                <span class="font-mono text-[11px] hidden sm:inline truncate max-w-[90px]">${escapeHtml(store.phone)}</span>
              </a>
            ` : ''}
            <button type="button" onclick="window.KasirApp.openSuperAdminEditStoreModal('${escapeHtml(store.id)}')"
              class="h-8 px-2.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1 transition active:scale-95"
              title="Edit Profil Toko">
              <span class="material-symbols-rounded text-sm text-stone-500">edit</span>
              <span>Edit</span>
            </button>
            <button type="button" onclick="window.KasirApp.openSuperAdminDeleteStoreModal('${escapeHtml(store.id)}')"
              class="h-8 w-8 rounded-lg border border-stone-200 hover:bg-red-50 hover:border-red-200 text-stone-400 hover:text-red-600 text-xs flex items-center justify-center transition active:scale-95 shrink-0"
              title="Hapus Toko">
              <span class="material-symbols-rounded text-sm">delete</span>
            </button>
            <div class="flex-1 min-w-0"></div>
            <button type="button" onclick="window.KasirApp.impersonateStore('${escapeHtml(store.id)}')"
              class="h-8 px-3 rounded-lg ${isCurrent ? 'bg-stone-100 text-stone-500 font-medium' : 'bg-stone-900 hover:bg-stone-800 text-white font-bold shadow-xs'} text-xs flex items-center gap-1 transition active:scale-95 shrink-0">
              <span class="material-symbols-rounded text-sm">${isCurrent ? 'check_circle' : 'login'}</span>
              <span>${isCurrent ? 'Dibuka' : 'Buka'}</span>
            </button>
          </div>

        </div>
      `;
    }).join('');
  }

  // 2. RENDER COMPACT DATA TABLE
  if (tableBody) {
    tableBody.innerHTML = filtered.map(store => {
      const isCurrent = state.isSessionActive && store.id === state.storeId;
      const waLink = store.phone ? `https://wa.me/62${store.phone.replace(/^0/, '')}` : '#';
      const initial = (store.name || store.id || 'T').charAt(0).toUpperCase();

      return `
        <tr class="hover:bg-stone-50 transition ${isCurrent ? 'bg-stone-50' : ''}">
          <td class="py-2.5 px-4">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg ${isCurrent ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'} flex items-center justify-center font-bold text-xs shrink-0">
                ${escapeHtml(initial)}
              </div>
              <div class="min-w-0">
                <div class="font-bold text-stone-900 text-xs truncate max-w-[180px]">${escapeHtml(store.name || store.id)}</div>
                <div class="text-[11px] text-stone-500">${escapeHtml(store.ownerName || 'Owner')}</div>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3">
            <span class="font-mono text-[11px] text-stone-600">${escapeHtml(store.id)}</span>
          </td>
          <td class="py-2.5 px-3">
            <button type="button" onclick="window.KasirApp.openSuperAdminChangePin('${escapeHtml(store.id)}', '${escapeHtml(store.name || store.id)}', '${escapeHtml(store.pin || '123456')}')"
              class="font-mono font-bold text-xs text-stone-700 hover:text-stone-900 flex items-center gap-1">
              <span class="material-symbols-rounded text-sm text-stone-400">key</span>${escapeHtml(store.pin || '123456')}
            </button>
          </td>
          <td class="py-2.5 px-3">
            ${store.phone ? `
              <a href="${waLink}" target="_blank" class="text-stone-600 hover:text-stone-900 font-mono text-xs">${escapeHtml(store.phone)}</a>
            ` : '<span class="text-stone-300">-</span>'}
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="font-bold text-stone-900 text-xs tabular-nums">${formatRp(store.todayRevenue || 0)}</span>
          </td>
          <td class="py-2.5 px-3 text-center font-medium text-stone-700 tabular-nums">
            ${store.todayTxCount || 0}
          </td>
          <td class="py-2.5 px-3 text-center text-stone-500 tabular-nums">
            ${store.productCount || 0}
          </td>
          <td class="py-2.5 px-4 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1.5">
              <button type="button" onclick="window.KasirApp.openSuperAdminEditStoreModal('${escapeHtml(store.id)}')"
                class="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition"
                title="Edit Toko">
                <span class="material-symbols-rounded text-base block">edit</span>
              </button>
              <button type="button" onclick="window.KasirApp.openSuperAdminDeleteStoreModal('${escapeHtml(store.id)}')"
                class="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                title="Hapus Toko">
                <span class="material-symbols-rounded text-base block">delete</span>
              </button>
              <button type="button" onclick="window.KasirApp.impersonateStore('${escapeHtml(store.id)}')"
                class="px-2.5 py-1 rounded-lg ${isCurrent ? 'bg-stone-100 text-stone-500' : 'bg-stone-900 hover:bg-stone-800 text-white'} font-bold text-xs transition">
                ${isCurrent ? 'Dibuka' : 'Buka'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

/**
 * Modal Material Design 3 untuk Ganti PIN Toko
 */
export function openSuperAdminChangePin(storeId, storeName, currentPin) {
  playClick('pop');
  const modal = document.getElementById('superAdminChangePinModal');
  const targetIdInput = document.getElementById('saPinTargetStoreId');
  const storeNameEl = document.getElementById('saPinModalStoreName');
  const storeIdEl = document.getElementById('saPinModalStoreId');
  const pinInput = document.getElementById('saNewPinInput');

  if (targetIdInput) targetIdInput.value = storeId;
  if (storeNameEl) storeNameEl.innerText = storeName || storeId;
  if (storeIdEl) storeIdEl.innerText = storeId;
  if (pinInput) {
    pinInput.value = currentPin || '123456';
    requestAnimationFrame(() => pinInput.focus());
  }

  if (modal) modal.classList.remove('hidden');
}

export function closeSuperAdminChangePinModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminChangePinModal');
  if (modal) modal.classList.add('hidden');
}

export async function handleSuperAdminChangePinSubmit(e) {
  if (e) e.preventDefault();
  const targetIdInput = document.getElementById('saPinTargetStoreId');
  const pinInput = document.getElementById('saNewPinInput');
  const storeId = targetIdInput ? targetIdInput.value : '';
  const newPin = pinInput ? pinInput.value.trim() : '';

  if (!storeId || !newPin) {
    showToast('Masukkan PIN baru', 'warning');
    return;
  }

  const ok = await superAdminUpdateStorePin(storeId, newPin);
  if (ok) {
    closeSuperAdminChangePinModal();
    showToast(`PIN ${storeId} diubah ke ${newPin}`, 'success');
    renderSuperAdminDashboard();
  } else {
    showToast('Gagal mengubah PIN', 'error');
  }
}

// ==================== SUPER ADMIN CREATE (TAMBAH TOKO) ====================

export function openSuperAdminAddStoreModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminAddStoreModal');
  const form = document.getElementById('superAdminAddStoreForm');
  if (form) form.reset();

  const nameInput = document.getElementById('saAddStoreName');
  const idInput = document.getElementById('saAddStoreId');
  const ownerInput = document.getElementById('saAddOwnerName');
  const phoneInput = document.getElementById('saAddPhone');
  const cityInput = document.getElementById('saAddCity');
  const pinInput = document.getElementById('saAddPin');
  const menuCheck = document.getElementById('saAddIncludeMenu');

  if (nameInput) nameInput.value = '';
  if (idInput) idInput.value = '';
  if (ownerInput) ownerInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (cityInput) cityInput.value = 'Indonesia';
  if (pinInput) pinInput.value = '123456';
  if (menuCheck) menuCheck.checked = true;

  if (modal) modal.classList.remove('hidden');
  if (nameInput) requestAnimationFrame(() => nameInput.focus());
}

export function closeSuperAdminAddStoreModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminAddStoreModal');
  if (modal) modal.classList.add('hidden');
}

export function handleSuperAdminStoreNameInput(name) {
  const idInput = document.getElementById('saAddStoreId');
  if (!idInput) return;
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  idInput.value = slug;
}

export async function handleSuperAdminAddStoreSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('saAddStoreName');
  const idInput = document.getElementById('saAddStoreId');
  const ownerInput = document.getElementById('saAddOwnerName');
  const phoneInput = document.getElementById('saAddPhone');
  const cityInput = document.getElementById('saAddCity');
  const pinInput = document.getElementById('saAddPin');
  const menuCheck = document.getElementById('saAddIncludeMenu');
  const submitBtn = document.getElementById('saAddStoreSubmitBtn');

  const name = nameInput ? nameInput.value.trim() : '';
  const id = idInput ? idInput.value.trim() : '';
  const ownerName = ownerInput ? ownerInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const city = cityInput ? cityInput.value.trim() : 'Indonesia';
  const pin = pinInput ? pinInput.value.trim() : '123456';
  const includeMenu = menuCheck ? menuCheck.checked : true;

  if (!name || !id) {
    showToast('Nama toko dan ID toko wajib diisi', 'warning');
    return;
  }

  // Cek duplikasi ID di daftar toko
  const isDuplicate = superAdminStores.some(s => s.id.toLowerCase() === id.toLowerCase());
  if (isDuplicate) {
    showToast(`ID Toko [${id}] sudah digunakan oleh mitra lain!`, 'warning');
    if (idInput) idInput.focus();
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Mendaftarkan Toko...</span>`;
  }

  try {
    const res = await superAdminCreateStore({
      id,
      name,
      ownerName,
      phone,
      city,
      pin
    }, includeMenu);

    if (res.success) {
      closeSuperAdminAddStoreModal();
      showToast(`Mitra [${res.storeName}] berhasil ditambahkan!`, 'success', 3500);
      await renderSuperAdminDashboard();
    } else {
      showToast(res.message || 'Gagal mendaftarkan toko baru', 'error');
    }
  } catch (err) {
    console.error('Error creating store:', err);
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span class="material-symbols-rounded text-base">save</span>
        <span>Simpan Mitra</span>
      `;
    }
  }
}

// ==================== SUPER ADMIN UPDATE (EDIT TOKO) ====================

export function openSuperAdminEditStoreModal(storeId) {
  playClick('pop');
  const store = superAdminStores.find(s => s.id === storeId);
  if (!store) {
    showToast('Data toko tidak ditemukan', 'warning');
    return;
  }

  const modal = document.getElementById('superAdminEditStoreModal');
  const targetIdInput = document.getElementById('saEditStoreTargetId');
  const idBadge = document.getElementById('saEditStoreIdBadge');
  const nameInput = document.getElementById('saEditStoreName');
  const ownerInput = document.getElementById('saEditOwnerName');
  const phoneInput = document.getElementById('saEditPhone');
  const cityInput = document.getElementById('saEditCity');
  const pinInput = document.getElementById('saEditPin');

  if (targetIdInput) targetIdInput.value = store.id;
  if (idBadge) idBadge.textContent = store.id;
  if (nameInput) nameInput.value = store.name || store.id;
  if (ownerInput) ownerInput.value = store.ownerName || '';
  if (phoneInput) phoneInput.value = store.phone || '';
  if (cityInput) cityInput.value = store.city || 'Indonesia';
  if (pinInput) pinInput.value = store.pin || '123456';

  if (modal) modal.classList.remove('hidden');
  if (nameInput) requestAnimationFrame(() => nameInput.focus());
}

export function closeSuperAdminEditStoreModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminEditStoreModal');
  if (modal) modal.classList.add('hidden');
}

export async function handleSuperAdminEditStoreSubmit(e) {
  if (e) e.preventDefault();
  const targetIdInput = document.getElementById('saEditStoreTargetId');
  const nameInput = document.getElementById('saEditStoreName');
  const ownerInput = document.getElementById('saEditOwnerName');
  const phoneInput = document.getElementById('saEditPhone');
  const cityInput = document.getElementById('saEditCity');
  const pinInput = document.getElementById('saEditPin');
  const submitBtn = document.getElementById('saEditStoreSubmitBtn');

  const storeId = targetIdInput ? targetIdInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const ownerName = ownerInput ? ownerInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const city = cityInput ? cityInput.value.trim() : 'Indonesia';
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!storeId || !name) {
    showToast('Nama toko tidak boleh kosong', 'warning');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Menyimpan Perubahan...</span>`;
  }

  try {
    const res = await superAdminUpdateStore({
      storeId,
      name,
      ownerName,
      phone,
      city,
      pin
    });

    if (res.success) {
      closeSuperAdminEditStoreModal();
      showToast(`Profil [${res.storeName}] berhasil diperbarui!`, 'success');
      await renderSuperAdminDashboard();
    } else {
      showToast(res.message || 'Gagal memperbarui data toko', 'error');
    }
  } catch (err) {
    console.error('Error updating store:', err);
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span class="material-symbols-rounded text-base">check</span>
        <span>Simpan Perubahan</span>
      `;
    }
  }
}

// ==================== SUPER ADMIN DELETE (HAPUS TOKO) ====================

export function openSuperAdminDeleteStoreModal(storeId) {
  playClick('pop');
  const store = superAdminStores.find(s => s.id === storeId);
  if (!store) {
    showToast('Data toko tidak ditemukan', 'warning');
    return;
  }

  const modal = document.getElementById('superAdminDeleteStoreModal');
  const targetIdInput = document.getElementById('saDeleteTargetStoreId');
  const nameEl = document.getElementById('saDeleteStoreName');
  const idBadge = document.getElementById('saDeleteStoreIdBadge');
  const revEl = document.getElementById('saDeleteStoreRevenue');
  const confirmCheck = document.getElementById('saDeleteConfirmCheck');
  const confirmBtn = document.getElementById('saConfirmDeleteBtn');

  if (targetIdInput) targetIdInput.value = store.id;
  if (nameEl) nameEl.textContent = store.name || store.id;
  if (idBadge) idBadge.textContent = store.id;
  if (revEl) revEl.textContent = `${formatRp(store.todayRevenue || 0)} (${store.todayTxCount || 0} struk)`;
  if (confirmCheck) confirmCheck.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;

  if (modal) modal.classList.remove('hidden');
}

export function closeSuperAdminDeleteStoreModal() {
  playClick('pop');
  const modal = document.getElementById('superAdminDeleteStoreModal');
  if (modal) modal.classList.add('hidden');
}

export function toggleSuperAdminDeleteConfirmCheck() {
  const check = document.getElementById('saDeleteConfirmCheck');
  const btn = document.getElementById('saConfirmDeleteBtn');
  if (btn && check) {
    btn.disabled = !check.checked;
  }
}

export async function confirmSuperAdminDeleteStore() {
  const targetIdInput = document.getElementById('saDeleteTargetStoreId');
  const storeId = targetIdInput ? targetIdInput.value.trim() : '';
  const confirmBtn = document.getElementById('saConfirmDeleteBtn');

  if (!storeId) return;

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span>Menghapus...</span>`;
  }

  try {
    const ok = await deleteStoreFromCloud(storeId);
    if (ok) {
      closeSuperAdminDeleteStoreModal();
      showToast(`Toko [${storeId}] berhasil dihapus dari sistem!`, 'success');

      // Jika toko yang dihapus sedang dibuka di perangkat ini, bersihkan state aktif
      if (state.storeId === storeId) {
        state.storeId = '';
        state.isSessionActive = false;
        localStorage.removeItem('kasir_active_store_id');
      }

      await renderSuperAdminDashboard();
    } else {
      showToast('Gagal menghapus toko dari sistem', 'error');
    }
  } catch (err) {
    console.error('Error deleting store:', err);
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `
        <span class="material-symbols-rounded text-base">delete</span>
        <span>Hapus Toko</span>
      `;
    }
  }
}

// ==================== SUPER ADMIN SAAS LICENSE MANAGEMENT ====================

/**
 * Switch Super Admin Tab ('stores' vs 'licenses')
 */
export function switchSuperAdminTab(tab = 'stores') {
  playClick('switch');
  activeSuperAdminTab = tab;

  const tabStoresBtn = document.getElementById('saTabStoresBtn');
  const tabLicensesBtn = document.getElementById('saTabLicensesBtn');
  const storesContent = document.getElementById('saStoresTabContent');
  const licensesContent = document.getElementById('saLicensesTabContent');

  if (tab === 'licenses') {
    if (tabStoresBtn) {
      tabStoresBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-stone-500 hover:text-stone-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer';
    }
    if (tabLicensesBtn) {
      tabLicensesBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-white text-stone-900 font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition cursor-pointer';
    }
    if (storesContent) storesContent.classList.add('hidden');
    if (licensesContent) {
      licensesContent.classList.remove('hidden');
      licensesContent.classList.add('flex');
    }
    renderSuperAdminLicensesTable();
  } else {
    if (tabStoresBtn) {
      tabStoresBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-white text-stone-900 font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition cursor-pointer';
    }
    if (tabLicensesBtn) {
      tabLicensesBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-stone-500 hover:text-stone-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer';
    }
    if (licensesContent) {
      licensesContent.classList.add('hidden');
      licensesContent.classList.remove('flex');
    }
    if (storesContent) storesContent.classList.remove('hidden');
  }
}

/**
 * Handle submit pada generator lisensi baru
 */
export async function handleGenerateLicenseSubmit(e) {
  if (e) e.preventDefault();
  playClick('pop');

  const nameInput = document.getElementById('saGenClientName');
  const phoneInput = document.getElementById('saGenClientPhone');
  const tierSelect = document.getElementById('saGenTier');
  const notesInput = document.getElementById('saGenNotes');
  const submitBtn = document.getElementById('saBtnGenerateLicense');

  const clientName = nameInput ? nameInput.value.trim() : '';
  const clientPhone = phoneInput ? phoneInput.value.trim() : '';
  const tierCode = tierSelect ? tierSelect.value : 'LT';
  const notes = notesInput ? notesInput.value.trim() : '';

  if (!clientName || !clientPhone) {
    showToast('Harap isi nama klien dan nomor WhatsApp', 'warning');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-rounded text-lg animate-spin">sync</span><span>Membuat...</span>`;
  }

  try {
    // 1. Generate Cryptographic Key
    const licenseKey = await generateOfficialLicenseKey(tierCode);
    const tierName = tierCode === 'PR' ? 'PRO_LIFETIME' : 'LIFETIME_STANDARD';

    // 2. Simpan ke Cloud Firestore
    const res = await superAdminGenerateLicense({
      licenseKey,
      tier: tierName,
      clientName,
      clientPhone,
      notes
    });

    if (res.success) {
      lastGeneratedLicense = {
        licenseKey,
        tier: tierName,
        clientName,
        clientPhone
      };

      // Tampilkan box hasil
      const resultBox = document.getElementById('saGeneratedResultBox');
      const keyDisplay = document.getElementById('saGeneratedKeyDisplay');
      const clientDisplay = document.getElementById('saGeneratedClientDisplay');

      if (keyDisplay) keyDisplay.textContent = licenseKey;
      if (clientDisplay) clientDisplay.textContent = `Klien: ${clientName} (${clientPhone}) • Paket: ${tierCode === 'PR' ? 'Pro Lifetime' : 'Lifetime Sekali Beli'}`;
      if (resultBox) resultBox.classList.remove('hidden');

      showToast(`Lisensi [${licenseKey}] berhasil dibuat!`, 'success', 3500);

      // Reset form
      if (nameInput) nameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (notesInput) notesInput.value = '';

      await renderSuperAdminLicensesTable();
    } else {
      showToast(res.message || 'Gagal menyimpan lisensi', 'error');
    }
  } catch (err) {
    console.error('Error generating license:', err);
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span class="material-symbols-rounded text-lg text-amber-400">vpn_key</span>
        <span>Terbitkan Lisensi Resmi Sekarang</span>
      `;
    }
  }
}

/**
 * Salin kode lisensi hasil generate ke clipboard
 */
export function copyGeneratedLicenseCode() {
  if (!lastGeneratedLicense?.licenseKey) return;
  navigator.clipboard.writeText(lastGeneratedLicense.licenseKey).then(() => {
    playClick('tap');
    showToast(`Kode lisensi ${lastGeneratedLicense.licenseKey} berhasil disalin!`, 'success');
  }).catch(() => {
    showToast('Gagal menyalin kode', 'warning');
  });
}

/**
 * Kirim lisensi hasil generate langsung via WhatsApp ke klien
 */
export function shareGeneratedLicenseViaWA() {
  if (!lastGeneratedLicense?.licenseKey) return;
  const { licenseKey, clientName, clientPhone, tier } = lastGeneratedLicense;
  shareSpecificLicenseViaWA(licenseKey, clientName, clientPhone, tier);
}

/**
 * Share WhatsApp formatter serbaguna
 */
export function shareSpecificLicenseViaWA(key, name = 'Mitra', phone = '', tier = 'LIFETIME_STANDARD') {
  let cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.substring(1);
  }

  const tierText = tier === 'PRO_LIFETIME' ? 'Pro Lifetime (Multi-Kasir)' : 'Lifetime Sekali Beli (Standar Retail)';

  const text = `Halo Kak ${name},\n\nTerima kasih telah mempercayakan sistem kasir toko Anda kepada *Aristotle POS*! 🎉\n\nBerikut adalah *Kode Lisensi Resmi* seumur hidup untuk usaha Anda:\n\n🔑 *${key}*\nPaket: ${tierText}\nStatus: Aktif Selamanya (Tanpa Biaya Langganan Bulanan)\n\n*Langkah Aktivasi di Aplikasi:*\n1. Buka aplikasi Aristotle POS\n2. Klik menu *Daftar Toko Baru* (atau dari Profil Toko -> *Aktivasi Lisensi*)\n3. Masukkan kode lisensi resmi di atas\n4. Selesai! Kasir Anda langsung aktif penuh tanpa batas transaksi.\n\nSelamat berniaga dan semoga usaha Anda semakin maju, sukses & berkah selalu! 🙏✨`;

  const encoded = encodeURIComponent(text);
  const waUrl = cleanPhone 
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  window.open(waUrl, '_blank');
}

/**
 * Salin kode lisensi tertentu dari baris tabel
 */
export function copySpecificLicenseCode(key) {
  if (!key) return;
  navigator.clipboard.writeText(key).then(() => {
    playClick('tap');
    showToast(`Kode [${key}] disalin!`, 'success');
  }).catch(() => {
    showToast('Gagal menyalin', 'warning');
  });
}

/**
 * Render tabel seluruh riwayat lisensi
 */
export async function renderSuperAdminLicensesTable() {
  const tableBody = document.getElementById('saLicensesTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = `
    <tr>
      <td colspan="7" class="py-6 text-center text-stone-400">
        <span class="material-symbols-rounded text-xl animate-spin align-middle mr-1">sync</span>
        <span>Memuat data lisensi...</span>
      </td>
    </tr>
  `;

  try {
    const licenses = await superAdminFetchAllLicenses();
    superAdminLicenses = licenses;

    if (licenses.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-stone-400">
            <span class="material-symbols-rounded text-2xl mb-1 text-stone-300">vpn_key</span>
            <p class="font-bold text-xs text-stone-600">Belum ada lisensi resmi yang diterbitkan</p>
            <p class="text-[11px] text-stone-400 mt-0.5">Gunakan formulir generator di atas untuk membuat kode lisensi pertama.</p>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = licenses.map(lic => {
      const isClaimed = lic.status === 'claimed';
      const isRevoked = lic.status === 'revoked';

      let statusBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Tersedia</span>
        </span>
      `;
      if (isClaimed) {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-sky-50 text-sky-800 border border-sky-200/80 shadow-2xs">
            <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
            <span>Aktif Terpakai</span>
          </span>
        `;
      } else if (isRevoked) {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-rose-50 text-rose-800 border border-rose-200/80 shadow-2xs">
            <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Dibekukan</span>
          </span>
        `;
      }

      const dateStr = lic.createdAt ? new Date(lic.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
      const safeKey = escapeHtml(lic.licenseKey);
      const safeName = escapeHtml(lic.clientName || '-');
      const safePhone = escapeHtml(lic.clientPhone || '');
      const claimedStore = lic.claimedByStoreId ? escapeHtml(lic.claimedByStoreId) : '<span class="text-stone-400 font-normal italic">Belum diklaim</span>';

      return `
        <tr class="hover:bg-stone-50/90 transition-colors border-b border-stone-100 last:border-0">
          <td class="py-3.5 px-4 font-mono font-black text-xs text-stone-900 select-all tracking-wider">
            <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-100 text-stone-900 border border-stone-200">
              <span class="material-symbols-rounded text-xs text-amber-500">vpn_key</span>
              <span>${safeKey}</span>
            </div>
          </td>
          <td class="py-3.5 px-4 font-bold text-xs text-stone-900">
            <div class="font-extrabold text-stone-900 text-xs sm:text-sm">${safeName}</div>
            <div class="text-[11px] font-medium text-stone-500 flex items-center gap-1 mt-0.5">
              <span class="material-symbols-rounded text-xs text-stone-400">phone</span>
              <span>${safePhone || 'Tidak ada no WA'}</span>
            </div>
          </td>
          <td class="py-3.5 px-3 text-xs font-bold">
            ${lic.tier === 'PRO_LIFETIME' 
              ? '<span class="px-2 py-0.5 rounded-md bg-stone-900 text-amber-300 text-[10.5px] font-black tracking-wide">PRO LIFETIME</span>' 
              : '<span class="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10.5px] font-black tracking-wide border border-stone-200">STANDAR</span>'}
          </td>
          <td class="py-3.5 px-3">${statusBadge}</td>
          <td class="py-3.5 px-3 text-xs text-stone-600 font-medium">${dateStr}</td>
          <td class="py-3.5 px-3 text-xs font-mono font-bold text-stone-800">${claimedStore}</td>
          <td class="py-3.5 px-4 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1.5">
              <button type="button" onclick="window.KasirApp.copySpecificLicenseCode('${safeKey}')"
                class="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition active:scale-95 cursor-pointer shadow-2xs" title="Salin Kode">
                <span class="material-symbols-rounded text-base">content_copy</span>
              </button>
              <button type="button" onclick="window.KasirApp.shareSpecificLicenseViaWA('${safeKey}', '${safeName}', '${safePhone}', '${lic.tier}')"
                class="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition active:scale-95 cursor-pointer shadow-2xs" title="Kirim WhatsApp">
                <span class="material-symbols-rounded text-base">chat</span>
              </button>
              ${!isRevoked ? `
                <button type="button" onclick="window.KasirApp.revokeLicenseAction('${safeKey}')"
                  class="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition active:scale-95 cursor-pointer shadow-2xs" title="Bekukan Lisensi">
                  <span class="material-symbols-rounded text-base">block</span>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error rendering licenses table:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-rose-600">
          Gagal memuat daftar lisensi: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

/**
 * Aksi bekukan lisensi
 */
export async function revokeLicenseAction(licenseKey) {
  if (!licenseKey) return;
  const ok = await showConfirmDialog({
    title: 'Bekukan Lisensi?',
    message: `Apakah Anda yakin ingin membekukan lisensi [${licenseKey}]? Toko yang menggunakan lisensi ini akan ditahan dari akses resmi.`,
    confirmText: 'Ya, Bekukan Lisensi',
    confirmType: 'danger',
    icon: 'block'
  });

  if (ok) {
    const res = await superAdminRevokeLicense(licenseKey);
    if (res) {
      showToast(`Lisensi [${licenseKey}] telah dibekukan`, 'info');
      await renderSuperAdminLicensesTable();
    } else {
      showToast('Gagal membekukan lisensi', 'error');
    }
  }
}
