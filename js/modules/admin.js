import { state, saveProducts, saveQueues, saveHistory, saveExpenses, saveQrisPayload } from '../state.js';
import { formatRp, escapeHtml, showToast, showConfirmDialog, playClick, compressImageToDataUrl } from '../utils.js';
import { renderProducts, renderCart } from './pos.js';
import { syncSaveProduct, syncDeleteProduct, syncBatchDeleteProducts, syncClearAllProducts, forceUploadAllToCloud, syncSaveQrisPayload } from '../firebase.js';
import { decodeQRFromImage, renderQRToContainer, parseQRISMetadata } from '../qris.js';
import { getStoreLicenseStatus, DEMO_MAX_PRODUCTS } from './license.js';

// State seleksi & filter internal tabel admin
let selectedAdminProductIds = new Set();
let adminSearchQuery = '';
let adminCategoryFilter = 'all';

export function renderAdminSkeletons(count = 5) {
  const container = document.getElementById('adminProductCardList');
  if (!container) return;
  container.innerHTML = Array(count).fill(0).map(() => `
    <div class="p-3 sm:p-4 flex items-center justify-between gap-3 border-b border-stone-100 animate-pulse">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="w-10 h-10 rounded-xl skeleton-shimmer shrink-0"></div>
        <div class="space-y-1.5 flex-1 max-w-xs">
          <div class="w-3/4 h-4 rounded skeleton-shimmer"></div>
          <div class="w-1/3 h-3.5 rounded skeleton-shimmer"></div>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <div class="w-16 h-8 rounded-xl skeleton-shimmer"></div>
        <div class="w-8 h-8 rounded-xl skeleton-shimmer"></div>
      </div>
    </div>
  `).join('');
}

export function getFilteredAdminProducts() {
  let list = state.products || [];
  if (adminCategoryFilter && adminCategoryFilter !== 'all') {
    list = list.filter(p => (p.category || '').toLowerCase() === adminCategoryFilter.toLowerCase());
  }
  if (adminSearchQuery.trim()) {
    const q = adminSearchQuery.trim().toLowerCase();
    list = list.filter(p => 
      (p.name || '').toLowerCase().includes(q) || 
      (p.category || '').toLowerCase().includes(q)
    );
  }
  return list;
}

export function handleAdminSearch(val) {
  adminSearchQuery = (val || '').trim();
  const clearBtn = document.getElementById('adminProductSearchClear');
  const kbdHint = document.getElementById('adminSearchKbdHint');
  if (clearBtn) {
    if (adminSearchQuery) {
      clearBtn.classList.remove('hidden');
      if (kbdHint) kbdHint.classList.add('hidden');
    } else {
      clearBtn.classList.add('hidden');
      if (kbdHint) kbdHint.classList.remove('hidden');
    }
  }
  renderAdminTable();
}

export function clearAdminSearch() {
  playClick('tap');
  adminSearchQuery = '';
  const input = document.getElementById('adminProductSearch');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('adminProductSearchClear');
  const kbdHint = document.getElementById('adminSearchKbdHint');
  if (clearBtn) clearBtn.classList.add('hidden');
  if (kbdHint) kbdHint.classList.remove('hidden');
  renderAdminTable();
}

export function setAdminCategoryFilter(cat) {
  playClick('tap');
  adminCategoryFilter = cat || 'all';
  const pills = document.querySelectorAll('.admin-cat-pill');
  pills.forEach(pill => {
    const isTarget = pill.getAttribute('data-cat') === adminCategoryFilter;
    if (isTarget) {
      pill.className = 'admin-cat-pill px-3 py-1.5 rounded-xl font-bold bg-emerald-700 text-white shadow-2xs transition whitespace-nowrap';
    } else {
      pill.className = 'admin-cat-pill px-3 py-1.5 rounded-xl font-bold bg-white text-stone-700 border border-stone-200 hover:bg-stone-100 transition whitespace-nowrap';
    }
  });
  renderAdminTable();
}

export function toggleSelectAdminProduct(id) {
  playClick('tap');
  if (selectedAdminProductIds.has(id)) {
    selectedAdminProductIds.delete(id);
  } else {
    selectedAdminProductIds.add(id);
  }
  renderAdminTable();
}

export function toggleSelectAllAdminProducts(forcedState) {
  playClick('tap');
  const filtered = getFilteredAdminProducts();
  const checkEl = document.getElementById('selectAllAdminProductsCheck');
  const shouldSelect = typeof forcedState === 'boolean' 
    ? forcedState 
    : (checkEl ? checkEl.checked : selectedAdminProductIds.size === 0);

  if (shouldSelect) {
    filtered.forEach(p => selectedAdminProductIds.add(p.id));
  } else {
    filtered.forEach(p => selectedAdminProductIds.delete(p.id));
  }
  renderAdminTable();
}

export function clearAdminSelection() {
  playClick('tap');
  selectedAdminProductIds.clear();
  renderAdminTable();
}

