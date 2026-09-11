/**
 * Kasir Mami - POS Module (Catalog, Order Queue, Cart)
 */

import { state, saveQueues, getCurrentCart, getActiveQueue, calculateCartTotal, getQueueLineItems, syncQueueCartFromItems } from '../state.js';
import { formatRp, playBeep, playClick, escapeHtml, showToast, showConfirmDialog } from '../utils.js';
import { syncSaveQueues } from '../firebase.js';

// ================= MULTI-ORDER QUEUE =================
export function renderOrderQueueTabs(autoScrollTab = false) {
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;

  container.innerHTML = state.orderQueues.map((q) => {
    const isActive = q.id === state.activeQueueId;
    const itemCount = (Array.isArray(q.items) && q.items.length > 0)
      ? q.items.reduce((a, b) => a + (b.qty || 0), 0)
      : Object.values(q.cart || {}).reduce((a, b) => a + b, 0);

    let tabStyle = '';
    let badgeStyle = '';

    if (isActive) {
      tabStyle = 'bg-emerald-700 text-white font-black shadow-xs ring-1 ring-emerald-400 active-queue-tab';
      badgeStyle = 'bg-white text-emerald-950 font-black shadow-2xs';
    } else if (itemCount > 0) {
      tabStyle = 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100 font-extrabold border border-emerald-300 shadow-2xs';
      badgeStyle = 'bg-emerald-700 text-white font-black';
    } else {
      tabStyle = 'bg-stone-100 text-stone-800 hover:bg-stone-200 font-extrabold border border-stone-200';
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

  initQueueDragScroll();

  // PENTING: Hanya geser kontainer horizontal slider orderQueueTabs itu sendiri jika diminta (misal: saat ganti antrian)
  // JANGAN PERNAH gunakan activeTab.scrollIntoView() karena browser akan menggulir seluruh halaman (window/body) ke atas!
  if (autoScrollTab) {
    const activeTab = container.querySelector('.active-queue-tab');
    if (activeTab) {
      const tabLeft = activeTab.offsetLeft;
      const tabWidth = activeTab.offsetWidth;
      const currentScroll = container.scrollLeft;
      const visibleWidth = container.clientWidth;

      if (tabLeft < currentScroll) {
        container.scrollTo({ left: Math.max(0, tabLeft - 12), behavior: 'smooth' });
      } else if (tabLeft + tabWidth > currentScroll + visibleWidth) {
        container.scrollTo({ left: tabLeft + tabWidth - visibleWidth + 12, behavior: 'smooth' });
      }
    }
  }
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
  renderOrderQueueTabs(true);
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

  const { total, count } = calculateCartTotal();
  const itemCount = count;
  const backedUpQueue = { 
    id: cur.id,
    name: cur.name,
    cart: { ...(cur.cart || {}) },
    notes: { ...(cur.notes || {}) },
    items: JSON.parse(JSON.stringify(cur.items || []))
  };

  if (state.orderQueues.length <= 1) {
    if (itemCount > 0) {
      const ok = await showConfirmDialog({
        title: 'Hapus Antrian & Isi Pesanan',
        message: `Hapus antrian "${cur.name}" beserta ${itemCount} pesanan di dalamnya (Total: ${formatRp(total)})? Seluruh isi pesanan akan ikut terhapus.`,
        confirmText: 'Hapus Antrian & Pesanan',
        confirmType: 'danger',
        icon: 'delete_sweep'
      });
      if (ok) {
        cur.items = [];
        cur.cart = {};
        cur.notes = {};
        cur.name = 'Pesanan #1';
        saveQueues();
        syncSaveQueues(state.orderQueues);
        renderOrderQueueTabs();
        renderCart();
        renderProducts();
        showToast(`Antrian dan seluruh isi pesanan telah dihapus.`, 'info', 5000, {
          label: 'URUNGKAN',
          onClick: () => {
            cur.cart = { ...backedUpQueue.cart };
            cur.notes = { ...backedUpQueue.notes };
            cur.items = JSON.parse(JSON.stringify(backedUpQueue.items || []));
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
      title: 'Tutup Antrian & Hapus Pesanan',
      message: `"${cur.name}" masih berisi ${itemCount} pesanan senilai ${formatRp(total)}. Yakin ingin menutup dan menghapus antrian ini beserta seluruh isinya?`,
      confirmText: 'Tutup & Hapus Semua',
      confirmType: 'danger',
      icon: 'delete_sweep'
    });
    if (ok) {
      deleteOrderQueue(cur.id);
      showToast(`Antrian "${cur.name}" dan seluruh isinya telah dihapus.`, 'info', 5000, {
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
  
  // Bersihkan data pesanan di antrian yang akan dihapus
  qToDelete.items = [];
  qToDelete.cart = {};
  qToDelete.notes = {};

  state.orderQueues = state.orderQueues.filter(q => q.id !== queueId);

  if (state.orderQueues.length === 0) {
    state.orderQueues = [{ id: 'q_' + Date.now(), name: 'Pesanan #1', cart: {}, items: [], notes: {} }];
  } else if (
    state.orderQueues.length === 1 &&
    Object.keys(state.orderQueues[0].cart || {}).length === 0 &&
    (!state.orderQueues[0].items || state.orderQueues[0].items.length === 0) &&
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
// ================= CATEGORY & PRODUCT RENDERING =================
export function syncCategoryPillsUI() {
  const current = state.currentCategory || 'all';
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.className = 'cat-pill py-2 px-3.5 sm:px-4 rounded-xl font-bold text-xs sm:text-sm text-center bg-white hover:bg-stone-50 text-stone-700 transition flex items-center justify-center gap-1.5 touch-target-large border border-stone-200/90 shadow-2xs shrink-0 whitespace-nowrap active:scale-95';
  });
  const activeBtn = document.getElementById(`cat-${current}`);
  if (activeBtn) {
    activeBtn.className = 'cat-pill py-2 px-4 sm:px-4.5 rounded-xl font-black text-xs sm:text-sm text-center bg-stone-900 text-white shadow-md transition flex items-center justify-center gap-1.5 touch-target-large ring-2 ring-stone-900/20 border border-stone-900 shrink-0 whitespace-nowrap';
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
    <div class="bg-white border border-stone-200/80 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 flex flex-col justify-between h-56 animate-pulse shadow-sm">
      <div class="w-full h-24 sm:h-28 rounded-xl sm:rounded-2xl skeleton-shimmer"></div>
      <div class="space-y-2 mt-2.5">
        <div class="w-3/4 h-4 rounded-lg skeleton-shimmer"></div>
        <div class="w-1/2 h-5 rounded-lg skeleton-shimmer"></div>
      </div>
      <div class="w-full h-8 rounded-xl skeleton-shimmer mt-2.5"></div>
    </div>
  `).join('');
}

function getCategoryVisualConfig(category, icon) {
  const cat = (category || '').toLowerCase().trim();
  if (cat.includes('makan')) {
    return {
      gradClass: 'card-grad-makanan',
      icon: icon || 'lunch_dining',
      accentColor: 'text-amber-800'
    };
  } else if (cat.includes('minum')) {
    return {
      gradClass: 'card-grad-minuman',
      icon: icon || 'local_cafe',
      accentColor: 'text-teal-800'
    };
  } else if (cat.includes('camil') || cat.includes('snack') || cat.includes('kue')) {
    return {
      gradClass: 'card-grad-camilan',
      icon: icon || 'bakery_dining',
      accentColor: 'text-rose-800'
    };
  } else if (cat.includes('top') || cat.includes('ekstra') || cat.includes('tambah')) {
    return {
      gradClass: 'card-grad-topping',
      icon: icon || 'add_circle',
      accentColor: 'text-purple-800'
    };
  }
  return {
    gradClass: 'card-grad-default',
    icon: icon || 'restaurant',
    accentColor: 'text-stone-700'
  };
}

export function renderProductCardActionHTML(product, qty, isReady) {
  if (!isReady) {
    return `
      <div class="flex items-center justify-between text-[11px] font-extrabold text-rose-500 py-1">
        <span class="font-black text-rose-600">Stok Kosong</span>
        <span class="material-symbols-rounded text-base text-rose-500">block</span>
      </div>
    `;
  }
  if (qty > 0) {
    return `
      <div class="flex items-center gap-1.5 pt-0.5" onclick="event.stopPropagation()">
        <div class="flex-1 bg-stone-100/90 rounded-xl p-0.5 flex items-center justify-between border border-stone-200/70">
          <button onclick="window.KasirApp.updateCartQty('${product.id}', -1)"
            class="w-7 h-7 rounded-lg ${qty === 1 ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-white text-stone-700 hover:bg-stone-50'} shadow-2xs font-black text-sm flex items-center justify-center transition active:scale-90 cursor-pointer"
            title="${qty === 1 ? 'Hapus dari pesanan' : 'Kurangi 1 porsi'}">
            ${qty === 1 ? '<span class="material-symbols-rounded text-sm">delete</span>' : '<span class="material-symbols-rounded text-sm">remove</span>'}
          </button>
          <div class="flex flex-col items-center leading-none px-1 select-none">
            <span class="font-black text-stone-900 text-xs">${qty}</span>
            <span class="text-[8px] font-extrabold text-stone-500 uppercase tracking-tighter">porsi</span>
          </div>
          <button onclick="window.KasirApp.updateCartQty('${product.id}', 1)"
            class="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-black text-sm flex items-center justify-center transition active:scale-90 cursor-pointer"
            title="Tambah 1 porsi">
            <span class="material-symbols-rounded text-sm">add</span>
          </button>
        </div>
        <button type="button" onclick="window.KasirApp.openItemNoteModal('${product.id}')"
          class="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 flex items-center justify-center transition active:scale-90 shadow-2xs shrink-0 cursor-pointer"
          title="Catatan & Add-on">
          <span class="material-symbols-rounded text-base text-amber-700">edit_note</span>
        </button>
      </div>
    `;
  }
  return `
    <button type="button"
      class="w-full py-1.5 px-2.5 rounded-xl bg-stone-100/80 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 border border-stone-200/80 hover:border-emerald-300 flex items-center justify-between text-xs font-bold transition active:scale-95 shadow-2xs">
      <span>+ Tambah</span>
      <span class="material-symbols-rounded text-base text-emerald-600">add</span>
    </button>
  `;
}

export function renderSingleProductCardHTML(product, qty) {
  const hasQty = qty > 0;
  const isReady = product.isAvailable !== false && (!product.trackStock || (product.stock || 0) > 0);
  const vis = getCategoryVisualConfig(product.category, product.icon);

  return `
    <div id="posProductCard_${product.id}" onclick="window.KasirApp.addToCart('${product.id}')" 
      class="pos-product-card relative bg-white rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 flex flex-col justify-between border ${hasQty ? 'pos-product-card-active' : 'border-stone-200/80 hover:border-emerald-300'} ${!isReady ? 'opacity-65 bg-stone-50/90 cursor-not-allowed' : 'cursor-pointer'} touch-target-large select-none">
      
      <div id="posBadgeSlot_${product.id}">
        ${hasQty ? `
          <span class="absolute -top-2 -right-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs px-2.5 py-0.5 rounded-full shadow-md z-20 border-2 border-white">
            ${qty}x
          </span>
        ` : ''}
      </div>

      ${!isReady ? `
        <span class="absolute top-2.5 right-2.5 bg-rose-600 text-white font-black text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full shadow-md z-20 border border-white">
          HABIS
        </span>
      ` : ''}

      ${product.image ? `
        <div class="relative w-full h-24 sm:h-28 rounded-xl sm:rounded-2xl overflow-hidden mb-2 bg-stone-100 shrink-0 shadow-2xs">
          <img src="${product.image}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="this.parentElement.style.display='none'">
          <div class="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none"></div>
          <div class="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            <span class="text-[9px] sm:text-[10px] font-extrabold text-white capitalize px-2 py-0.5 rounded-md bg-stone-900/85 shadow-xs">${escapeHtml(product.category)}</span>
          </div>
          <div class="absolute bottom-1.5 right-1.5 flex flex-col gap-1 items-end">
            ${Array.isArray(product.addOns) && product.addOns.length > 0 ? `
              <span class="text-[9px] font-extrabold text-amber-950 bg-amber-300 px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5 border border-amber-400/50">
                <span class="material-symbols-rounded text-[11px] text-amber-800">add_circle</span>
                <span>Add-on</span>
              </span>
            ` : ''}
            ${product.trackStock && isReady ? `
              <span class="text-[9px] font-extrabold text-white bg-stone-900/90 px-1.5 py-0.5 rounded-md border border-stone-700 shadow-xs">
                Sisa ${product.stock}
              </span>
            ` : ''}
          </div>
        </div>
      ` : `
        <div class="relative w-full h-24 sm:h-28 rounded-xl sm:rounded-2xl overflow-hidden mb-2 shrink-0 ${vis.gradClass} border border-black/[0.04] flex items-center justify-center shadow-2xs">
          <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center ${vis.accentColor} transition-transform group-hover:scale-110 border border-stone-200/60">
            <span class="material-symbols-rounded text-2xl sm:text-3xl">${vis.icon}</span>
          </div>
          <div class="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            <span class="text-[9px] sm:text-[10px] font-bold capitalize px-2 py-0.5 rounded-md bg-white text-stone-700 shadow-2xs border border-stone-200">${escapeHtml(product.category)}</span>
          </div>
          <div class="absolute bottom-1.5 right-1.5 flex flex-col gap-1 items-end">
            ${Array.isArray(product.addOns) && product.addOns.length > 0 ? `
              <span class="text-[9px] font-extrabold text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded-md shadow-2xs flex items-center gap-0.5 border border-amber-300">
                <span class="material-symbols-rounded text-[11px] text-amber-800">add_circle</span>
                <span>Add-on</span>
              </span>
            ` : ''}
            ${product.trackStock && isReady ? `
              <span class="text-[9px] font-extrabold text-emerald-900 bg-white px-1.5 py-0.5 rounded-md shadow-2xs border border-stone-200">
                Sisa ${product.stock}
              </span>
            ` : ''}
          </div>
        </div>
      `}

      <div class="flex-1 flex flex-col justify-start">
        <h3 class="font-extrabold text-stone-900 text-xs sm:text-sm leading-snug line-clamp-2 ${!isReady ? 'text-stone-400 line-through' : ''}">${escapeHtml(product.name)}</h3>
        <p class="font-black ${isReady ? 'text-emerald-700' : 'text-stone-400'} text-sm sm:text-base mt-1 tracking-tight">${formatRp(product.price)}</p>
      </div>

      <div id="posActionSlot_${product.id}" class="mt-2.5 pt-2 border-t ${hasQty ? 'border-emerald-200/70' : 'border-stone-100'}">
        ${renderProductCardActionHTML(product, qty, isReady)}
      </div>
    </div>
  `;
}

export function updateProductCardDOM(productId) {
  const cardEl = document.getElementById(`posProductCard_${productId}`);
  if (!cardEl) {
    renderProducts();
    return;
  }

  const p = state.products.find(prod => prod.id === productId);
  if (!p) return;

  const currentCart = getCurrentCart();
  const qty = currentCart[productId] || 0;
  const hasQty = qty > 0;
  const isReady = p.isAvailable !== false && (!p.trackStock || (p.stock || 0) > 0);

  // 1. Perbarui visual aktif kartu tunggal
  if (hasQty) {
    cardEl.classList.add('pos-product-card-active');
    cardEl.classList.remove('border-stone-200/80', 'hover:border-emerald-300');
  } else {
    cardEl.classList.remove('pos-product-card-active');
    cardEl.classList.add('border-stone-200/80', 'hover:border-emerald-300');
  }

  // 2. Perbarui badge porsi dengan animasi fluid tunggal (hanya pada kartu ini)
  const badgeSlot = document.getElementById(`posBadgeSlot_${productId}`);
  if (badgeSlot) {
    const existingBadge = badgeSlot.querySelector('span');
    if (hasQty) {
      if (existingBadge) {
        existingBadge.innerText = `${qty}x`;
        existingBadge.classList.remove('modern-badge-pulse', 'modern-badge-in');
        void existingBadge.offsetWidth; // trigger reflow
        existingBadge.classList.add('modern-badge-pulse');
      } else {
        badgeSlot.innerHTML = `
          <span class="absolute -top-2 -right-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs px-2.5 py-0.5 rounded-full shadow-md z-20 border-2 border-white modern-badge-in">
            ${qty}x
          </span>
        `;
      }
    } else {
      badgeSlot.innerHTML = '';
    }
  }

  // 3. Perbarui baris aksi stepper
  const actionSlot = document.getElementById(`posActionSlot_${productId}`);
  if (actionSlot) {
    actionSlot.className = `mt-2.5 pt-2 border-t ${hasQty ? 'border-emerald-200/70' : 'border-stone-100'}`;
    actionSlot.innerHTML = renderProductCardActionHTML(p, qty, isReady);
  }
}

export function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const currentScrollY = window.scrollY;

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

  // Perbarui indikator jumlah hasil pencarian & filter kategori
  const countBadge = document.getElementById('posSearchResultCount');
  if (countBadge) {
    if (search) {
      countBadge.innerHTML = `<span class="text-stone-900 font-extrabold">${filtered.length}</span> menu ditemukan`;
    } else if (state.currentCategory && state.currentCategory !== 'all') {
      countBadge.innerHTML = `<span class="text-stone-900 font-extrabold">${filtered.length}</span> menu (${state.currentCategory})`;
    } else {
      countBadge.innerHTML = `<span class="text-stone-900 font-extrabold">${filtered.length}</span> menu tersedia`;
    }
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-stone-400 flex flex-col items-center justify-center gap-2.5 bg-white rounded-3xl border border-stone-200/80 shadow-2xs p-6">
        <div class="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 mb-0.5">
          <span class="material-symbols-rounded text-3xl">search_off</span>
        </div>
        <p class="font-extrabold text-stone-700 text-sm">Menu tidak ditemukan</p>
        <p class="text-xs text-stone-400 max-w-xs">Tidak ada menu yang cocok dengan kata kunci "${escapeHtml(search || state.currentCategory)}".</p>
        <button type="button" onclick="window.KasirApp.clearSearch(); window.KasirApp.setCategory('all');"
          class="mt-2 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition active:scale-95 touch-target-large flex items-center gap-1.5">
          <span class="material-symbols-rounded text-sm">refresh</span>
          <span>Reset Pencarian & Kategori</span>
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const qty = currentCart[product.id] || 0;
    return renderSingleProductCardHTML(product, qty);
  }).join('');

  if (typeof window !== 'undefined' && window.scrollY !== currentScrollY) {
    window.scrollTo({ top: currentScrollY, behavior: 'instant' });
  }
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
    renderOrderQueueTabs(false);
    renderCart();
    updateProductCardDOM(productId);
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
  renderOrderQueueTabs(false);
  renderCart();
  if (p && p.id) {
    updateProductCardDOM(p.id);
  } else {
    renderProducts();
  }
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
      mobileHeaderBtn.className = 'relative px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 active:scale-95 transition shrink-0 shadow-2xs';
      if (mobileHeaderTotal) {
        mobileHeaderTotal.className = 'text-xs font-black text-white';
        mobileHeaderTotal.innerText = `${count}`;
      }
    } else {
      mobileHeaderBtn.className = 'relative px-2.5 py-1.5 rounded-xl bg-stone-100 text-stone-500 border border-stone-200/80 flex items-center gap-1 active:scale-95 transition shrink-0 shadow-2xs';
      if (mobileHeaderTotal) {
        mobileHeaderTotal.className = 'text-xs font-bold text-stone-500';
        mobileHeaderTotal.innerText = '0';
      }
    }
  }

  if (mobileFloating) {
    if (hasItems) {
      const cur = getActiveQueue();
      if (mobilePillCount) mobilePillCount.innerText = `${count} Item • ${cur ? cur.name : 'Pesanan'}`;
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
            ${hasAddOns ? `
              <span class="text-stone-700 font-medium">${formatRp(p.price)}</span> + <span class="text-amber-800 font-black">Add-on ${formatRp(addOnTotal)}</span> = 
            ` : ''}
            <span class="text-stone-800 font-extrabold">${formatRp(unitPrice)}</span> &times; ${item.qty} = <span class="text-emerald-800 font-black text-xs sm:text-sm">${formatRp(subtotal)}</span>
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
              onchange="this.closest('label').classList.toggle('border-amber-400', this.checked); this.closest('label').classList.toggle('bg-amber-50/60', this.checked); this.closest('label').classList.toggle('ring-1', this.checked); this.closest('label').classList.toggle('ring-amber-300', this.checked); if (window.KasirApp && window.KasirApp.updateItemNoteLivePrice) window.KasirApp.updateItemNoteLivePrice();">
            <div class="flex flex-col min-w-0 flex-1 leading-tight">
              <span class="truncate font-bold">${escapeHtml(ao.name)}</span>
              <span class="text-[10px] text-amber-800 font-extrabold">${Number(ao.price) > 0 ? `+${formatRp(ao.price)}` : 'Gratis'}</span>
            </div>
          </label>
        `;
      }).join('');
      updateItemNoteLivePrice();
    }
  } else {
    if (addOnSection) addOnSection.classList.add('hidden');
    if (addOnList) addOnList.innerHTML = '';
  }

  if (modal) modal.classList.remove('hidden');
  setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
}

export function updateItemNoteLivePrice() {
  const prodIdEl = document.getElementById('itemNoteProductId');
  const livePriceEl = document.getElementById('itemNoteLivePrice');
  if (!prodIdEl || !livePriceEl) return;
  const p = state.products.find(prod => prod.id === prodIdEl.value);
  if (!p) return;

  let addOnSum = 0;
  let count = 0;
  document.querySelectorAll('#itemNoteAddOnList input[name="itemAddOnCheckbox"]:checked').forEach(cb => {
    addOnSum += (Number(cb.dataset.price) || 0);
    count++;
  });

  const unitTotal = (p.price || 0) + addOnSum;
  livePriceEl.innerHTML = `
    <div class="flex items-center justify-between w-full">
      <span class="text-[11px] text-amber-950 font-bold">
        ${count > 0 ? `Harga Menu (${formatRp(p.price)}) + ${count} Add-on (${formatRp(addOnSum)})` : 'Total Harga per Porsi'}
      </span>
      <span class="text-xs sm:text-sm font-black text-emerald-900 bg-white/90 px-2 py-0.5 rounded-lg border border-amber-300">
        = ${formatRp(unitTotal)}
      </span>
    </div>
  `;
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
