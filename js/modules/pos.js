/**
 * Kasir Mami - POS Module (Catalog, Order Queue, Cart)
 */

import { state, saveQueues, getCurrentCart, getActiveQueue, calculateCartTotal, getQueueLineItems, syncQueueCartFromItems } from '../state.js';
import { formatRp, playBeep, playClick, escapeHtml, showToast, showConfirmDialog } from '../utils.js';
import { syncSaveQueues } from '../firebase.js';

// ================= MULTI-ORDER QUEUE =================
export function renderOrderQueueTabs() {
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;

  container.innerHTML = state.orderQueues.map((q) => {
    const isActive = q.id === state.activeQueueId;
    const itemCount = Object.values(q.cart).reduce((a, b) => a + b, 0);

    let tabStyle = '';
    let badgeStyle = '';

    if (isActive) {
      tabStyle = 'bg-emerald-700 text-white font-black shadow-md ring-2 ring-emerald-400 active-queue-tab scale-[1.02]';
      badgeStyle = 'bg-white text-emerald-950 font-black shadow-sm';
    } else if (itemCount > 0) {
      tabStyle = 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100 font-extrabold border border-emerald-300 shadow-sm';
      badgeStyle = 'bg-emerald-700 text-white font-black';
    } else {
      tabStyle = 'bg-stone-100 text-stone-800 hover:bg-stone-200 font-extrabold border border-stone-300';
      badgeStyle = 'bg-stone-200 text-stone-800 font-bold';
    }

    return `
      <div class="active-queue-tab-wrapper flex items-center rounded-xl transition shrink-0 ${tabStyle}">
        <button onclick="window.KasirApp.switchOrderQueue('${q.id}')"
          class="px-3 py-2 text-xs sm:text-sm flex items-center gap-1.5 touch-target-large">
          <span>${escapeHtml(q.name)}</span>
          ${itemCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${badgeStyle}">${itemCount}</span>` : ''}
        </button>
        ${isActive ? `
          <button type="button" onclick="event.stopPropagation(); window.KasirApp.promptRenameQueue()"
            title="Ubah nama antrian" class="pr-2.5 pl-0.5 py-2 text-white/80 hover:text-white transition flex items-center">
            <span class="material-symbols-rounded text-sm">edit</span>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  const cur = getActiveQueue();
  const queueName = cur ? cur.name : (state.orderQueues[0]?.name || 'Pesanan #1');
  const titleEl = document.getElementById('currentOrderTitle');
  const drawerTitleEl = document.getElementById('mobileDrawerTitle');
  if (titleEl) titleEl.innerText = queueName;
  if (drawerTitleEl) drawerTitleEl.innerText = queueName;

  // Auto-scroll active tab into view smoothly & init drag scroll
  setTimeout(() => {
    initQueueDragScroll();
    const activeTab = container.querySelector('.active-queue-tab');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, 40);
}

export function initQueueDragScroll() {
  const slider = document.getElementById('orderQueueTabs');
  if (!slider || slider.dataset.dragInit) return;
  slider.dataset.dragInit = 'true';

  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });
}

export function scrollQueueTabs(direction) {
  playClick('tap');
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;
  const scrollAmount = direction === 'left' ? -200 : 200;
  container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

export function handleQueueWheel(e) {
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;
  if (e.deltaY !== 0) {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
  }
}

export function addNewOrderQueue() {
  playClick('pop');
  let nextNum = 1;
  const existingNums = state.orderQueues.map(q => {
    const m = q.name.match(/Pesanan\s*#(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  });
  while (existingNums.includes(nextNum)) {
    nextNum++;
  }

  const newId = 'q_' + Date.now();
  const newName = `Pesanan #${nextNum}`;
  state.orderQueues.push({
    id: newId,
    name: newName,
    cart: {},
    items: []
  });
  state.activeQueueId = newId;
  saveQueues();
  syncSaveQueues(state.orderQueues);
  renderOrderQueueTabs();
  renderCart();
  renderProducts();
  showToast(`Antrian "${newName}" siap digunakan`, 'info');

  // Scroll to the newest tab on the far right
  setTimeout(() => {
    const container = document.getElementById('orderQueueTabs');
    if (container) {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }
  }, 60);
}

export function switchOrderQueue(queueId) {
  playClick('switch');
  state.activeQueueId = queueId;
  renderOrderQueueTabs();
  renderCart();
  renderProducts();
}

export function promptRenameQueue() {
  openRenameQueueModal();
}

export function openRenameQueueModal() {
  playClick('pop');
  const cur = getActiveQueue();
  if (!cur) return;
  const modal = document.getElementById('renameQueueModal');
  const input = document.getElementById('renameQueueInput');
  if (input) input.value = cur.name;
  if (modal) modal.classList.remove('hidden');
  if (input) {
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
}

export function closeRenameQueueModal() {
  playClick('pop');
  const modal = document.getElementById('renameQueueModal');
  if (modal) modal.classList.add('hidden');
}

export function setPresetQueueName(name) {
  playClick('tap');
  const input = document.getElementById('renameQueueInput');
  if (input) input.value = name;
}

export function saveQueueRename(e) {
  if (e) e.preventDefault();
  const cur = getActiveQueue();
  if (!cur) return;
  const input = document.getElementById('renameQueueInput');
  const newName = input ? input.value.trim() : '';
  if (newName) {
    cur.name = newName;
    saveQueues();
    syncSaveQueues(state.orderQueues);
    renderOrderQueueTabs();
    closeRenameQueueModal();
    showToast(`Nama antrian diubah menjadi "${newName}"`, 'success');
  }
}

export async function deleteCurrentActiveQueue() {
  const cur = getActiveQueue();
  if (!cur) return;

  const itemCount = Object.values(cur.cart).reduce((a, b) => a + b, 0);
  const { total } = calculateCartTotal();
  const backedUpQueue = { 
    id: cur.id,
    name: cur.name,
    cart: { ...cur.cart }
  };

  if (state.orderQueues.length <= 1) {
    if (itemCount > 0) {
      const ok = await showConfirmDialog({
        title: 'Kosongkan Pesanan',
        message: `Kosongkan ${itemCount} pesanan senilai ${formatRp(total)} pada "${cur.name}"?`,
        confirmText: 'Kosongkan Pesanan',
        confirmType: 'danger',
        icon: 'remove_shopping_cart'
      });
      if (ok) {
        cur.cart = {};
        cur.name = 'Pesanan #1';
        saveQueues();
        syncSaveQueues(state.orderQueues);
        renderOrderQueueTabs();
        renderCart();
        renderProducts();
        showToast(`Pesanan dikosongkan dan direset ke "Pesanan #1".`, 'info', 5000, {
          label: 'URUNGKAN',
          onClick: () => {
            cur.cart = { ...backedUpQueue.cart };
            cur.name = backedUpQueue.name;
            saveQueues();
            syncSaveQueues(state.orderQueues);
            renderOrderQueueTabs();
            renderCart();
            renderProducts();
            showToast(`Pesanan "${cur.name}" berhasil dipulihkan!`, 'success');
          }
        });
      }
    } else {
      showToast(`Antrian "${cur.name}" sudah kosong.`, 'info');
    }
    return;
  }

  if (itemCount > 0) {
    const ok = await showConfirmDialog({
      title: 'Tutup Antrian Pesanan',
      message: `"${cur.name}" masih berisi ${itemCount} pesanan senilai ${formatRp(total)}. Yakin ingin menutup dan menghapus antrian ini?`,
      confirmText: 'Tutup & Hapus',
      confirmType: 'danger',
      icon: 'delete_sweep'
    });
    if (ok) {
      deleteOrderQueue(cur.id);
      showToast(`Antrian "${cur.name}" ditutup.`, 'info', 5000, {
        label: 'URUNGKAN',
        onClick: () => {
          state.orderQueues.push(backedUpQueue);
          state.activeQueueId = backedUpQueue.id;
          saveQueues();
          syncSaveQueues(state.orderQueues);
          renderOrderQueueTabs();
          renderCart();
          renderProducts();
          showToast(`Antrian "${backedUpQueue.name}" berhasil dipulihkan!`, 'success');
        }
      });
    }
  } else {
    deleteOrderQueue(cur.id);
    showToast(`Antrian "${cur.name}" ditutup.`, 'info', 4000, {
      label: 'URUNGKAN',
      onClick: () => {
        state.orderQueues.push(backedUpQueue);
        state.activeQueueId = backedUpQueue.id;
        saveQueues();
        syncSaveQueues(state.orderQueues);
        renderOrderQueueTabs();
        renderCart();
        renderProducts();
        showToast(`Antrian "${backedUpQueue.name}" dipulihkan.`, 'success');
      }
    });
  }
}

export function deleteOrderQueue(queueId, event) {
  if (event) event.stopPropagation();
  const qToDelete = state.orderQueues.find(q => q.id === queueId);
  if (!qToDelete) return;
  
  state.orderQueues = state.orderQueues.filter(q => q.id !== queueId);

  if (state.orderQueues.length === 0) {
    state.orderQueues = [{ id: 'q_' + Date.now(), name: 'Pesanan #1', cart: {}, items: [] }];
  } else if (
    state.orderQueues.length === 1 &&
    Object.keys(state.orderQueues[0].cart).length === 0 &&
    state.orderQueues[0].name.startsWith('Pesanan #')
  ) {
    state.orderQueues[0].name = 'Pesanan #1';
  }

  if (!state.orderQueues.some(q => q.id === state.activeQueueId)) {
    state.activeQueueId = state.orderQueues[0].id;
  }

  saveQueues();
  syncSaveQueues(state.orderQueues);
  renderOrderQueueTabs();
  renderCart();
  renderProducts();
}

// ================= CATEGORY & PRODUCT RENDERING =================
export function syncCategoryPillsUI() {
  const current = state.currentCategory || 'all';
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.className = 'cat-pill py-2 px-1 sm:px-4 rounded-xl font-bold text-xs sm:text-sm text-center bg-stone-100 hover:bg-stone-200 text-stone-800 transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 touch-target-large border border-stone-200';
  });
  const activeBtn = document.getElementById(`cat-${current}`);
  if (activeBtn) {
    activeBtn.className = 'cat-pill py-2 px-1 sm:px-4 rounded-xl font-black text-xs sm:text-sm text-center bg-emerald-700 text-white shadow-md transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 touch-target-large ring-2 ring-emerald-500/30';
  }
}

export function setCategory(cat) {
  playClick('switch');
  state.currentCategory = cat;
  syncCategoryPillsUI();
  renderProducts();
}

export function renderProductSkeletons(count = 8) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = Array(count).fill(0).map(() => `
    <div class="bg-white border border-stone-200 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between h-40 animate-pulse shadow-sm">
      <div class="flex items-start justify-between">
        <div class="w-9 h-9 sm:w-12 sm:h-12 rounded-xl skeleton-shimmer"></div>
        <div class="w-14 h-4 rounded-lg skeleton-shimmer"></div>
      </div>
      <div class="space-y-2 mt-2">
        <div class="w-3/4 h-4 rounded skeleton-shimmer"></div>
        <div class="w-1/2 h-5 rounded skeleton-shimmer"></div>
      </div>
      <div class="w-full h-3 rounded skeleton-shimmer mt-2 pt-1 border-t border-stone-100"></div>
    </div>
  `).join('');
}