export function renderAdminTable() {
  const container = document.getElementById('adminProductCardList');
  if (!container) return;

  const filtered = getFilteredAdminProducts();
  const totalCount = state.products.length;
  const selectedCount = selectedAdminProductIds.size;

  // Sinkronisasi status toolbar kontrol & seleksi
  const checkAllEl = document.getElementById('selectAllAdminProductsCheck');
  const summaryEl = document.getElementById('adminSelectionSummary');
  const bulkContainer = document.getElementById('adminBulkActionContainer');
  const normalContainer = document.getElementById('adminNormalActionContainer');
  const bulkBtnText = document.getElementById('adminDeleteSelectedBtnText');

  if (checkAllEl) {
    if (filtered.length === 0) {
      checkAllEl.checked = false;
      checkAllEl.indeterminate = false;
      checkAllEl.disabled = true;
    } else {
      checkAllEl.disabled = false;
      const allSelected = filtered.every(p => selectedAdminProductIds.has(p.id));
      const someSelected = filtered.some(p => selectedAdminProductIds.has(p.id));
      checkAllEl.checked = allSelected;
      checkAllEl.indeterminate = !allSelected && someSelected;
    }
  }

  if (summaryEl) {
    if (selectedCount > 0) {
      summaryEl.innerHTML = `<strong class="text-emerald-800 font-black">${selectedCount}</strong> dari ${totalCount} dipilih`;
    } else if (filtered.length !== totalCount) {
      summaryEl.textContent = `${filtered.length} dari ${totalCount} Menu`;
    } else {
      summaryEl.textContent = `Total ${totalCount} Menu`;
    }
  }

  if (bulkContainer && normalContainer) {
    if (selectedCount > 0) {
      bulkContainer.classList.remove('hidden');
      normalContainer.classList.add('hidden');
      if (bulkBtnText) {
        bulkBtnText.textContent = `Hapus (${selectedCount}) Menu`;
      }
    } else {
      bulkContainer.classList.add('hidden');
      normalContainer.classList.remove('hidden');
    }
  }

  // Tampilan jika data menu kosong total
  if (totalCount === 0) {
    container.innerHTML = `
      <div class="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-3">
        <div class="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
          <span class="material-symbols-rounded text-3xl">restaurant_menu</span>
        </div>
        <h3 class="text-base sm:text-lg font-black text-stone-900">Belum ada menu</h3>
        <p class="text-xs sm:text-sm text-stone-500 max-w-sm">
          Tambah satu-satu atau sekaligus.
        </p>
        <div class="flex items-center gap-2 mt-2 flex-wrap justify-center">
          <button onclick="window.KasirApp.openAddProductModal()" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-stone-950 font-black text-xs sm:text-sm shadow-sm transition active:scale-95 touch-target-large">
            + Tambah Menu
          </button>
          <button onclick="window.KasirApp.openBulkImportModal()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 touch-target-large">
            Tambah Banyak
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Tampilan jika filter atau pencarian tidak menghasilkan menu
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center flex flex-col items-center justify-center gap-2">
        <span class="material-symbols-rounded text-3xl text-stone-400">search_off</span>
        <p class="text-xs font-bold text-stone-600">Tidak ada menu yang sesuai dengan pencarian atau filter.</p>
        <button onclick="window.KasirApp.clearAdminSearch()" class="text-xs font-extrabold text-emerald-700 hover:underline mt-1 cursor-pointer">
          Reset Filter & Pencarian
        </button>
      </div>
    `;
    return;
  }

  // Render daftar baris produk dengan checkbox & highlight baris
  container.innerHTML = filtered.map(p => {
    const isReady = p.isAvailable !== false && (!p.trackStock || (p.stock || 0) > 0);
    const isSelected = selectedAdminProductIds.has(p.id);

    return `
      <div class="p-2.5 sm:p-3.5 flex items-center justify-between gap-2 sm:gap-3 hover:bg-stone-50 transition border-b border-stone-100 last:border-0 ${isSelected ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600' : (!isReady ? 'bg-stone-50/60' : '')}">
        <div class="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          <!-- Checkbox seleksi per baris -->
          <label class="flex items-center justify-center p-1 cursor-pointer rounded-lg hover:bg-stone-200/60 transition touch-target-large shrink-0" onclick="event.stopPropagation()">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.KasirApp.toggleSelectAdminProduct('${p.id}')"
              class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-stone-300 cursor-pointer">
          </label>

          ${p.image ? `
            <img src="${p.image}" alt="${escapeHtml(p.name)}" class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover shrink-0 border border-stone-200 shadow-2xs" loading="lazy">
          ` : `
            <span class="material-symbols-rounded text-xl sm:text-2xl text-stone-950 p-2 sm:p-2.5 ${isReady ? 'bg-emerald-100/80' : 'bg-stone-200 text-stone-500'} rounded-xl shrink-0 border border-emerald-200">${p.icon || 'lunch_dining'}</span>
          `}
          
          <div class="truncate flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-black text-stone-900 text-xs sm:text-sm truncate ${!isReady ? 'line-through text-stone-500' : ''}">${escapeHtml(p.name)}</h4>
              ${p.trackStock ? `
                <span class="px-1.5 py-0.5 rounded-md text-[10.5px] font-black ${(p.stock || 0) > 0 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-700 border border-red-300'}">
                  Stok: ${p.stock || 0}
                </span>
              ` : `
                <span class="px-1.5 py-0.5 rounded-md text-[10.5px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                  Ready
                </span>
              `}
            </div>
            <p class="font-black text-emerald-800 text-xs mt-0.5">${formatRp(p.price)} <span class="text-[10.5px] text-stone-400 font-medium">(${escapeHtml(p.category)})</span></p>
          </div>
        </div>

        <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <!-- 1-Tap Toggle Status Ready / Habis -->
          <button onclick="window.KasirApp.toggleProductAvailability('${p.id}')" 
            class="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl font-black text-xs transition touch-target-large flex items-center gap-1 border cursor-pointer ${isReady ? 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'}"
            title="Klik untuk ubah status Ready/Habis">
            <span class="material-symbols-rounded text-base">${isReady ? 'check_circle' : 'cancel'}</span>
            <span class="hidden sm:inline">${isReady ? 'Ready' : 'Habis'}</span>
          </button>
          
          <!-- Tombol Ubah Menu -->
          <button onclick="window.KasirApp.openEditProductModal('${p.id}')" 
            class="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-stone-100 text-stone-800 hover:bg-emerald-100 hover:text-emerald-900 border border-stone-200 font-black text-xs flex items-center gap-1 transition touch-target-large cursor-pointer" 
            title="Ubah nama, harga, atau stok menu">
            <span class="material-symbols-rounded text-base">edit</span>
            <span class="hidden sm:inline">Ubah</span>
          </button>
          
          <!-- Hapus Menu Tunggal -->
          <button onclick="window.KasirApp.deleteProduct('${p.id}')" 
            class="p-1.5 sm:p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-bold touch-target-large cursor-pointer" 
            title="Hapus menu">
            <span class="material-symbols-rounded text-base">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export function toggleProductAvailability(id) {
  playClick('pop');
  const p = state.products.find(prod => prod.id === id);
  if (!p) return;
  
  const currentReady = p.isAvailable !== false && (!p.trackStock || (p.stock || 0) > 0);
  p.isAvailable = !currentReady;
  
  if (p.isAvailable && p.trackStock && (p.stock || 0) <= 0) {
    p.stock = 10; // Restock ke 10 jika sebelumnya 0
  }

  saveProducts();
  syncSaveProduct(p);
  renderAdminTable();
  renderProducts();
  showToast(`Menu "${p.name}": ${p.isAvailable ? 'tersedia' : 'habis'}`, p.isAvailable ? 'success' : 'warning');
}

export function renderProductAddOns(addOns = []) {
  const container = document.getElementById('productAddOnsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (Array.isArray(addOns) && addOns.length > 0) {
    addOns.forEach(ao => addNewAddOnRow(ao.name, ao.price));
  }
}

export function addNewAddOnRow(name = '', price = '') {
  playClick('tap');
  const container = document.getElementById('productAddOnsContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'addon-row flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-stone-200';
  row.innerHTML = `
    <input type="text" placeholder="Nama Add-on (ex: Telur)" value="${escapeHtml(name)}"
      class="addon-name-input flex-1 px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none">
    <div class="flex items-center gap-1">
      <span class="text-[10px] font-bold text-stone-500">+Rp</span>
      <input type="number" placeholder="0" min="0" step="500" value="${price !== undefined && price !== '' ? price : ''}"
        class="addon-price-input w-20 px-2 py-1.5 rounded-lg border border-stone-300 text-xs font-black text-emerald-800 focus:border-amber-500 focus:outline-none">
    </div>
    <button type="button" onclick="this.closest('.addon-row').remove()"
      class="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="Hapus Add-on">
      <span class="material-symbols-rounded text-base">delete</span>
    </button>
  `;
  container.appendChild(row);
  const input = row.querySelector('.addon-name-input');
  if (!name && input) input.focus();
}

export function collectProductAddOns() {
  const container = document.getElementById('productAddOnsContainer');
  if (!container) return [];
  const rows = container.querySelectorAll('.addon-row');
  const addOns = [];
  rows.forEach((row, idx) => {
    const name = row.querySelector('.addon-name-input')?.value.trim();
    const priceVal = parseInt(row.querySelector('.addon-price-input')?.value, 10);
    const price = isNaN(priceVal) ? 0 : Math.max(0, priceVal);
    if (name) {
      addOns.push({
        id: 'ao_' + idx + '_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name,
        price
      });
    }
  });
  return addOns;
}

// ================= FOTO MENU PRODUK =================
let currentProductImage = '';

export function triggerProductImageUpload() {
  playClick('tap');
  const input = document.getElementById('prodImageInput');
  if (input) {
    input.value = ''; // Reset agar event onchange tetap terpanggil jika upload file yang sama
    input.click();
  }
}

export function updateProductImagePreviewUI(imgUrl) {
  const imgEl = document.getElementById('prodImagePreviewImg');
  const placeholderEl = document.getElementById('prodImagePlaceholder');
  const btnRemove = document.getElementById('btnRemoveProductImage');

  if (imgUrl) {
    if (imgEl) {
      imgEl.src = imgUrl;
      imgEl.classList.remove('hidden');
    }
    if (placeholderEl) placeholderEl.classList.add('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.classList.add('hidden');
    }
    if (placeholderEl) placeholderEl.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
  }
}

export async function handleProductImageFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  try {
    showToast('Memproses foto…', 'info', 1500);
    const compressedDataUrl = await compressImageToDataUrl(file, 360, 0.75);
    currentProductImage = compressedDataUrl;
    updateProductImagePreviewUI(currentProductImage);
    playClick('pop');
    showToast('Foto tersimpan', 'success', 2000);
  } catch (err) {
    console.error('Compress image error:', err);
    showToast(err.message || 'Gagal memproses gambar', 'error');
  }
}

export function removeProductImage() {
  playClick('del');
  currentProductImage = '';
  updateProductImagePreviewUI('');
  const input = document.getElementById('prodImageInput');
  if (input) input.value = '';
  showToast('Foto dihapus', 'info', 2000);
}

export function openAddProductModal() {
  playClick('pop');
  const titleEl = document.getElementById('productModalTitle');
  const editIdEl = document.getElementById('editProductId');
  const nameEl = document.getElementById('prodName');
  const priceEl = document.getElementById('prodPrice');
  const catEl = document.getElementById('prodCategory');
  const iconEl = document.getElementById('prodIcon');
  const isAvailEl = document.getElementById('prodIsAvailable');
  const stockEl = document.getElementById('prodStock');
  const modal = document.getElementById('productModal');

  if (titleEl) titleEl.innerText = 'Tambah Menu';
  if (editIdEl) editIdEl.value = '';
  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  if (catEl) catEl.value = 'makanan';
  if (iconEl) iconEl.value = 'lunch_dining';
  if (isAvailEl) isAvailEl.checked = true;
  if (stockEl) stockEl.value = '';
  
  currentProductImage = '';
  updateProductImagePreviewUI('');
  renderProductAddOns([]);
  if (modal) {
    modal.classList.remove('hidden');
    const scrollBody = modal.querySelector('.overflow-y-auto');
    if (scrollBody) scrollBody.scrollTop = 0;
    setTimeout(() => {
      if (nameEl) nameEl.focus();
    }, 120);
  }
}

export function openEditProductModal(id) {
  playClick('pop');
  const p = state.products.find(prod => prod.id === id);
  if (!p) return;

  const titleEl = document.getElementById('productModalTitle');
  const editIdEl = document.getElementById('editProductId');
  const nameEl = document.getElementById('prodName');
  const priceEl = document.getElementById('prodPrice');
  const catEl = document.getElementById('prodCategory');
  const iconEl = document.getElementById('prodIcon');
  const isAvailEl = document.getElementById('prodIsAvailable');
  const stockEl = document.getElementById('prodStock');
  const modal = document.getElementById('productModal');

  if (titleEl) titleEl.innerText = `Ubah: ${p.name}`;
  if (editIdEl) editIdEl.value = p.id;
  if (nameEl) nameEl.value = p.name;
  if (priceEl) priceEl.value = p.price;
  if (catEl) catEl.value = p.category;
  if (iconEl) iconEl.value = p.icon;
  if (isAvailEl) isAvailEl.checked = p.isAvailable !== false;
  if (stockEl) {
    stockEl.value = (p.trackStock && p.stock !== null && p.stock !== undefined) ? p.stock : '';
  }
  
  currentProductImage = p.image || '';
  updateProductImagePreviewUI(currentProductImage);
  renderProductAddOns(p.addOns || []);
  if (modal) {
    modal.classList.remove('hidden');
    const scrollBody = modal.querySelector('.overflow-y-auto');
    if (scrollBody) scrollBody.scrollTop = 0;
    setTimeout(() => {
      if (nameEl) nameEl.focus();
    }, 120);
  }
}

export function closeProductModal() {
  playClick('pop');
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.add('hidden');
}

export function saveProduct(e) {
  if (e) e.preventDefault();

  const id = document.getElementById('editProductId').value;
  const name = document.getElementById('prodName').value.trim();
  const price = parseInt(document.getElementById('prodPrice').value, 10);
  const category = document.getElementById('prodCategory').value;
  const icon = document.getElementById('prodIcon').value;
  const isAvailable = document.getElementById('prodIsAvailable').checked;
  const stockInputRaw = document.getElementById('prodStock').value.trim();
  const addOns = collectProductAddOns();

  if (!name || isNaN(price) || price <= 0) {
    showToast('Isi nama dan harga', 'warning');
    return;
  }

  // Cek Batasan Jumlah Produk untuk Akun Demo (Maksimal 10 Produk)
  if (!id) {
    const licStatus = getStoreLicenseStatus(state.storeId);
    if (!licStatus.isLicensed && state.products && state.products.length >= DEMO_MAX_PRODUCTS) {
      playClick('error');
      showToast(`Batas Demo: Akun demo dibatasi maksimal ${DEMO_MAX_PRODUCTS} produk. Silakan aktivasi lisensi resmi seumur hidup!`, 'warning', 5000);
      if (window.KasirApp && typeof window.KasirApp.openActivateLicenseModal === 'function') {
        window.KasirApp.openActivateLicenseModal();
      }
      return;
    }
  }

  // Jika input stok diisi angka -> aktifkan batasan stok porsi. Jika dikosongkan -> stok bebas.
  const trackStock = stockInputRaw !== '';
  const stock = trackStock ? Math.max(0, parseInt(stockInputRaw, 10) || 0) : null;
  const finalAvailable = trackStock ? (stock > 0 && isAvailable) : isAvailable;

  let productObj = null;

  if (id) {
    const index = state.products.findIndex(p => p.id === id);
    if (index !== -1) {
      productObj = { 
        ...state.products[index], 
        name, 
        price, 
        category, 
        icon,
        image: currentProductImage || '',
        isAvailable: finalAvailable,
        trackStock,
        stock,
        addOns
      };
      state.products[index] = productObj;
    }
  } else {
    productObj = {
      id: 'p_' + Date.now(),
      name,
      price,
      category,
      icon,
      image: currentProductImage || '',
      isAvailable: finalAvailable,
      trackStock,
      stock,
      addOns
    };
    state.products.unshift(productObj);
  }

  saveProducts();
  if (productObj) {
    syncSaveProduct(productObj);
  }

  closeProductModal();
  renderAdminTable();
  renderProducts();
  showToast(`"${name}" tersimpan${addOns.length ? ` (${addOns.length} topping)` : ''}`, 'success');
}

export async function deleteProduct(id) {
  const p = state.products.find(prod => prod.id === id);
  const prodName = p ? p.name : 'ini';
  const ok = await showConfirmDialog({
    title: 'Hapus Menu Kasir',
    message: `Hapus menu "${prodName}" dari daftar kasir?`,
    confirmText: 'Hapus Menu',
    confirmType: 'danger',
    icon: 'delete'
  });
  if (ok) {
    selectedAdminProductIds.delete(id);
    state.products = state.products.filter(item => item.id !== id);
    state.orderQueues.forEach(q => {
      if (q.cart) delete q.cart[id];
    });
    saveProducts();
    saveQueues();
    syncDeleteProduct(id);
    renderAdminTable();
    renderProducts();
    renderCart();
    showToast(`"${prodName}" dihapus.`, 'info');
  }
}

/**
 * Bulk Delete Menu Terpilih
 */
export async function deleteSelectedProducts() {
  playClick('pop');
  const count = selectedAdminProductIds.size;
  if (count === 0) {
    showToast('Pilih menu dulu', 'warning');
    return;
  }

  const selectedProducts = state.products.filter(p => selectedAdminProductIds.has(p.id));
  const sampleNames = selectedProducts.slice(0, 3).map(p => `"${p.name}"`).join(', ');
  const extraCount = count - 3;
  const listSummary = extraCount > 0 ? `${sampleNames}, dan ${extraCount} menu lainnya` : sampleNames;

  const ok = await showConfirmDialog({
    title: `Hapus ${count} Menu Terpilih?`,
    message: `Apakah Anda yakin ingin menghapus ${count} menu (${listSummary})? Menu akan dihapus dari kasir dan sinkronisasi database cloud.`,
    confirmText: `Ya, Hapus (${count}) Menu`,
    confirmType: 'danger',
    icon: 'delete_sweep'
  });

  if (ok) {
    const idsToDelete = Array.from(selectedAdminProductIds);
    state.products = state.products.filter(p => !selectedAdminProductIds.has(p.id));
    state.orderQueues.forEach(q => {
      if (q.cart) {
        idsToDelete.forEach(id => delete q.cart[id]);
      }
    });

    saveProducts();
    saveQueues();
    syncBatchDeleteProducts(idsToDelete);

    selectedAdminProductIds.clear();
    renderAdminTable();
    renderProducts();
    renderCart();

    showToast(`${count} menu dihapus`, 'success');
  }
}

/**
 * Modal & Handler: Hapus Seluruh Menu (Destructive wipe with safety lock)
 */
export function openDeleteAllModal() {
  playClick('pop');
  if (!state.products || state.products.length === 0) {
    showToast('Daftar menu sudah kosong', 'info');
    return;
  }

  const countText = document.getElementById('deleteAllMenuCountText');
  if (countText) {
    countText.textContent = `seluruh ${state.products.length} menu`;
  }

  const checkEl = document.getElementById('deleteAllConfirmCheck');
  if (checkEl) checkEl.checked = false;

  const btnConfirm = document.getElementById('btnConfirmDeleteAll');
  if (btnConfirm) btnConfirm.disabled = true;

  const modal = document.getElementById('deleteAllMenuModal');
  if (modal) modal.classList.remove('hidden');
}

export function closeDeleteAllModal() {
  playClick('pop');
  const modal = document.getElementById('deleteAllMenuModal');
  if (modal) modal.classList.add('hidden');
}

export function toggleDeleteAllConfirmCheck(isChecked) {
  playClick('tap');
  const btnConfirm = document.getElementById('btnConfirmDeleteAll');
  if (btnConfirm) {
    btnConfirm.disabled = !isChecked;
  }
}

export async function confirmDeleteAllProducts() {
  playClick('pop');
  const count = state.products.length;
  if (count === 0) {
    closeDeleteAllModal();
    return;
  }

  state.products = [];
  state.orderQueues.forEach(q => {
    q.cart = {};
  });

  saveProducts();
  saveQueues();
  await syncClearAllProducts();

  selectedAdminProductIds.clear();
  closeDeleteAllModal();
  renderAdminTable();
  renderProducts();
  renderCart();

  showToast(`${count} menu dihapus dari kasir.`, 'info');
}

// ================= QRIS SETTINGS & IMAGE UPLOAD =================
export function openQrisModal() {
  playClick('pop');
  const modal = document.getElementById('qrisConfigModal');
  const inputEl = document.getElementById('qrisPayloadInput');
  const customNameEl = document.getElementById('qrisCustomStoreName');
  if (inputEl) inputEl.value = state.qrisPayload || '';
  if (customNameEl) customNameEl.value = state.storeProfile?.name || '';
  renderQrisPreview(state.qrisPayload);
  if (modal) modal.classList.remove('hidden');
}

export function closeQrisModal() {
  playClick('pop');
  const modal = document.getElementById('qrisConfigModal');
  if (modal) modal.classList.add('hidden');
}

export function renderQrisPreview(payload) {
  const containerEl = document.getElementById('qrisPreviewContainer');
  const text = (payload || state.qrisPayload || '').trim();
  if (containerEl && text) {
    renderQRToContainer(containerEl, text, 140);
  }

  // Parse and display metadata in preview
  if (text.startsWith('000201')) {
    const meta = parseQRISMetadata(text);
    const metaInfoEl = document.getElementById('qrisMetaInfoArea');
    if (metaInfoEl) {
      metaInfoEl.innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200 text-left text-xs flex flex-col gap-1 w-full">
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-emerald-950">${escapeHtml(meta.merchantName)}</span>
            <span class="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px] font-black">${escapeHtml(meta.acquirer)}</span>
          </div>
          <p class="text-[11px] text-stone-600">NMID: <strong class="text-stone-900">${meta.nmid || '-'}</strong> | Kota: ${escapeHtml(meta.city || '-')}</p>
        </div>
      `;
      metaInfoEl.classList.remove('hidden');
    }
  }
}

export async function handleQrisImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('qrisScanStatus');
  if (statusEl) {
    statusEl.innerText = '⏳ Sedang memindai gambar QRIS...';
    statusEl.className = 'text-xs font-bold text-emerald-700 block';
  }

  try {
    const rawPayload = await decodeQRFromImage(file);
    if (!rawPayload.startsWith('000201')) {
      throw new Error('QR Code yang terbaca bukan standar QRIS Indonesia (EMVCo).');
    }

    const inputEl = document.getElementById('qrisPayloadInput');
    if (inputEl) inputEl.value = rawPayload;

    renderQrisPreview(rawPayload);

    const meta = parseQRISMetadata(rawPayload);
    if (statusEl) {
      statusEl.innerText = `Berhasil membaca QRIS "${meta.merchantName}". Klik "Simpan QRIS" di bawah.`;
      statusEl.className = 'text-xs font-bold text-emerald-700 block';
    }
  } catch (err) {
    console.error('Scan QRIS error:', err);
    if (statusEl) {
      statusEl.innerText = 'Gagal: ' + (err.message || 'Tidak dapat membaca QRIS');
      statusEl.className = 'text-xs font-bold text-red-600 block';
    }
    showToast('Gagal membaca gambar QRIS. Pastikan foto tegak dan jelas.', 'error');
  }
}