export function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const searchInput = document.getElementById('searchInput');
  const search = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const currentCart = getCurrentCart();

  // Mode Belum Masuk Toko / Logout
  if (!state.storeId) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center text-stone-500 flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
        <div class="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-sm">
          <span class="material-symbols-rounded text-3xl">storefront</span>
        </div>
        <div>
          <h3 class="text-base font-black text-stone-900">Belum Ada Toko Terhubung</h3>
          <p class="text-xs text-stone-500 max-w-xs mt-0.5">Silakan masuk ke toko Anda atau daftarkan toko baru untuk mulai melayani pelanggan.</p>
        </div>
        <button type="button" onclick="KasirApp.openUniversalLoginModal('login')"
          class="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-sm transition active:scale-95 touch-target-large">
          Pilih / Masuk Toko
        </button>
      </div>
    `;
    return;
  }

  const filtered = state.products.filter(p => {
    const matchesCat = (state.currentCategory === 'all') || (p.category === state.currentCategory);
    const matchesSearch = p.name.toLowerCase().includes(search);
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-stone-400 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
        <span class="material-symbols-rounded text-5xl text-stone-300">search_off</span>
        <p class="font-bold text-sm">Menu tidak ditemukan</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const qty = currentCart[product.id] || 0;
    const hasQty = qty > 0;
    const isReady = product.isAvailable !== false && (!product.trackStock || (product.stock || 0) > 0);

    return `
      <div onclick="window.KasirApp.addToCart('${product.id}')" 
        class="relative bg-white active:scale-[0.98] ${hasQty ? 'border-2 border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/20 shadow-md' : 'border border-stone-200 hover:border-emerald-300 shadow-sm'} ${!isReady ? 'opacity-65 bg-stone-50 cursor-not-allowed' : ''} rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between transition touch-target-large">
        
        ${hasQty ? `
          <span class="absolute -top-2 -right-2 bg-emerald-700 text-white font-black text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full shadow-md z-10">
            ${qty}x
          </span>
        ` : ''}

        ${!isReady ? `
          <span class="absolute top-2 right-2 bg-rose-600 text-white font-black text-[10px] sm:text-xs px-2 py-0.5 rounded-full shadow-md z-10">
            HABIS
          </span>
        ` : ''}

        <div class="flex items-start justify-between gap-1">
          <div class="w-9 h-9 sm:w-12 sm:h-12 rounded-xl ${hasQty ? 'bg-emerald-100 text-emerald-800' : (isReady ? 'bg-stone-100 text-stone-700' : 'bg-stone-200 text-stone-400')} flex items-center justify-center shrink-0 transition">
            <span class="material-symbols-rounded text-xl sm:text-2xl">${product.icon || 'lunch_dining'}</span>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-[10px] font-bold text-stone-500 capitalize px-2 py-0.5 rounded-lg bg-stone-100">${escapeHtml(product.category)}</span>
            ${Array.isArray(product.addOns) && product.addOns.length > 0 ? `
              <span class="text-[9px] font-extrabold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                <span class="material-symbols-rounded text-[11px] text-amber-600">add_circle</span>
                <span>Add-on</span>
              </span>
            ` : ''}
            ${product.trackStock && isReady ? `
              <span class="text-[9px] font-extrabold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Sisa: ${product.stock}
              </span>
            ` : ''}
          </div>
        </div>

        <div class="mt-2.5">
          <h3 class="font-extrabold text-stone-900 text-xs sm:text-base leading-tight line-clamp-2 ${!isReady ? 'text-stone-500 line-through' : ''}">${escapeHtml(product.name)}</h3>
          <p class="font-black ${isReady ? 'text-emerald-700' : 'text-stone-400'} text-sm sm:text-lg mt-0.5">${formatRp(product.price)}</p>
        </div>

        <div class="mt-2 pt-1.5 border-t ${hasQty ? 'border-emerald-200/80' : 'border-stone-100'}">
          ${!isReady ? `
            <div class="flex items-center justify-between text-[11px] font-extrabold text-rose-500">
              <span class="font-black text-rose-600">Stok Kosong</span>
              <span class="material-symbols-rounded text-base text-rose-500">block</span>
            </div>
          ` : (hasQty ? `
            <div class="flex items-center justify-between gap-1 pt-0.5" onclick="event.stopPropagation()">
              <button onclick="window.KasirApp.updateCartQty('${product.id}', -1)"
                class="w-8 h-8 rounded-xl ${qty === 1 ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-white text-stone-800 border-emerald-300 hover:bg-stone-50'} border font-black text-base flex items-center justify-center transition active:scale-90 shadow-sm touch-target-large"
                title="${qty === 1 ? 'Hapus menu dari pesanan' : 'Kurangi 1 porsi'}">
                ${qty === 1 ? '<span class="material-symbols-rounded text-base">delete</span>' : '-'}
              </button>
              <div class="flex flex-col items-center leading-none px-0.5">
                <span class="font-black text-emerald-950 text-xs sm:text-sm">${qty}</span>
                <span class="text-[9px] font-bold text-stone-500">porsi</span>
              </div>
              <button onclick="window.KasirApp.updateCartQty('${product.id}', 1)"
                class="w-8 h-8 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-base flex items-center justify-center transition active:scale-90 shadow-sm touch-target-large"
                title="Tambah 1 porsi">
                +
              </button>
              <button type="button" onclick="window.KasirApp.openItemNoteModal('${product.id}')"
                class="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center transition active:scale-90 shadow-sm touch-target-large ml-0.5 cursor-pointer"
                title="Catatan & Add-on">
                <span class="material-symbols-rounded text-base text-amber-700">edit_note</span>
              </button>
            </div>
          ` : `
            <div class="flex items-center justify-between text-[11px] font-extrabold text-stone-500">
              <span>+ Tambah</span>
              <span class="material-symbols-rounded text-base text-emerald-600">add_circle</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }).join('');
}

// ================= CART OPERATIONS =================
export function addToCart(productId) {
  const p = state.products.find(prod => prod.id === productId);
  if (!p) return;

  const isReady = p.isAvailable !== false && (!p.trackStock || (p.stock || 0) > 0);
  if (!isReady) {
    playClick('del');
    showToast(`Menu "${p.name}" sedang HABIS / KOSONG!`, 'warning');
    return;
  }

  const q = getActiveQueue();
  if (q) {
    const items = getQueueLineItems(q);
    const totalQtyInCart = items.filter(it => it.productId === productId).reduce((sum, it) => sum + it.qty, 0);

    if (p.trackStock && (p.stock || 0) <= totalQtyInCart) {
      playClick('del');
      showToast(`Stok "${p.name}" hanya tersisa ${p.stock}!`, 'warning');
      return;
    }

    playClick('tap');
    // Cari line item standar yang belum memiliki catatan khusus dan belum memiliki addOn
    let plainItem = items.find(it => it.productId === productId && (!it.note || it.note.trim() === '') && (!it.addOns || it.addOns.length === 0));
    if (plainItem) {
      plainItem.qty += 1;
    } else {
      const newLineId = 'line_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      items.push({
        lineId: newLineId,
        productId: productId,
        qty: 1,
        note: '',
        addOns: []
      });
    }

    syncQueueCartFromItems(q);
    saveQueues();
    syncSaveQueues(state.orderQueues);
    renderOrderQueueTabs();
    renderCart();
    renderProducts();
  }
}

export function updateCartQty(targetId, delta) {
  if (delta > 0) {
    playClick('tap');
  } else {
    playClick('del');
  }
  const q = getActiveQueue();
  if (!q) return;

  const items = getQueueLineItems(q);
  // Cari berdasarkan lineId terlebih dahulu
  let targetIndex = items.findIndex(it => it.lineId === targetId);

  // Jika tidak ditemukan berdasarkan lineId, cari berdasarkan productId (misal tombol +/- di kartu katalog produk)
  if (targetIndex === -1) {
    if (delta > 0) {
      targetIndex = items.findIndex(it => it.productId === targetId && (!it.note || it.note.trim() === '') && (!it.addOns || it.addOns.length === 0));
      if (targetIndex === -1) {
        targetIndex = items.map(it => it.productId).lastIndexOf(targetId);
      }
    } else {
      targetIndex = items.map(it => it.productId).lastIndexOf(targetId);
    }
  }

  if (targetIndex === -1) return;

  const item = items[targetIndex];
  const p = state.products.find(prod => prod.id === item.productId);

  if (delta > 0) {
    if (p && p.trackStock) {
      const totalQtyInCart = items.filter(it => it.productId === item.productId).reduce((sum, it) => sum + it.qty, 0);
      if (p.stock <= totalQtyInCart) {
        showToast(`Stok "${p.name}" hanya tersisa ${p.stock}!`, 'warning');
        return;
      }
    }
    item.qty += delta;
  } else {
    item.qty += delta;
    if (item.qty <= 0) {
      items.splice(targetIndex, 1);
    }
  }

  syncQueueCartFromItems(q);
  saveQueues();
  syncSaveQueues(state.orderQueues);
  renderOrderQueueTabs();
  renderCart();
  renderProducts();
}

export async function confirmClearCart() {
  const q = getActiveQueue();
  if (!q) return;
  const items = getQueueLineItems(q);
  if (items.length === 0 && Object.keys(q.cart || {}).length === 0) return;

  const ok = await showConfirmDialog({
    title: 'Kosongkan Pesanan',
    message: `Hapus semua item pesanan di ${q.name}?`,
    confirmText: 'Kosongkan',
    confirmType: 'danger',
    icon: 'remove_shopping_cart'
  });
  if (ok) {
    q.items = [];
    q.cart = {};
    q.notes = {};
    saveQueues();
    syncSaveQueues(state.orderQueues);
    toggleMobileCartDrawer(false);
    renderOrderQueueTabs();
    renderCart();
    renderProducts();
    showToast(`Pesanan pada ${q.name} telah dikosongkan.`, 'info');
  }
}

export function renderCart() {
  const { total, count } = calculateCartTotal();
  const hasItems = count > 0;
  const curQueue = getActiveQueue();
  const items = curQueue ? getQueueLineItems(curQueue) : [];

  const desktopList = document.getElementById('cartItemsList');
  const desktopTotal = document.getElementById('cartTotalDisplay');
  const desktopCount = document.getElementById('cartCountBadge');
  const desktopBtnCheckout = document.getElementById('btnCheckout');
  
  if (desktopTotal) desktopTotal.innerText = formatRp(total);
  if (desktopCount) desktopCount.innerText = `${count} item`;
  if (desktopBtnCheckout) desktopBtnCheckout.disabled = !hasItems;

  const mobileFloating = document.getElementById('mobileFloatingCart');
  const mobilePillCount = document.getElementById('mobilePillCount');
  const mobilePillTotal = document.getElementById('mobilePillTotal');
  const mobileHeaderBtn = document.getElementById('mobileHeaderCartBtn');
  const mobileHeaderTotal = document.getElementById('mobileHeaderCartTotal');

  if (mobileHeaderBtn) {
    if (hasItems) {
      mobileHeaderBtn.className = 'relative px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 touch-target-large shadow-sm active:scale-95 transition';
      if (mobileHeaderTotal) {
        mobileHeaderTotal.className = 'text-xs font-black text-white';
        mobileHeaderTotal.innerText = formatRp(total);
      }
    } else {
      mobileHeaderBtn.className = 'relative px-3.5 py-2 rounded-xl bg-stone-100 text-stone-500 border border-stone-200 flex items-center gap-1.5 touch-target-large active:scale-95 transition';
      if (mobileHeaderTotal) {
        mobileHeaderTotal.className = 'text-xs font-bold text-stone-500';
        mobileHeaderTotal.innerText = 'Rp 0';
      }
    }
  }

  if (mobileFloating) {
    if (hasItems) {
      const cur = getActiveQueue();
      mobilePillCount.innerText = `${cur ? cur.name : 'Pesanan'} (${count} Item)`;
      if (mobilePillTotal) mobilePillTotal.innerText = formatRp(total);
      mobileFloating.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
    } else {
      mobileFloating.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
    }
  }

  const itemsHtml = items.length === 0 ? `
    <div class="flex flex-col items-center justify-center h-36 text-stone-400 gap-1.5">
      <span class="material-symbols-rounded text-3xl text-stone-300">touch_app</span>
      <p class="font-bold text-xs sm:text-sm text-center">Sentuh menu untuk menambah pesanan</p>
    </div>
  ` : items.map(item => {
    const p = state.products.find(prod => prod.id === item.productId);
    if (!p) return '';
    const addOns = Array.isArray(item.addOns) ? item.addOns : [];
    const addOnTotal = addOns.reduce((sum, ao) => sum + (Number(ao.price) || 0), 0);
    const unitPrice = (p.price || 0) + addOnTotal;
    const subtotal = unitPrice * item.qty;
    const hasAddOns = addOns.length > 0;
    const hasNote = Boolean(item.note && item.note.trim());

    return `
      <div class="py-2.5 flex items-start justify-between gap-1.5 border-b border-stone-100 last:border-0">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="font-extrabold text-stone-900 text-xs sm:text-sm leading-tight">${escapeHtml(p.name)}</h4>
            ${hasAddOns ? `<span class="text-[9.5px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">+Add-on</span>` : ''}
          </div>

          <p class="text-[11px] font-bold text-stone-500 mt-0.5">
            ${formatRp(unitPrice)} &times; ${item.qty} = <span class="text-emerald-800 font-black">${formatRp(subtotal)}</span>
          </p>

          ${hasAddOns ? `
            <div class="flex flex-wrap gap-1 mt-1">
              ${addOns.map(ao => `
                <span class="text-[10px] font-bold text-amber-950 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <span class="material-symbols-rounded text-[11px] text-amber-600">check_circle</span>
                  <span>${escapeHtml(ao.name)}</span>
                  ${Number(ao.price) > 0 ? `<span class="text-amber-800 font-black">(+${formatRp(ao.price)})</span>` : ''}
                </span>
              `).join('')}
            </div>
          ` : ''}

          <div class="mt-1 flex items-center gap-1.5 flex-wrap">
            ${hasNote ? `
              <button type="button" onclick="window.KasirApp.openItemNoteModal('${item.lineId}')" 
                class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 transition text-left cursor-pointer shadow-2xs">
                <span class="material-symbols-rounded text-sm text-amber-700">edit_note</span>
                <span class="truncate max-w-[140px] sm:max-w-[200px]">${escapeHtml(item.note)}</span>
              </button>
            ` : `
              <button type="button" onclick="window.KasirApp.openItemNoteModal('${item.lineId}')"
                class="inline-flex items-center gap-1 text-[10.5px] font-bold text-stone-500 hover:text-amber-900 bg-stone-50 hover:bg-amber-50 px-2 py-0.5 rounded-lg border border-stone-200 hover:border-amber-300 transition cursor-pointer">
                <span class="material-symbols-rounded text-sm text-amber-600">note_add</span>
                <span>Catatan / Add-on</span>
              </button>
            `}
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0 mt-0.5">
          <button type="button" onclick="window.KasirApp.openItemNoteModal('${item.lineId}')"
            class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${hasNote || hasAddOns ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 ring-1 ring-amber-400/40' : 'bg-stone-100 hover:bg-amber-50 hover:text-amber-700 text-stone-500 border border-stone-200'} flex items-center justify-center touch-target-large transition cursor-pointer active:scale-95 shadow-2xs"
            title="${hasNote ? `Catatan: ${escapeHtml(item.note)}` : 'Tambah Catatan / Add-on'}">
            <span class="material-symbols-rounded text-base sm:text-lg ${hasNote || hasAddOns ? 'text-amber-700' : 'text-stone-500'}">edit_note</span>
          </button>
          <button onclick="window.KasirApp.updateCartQty('${item.lineId}', -1)" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-black text-sm flex items-center justify-center touch-target-large transition cursor-pointer">-</button>
          <span class="w-5 text-center font-black text-xs sm:text-sm text-stone-800">${item.qty}</span>
          <button onclick="window.KasirApp.updateCartQty('${item.lineId}', 1)" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center touch-target-large shadow-sm transition cursor-pointer">+</button>
        </div>
      </div>
    `;
  }).join('');

  if (desktopList) desktopList.innerHTML = itemsHtml;
  
  const drawerList = document.getElementById('mobileDrawerCartItems');
  const drawerTotal = document.getElementById('mobileDrawerTotalDisplay');
  if (drawerList) drawerList.innerHTML = itemsHtml;
  if (drawerTotal) drawerTotal.innerText = formatRp(total);

  // ponytail: single source of truth - card badges must always mirror cart
  renderProducts();
}

export function toggleMobileCartDrawer(forcedState) {
  const drawer = document.getElementById('mobileCartDrawer');
  if (!drawer) return;
  if (typeof forcedState === 'boolean') {
    drawer.classList.toggle('hidden', !forcedState);
  } else {
    drawer.classList.toggle('hidden');
  }
}

// ================= SENIOR-FRIENDLY ITEM NOTE & ADD-ON MODAL =================
export function openItemNoteModal(lineIdOrProductId) {
  playClick('pop');
  const q = getActiveQueue();
  if (!q) return;

  const items = getQueueLineItems(q);
  let item = items.find(it => it.lineId === lineIdOrProductId);
  if (!item) {
    item = items.find(it => it.productId === lineIdOrProductId);
  }
  if (!item) return;

  const p = state.products.find(prod => prod.id === item.productId);
  const prodNameEl = document.getElementById('itemNoteProductName');
  const prodIdEl = document.getElementById('itemNoteProductId');
  const lineIdEl = document.getElementById('itemNoteLineId');
  const scopeEl = document.getElementById('itemNoteScope');
  const inputEl = document.getElementById('itemNoteInput');
  const modal = document.getElementById('itemNoteModal');

  if (prodNameEl) prodNameEl.innerText = p ? p.name : 'Pesanan';
  if (prodIdEl) prodIdEl.value = item.productId;
  if (lineIdEl) lineIdEl.value = item.lineId;
  if (scopeEl) scopeEl.value = 'all';
  if (inputEl) inputEl.value = item.note || '';

  // 1. Opsi Pemisahan Porsi (Item Splitting jika qty > 1)
  const splitSection = document.getElementById('itemNoteSplitSection');
  const qtyDisplay = document.getElementById('itemNoteQtyDisplay');
  const btnApplyAllQtyText = document.getElementById('btnApplyAllQtyText');

  if (item.qty > 1) {
    if (splitSection) splitSection.classList.remove('hidden');
    if (qtyDisplay) qtyDisplay.innerText = item.qty;
    if (btnApplyAllQtyText) btnApplyAllQtyText.innerText = item.qty;
    setItemNoteScope('all', false);
  } else {
    if (splitSection) splitSection.classList.add('hidden');
    setItemNoteScope('all', false);
  }

  // 2. Daftar Pilihan Add-On / Topping Ekstra Menu
  const addOnSection = document.getElementById('itemNoteAddOnSection');
  const addOnList = document.getElementById('itemNoteAddOnList');

  if (p && Array.isArray(p.addOns) && p.addOns.length > 0) {
    if (addOnSection) addOnSection.classList.remove('hidden');
    if (addOnList) {
      const selectedAddOnNames = (item.addOns || []).map(ao => String(ao.name || '').trim().toLowerCase());
      addOnList.innerHTML = p.addOns.map(ao => {
        const isChecked = selectedAddOnNames.includes(String(ao.name || '').trim().toLowerCase());
        return `
          <label class="flex items-center gap-2 p-2 rounded-xl bg-white border ${isChecked ? 'border-amber-400 bg-amber-50/60 ring-1 ring-amber-300' : 'border-stone-200'} cursor-pointer hover:border-amber-300 transition text-xs font-bold text-stone-800 touch-target-large select-none">
            <input type="checkbox" name="itemAddOnCheckbox" value="${escapeHtml(ao.name)}" data-price="${ao.price || 0}" ${isChecked ? 'checked' : ''}
              class="w-4 h-4 accent-amber-600 rounded cursor-pointer shrink-0"
              onchange="this.closest('label').classList.toggle('border-amber-400', this.checked); this.closest('label').classList.toggle('bg-amber-50/60', this.checked); this.closest('label').classList.toggle('ring-1', this.checked); this.closest('label').classList.toggle('ring-amber-300', this.checked);">
            <div class="flex flex-col min-w-0 flex-1 leading-tight">
              <span class="truncate font-bold">${escapeHtml(ao.name)}</span>
              <span class="text-[10px] text-amber-800 font-extrabold">${Number(ao.price) > 0 ? `+${formatRp(ao.price)}` : 'Gratis'}</span>
            </div>
          </label>
        `;
      }).join('');
    }
  } else {
    if (addOnSection) addOnSection.classList.add('hidden');
    if (addOnList) addOnList.innerHTML = '';
  }

  if (modal) modal.classList.remove('hidden');
  setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
}

export function setItemNoteScope(scope, playSound = true) {
  if (playSound) playClick('tap');
  const scopeEl = document.getElementById('itemNoteScope');
  if (scopeEl) scopeEl.value = scope;

  const btnAll = document.getElementById('btnApplyAllPortions');
  const btnSplit = document.getElementById('btnSplitOnePortion');

  if (scope === 'split') {
    if (btnAll) {
      btnAll.className = 'py-2 px-2 rounded-xl bg-white text-stone-700 hover:bg-stone-100 font-bold border border-stone-300 text-center transition active:scale-95 cursor-pointer';
    }
    if (btnSplit) {
      btnSplit.className = 'py-2 px-2 rounded-xl bg-amber-100 text-amber-950 font-black border-2 border-amber-400 text-center transition active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-sm';
    }
  } else {
    if (btnAll) {
      btnAll.className = 'py-2 px-2 rounded-xl bg-emerald-100 text-emerald-900 font-black border-2 border-emerald-400 text-center transition active:scale-95 cursor-pointer shadow-sm';
    }
    if (btnSplit) {
      btnSplit.className = 'py-2 px-2 rounded-xl bg-white text-stone-700 hover:bg-stone-100 font-bold border border-stone-300 text-center transition active:scale-95 cursor-pointer flex items-center justify-center gap-1';
    }
  }
}

export function closeItemNoteModal() {
  playClick('pop');
  const modal = document.getElementById('itemNoteModal');
  if (modal) modal.classList.add('hidden');
}

export function appendQuickNote(chipText) {
  playClick('tap');
  const inputEl = document.getElementById('itemNoteInput');
  if (!inputEl) return;
  const current = inputEl.value.trim();
  if (!current) {
    inputEl.value = chipText;
  } else {
    if (!current.toLowerCase().includes(chipText.toLowerCase())) {
      inputEl.value = `${current}, ${chipText}`;
    }
  }
}

export function clearItemNote() {
  playClick('del');
  const inputEl = document.getElementById('itemNoteInput');
  if (inputEl) inputEl.value = '';
}

export function saveItemNote(e) {
  if (e) e.preventDefault();
  playClick('pop');
  const q = getActiveQueue();
  const prodIdEl = document.getElementById('itemNoteProductId');
  const lineIdEl = document.getElementById('itemNoteLineId');
  const scopeEl = document.getElementById('itemNoteScope');
  const inputEl = document.getElementById('itemNoteInput');
  if (!q || !prodIdEl) return;

  const productId = prodIdEl.value;
  const lineId = lineIdEl ? lineIdEl.value : '';
  const scope = scopeEl ? scopeEl.value : 'all';
  const note = (inputEl ? inputEl.value : '').trim();

  // Kumpulkan Add-On yang dicentang
  const selectedAddOns = [];
  document.querySelectorAll('#itemNoteAddOnList input[name="itemAddOnCheckbox"]:checked').forEach(cb => {
    selectedAddOns.push({
      name: cb.value,
      price: Number(cb.dataset.price) || 0
    });
  });

  const items = getQueueLineItems(q);
  let item = items.find(it => it.lineId === lineId);
  if (!item) {
    item = items.find(it => it.productId === productId);
  }
  if (!item) return;

  if (scope === 'split' && item.qty > 1) {
    // Kurangi 1 dari baris asli
    item.qty -= 1;

    // Buat baris baru mandiri khusus 1 porsi yang dicatat/diberi topping ini
    const newLineId = 'line_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    items.push({
      lineId: newLineId,
      productId: item.productId,
      qty: 1,
      note: note,
      addOns: selectedAddOns
    });

    showToast('1 porsi berhasil dipisahkan dengan catatan & topping khusus!', 'success', 3000);
  } else {
    // Terapkan ke baris ini
    item.note = note;
    item.addOns = selectedAddOns;
    showToast('Catatan & topping pesanan berhasil disimpan.', 'success', 2000);
  }

  syncQueueCartFromItems(q);
  saveQueues();
  syncSaveQueues(state.orderQueues);
  closeItemNoteModal();
  renderCart();
}