export function saveQrisSettings(e) {
  if (e) e.preventDefault();
  const inputEl = document.getElementById('qrisPayloadInput');
  const customNameEl = document.getElementById('qrisCustomStoreName');
  const payload = inputEl ? inputEl.value.trim() : '';
  const customName = customNameEl ? customNameEl.value.trim() : '';

  if (!payload || !payload.startsWith('000201')) {
    showToast('Format kode QRIS tidak valid. Harus diawali dengan "000201".', 'warning');
    return;
  }

  saveQrisPayload(payload);
  if (customName && customName !== state.storeProfile.name) {
    state.storeProfile.name = customName;
    saveStoreProfile();
  }
  syncSaveQrisPayload(payload);
  closeQrisModal();
  showToast(`Pengaturan QRIS & nama toko [${state.storeProfile.name}] berhasil disimpan!`, 'success');
}

// ================= BACKUP & RESTORE DATA (JSON) =================
export function exportDataBackup() {
  const backupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    products: state.products,
    transactions: state.transactions,
    expenses: state.expenses,
    orderQueues: state.orderQueues,
    qrisPayload: state.qrisPayload
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Backup_Kasir_Mami_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function importDataBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.products && Array.isArray(data.products)) {
        state.products = data.products;
        saveProducts();
      }
      if (data.transactions && Array.isArray(data.transactions)) {
        state.transactions = data.transactions;
        saveHistory();
      }
      if (data.expenses && Array.isArray(data.expenses)) {
        state.expenses = data.expenses;
        saveExpenses();
      }
      if (data.orderQueues && Array.isArray(data.orderQueues)) {
        state.orderQueues = data.orderQueues;
        state.activeQueueId = data.orderQueues[0]?.id || 'q_1';
        saveQueues();
      }
      if (data.qrisPayload && typeof data.qrisPayload === 'string') {
        saveQrisPayload(data.qrisPayload);
        syncSaveQrisPayload(data.qrisPayload);
      }
      showToast('Data Kasir Mami berhasil dipulihkan dari backup!', 'success');
      forceUploadAllToCloud();
      renderProducts();
      renderCart();
      renderAdminTable();
    } catch (err) {
      showToast('Format file backup tidak valid!', 'error');
    }
  };
  reader.readAsText(file);
}

// ================= BULK MENU TEXT IMPORT =================
export const USER_SAMPLE_MENU_TEXT = `Makanan nasi Ayam serbuk 15k
Nasi telor satu 10k
Telor dobel 13k
Mie jumbo/dobel 19k tambah telor 13k
Mie biasa 7k tambah telor 10k
Aneka minuman saset 5k
Gud day 6k
ABC kelepon 6k
Nutri sari dll 5k
Kopi hitam 5k
Kopi susu 7k
Teh tarik 7k
Es teh solo 4k
Josu 5k
Millo 8k
Aneka minuman botol 5k
Sprit 7k
Gud day 7k
Susu ultra 7k
Sijiro 4k
Mineralle 5k
AQua 5k`;

let bulkParsedProducts = [];

function parsePriceNumber(str) {
  if (!str) return 0;
  const clean = str.trim().toLowerCase().replace(/rp\.?\s*/g, '');
  if (clean.endsWith('k') || clean.endsWith('rb') || clean.endsWith('ribu')) {
    const num = parseFloat(clean.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000);
  }
  const digits = clean.replace(/[^\d]/g, '');
  const num = parseInt(digits, 10) || 0;
  if (num > 0 && num < 1000) return num * 1000;
  return num;
}

function cleanItemTitle(str) {
  const words = (str || '').trim().split(/\s+/);
  return words.map(w => {
    if (/^(dll|dan|atau|ke|di|yang)$/i.test(w)) return w.toLowerCase();
    if (/^(abc|qris|pos|josu|bbq)$/i.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function pickMenuIcon(name, category) {
  const n = (name || '').toLowerCase();
  if (/mie|ramen|bakso|bihun|kwetiau/i.test(n)) return 'ramen_dining';
  if (/nasi|ayam|bebek|sate|burger|daging|ikan/i.test(n)) return 'lunch_dining';
  if (/telur|telor/i.test(n)) return 'egg';
  if (/kopi|coffee|teh|tea/i.test(n)) return 'local_cafe';
  if (/minuman|es |susu|josu|milo|millo|sprit|aqua|mineral|botol|saset/i.test(n)) return 'local_drink';
  if (/roti|pisang|tahu|tempe|gorengan|camilan|snack/i.test(n)) return 'bakery_dining';
  return category === 'minuman' ? 'local_drink' : (category === 'camilan' ? 'bakery_dining' : 'lunch_dining');
}

export function parseBulkMenuText(raw) {
  const lines = (raw || '').split('\n');
  const items = [];
  let currentCategory = 'makanan';

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Deteksi header kategori jika ada
    if (/^===?\s*makanan/i.test(line) || /^makanan\s*:/i.test(line)) {
      currentCategory = 'makanan';
      continue;
    }
    if (/^===?\s*minuman/i.test(line) || /^minuman\s*:/i.test(line)) {
      currentCategory = 'minuman';
      continue;
    }
    if (/^===?\s*camilan/i.test(line) || /^camilan\s*:/i.test(line)) {
      currentCategory = 'camilan';
      continue;
    }

    if (/^makanan\s+/i.test(line)) {
      currentCategory = 'makanan';
    } else if (/aneka minuman/i.test(line) || /^minuman\s+/i.test(line)) {
      currentCategory = 'minuman';
    }

    // Periksa baris ganda dengan ekstra/varian (misal: 'Mie biasa 7k tambah telor 10k')
    const tambahMatch = line.match(/(.+?)\s+(\d+[kK]?|\d+\.\d{3}|rp\.?\s*\d+)\s+(?:tambah|\+)\s+(.+?)\s+(\d+[kK]?|\d+\.\d{3}|rp\.?\s*\d+)$/i);
    if (tambahMatch) {
      let mainName = tambahMatch[1].replace(/^(makanan|minuman|camilan)\s+/i, '').trim();
      const mainPrice = parsePriceNumber(tambahMatch[2]);
      const addName = tambahMatch[3].trim();
      const addPrice = parsePriceNumber(tambahMatch[4]);
      
      items.push({
        id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name: cleanItemTitle(mainName),
        price: mainPrice,
        category: currentCategory,
        icon: pickMenuIcon(mainName, currentCategory),
        isAvailable: true,
        trackStock: false,
        stock: null
      });
      items.push({
        id: 'p_' + (Date.now() + 1) + '_' + Math.floor(Math.random() * 100000),
        name: cleanItemTitle(`${mainName} + ${addName}`),
        price: addPrice,
        category: currentCategory,
        icon: pickMenuIcon(mainName, currentCategory),
        isAvailable: true,
        trackStock: false,
        stock: null
      });
      continue;
    }

    // Baris reguler: Ekstrak nama dan harga
    const priceMatch = line.match(/(.*?)\s+(\d+[kK]|\d+rb|\d+\.\d{3}|rp\.?\s*\d+|\d{4,6}|\b\d{1,3}\b)$/i);
    if (priceMatch) {
      let name = priceMatch[1].replace(/^(makanan|minuman|camilan)\s+/i, '').trim();
      let price = parsePriceNumber(priceMatch[2]);
      if (!name) name = line;
      
      let cat = currentCategory;
      if (/kopi|teh|susu|josu|millo|milo|sprit|aqua|mineral|nutri|jus|drink|kelepon|saset|botol/i.test(name)) {
        cat = 'minuman';
      } else if (/nasi|mie|ayam|telor|bebek|bakso|gorengan/i.test(name)) {
        cat = 'makanan';
      }

      items.push({
        id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name: cleanItemTitle(name),
        price: price,
        category: cat,
        icon: pickMenuIcon(name, cat),
        isAvailable: true,
        trackStock: false,
        stock: null
      });
    } else {
      items.push({
        id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name: cleanItemTitle(line),
        price: 0,
        category: currentCategory,
        icon: pickMenuIcon(line, currentCategory),
        isAvailable: true,
        trackStock: false,
        stock: null
      });
    }
  }
  return items;
}

function createEmptyBulkItem(category = 'makanan') {
  return {
    id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    name: '',
    price: 0,
    category: category || 'makanan',
    icon: category === 'minuman' ? 'local_drink' : (category === 'camilan' ? 'bakery_dining' : 'lunch_dining'),
    isAvailable: true,
    trackStock: false,
    stock: null
  };
}

export function openBulkImportModal(initialText = '') {
  playClick('pop');
  const modal = document.getElementById('bulkImportModal');
  const textarea = document.getElementById('bulkMenuTextInput');
  
  if (initialText) {
    if (textarea) textarea.value = initialText;
    const parsed = parseBulkMenuText(initialText);
    if (parsed.length > 0) {
      bulkParsedProducts = parsed;
    }
    switchBulkMode('table');
  } else {
    if (!bulkParsedProducts || bulkParsedProducts.length === 0) {
      bulkParsedProducts = Array.from({ length: 5 }, () => createEmptyBulkItem());
    }
    switchBulkMode('table');
  }
  
  if (modal) modal.classList.remove('hidden');
}

export function closeBulkImportModal() {
  playClick('pop');
  const modal = document.getElementById('bulkImportModal');
  if (modal) modal.classList.add('hidden');
}

export function switchBulkMode(mode = 'table') {
  playClick('tap');
  const tabTable = document.getElementById('tabBtnBulkTable');
  const tabText = document.getElementById('tabBtnBulkText');
  const viewTable = document.getElementById('bulkTableView');
  const viewText = document.getElementById('bulkTextView');

  if (mode === 'table') {
    if (tabTable) {
      tabTable.className = 'px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border-b-2 border-indigo-600 text-indigo-700 bg-white rounded-t-xl transition shadow-2xs cursor-pointer';
    }
    if (tabText) {
      tabText.className = 'px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 border-transparent text-stone-500 hover:text-stone-800 rounded-t-xl transition cursor-pointer';
    }
    if (viewTable) viewTable.classList.remove('hidden');
    if (viewText) viewText.classList.add('hidden');
    renderBulkTable();
  } else {
    if (tabTable) {
      tabTable.className = 'px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 border-transparent text-stone-500 hover:text-stone-800 rounded-t-xl transition cursor-pointer';
    }
    if (tabText) {
      tabText.className = 'px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border-b-2 border-indigo-600 text-indigo-700 bg-white rounded-t-xl transition shadow-2xs cursor-pointer';
    }
    if (viewTable) viewTable.classList.add('hidden');
    if (viewText) viewText.classList.remove('hidden');
  }
  updateBulkSummary();
}

export function addBulkRow(count = 1) {
  playClick('tap');
  if (!Array.isArray(bulkParsedProducts)) bulkParsedProducts = [];
  const prevLen = bulkParsedProducts.length;
  for (let i = 0; i < count; i++) {
    bulkParsedProducts.push(createEmptyBulkItem());
  }
  renderBulkTable();
  updateBulkSummary();

  // Focus input nama baris baru
  setTimeout(() => {
    const input = document.getElementById(`bulkRowName_${prevLen}`);
    if (input) input.focus();
  }, 50);
}

export function removeBulkRow(index) {
  playClick('pop');
  if (index >= 0 && index < bulkParsedProducts.length) {
    bulkParsedProducts.splice(index, 1);
    if (bulkParsedProducts.length === 0) {
      bulkParsedProducts.push(createEmptyBulkItem());
    }
    renderBulkTable();
    updateBulkSummary();
  }
}

export function clearAllBulkRows() {
  playClick('pop');
  if (!Array.isArray(bulkParsedProducts) || bulkParsedProducts.length === 0) return;
  const filled = bulkParsedProducts.filter(item => item.name && item.name.trim().length > 0).length;
  const doClear = () => {
    bulkParsedProducts = [createEmptyBulkItem()];
    renderBulkTable();
    updateBulkSummary();
    showToast(filled > 0 ? `${filled} baris dihapus.` : 'Tabel sudah kosong.', 'info', 1500);
  };
  if (filled > 0) {
    showConfirmDialog({
      title: 'Hapus Semua Baris?',
      message: `Hapus ${filled} baris menu dari tabel? (Menu yang sudah tersimpan di kasir tidak ikut terhapus).`,
      confirmText: 'Hapus Semua',
      confirmType: 'danger',
      icon: 'delete_sweep'
    }).then(ok => { if (ok) doClear(); });
  } else {
    doClear();
  }
}

export function clearEmptyBulkRows() {
  playClick('pop');
  const beforeCount = bulkParsedProducts.length;
  bulkParsedProducts = bulkParsedProducts.filter(item => item.name && item.name.trim().length > 0);
  if (bulkParsedProducts.length === 0) {
    bulkParsedProducts.push(createEmptyBulkItem());
  }
  const removed = beforeCount - bulkParsedProducts.length;
  renderBulkTable();
  updateBulkSummary();
  if (removed > 0) {
    showToast(`${removed} baris kosong dihapus.`, 'info', 1500);
  } else {
    showToast('Tidak ada baris kosong.', 'info', 1200);
  }
}

export function updateBulkItem(index, field, value) {
  if (!bulkParsedProducts[index]) return;
  if (field === 'price') {
    bulkParsedProducts[index].price = Math.max(0, parseInt(value, 10) || 0);
  } else {
    bulkParsedProducts[index][field] = value;
  }
  if (field === 'name' || field === 'category') {
    bulkParsedProducts[index].icon = pickMenuIcon(bulkParsedProducts[index].name, bulkParsedProducts[index].category);
    const iconEl = document.getElementById(`bulkRowIcon_${index}`);
    if (iconEl) iconEl.textContent = bulkParsedProducts[index].icon;
  }
  updateBulkSummary();
}

export function handleBulkTextInput() {
  const textarea = document.getElementById('bulkMenuTextInput');
  const raw = textarea ? textarea.value : '';
  const parsed = parseBulkMenuText(raw);
  const validCountEl = document.getElementById('bulkValidCountText');
  if (validCountEl && document.getElementById('bulkTextView') && !document.getElementById('bulkTextView').classList.contains('hidden')) {
    validCountEl.textContent = `${parsed.length} Menu terdeteksi di teks`;
  }
}

export function convertTextToTable() {
  playClick('pop');
  const textarea = document.getElementById('bulkMenuTextInput');
  const raw = textarea ? textarea.value : '';
  const parsed = parseBulkMenuText(raw);
  if (parsed.length === 0) {
    showToast('Tidak ada menu terbaca', 'warning', 2500);
    return;
  }
  // Ambil menu yang sudah ada yang tidak kosong
  const existing = bulkParsedProducts.filter(item => item.name && item.name.trim().length > 0);
  bulkParsedProducts = [...existing, ...parsed];
  switchBulkMode('table');
  showToast(`${parsed.length} menu masuk tabel`, 'success', 2500);
}

export function loadUserSampleMenu() {
  playClick('tap');
  const textarea = document.getElementById('bulkMenuTextInput');
  if (textarea) {
    textarea.value = USER_SAMPLE_MENU_TEXT;
  }
  const parsed = parseBulkMenuText(USER_SAMPLE_MENU_TEXT);
  if (parsed.length > 0) {
    bulkParsedProducts = parsed;
    switchBulkMode('table');
    showToast(`${parsed.length} contoh masuk tabel`, 'success', 2500);
  }
}

export function renderBulkTable() {
  const tbody = document.getElementById('bulkTableBody');
  const badge = document.getElementById('bulkTableRowBadge');
  if (badge) badge.textContent = `${bulkParsedProducts.length} Baris`;
  if (!tbody) return;

  if (bulkParsedProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-stone-400">
          <span class="material-symbols-rounded text-3xl mb-1 text-stone-300">table_rows</span>
          <p class="font-bold text-xs">Belum ada baris menu.</p>
          <button type="button" onclick="window.KasirApp.addBulkRow(1)" class="mt-2 text-xs text-indigo-600 font-black hover:underline cursor-pointer">+ Tambah Baris Pertama</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = bulkParsedProducts.map((item, idx) => `
    <tr class="hover:bg-stone-50/70 transition-colors group">
      <td class="text-center py-2 px-1 text-stone-400 font-bold text-[11px] select-none">
        ${idx + 1}
      </td>
      <td class="py-1.5 px-2">
        <div class="flex items-center gap-1.5">
          <span id="bulkRowIcon_${idx}" class="material-symbols-rounded text-base text-stone-400 shrink-0 select-none hidden sm:inline-block">${item.icon}</span>
          <input type="text" id="bulkRowName_${idx}" value="${escapeHtml(item.name)}"
            placeholder="Contoh: Nasi Goreng Spesial"
            oninput="window.KasirApp.updateBulkItem(${idx}, 'name', this.value)"
            class="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none font-bold text-xs text-stone-900 shadow-2xs">
        </div>
      </td>
      <td class="py-1.5 px-2">
        <select onchange="window.KasirApp.updateBulkItem(${idx}, 'category', this.value)"
          class="w-full px-2 py-1.5 rounded-lg bg-white border border-stone-300 focus:border-indigo-600 focus:outline-none font-extrabold text-xs text-stone-800 shadow-2xs cursor-pointer">
          <option value="makanan" ${item.category === 'makanan' ? 'selected' : ''}>Makanan</option>
          <option value="minuman" ${item.category === 'minuman' ? 'selected' : ''}>Minuman</option>
          <option value="camilan" ${item.category === 'camilan' ? 'selected' : ''}>Camilan</option>
          <option value="topping" ${item.category === 'topping' ? 'selected' : ''}>Topping</option>
        </select>
      </td>
      <td class="py-1.5 px-2">
        <div class="relative flex items-center">
          <span class="absolute left-2 text-[11px] font-bold text-stone-400 pointer-events-none select-none">Rp</span>
          <input type="number" min="0" step="500" value="${item.price > 0 ? item.price : ''}" placeholder="0"
            oninput="window.KasirApp.updateBulkItem(${idx}, 'price', this.value)"
            class="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white border border-stone-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none font-black text-xs text-emerald-800 shadow-2xs">
        </div>
      </td>
      <td class="text-center py-1.5 px-1">
        <button type="button" onclick="window.KasirApp.removeBulkRow(${idx})"
          class="w-7 h-7 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center mx-auto transition cursor-pointer"
          title="Hapus baris ini">
          <span class="material-symbols-rounded text-base">close</span>
        </button>
      </td>
    </tr>
  `).join('');
}

export function updateBulkSummary() {
  const validItems = bulkParsedProducts.filter(item => item.name && item.name.trim().length > 0);
  const validCountText = document.getElementById('bulkValidCountText');
  const breakdownEl = document.getElementById('bulkBreakdownPills');
  const applyBtn = document.getElementById('btnApplyBulkImport');
  const btnText = document.getElementById('btnApplyBulkImportText');
  const badge = document.getElementById('bulkTableRowBadge');

  if (badge) badge.textContent = `${bulkParsedProducts.length} Baris`;

  const count = validItems.length;
  if (validCountText) {
    validCountText.textContent = `${count} Menu Siap Disimpan`;
  }

  if (breakdownEl) {
    if (count > 0) {
      const counts = { makanan: 0, minuman: 0, camilan: 0, topping: 0 };
      validItems.forEach(i => {
        counts[i.category] = (counts[i.category] || 0) + 1;
      });
      const parts = [];
      if (counts.makanan) parts.push(`${counts.makanan} Makanan`);
      if (counts.minuman) parts.push(`${counts.minuman} Minuman`);
      if (counts.camilan) parts.push(`${counts.camilan} Camilan`);
      if (counts.topping) parts.push(`${counts.topping} Topping`);
      breakdownEl.textContent = `• ${parts.join(' • ')}`;
    } else {
      breakdownEl.textContent = '';
    }
  }

  if (btnText) {
    btnText.textContent = count > 0 ? `Simpan & Terapkan (${count} Menu)` : 'Simpan & Terapkan (0 Menu)';
  }
  if (applyBtn) {
    applyBtn.disabled = count === 0;
  }
}

export function applyBulkMenuImport() {
  playClick('pop');
  const validItems = bulkParsedProducts.filter(item => item.name && item.name.trim().length > 0);
  if (validItems.length === 0) {
    showToast('Isi 1 nama menu dulu.', 'warning', 2000);
    return;
  }

  const modeRadios = document.getElementsByName('bulkImportMode');
  let mode = 'append';
  for (const r of modeRadios) {
    if (r.checked) {
      mode = r.value;
      break;
    }
  }

  // Pastikan setiap item memiliki ID unik dan nama bersih
  const processedItems = validItems.map(item => ({
    ...item,
    id: item.id || ('p_' + Date.now() + '_' + Math.floor(Math.random() * 100000)),
    name: cleanItemTitle(item.name),
    price: Math.max(0, parseInt(item.price, 10) || 0),
    category: item.category || 'makanan',
    icon: item.icon || pickMenuIcon(item.name, item.category),
    isAvailable: true,
    trackStock: false,
    stock: null
  }));

  // Cek Batasan Jumlah Produk untuk Akun Demo
  const licStatus = getStoreLicenseStatus(state.storeId);
  if (!licStatus.isLicensed) {
    const projectedCount = mode === 'replace' ? processedItems.length : ((state.products ? state.products.length : 0) + processedItems.length);
    if (projectedCount > DEMO_MAX_PRODUCTS) {
      playClick('error');
      showToast(`Batas Demo: Akun demo dibatasi maksimal ${DEMO_MAX_PRODUCTS} produk. Total (${projectedCount}) melebihi batas. Silakan aktivasi lisensi resmi!`, 'warning', 5000);
      if (window.KasirApp && typeof window.KasirApp.openActivateLicenseModal === 'function') {
        window.KasirApp.openActivateLicenseModal();
      }
      return;
    }
  }

  if (mode === 'replace') {
    state.products = [...processedItems];
    syncClearAllProducts();
  } else {
    const existingNames = new Set(state.products.map(p => p.name.toLowerCase().trim()));
    for (const item of processedItems) {
      if (existingNames.has(item.name.toLowerCase().trim())) {
        item.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      }
      state.products.push(item);
    }
  }

  saveProducts();
  processedItems.forEach(p => syncSaveProduct(p));

  closeBulkImportModal();
  renderAdminTable();
  renderProducts();

  // Reset bulk rows untuk pembukaan selanjutnya
  bulkParsedProducts = Array.from({ length: 5 }, () => createEmptyBulkItem());

  showToast(`${processedItems.length} menu tersimpan`, 'success', 3000);
}
