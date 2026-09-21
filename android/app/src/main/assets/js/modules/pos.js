/**
 * Kasir Mami - POS Module (Catalog, Order Queue, Cart)
 */

import { state, saveQueues, getCurrentCart, getActiveQueue, calculateCartTotal, getQueueLineItems, syncQueueCartFromItems } from '../state.js';
import { formatRp, playBeep, playClick, escapeHtml, showToast, showConfirmDialog, triggerHaptic } from '../utils.js';
import { syncSaveQueues } from '../firebase.js';
import { fuzzyFilterProducts } from './fuzzy.js';
import { resolveProductImage } from './photos.js';

// ================= MULTI-ORDER QUEUE =================
export function renderOrderQueueTabs(autoScrollTab = false) {
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;

  // Ingat posisi scroll strip SEBELUM innerHTML diganti — penggantian DOM
  // me-reset scrollLeft ke 0 (inilah yang membuat tampilan loncat ke
  // Pesanan #1 setiap hapus/tambah item). Dipulihkan di bawah.
  const prevScrollLeft = container.scrollLeft || 0;

  // Self-heal sesi drag-reorder yatim (mis. multi-sentuh / tahan ulang saat
  // drag masih aktif / pointerup hilang): placeholder nyangkut + tab hilang +
  // layer melayang + flag macet tidak boleh meninggalkan gap di strip.
  try {
    if (queueTabReorderSession) {
      const s = queueTabReorderSession;
      if (!s.tab.isConnected || !s.placeholder.isConnected) {
        try { if (typeof s.finish === 'function') s.finish(false); }
        catch (_) { queueTabReorderSession = null; queueTabReorderActive = false; suppressQueueTabClick = false; }
        return;
      }
    } else {
      container.querySelectorAll('.queue-tab-placeholder').forEach(n => { try { n.remove(); } catch (_) {} });
      document.querySelectorAll('.queue-tab-floating-layer').forEach(n => { try { n.remove(); } catch (_) {} });
      queueTabReorderActive = false;
      suppressQueueTabClick = false;
      container.classList.remove('reordering');
      if (container.style.touchAction === 'none') container.style.touchAction = '';
    }
  } catch (_) {}

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
      <div class="active-queue-tab-wrapper flex items-center rounded-xl transition shrink-0 ${tabStyle}" data-qid="${q.id}" data-tooltip="Urutan antrian">
        <button onclick="window.KasirApp.switchOrderQueue('${q.id}')"
          class="px-3 py-2 text-xs sm:text-sm flex items-center gap-1.5 touch-target-large"
          data-tooltip="Pilih antrian">
          <span>${escapeHtml(q.name)}</span>
          ${itemCount > 0 ? `<span data-queue-count class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${badgeStyle}">${itemCount}</span>` : ''}
        </button>
        ${isActive ? `
          <button type="button" data-no-reorder onclick="event.stopPropagation(); window.KasirApp.promptRenameQueue()"
            data-tooltip="Ubah nama antrian" class="pr-2.5 pl-0.5 py-2 text-white/80 hover:text-white transition flex items-center">
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
  initQueueTabReorder();
  initQueueScrollButtons();
  updateQueueScrollButtons();

  // Kembalikan posisi scroll semula (dijepit ke batas maksimal baru karena
  // lebar strip bisa menyusut setelah hapus tab di ujung).
  try {
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    container.scrollLeft = Math.min(prevScrollLeft, maxScroll);
  } catch (_) {}

  // PENTING: Hanya geser kontainer horizontal slider orderQueueTabs itu sendiri jika diminta (misal: saat ganti antrian)
  // JANGAN PERNAH gunakan activeTab.scrollIntoView() karena browser akan menggulir seluruh halaman (window/body) ke atas!
  // Mode autoScroll hanya menggeser MINIMAL bila tab aktif di luar pandangan,
  // sehingga posisi strip tidak pernah loncat jauh.
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

// ============ UPDATE BADGE TAB ANTRIAN TANPA BANGUN ULANG (PERF) ============
// Dipakai tiap tap tambah/kurang (yang berubah hanya angka & warna).
// Jauh lebih murah daripada renderOrderQueueTabs (innerHTML semua tab +
// inisialisasi ulang). Struktur berubah (tambah/hapus/ganti/rename) tetap
// lewat renderOrderQueueTabs penuh. Kelas disalin persis dari template di atas.
const QUEUE_TAB_WRAPPER_BASE = 'active-queue-tab-wrapper flex items-center rounded-xl transition shrink-0 ';
const QUEUE_TAB_BADGE_BASE = 'px-2 py-0.5 rounded-full text-[10px] sm:text-xs ';

function queueTabStyles(q, isActive, itemCount) {
  if (isActive) {
    return {
      tab: 'bg-emerald-700 text-white font-black shadow-xs ring-1 ring-emerald-400 active-queue-tab',
      badge: 'bg-white text-emerald-950 font-black shadow-2xs'
    };
  } else if (itemCount > 0) {
    return {
      tab: 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100 font-extrabold border border-emerald-300 shadow-2xs',
      badge: 'bg-emerald-700 text-white font-black'
    };
  }
  return {
    tab: 'bg-stone-100 text-stone-800 hover:bg-stone-200 font-extrabold border border-stone-200',
    badge: 'bg-stone-200 text-stone-800 font-bold'
  };
}

export function updateQueueTabBadges() {
  const container = document.getElementById('orderQueueTabs');
  if (!container) return;
  // Jangan ganggu gestur susun-ulang yang sedang berjalan.
  if (queueTabReorderSession) return;
  const wrappers = container.querySelectorAll('.active-queue-tab-wrapper');
  if (wrappers.length !== state.orderQueues.length) {
    renderOrderQueueTabs(false);
    return;
  }
  let mismatch = false;
  state.orderQueues.forEach((q) => {
    const wrapper = container.querySelector(`.active-queue-tab-wrapper[data-qid="${q.id}"]`);
    if (!wrapper) { mismatch = true; return; }
    const isActive = q.id === state.activeQueueId;
    const itemCount = (Array.isArray(q.items) && q.items.length > 0)
      ? q.items.reduce((a, b) => a + (b.qty || 0), 0)
      : Object.values(q.cart || {}).reduce((a, b) => a + b, 0);
    const st = queueTabStyles(q, isActive, itemCount);
    const wantWrapperCls = QUEUE_TAB_WRAPPER_BASE + st.tab;
    if (wrapper.className !== wantWrapperCls) wrapper.className = wantWrapperCls;

    let badge = wrapper.querySelector('[data-queue-count]');
    if (itemCount > 0) {
      if (!badge) {
        const btn = wrapper.querySelector('button');
        if (!btn) { mismatch = true; return; }
        badge = document.createElement('span');
        badge.setAttribute('data-queue-count', '');
        btn.appendChild(badge);
      }
      const wantBadgeCls = QUEUE_TAB_BADGE_BASE + st.badge;
      if (badge.className !== wantBadgeCls) badge.className = wantBadgeCls;
      const wantText = String(itemCount);
      if (badge.textContent !== wantText) badge.textContent = wantText;
    } else if (badge) {
      badge.remove();
    }
  });
  if (mismatch) {
    renderOrderQueueTabs(false);
  } else {
    try { updateQueueScrollButtons(); } catch (_) {}
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
    if (!isDown || queueTabReorderActive) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });
}

// ============ DRAG & DROP URUTAN TAB ANTRIAN (Android Launcher Style, 1:1 mengikuti jari) ============
// Ramah lansia: ketuk = pindah antrian biasa (<260ms).
// Tahan 260ms = Tab terangkat sebagai layer melayang di atas layar (lepas dari batas kontainer),
// membesar halus dengan bayangan 3D, sedikit tilt mengikuti gerakan, dan dapat digeser bebas
// seperti memindahkan ikon aplikasi di layar utama Android.
// Responsif: posisi pointer hanya dicatat di event, SEMUA baca/tulis DOM
// (transform, ukur slot, auto-scroll tepi) dikerjakan sekali per frame rAF —
// objek persis menempel di jari tanpa delay di HP kentang.
let queueTabReorderActive = false;
let queueTabReorderSession = null;
let suppressQueueTabClick = false;
let queueTabReorderLastEnd = 0;

// Dipakai arbitrasi gestur lintas modul (mis. pull-to-refresh wajib yield
// saat susun-ulang berlangsung / baru selesai).
export function isQueueTabReordering() { return queueTabReorderActive; }
export function lastQueueTabReorderEnd() { return queueTabReorderLastEnd; }

const QUEUE_REORDER_HOLD_MS = 260;
const QUEUE_REORDER_MOVE_PX = 8;
const QUEUE_REORDER_TOUCH_SLOP_PX = 14;
const QUEUE_REORDER_EDGE_PX = 64;

export function initQueueTabReorder() {
  const slider = document.getElementById('orderQueueTabs');
  if (!slider || slider.dataset.reorderInit) return;
  slider.dataset.reorderInit = 'true';

  // Tahan lama di HP tidak boleh memunculkan menu konteks browser
  slider.addEventListener('contextmenu', (e) => e.preventDefault());

  // Telan klik yang lahir dari akhir gestur susun-ulang (bukan ketukan)
  slider.addEventListener('click', (e) => {
    if (suppressQueueTabClick) {
      suppressQueueTabClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  slider.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    if (state.orderQueues.length < 2) return;
    if (e.target.closest('[data-no-reorder]')) return;
    const tab = e.target.closest('.active-queue-tab-wrapper');
    if (!tab || !slider.contains(tab)) return;
    const startX = e.clientX;
    const startY = e.clientY;
    // Layar sentuh bergetar: beri toleransi gerak lebih longgar dari mouse
    const holdSlop = (e.pointerType && e.pointerType === 'mouse') ? QUEUE_REORDER_MOVE_PX : QUEUE_REORDER_TOUCH_SLOP_PX;
    let holdTimer = null;
    let holdTouchGuard = null;

    const cancelHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      slider.removeEventListener('pointermove', onMove);
      slider.removeEventListener('pointerup', onUp);
      slider.removeEventListener('pointercancel', onUp);
      if (holdTouchGuard) { slider.removeEventListener('touchmove', holdTouchGuard); holdTouchGuard = null; }
    };

    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > holdSlop) {
        cancelHold();
      }
    };

    const onUp = () => cancelHold();

    holdTimer = setTimeout(() => {
      holdTimer = null;
      slider.removeEventListener('pointermove', onMove);
      slider.removeEventListener('pointerup', onUp);
      slider.removeEventListener('pointercancel', onUp);
      if (holdTouchGuard) { slider.removeEventListener('touchmove', holdTouchGuard); holdTouchGuard = null; }
      startQueueTabReorder(slider, tab, startX, startY);
    }, QUEUE_REORDER_HOLD_MS);

    slider.addEventListener('pointermove', onMove);
    slider.addEventListener('pointerup', onUp);
    slider.addEventListener('pointercancel', onUp);

    // KHUSUS SENTUH: selama timer tahan berjalan, tahan micro-jitter agar
    // browser tidak merebut gestur menjadi scroll (pointercancel) — yang
    // selama ini membuat mode susun tidak pernah aktif di layar kecil.
    // Begitu jari bergeser melewati ambang, lepas kendali ke scroll natural.
    if (!e.pointerType || e.pointerType !== 'mouse') {
      holdTouchGuard = (tev) => {
        if (!holdTimer) return;
        const t = tev.touches && tev.touches[0];
        if (!t) return;
        if (Math.hypot(t.clientX - startX, t.clientY - startY) > holdSlop) {
          cancelHold();
          return;
        }
        if (tev.cancelable) tev.preventDefault();
      };
      slider.addEventListener('touchmove', holdTouchGuard, { passive: false });
    }
  });
}

function startQueueTabReorder(slider, tab, startX, startY) {
  // Abaikan timer basi (mis. render asing terjadi selama tahan): tab harus
  // masih menempel di strip saat mode susun dimulai.
  if (!tab.isConnected || !slider.contains(tab)) return;
  // Jangan yatimkan sesi lama (multi-sentuh / tahan ulang): selesaikan dulu
  // tanpa commit agar placeholder & layer-nya ikut dibersihkan.
  if (queueTabReorderSession) {
    const prev = queueTabReorderSession;
    try { if (typeof prev.finish === 'function') prev.finish(false); } catch (_) {}
    try { if (prev.floatingLayer && prev.floatingLayer.remove) prev.floatingLayer.remove(); } catch (_) {}
    try { if (prev.placeholder && prev.placeholder.remove) prev.placeholder.remove(); } catch (_) {}
    try { if (prev.tab) prev.tab.style.display = ''; } catch (_) {}
    queueTabReorderActive = false;
    suppressQueueTabClick = false;
  }
  const rect = tab.getBoundingClientRect();
  const grabDX = startX - rect.left;
  const grabDY = startY - rect.top;

  // 1. Buat slot penanda (placeholder) di posisi asli
  const placeholder = document.createElement('div');
  placeholder.className = 'queue-tab-placeholder shrink-0';
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  slider.insertBefore(placeholder, tab);

  // Sembunyikan tab asli di alur DOM sementara
  tab.style.display = 'none';

  // 2. Buat Floating Layer terlepas dari kontainer (langsung di document.body)
  const floatingLayer = tab.cloneNode(true);
  floatingLayer.style.display = '';
  floatingLayer.className = 'queue-tab-floating-layer flex items-center shrink-0 ' + (tab.className || '');
  Object.assign(floatingLayer.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: '99999',
    pointerEvents: 'none',
    transformOrigin: 'center center'
  });
  document.body.appendChild(floatingLayer);

  // 3. Efek Angkat (Lift-off) ala Android Launcher TANPA Anime.js:
  // scale/rotate memakai properti CSS independen (bukan transform), sehingga
  // TIDAK PERNAH berebut dengan translate3d drag yang ditulis tiap frame.
  // Ini sumber utama delay/jank sebelumnya (Anime menulis transform bersamaan
  // dengan pointermove). Transisi CSS 150ms memberi kesan terangkat instan.
  floatingLayer.style.transition = 'scale 0.15s ease-out, rotate 0.15s ease-out';
  floatingLayer.style.scale = '1.08';
  floatingLayer.style.rotate = '1.5deg';
  floatingLayer.style.transform = 'translate3d(0px, 0px, 0)';

  const prevTouchAction = slider.style.touchAction;
  const hadSmooth = slider.classList.contains('scroll-smooth');
  slider.classList.add('reordering');
  slider.style.touchAction = 'none';
  if (hadSmooth) slider.classList.remove('scroll-smooth');

  queueTabReorderActive = true;
  suppressQueueTabClick = true;
  try { triggerHaptic('medium'); } catch (_) {}

  const perfNow = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
  const session = { slider, tab, placeholder, floatingLayer, grabDX, grabDY, prevTouchAction, hadSmooth, lastPX: startX, lastPY: startY, lastMoveX: startX, targetTX: 0, targetTY: 0, appliedTX: 0, appliedTY: 0, targetTilt: 1.2, edgeDir: 0, edgeRaf: 0, baseLeft: rect.left, baseTop: rect.top, needsPlace: false, dragStart: perfNow(), lastActivity: perfNow(), settled: false, lastPlaceHaptic: 0 };
  queueTabReorderSession = session;

  // Selama drag berlangsung, matikan scroll natural di SELURUH dokumen untuk
  // gestur ini (touchmove preventDefault satu-satunya cara yang mempan di
  // tengah gestur sentuh). Strip digerakkan manual via auto-scroll tepi.
  const blockTouchScroll = (tev) => { if (tev.cancelable) tev.preventDefault(); };
  document.addEventListener('touchmove', blockTouchScroll, { passive: false });

  // Sibling shifting: geser posisi penanda saat melayang di atas deretan antrian.
  // HANYA dipanggil dari loop rAF (maks 1x/frame) agar tidak layout-thrash.
  const placeAt = (x) => {
    const siblings = Array.from(slider.querySelectorAll('.active-queue-tab-wrapper'))
      .filter(t => t !== tab && t.style.display !== 'none');

    let placed = false;
    for (const other of siblings) {
      const r = other.getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        if (placeholder.nextSibling !== other) {
          slider.insertBefore(placeholder, other);
          placeHaptic();
        }
        placed = true;
        break;
      }
    }
    if (!placed && placeholder.parentNode && placeholder.nextSibling) {
      slider.appendChild(placeholder);
      placeHaptic();
    }
  };

  // Getar penanda dibatasi (maks ~11x/detik) agar tidak membebani bridge HP
  const placeHaptic = () => {
    const now = perfNow();
    if (now - session.lastPlaceHaptic < 90) return;
    session.lastPlaceHaptic = now;
    try { triggerHaptic('selection'); } catch (_) {}
  };

  const onMove = (e) => {
    if (queueTabReorderSession !== session) return;
    const x = (e.clientX !== undefined && e.clientX !== null) ? e.clientX : startX;
    const y = (e.clientY !== undefined && e.clientY !== null) ? e.clientY : startY;
    // CATAT SAJA di event (tanpa baca/tulis DOM = tanpa jank).
    // Semua pekerjaan berat (transform, ukur slot, auto-scroll) dikerjakan
    // sekali per frame di renderLoop di bawah → objek 1:1 menempel di jari.
    session.targetTX = x - startX;
    session.targetTY = y - startY;
    const deltaX = x - session.lastMoveX;
    session.lastMoveX = x;
    session.targetTilt = Math.min(3.5, Math.max(-3.5, deltaX * 0.45 + 1.2));
    session.lastPX = x;
    session.lastPY = y;
    session.needsPlace = true;
    session.lastActivity = perfNow();
    if (e.cancelable) e.preventDefault();
  };

  // Loop render terpadu: transform + tilt + auto-scroll tepi + geser penanda,
  // SEKALI per frame. Auto-scroll proporsional (makin ke tepi + makin lama
  // menahan, makin cepat) sehingga strip panjang tetap terjangkau di HP kecil
  // dan berjalan meski jari diam.
  const renderLoop = (now) => {
    if (queueTabReorderSession !== session || session.settled) return;
    // Pengaman anti-macet: drag yang sunyi >30 detik (pointerup hilang tanpa
    // blur/cancel) dianggap ditinggalkan → batalkan agar tidak ada layer
    // hantu + RAF yang jalan selamanya (boros baterai + jank).
    if (now - session.lastActivity > 30000) {
      try { finish(false); } catch (_) {}
      return;
    }
    // 1) Tempelkan layer tepat di jari (kompositor GPU, tanpa layout)
    if (session.appliedTX !== session.targetTX || session.appliedTY !== session.targetTY) {
      session.appliedTX = session.targetTX;
      session.appliedTY = session.targetTY;
      floatingLayer.style.transform = `translate3d(${session.appliedTX}px, ${session.appliedTY}px, 0)`;
    }
    floatingLayer.style.rotate = `${session.targetTilt}deg`;
    // 2) Arah + kecepatan auto-scroll tepi
    const sRect = slider.getBoundingClientRect();
    const x = session.lastPX;
    if (x < sRect.left + QUEUE_REORDER_EDGE_PX) session.edgeDir = -1;
    else if (x > sRect.right - QUEUE_REORDER_EDGE_PX) session.edgeDir = 1;
    else session.edgeDir = 0;
    let scrolled = false;
    if (session.edgeDir !== 0) {
      const depth = session.edgeDir < 0
        ? Math.min(1, Math.max(0, (sRect.left + QUEUE_REORDER_EDGE_PX - x) / QUEUE_REORDER_EDGE_PX))
        : Math.min(1, Math.max(0, (x - (sRect.right - QUEUE_REORDER_EDGE_PX)) / QUEUE_REORDER_EDGE_PX));
      const ramp = Math.min(1, (now - session.dragStart) / 900);
      slider.scrollLeft += session.edgeDir * ((5 + 30 * depth) * (0.55 + 1.1 * ramp));
      scrolled = true;
    }
    // 3) Geser penanda (butuh ukur slot → cukup 1x/frame, bukan per event)
    if (session.needsPlace || scrolled) {
      session.needsPlace = false;
      placeAt(session.lastPX);
    }
    session.edgeRaf = requestAnimationFrame(renderLoop);
  };
  session.edgeRaf = requestAnimationFrame(renderLoop);

  // Sentuhan baru di mana pun = pengguna beralih aktivitas → batalkan drag
  // (tanpa commit) SEBELUM tap itu diproses. Ini menutup lubang terakhir
  // sesi nyangkut (tab hantu melayang) yang lolos dari blur/cancel.
  const onAbandon = () => {
    if (queueTabReorderSession === session && !session.settled) {
      try { finish(false); } catch (_) {}
    }
  };

  const finish = (commit) => {
    if (session.settled) return;
    session.settled = true;
    document.removeEventListener('pointerdown', onAbandon, true);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.removeEventListener('touchmove', blockTouchScroll);
    if (session.edgeRaf) { cancelAnimationFrame(session.edgeRaf); session.edgeRaf = 0; }
    session.edgeDir = 0;
    queueTabReorderLastEnd = Date.now();
    if (queueTabReorderSession !== session) return;

    slider.classList.remove('reordering');
    slider.style.touchAction = prevTouchAction;
    if (hadSmooth) slider.classList.add('scroll-smooth');

    // Potret urutan baru SECARA SINKRON di sini: render asing (mis. echo
    // cloud) selama animasi mendarat tidak boleh merusak commit.
    // Duplikat id (tab basi hasil render tengah-jalan) dimenangkan oleh
    // kemunculan TERAKHIR = posisi baru pilihan pengguna.
    let pendingOrder = null;
    if (commit) {
      try {
        if (placeholder.parentNode) {
          slider.insertBefore(tab, placeholder);
          const rawOrder = Array.from(slider.querySelectorAll('.active-queue-tab-wrapper'))
            .map(el => el.getAttribute('data-qid'))
            .filter(Boolean);
          const seen = new Set();
          pendingOrder = [];
          for (let i = rawOrder.length - 1; i >= 0; i--) {
            if (!seen.has(rawOrder[i])) { seen.add(rawOrder[i]); pendingOrder.unshift(rawOrder[i]); }
          }
        }
      } catch (_) { pendingOrder = null; }
    }
    let destRect = null;
    try {
      destRect = (placeholder.parentNode ? placeholder : tab).getBoundingClientRect();
    } catch (_) { destRect = null; }

    const cleanupAndApply = () => {
      queueTabReorderSession = null;
      queueTabReorderActive = false;
      try { if (floatingLayer && floatingLayer.parentNode) floatingLayer.remove(); } catch (_) {}

      try {
        if (commit && pendingOrder && pendingOrder.length) {
          const byId = new Map(state.orderQueues.map(q => [q.id, q]));
          const next = [];
          pendingOrder.forEach(id => {
            if (byId.has(id)) {
              next.push(byId.get(id));
              byId.delete(id);
            }
          });
          byId.forEach(q => next.push(q));
          state.orderQueues = next;

          saveQueues();
          syncSaveQueues(state.orderQueues);
        }
        if (placeholder.parentNode) placeholder.remove();
        tab.style.display = '';
        renderOrderQueueTabs(false);
        if (commit && pendingOrder && pendingOrder.length) {
          try { triggerHaptic('light'); } catch (_) {}
          try {
            if (!localStorage.getItem('kasir_queue_reorder_hint_v1')) {
              localStorage.setItem('kasir_queue_reorder_hint_v1', '1');
              showToast('Urutan antrian tersimpan', 'success');
            }
          } catch (_) {}
        }
      } catch (_) {
        try { renderOrderQueueTabs(false); } catch (_) {}
      }

      setTimeout(() => { suppressQueueTabClick = false; }, 350);
    };

    // 4. Animasi Mendarat via transisi CSS (tanpa Anime.js agar tidak ada
    // perebutan transform di frame terakhir). Layer diterbangkan ke slot
    // tujuan lalu commit urutan sinkron.
    const destTX = destRect ? (destRect.left - session.baseLeft) : session.appliedTX;
    const destTY = destRect ? (destRect.top - session.baseTop) : session.appliedTY;
    if (commit && destRect && destRect.width > 0) {
      try {
        floatingLayer.style.transition = 'transform 0.2s ease-out, scale 0.2s ease-out, rotate 0.2s ease-out';
        floatingLayer.style.transform = `translate3d(${destTX}px, ${destTY}px, 0)`;
        floatingLayer.style.scale = '1';
        floatingLayer.style.rotate = '0deg';
      } catch (_) {}
      setTimeout(() => { cleanupAndApply(); }, 210);
    } else {
      cleanupAndApply();
    }
  };

  const onUp = () => finish(true);
  session.finish = finish;
  document.addEventListener('pointerdown', onAbandon, true);
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
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

// Panah geser antrian hanya tampil saat strip benar-benar overflow (tidak
// makan tempat saat semua tab muat), dengan redup di ujung strip.
let queueScrollResizeInit = false;

export function updateQueueScrollButtons() {
  const slider = document.getElementById('orderQueueTabs');
  if (!slider) return;
  const leftBtn = document.getElementById('queueScrollLeftBtn');
  const rightBtn = document.getElementById('queueScrollRightBtn');
  const canScroll = slider.scrollWidth > slider.clientWidth + 2;
  const max = Math.max(0, slider.scrollWidth - slider.clientWidth);
  if (leftBtn) {
    leftBtn.style.display = canScroll ? '' : 'none';
    leftBtn.style.opacity = slider.scrollLeft > 4 ? '1' : '0.35';
  }
  if (rightBtn) {
    rightBtn.style.display = canScroll ? '' : 'none';
    rightBtn.style.opacity = slider.scrollLeft < max - 4 ? '1' : '0.35';
  }
}

export function initQueueScrollButtons() {
  const slider = document.getElementById('orderQueueTabs');
  if (!slider || slider.dataset.scrollBtnInit) return;
  slider.dataset.scrollBtnInit = 'true';
  slider.addEventListener('scroll', () => { try { updateQueueScrollButtons(); } catch (_) {} }, { passive: true });
  if (!queueScrollResizeInit) {
    queueScrollResizeInit = true;
    window.addEventListener('resize', () => { try { updateQueueScrollButtons(); } catch (_) {} });
    // Pindah tab/aplikasi di tengah drag = batalkan sesi (tanpa commit)
    // agar tidak ada layer/flag yang nyangkut.
    window.addEventListener('blur', () => {
      try {
        const s = queueTabReorderSession;
        if (s && typeof s.finish === 'function') s.finish(false);
      } catch (_) {}
    });
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
  const deletedIndex = Math.max(0, state.orderQueues.findIndex(q => q.id === cur.id));
  const backedUpQueue = { 
    id: cur.id,
    name: cur.name,
    cart: { ...(cur.cart || {}) },
    notes: { ...(cur.notes || {}) },
    items: JSON.parse(JSON.stringify(cur.items || []))
  };
  const restoreBackedUpQueue = () => {
    // Kembalikan ke posisi semula (bukan didorong ke ujung) agar strip diam.
    if (state.orderQueues.some(q => q.id === backedUpQueue.id)) return false;
    const at = Math.min(deletedIndex, state.orderQueues.length);
    state.orderQueues.splice(at, 0, backedUpQueue);
    state.activeQueueId = backedUpQueue.id;
    return true;
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
          restoreBackedUpQueue();
          saveQueues();
          syncSaveQueues(state.orderQueues);
          renderOrderQueueTabs(true);
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
        restoreBackedUpQueue();
        saveQueues();
        syncSaveQueues(state.orderQueues);
        renderOrderQueueTabs(true);
        renderCart();
        renderProducts();
        showToast(`Antrian "${backedUpQueue.name}" dipulihkan.`, 'success');
      }
    });
  }
}

export function deleteOrderQueue(queueId, event) {
  if (event) event.stopPropagation();
  const delIdx = state.orderQueues.findIndex(q => q.id === queueId);
  if (delIdx === -1) return;
  const qToDelete = state.orderQueues[delIdx];
  const wasActive = state.activeQueueId === queueId;

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
    // Pindah ke tetangga terdekat, BUKAN selalu ke index 0:
    // - hapus di tengah/awal -> tab kanan yang bergeser ke posisi ini (index sama)
    // - hapus di ujung -> tab terakhir yang baru (index-1)
    // Sehingga posisi strip terasa diam di sekitar titik hapus.
    if (wasActive && delIdx !== -1) {
      const nextIdx = Math.min(delIdx, state.orderQueues.length - 1);
      state.activeQueueId = state.orderQueues[Math.max(0, nextIdx)].id;
    } else {
      state.activeQueueId = state.orderQueues[0].id;
    }
  }

  saveQueues();
  syncSaveQueues(state.orderQueues);
  // true = pastikan tab tetangga terlihat, tapi hanya geser minimal bila perlu
  renderOrderQueueTabs(true);
  renderCart();
  renderProducts();
}

// ================= CATEGORY & PRODUCT RENDERING =================
// ================= CATEGORY & PRODUCT RENDERING =================
export function syncCategoryPillsUI() {
  const current = state.currentCategory || 'all';
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.className = 'cat-pill py-2 px-3.5 sm:px-4 rounded-xl font-bold text-xs sm:text-sm text-center bg-white hover:bg-stone-50 text-stone-700 transition flex items-center justify-center lg:justify-start gap-1.5 touch-target-large border border-stone-200/90 shadow-2xs shrink-0 whitespace-nowrap active:scale-95 lg:w-full';
  });
  const activeBtn = document.getElementById(`cat-${current}`);
  if (activeBtn) {
    activeBtn.className = 'cat-pill py-2 px-4 sm:px-4.5 rounded-xl font-black text-xs sm:text-sm text-center bg-stone-900 text-white shadow-md transition flex items-center justify-center lg:justify-start gap-1.5 touch-target-large ring-2 ring-stone-900/20 border border-stone-900 shrink-0 whitespace-nowrap lg:w-full';
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
    <div class="bg-white border border-stone-200/80 rounded-2xl sm:rounded-3xl p-2 sm:p-2.5 flex flex-col justify-between h-48 lg:h-56 animate-pulse shadow-2xs">
      <div class="w-full h-20 sm:h-24 lg:h-28 rounded-xl sm:rounded-2xl skeleton-shimmer"></div>
      <div class="space-y-2 mt-2">
        <div class="w-3/4 h-4 rounded-lg skeleton-shimmer"></div>
        <div class="w-1/2 h-5 rounded-lg skeleton-shimmer"></div>
      </div>
      <div class="w-full h-7 rounded-xl skeleton-shimmer mt-2"></div>
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
        <div class="flex-1 bg-white rounded-xl p-1 flex items-center justify-between gap-1 border-2 border-emerald-400 shadow-sm">
          <button data-repeat-target="${product.id}" data-repeat-delta="-1" onclick="window.KasirApp.updateCartQty('${product.id}', -1)"
            class="w-8 h-9 rounded-lg ${qty === 1 ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'} font-black flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
            data-tooltip="${qty === 1 ? 'Hapus item' : 'Kurangi 1'}">
            ${qty === 1 ? '<span class="material-symbols-rounded text-base">delete</span>' : '<span class="material-symbols-rounded text-base">remove</span>'}
          </button>
          <button type="button" onclick="event.stopPropagation(); window.KasirApp.openQtyEditor('${product.id}')"
            class="flex-1 flex flex-col items-center justify-center leading-none px-1 py-0.5 rounded-lg hover:bg-emerald-50 transition active:scale-95 cursor-pointer select-none min-w-0"
            data-tooltip="Ubah jumlah">
            <span class="font-black text-stone-950 text-[15px] flex items-center gap-1">${qty} <span class="material-symbols-rounded text-sm text-emerald-600">edit</span></span>
            <span class="text-[8px] font-extrabold text-stone-500 uppercase tracking-tighter">porsi</span>
          </button>
          <button data-repeat-target="${product.id}" data-repeat-delta="1" onclick="window.KasirApp.updateCartQty('${product.id}', 1)"
            class="w-8 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-black flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
            data-tooltip="Tambah 1">
            <span class="material-symbols-rounded text-lg">add</span>
          </button>
        </div>
      </div>
    `;
  }
  return `
    <button type="button"
      data-tooltip="Tambah ke pesanan"
      class="w-full py-1 lg:py-2 px-2.5 rounded-xl bg-stone-100/80 hover:bg-emerald-50 active:bg-emerald-100 text-stone-700 hover:text-emerald-800 border border-stone-200/80 hover:border-emerald-300 flex items-center justify-between text-xs lg:text-sm font-bold transition-colors shadow-2xs">
      <span>+ Tambah</span>
      <span class="material-symbols-rounded text-base text-emerald-600">add</span>
    </button>
  `;
}

export function renderSingleProductCardHTML(product, qty) {
  const hasQty = qty > 0;
  const isReady = product.isAvailable !== false && (!product.trackStock || (product.stock || 0) > 0);
  const vis = getCategoryVisualConfig(product.category, product.icon);
  const activeQ = getActiveQueue();
  const qLineItems = activeQ ? getQueueLineItems(activeQ) : [];
  const hasNoteOrAddOn = qLineItems.some(it => it.productId === product.id && ((it.note && it.note.trim() !== '') || (Array.isArray(it.addOns) && it.addOns.length > 0)));
  const imgSrc = resolveProductImage(product);

  return `
    <div id="posProductCard_${product.id}" data-product-card="${product.id}" onclick="window.KasirApp.addToCart('${product.id}')" 
      data-tooltip="${isReady ? 'Tambah ke pesanan' : 'Stok habis'}"
      class="pos-product-card group relative bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-2.5 lg:p-3 flex flex-col justify-between border ${hasQty ? 'pos-product-card-active' : 'border-stone-200/85'} ${!isReady ? 'opacity-65 bg-stone-50/90 cursor-not-allowed' : 'cursor-pointer'} touch-target-large select-none">

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

      ${imgSrc ? `
        <div class="relative w-full h-24 sm:h-28 lg:h-32 rounded-xl sm:rounded-2xl overflow-hidden mb-2 shrink-0 bg-stone-100 shadow-2xs">
          <img src="${imgSrc}" alt="${escapeHtml(product.name)}" class="pos-card-img w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'">
          <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
          <div class="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            <span class="text-[9px] sm:text-[10px] font-extrabold text-white capitalize px-2 py-0.5 rounded-md bg-stone-900/80 shadow-xs">${escapeHtml(product.category)}</span>
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
          ${hasQty ? `
            <button type="button" onclick="event.stopPropagation(); window.KasirApp.openItemNoteModal('${product.id}')"
              data-tooltip="Catatan & Add-on"
              class="absolute bottom-1.5 left-1.5 z-10 h-7 min-w-[28px] px-1 rounded-full ${hasNoteOrAddOn ? 'bg-amber-400 text-white border-amber-500' : 'bg-white/95 text-amber-700 border-amber-200'} border shadow-md flex items-center justify-center transition active:scale-90 cursor-pointer">
              <span class="material-symbols-rounded text-[15px]">edit_note</span>
            </button>
          ` : ''}
        </div>
      ` : `
        <div class="relative w-full h-24 sm:h-28 lg:h-32 rounded-xl sm:rounded-2xl overflow-hidden mb-2 shrink-0 ${vis.gradClass} border border-black/[0.04] flex items-center justify-center shadow-2xs">
          <div class="pos-card-icon w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white shadow-xs flex items-center justify-center ${vis.accentColor} border border-white/60">
            <span class="material-symbols-rounded text-2xl sm:text-3xl">${vis.icon}</span>
          </div>
          <div class="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
            <span class="text-[9px] sm:text-[10px] font-bold capitalize px-2 py-0.5 rounded-md bg-white text-stone-700 shadow-2xs border border-stone-200/80">${escapeHtml(product.category)}</span>
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
          ${hasQty ? `
            <button type="button" onclick="event.stopPropagation(); window.KasirApp.openItemNoteModal('${product.id}')"
              data-tooltip="Catatan & Add-on"
              class="absolute bottom-1.5 left-1.5 z-10 h-7 min-w-[28px] px-1 rounded-full ${hasNoteOrAddOn ? 'bg-amber-400 text-white border-amber-500' : 'bg-white/95 text-amber-700 border-amber-200'} border shadow-md flex items-center justify-center transition active:scale-90 cursor-pointer">
              <span class="material-symbols-rounded text-[15px]">edit_note</span>
            </button>
          ` : ''}
        </div>
      `}

      <div class="flex-1 flex flex-col justify-start">
        <h3 class="font-extrabold text-stone-900 text-xs sm:text-sm lg:text-[14.5px] leading-snug line-clamp-2 min-h-[2.4rem] ${!isReady ? 'text-stone-400 line-through' : ''}">${escapeHtml(product.name)}</h3>
        <p class="font-black ${isReady ? 'text-emerald-700' : 'text-stone-400'} text-sm sm:text-base lg:text-[17px] mt-0.5 tracking-tight">${formatRp(product.price)}</p>
      </div>

      <div id="posActionSlot_${product.id}" class="mt-2 pt-1.5 border-t ${hasQty ? 'border-emerald-200/80' : 'border-stone-100'}">
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

  // Render ulang SATU kartu penuh: badge, chip catatan, dan stepper
  // semuanya turunan hasQty — update bedah per-slot rawan tidak sinkron.
  // Listener gestur terdelegasi di container grid sehingga penggantian node
  // aman (tanpa scroll jump).
  try {
    cardEl.outerHTML = renderSingleProductCardHTML(p, qty);
  } catch (_) {
    renderProducts();
    return;
  }

  // Feedback pulse ringan pada badge agar tiap tap/tahan terasa hidup
  if (qty > 0) {
    const badgeSlot = document.getElementById(`posBadgeSlot_${productId}`);
    const badge = badgeSlot ? badgeSlot.querySelector('span') : null;
    if (badge) {
      badge.classList.remove('modern-badge-in');
      void badge.offsetWidth; // trigger reflow
      badge.classList.add('modern-badge-pulse');
    }
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

  // Cari toleran-typo (Fuse.js) lalu saring kategori — kosong = semua.
  const filtered = fuzzyFilterProducts(state.products, search).filter(p =>
    (state.currentCategory === 'all') || (p.category === state.currentCategory)
  );

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

  initCartGestures();
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
    updateQueueTabBadges();
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
  updateQueueTabBadges();
  renderCart();
  if (p && p.id) {
    updateProductCardDOM(p.id);
  } else {
    renderProducts();
  }
}

// ============ INPUT JUMLAH MANUAL (KETUK ANGKA) ============
// Senior-friendly: ketuk angka porsi di kartu katalog / keranjang untuk
// mengetik jumlah pasti, tanpa harus menahan atau mengetuk berkali-kali.
// - targetId bisa berupa lineId (baris keranjang) atau productId (total menu).
let qtyEditorTarget = null;

function resolveQtyEditorState(targetId) {
  const q = getActiveQueue();
  if (!q || !targetId) return null;
  const items = getQueueLineItems(q);
  // 1) Prioritas: baris keranjang spesifik (lineId)
  const line = items.find(it => it.lineId === targetId);
  if (line) {
    const p = state.products.find(prod => prod.id === line.productId);
    if (!p) return null;
    return { mode: 'line', queue: q, items, line, product: p, currentQty: line.qty };
  }
  // 2) Fallback: agregat per produk (dari kartu katalog)
  const p = state.products.find(prod => prod.id === targetId);
  if (!p) return null;
  const lines = items.filter(it => it.productId === targetId);
  const total = lines.reduce((a, b) => a + (b.qty || 0), 0);
  const specialQty = lines
    .filter(it => (it.note && it.note.trim() !== '') || (Array.isArray(it.addOns) && it.addOns.length > 0))
    .reduce((a, b) => a + (b.qty || 0), 0);
  const plain = lines.find(it => (!it.note || it.note.trim() === '') && (!it.addOns || it.addOns.length === 0));
  return { mode: 'product', queue: q, items, lines, plain, product: p, currentQty: total, specialQty };
}

export function openQtyEditor(targetId) {
  playClick('pop');
  const st = resolveQtyEditorState(targetId);
  if (!st) return;
  const p = st.product;
  const isReady = p.isAvailable !== false && (!p.trackStock || (p.stock || 0) > 0);
  if (!isReady) {
    showToast(`Menu "${p.name}" sedang HABIS / KOSONG!`, 'warning');
    return;
  }
  qtyEditorTarget = targetId;
  const modal = document.getElementById('qtyEditModal');
  const nameEl = document.getElementById('qtyEditProductName');
  const priceEl = document.getElementById('qtyEditProductPrice');
  const inputEl = document.getElementById('qtyEditInput');
  const stockEl = document.getElementById('qtyEditStockInfo');
  const noteEl = document.getElementById('qtyEditSpecialNote');
  if (nameEl) nameEl.innerText = p.name;
  if (priceEl) priceEl.innerText = formatRp(p.price);
  if (inputEl) {
    inputEl.value = String(st.currentQty || 0);
    inputEl.max = (p.trackStock && typeof p.stock === 'number') ? String(p.stock) : '';
  }
  if (stockEl) {
    stockEl.innerText = (p.trackStock && typeof p.stock === 'number')
      ? `Stok tersedia: ${p.stock} porsi`
      : 'Stok tidak dibatasi';
  }
  if (noteEl) {
    if (st.mode === 'product' && st.specialQty > 0) {
      noteEl.classList.remove('hidden');
      noteEl.innerText = `${st.specialQty} porsi punya catatan/add-on khusus — jumlah manual tidak boleh di bawah angka itu.`;
    } else {
      noteEl.classList.add('hidden');
      noteEl.innerText = '';
    }
  }
  if (modal) modal.classList.remove('hidden');
  initQtyEditorHold();
  if (inputEl) {
    setTimeout(() => { try { inputEl.focus(); inputEl.select(); } catch (_) {} }, 120);
  }
}

// ============ TAHAN-ULANG +/- MODAL QTY (pola sama dengan stepper kasir) ============
// Ketuk = ±1 seperti biasa (inline onclick). Tahan 550ms tanpa geser = angka
// jalan terus tiap 110ms sampai dilepas; klik susulan ditelan agar tak dobel.
function initQtyEditorHold() {
  const pairs = [
    [document.getElementById('qtyMinusBtn'), -1],
    [document.getElementById('qtyPlusBtn'), 1]
  ];
  pairs.forEach(([btn, delta]) => {
    if (!btn || btn.dataset.holdInit) return;
    btn.dataset.holdInit = 'true';
    let timer = null;
    let interval = null;
    let startX = 0;
    let startY = 0;

    const stop = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (interval) { clearInterval(interval); interval = null; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    const onMove = (ev) => {
      const dx = (ev.clientX ?? startX) - startX;
      const dy = (ev.clientY ?? startY) - startY;
      if (Math.hypot(dx, dy) > GESTURE_SLOP_PX) stop();
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      startX = e.clientX ?? 0;
      startY = e.clientY ?? 0;
      stop();
      timer = setTimeout(() => {
        timer = null;
        interval = setInterval(() => { try { changeQtyEditorDelta(delta); } catch (_) {} }, REPEAT_TICK_MS);
        try { changeQtyEditorDelta(delta); } catch (_) {}
        try { triggerHaptic('medium'); } catch (_) {}
        btn.dataset.swallowNextClick = '1';
      }, REPEAT_HOLD_MS);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
    btn.addEventListener('click', (e) => {
      if (btn.dataset.swallowNextClick === '1') {
        btn.dataset.swallowNextClick = '';
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  });
}

export function closeQtyEditor() {
  playClick('pop');
  qtyEditorTarget = null;
  const modal = document.getElementById('qtyEditModal');
  if (modal) modal.classList.add('hidden');
}

export function changeQtyEditorDelta(delta) {
  playClick('tap');
  const inputEl = document.getElementById('qtyEditInput');
  if (!inputEl) return;
  const st = resolveQtyEditorState(qtyEditorTarget);
  const cur = Math.max(0, parseInt(inputEl.value, 10) || 0);
  let next = cur + (Number(delta) || 0);
  next = Math.max(0, next);
  if (st && st.product && st.product.trackStock && typeof st.product.stock === 'number') {
    next = Math.min(next, Math.max(0, st.product.stock || 0));
  }
  if (st && st.mode === 'product' && (st.specialQty || 0) > 0) {
    next = Math.max(next, st.specialQty);
  }
  inputEl.value = String(next);
}

export function confirmQtyEditor(e) {
  if (e) e.preventDefault();
  const st = resolveQtyEditorState(qtyEditorTarget);
  if (!st) { closeQtyEditor(); return; }
  const inputEl = document.getElementById('qtyEditInput');
  let next = inputEl ? (parseInt(inputEl.value, 10) || 0) : 0;
  next = Math.max(0, Math.min(999, next));
  const p = st.product;

  // Batas stok
  if (p.trackStock && typeof p.stock === 'number' && next > (p.stock || 0)) {
    showToast(`Stok "${p.name}" hanya tersisa ${p.stock}!`, 'warning');
    next = Math.max(0, p.stock || 0);
    if (inputEl) inputEl.value = String(next);
    return;
  }

  if (st.mode === 'line') {
    if (next <= 0) {
      const idx = st.items.findIndex(it => it.lineId === st.line.lineId);
      if (idx !== -1) st.items.splice(idx, 1);
      showToast(`"${p.name}" dihapus dari pesanan`, 'info');
    } else {
      // Jika line lain makan stok, pastikan total tidak jebol
      if (p.trackStock && typeof p.stock === 'number') {
        const otherQty = st.items
          .filter(it => it.productId === p.id && it.lineId !== st.line.lineId)
          .reduce((a, b) => a + (b.qty || 0), 0);
        if (otherQty + next > (p.stock || 0)) {
          next = Math.max(0, (p.stock || 0) - otherQty);
          showToast(`Stok "${p.name}" hanya tersisa ${p.stock}!`, 'warning');
          if (inputEl) { inputEl.value = String(next); return; }
        }
      }
      st.line.qty = next;
      playClick('tap');
    }
  } else {
    const specialQty = st.specialQty || 0;
    if (next < specialQty) {
      showToast(`Minimal ${specialQty} (porsi ber-catatan khusus tidak bisa dikurangi dari sini — ubah lewat keranjang).`, 'warning', 3500);
      if (inputEl) inputEl.value = String(st.currentQty || 0);
      return;
    }
    const plainQty = next - specialQty;
    if (st.plain) {
      if (plainQty <= 0) {
        const idx = st.items.findIndex(it => it.lineId === st.plain.lineId);
        if (idx !== -1) st.items.splice(idx, 1);
      } else {
        st.plain.qty = plainQty;
      }
    } else if (plainQty > 0) {
      const newLineId = 'line_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      st.items.push({ lineId: newLineId, productId: p.id, qty: plainQty, note: '', addOns: [] });
    }
    if (next === 0 && specialQty === 0) {
      showToast(`"${p.name}" dihapus dari pesanan`, 'info');
    } else {
      playClick('tap');
    }
  }

  syncQueueCartFromItems(st.queue);
  saveQueues();
  syncSaveQueues(state.orderQueues);
  const targetModal = document.getElementById('qtyEditModal');
  if (targetModal) targetModal.classList.add('hidden');
  qtyEditorTarget = null;
  updateQueueTabBadges();
  renderCart();
  updateProductCardDOM(p.id);
}

// Hapus satu baris pesanan (dipakai usap-hapus) + tombol Urungkan via toast
export function removeCartLine(lineId) {
  playClick('del');
  const q = getActiveQueue();
  if (!q) return;
  const items = getQueueLineItems(q);
  const idx = items.findIndex(it => it.lineId === lineId);
  if (idx === -1) return;
  const item = items[idx];
  const p = state.products.find(prod => prod.id === item.productId);
  const snapshot = {
    queueId: q.id,
    index: idx,
    lineId: item.lineId,
    item: JSON.parse(JSON.stringify(item)),
    done: false
  };
  items.splice(idx, 1);
  syncQueueCartFromItems(q);
  saveQueues();
  syncSaveQueues(state.orderQueues);
  updateQueueTabBadges();
  renderCart();
  if (p) updateProductCardDOM(p.id);
  const label = p ? p.name : 'Item';
  showToast(`"${label}" dihapus dari pesanan`, 'info', 4500, {
    label: 'Urungkan',
    onClick: () => restoreCartLine(snapshot)
  });
}

function restoreCartLine(snapshot) {
  if (!snapshot || snapshot.done) return;
  const q = state.orderQueues.find(x => x.id === snapshot.queueId) || getActiveQueue();
  if (!q) return;
  const items = getQueueLineItems(q);
  if (items.some(it => it.lineId === snapshot.lineId)) {
    showToast('Item tersebut sudah kembali di pesanan', 'info');
    return;
  }
  snapshot.done = true;
  items.splice(Math.min(snapshot.index, items.length), 0, snapshot.item);
  const p = state.products.find(prod => prod.id === snapshot.item.productId);
  syncQueueCartFromItems(q);
  saveQueues();
  syncSaveQueues(state.orderQueues);
  updateQueueTabBadges();
  renderCart();
  if (p) updateProductCardDOM(p.id); else renderProducts();
  showToast(`"${p ? p.name : 'Item'}" dikembalikan ke pesanan`, 'success');
}

// ============ GESER-HAPUS BARIS + TAHAN-ULANG STEPPER + TAHAN-TAMBAH KARTU ============
// Satu delegasi untuk daftar kasir (desktop + drawer HP) dan grid katalog.
// - Usap baris ke kiri: tampilkan Hapus; lepas jauh/cepat = langsung hapus.
// - Tahan tombol +/- 0,55 dtk tanpa geser: qty jalan terus tiap 110ms sampai dilepas.
// - Tahan badan kartu katalog 0,6 dtk tanpa geser: tambah cepat tiap 140ms.
// - Ketukan biasa 100% tidak berubah (inline onclick tetap yang jalan).
// - Anti-tidak-sengaja: geser >12px (scroll) SELALU membatalkan & menelan klik,
//   sehingga usapan scroll tidak pernah menambah pesanan.
let cartGestureInitDone = false;
let pressRepeatState = null;
let swipeState = null;
let suppressStepperClick = false;
let suppressStepperClickTimer = null;
let cardPressState = null;
let suppressCardClick = false;
let suppressCardClickTimer = null;

function setSuppressCardClick(val) {
  suppressCardClick = Boolean(val);
  if (suppressCardClickTimer) {
    clearTimeout(suppressCardClickTimer);
    suppressCardClickTimer = null;
  }
  if (val) {
    suppressCardClickTimer = setTimeout(() => {
      suppressCardClick = false;
      suppressCardClickTimer = null;
    }, 280);
  }
}

function setSuppressStepperClick(val) {
  suppressStepperClick = Boolean(val);
  if (suppressStepperClickTimer) {
    clearTimeout(suppressStepperClickTimer);
    suppressStepperClickTimer = null;
  }
  if (val) {
    suppressStepperClickTimer = setTimeout(() => {
      suppressStepperClick = false;
      suppressStepperClickTimer = null;
    }, 280);
  }
}

const REPEAT_HOLD_MS = 550;
const REPEAT_TICK_MS = 110;
const GESTURE_SLOP_PX = 12;
const SWIPE_MIN_PX = 12;
const SWIPE_REVEAL_PX = 92;
const CARD_HOLD_MS = 600;
const CARD_HOLD_TICK_MS = 140;

function stopPressRepeat() {
  if (!pressRepeatState) return;
  if (pressRepeatState.timer) clearTimeout(pressRepeatState.timer);
  if (pressRepeatState.interval) clearInterval(pressRepeatState.interval);
  if (pressRepeatState.moveListener) {
    window.removeEventListener('pointermove', pressRepeatState.moveListener);
  }
  pressRepeatState = null;
  window.removeEventListener('pointerup', stopPressRepeat);
  window.removeEventListener('pointercancel', stopPressRepeat);
}

function cancelCardPress() {
  if (!cardPressState) return;
  if (cardPressState.holdTimer) clearTimeout(cardPressState.holdTimer);
  if (cardPressState.interval) clearInterval(cardPressState.interval);
  if (cardPressState.cardEl) cardPressState.cardEl.classList.remove('card-press-hold');
  window.removeEventListener('pointermove', onCardPressMove);
  window.removeEventListener('pointerup', onCardPressUp);
  window.removeEventListener('pointercancel', onCardPressUp);
  cardPressState = null;
}

function onCardPressMove(e) {
  const s = cardPressState;
  if (!s) return;
  const dx = (e.clientX ?? s.startX) - s.startX;
  const dy = (e.clientY ?? s.startY) - s.startY;
  if (Math.hypot(dx, dy) > GESTURE_SLOP_PX) {
    // Niat scroll / sentuhan liar: batalkan hold & telan klik susulan
    s.moved = true;
    setSuppressCardClick(true);
    cancelCardPress();
  }
}

function onCardPressUp() {
  const s = cardPressState;
  if (!s) return;
  const heldLong = ((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - s.startT) > CARD_HOLD_MS;
  if (s.repeating || s.moved || heldLong) {
    // Hold-repeat sudah menambah (atau jari bergeser / menahan lama):
    // telan klik susulan agar tidak dobel-tambah.
    setSuppressCardClick(true);
  }
  cancelCardPress();
}

function cleanupSwipeListeners() {
  window.removeEventListener('pointermove', onSwipeMove);
  window.removeEventListener('pointerup', onSwipeEnd);
  window.removeEventListener('pointercancel', onSwipeEnd);
}

function closeOpenSwipeRow(except) {
  document.querySelectorAll('.cart-line-swipe.cart-line-open').forEach((row) => {
    if (row === except) return;
    row.classList.remove('cart-line-open');
    const fg = row.querySelector('.cart-swipe-fg');
    if (fg) fg.style.transform = '';
  });
}

function onSwipeMove(e) {
  const s = swipeState;
  if (!s) return;
  const dx = e.clientX - s.startX;
  const dy = e.clientY - s.startY;
  if (!s.active) {
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    // Niat scroll vertikal: batalkan, biarkan browser menggulir natural
    if (Math.abs(dx) < Math.abs(dy) * 1.4) {
      cleanupSwipeListeners();
      swipeState = null;
      return;
    }
    s.active = true;
    s.fg.classList.add('swiping');
  }
  if (e.cancelable) e.preventDefault();
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  s.vx = (e.clientX - s.lastX) / Math.max(1, now - s.lastT);
  s.lastX = e.clientX;
  s.lastT = now;
  s.dx = Math.max(-SWIPE_REVEAL_PX - 24, Math.min(0, dx));
  s.fg.style.transform = `translateX(${s.dx}px)`;
}

function onSwipeEnd(e) {
  const s = swipeState;
  cleanupSwipeListeners();
  swipeState = null;
  if (!s) return;
  s.fg.classList.remove('swiping');
  // Browser mengambil alih (mis. scroll): kembalikan rapi, jangan hapus
  if (e && e.type === 'pointercancel') {
    s.fg.style.transform = '';
    s.row.classList.remove('cart-line-open');
    return;
  }
  const w = s.row.offsetWidth || 1;
  const fling = s.vx < -0.55;
  const past = s.dx < -Math.max(48, w * 0.42);
  if (s.active && (fling || past)) {
    s.fg.style.transform = `translateX(${-w}px)`;
    const lineId = s.row.getAttribute('data-cart-line');
    setTimeout(() => { if (lineId) removeCartLine(lineId); }, 160);
  } else if (s.active) {
    if (s.dx < -24) {
      s.fg.style.transform = `translateX(${-SWIPE_REVEAL_PX}px)`;
      s.row.classList.add('cart-line-open');
    } else {
      s.fg.style.transform = '';
      s.row.classList.remove('cart-line-open');
    }
  }
}

export function initCartGestures() {
  if (cartGestureInitDone) return;
  const zones = [
    document.getElementById('cartItemsList'),
    document.getElementById('mobileDrawerCartItems'),
    document.getElementById('productGrid')
  ].filter(Boolean);
  if (!zones.length) return;
  cartGestureInitDone = true;

  zones.forEach((zone) => {
    // Telan klik susulan gestur (bukan ketukan) + tombol Hapus hasil usapan
    zone.addEventListener('click', (e) => {
      // 1. Tombol eksplisit (seperti tombol "1 porsi", stepper, dsb): JANGAN PERNAH DITELAN!
      const btn = e.target.closest('button, [role="button"], a, input, select, textarea');
      if (btn) {
        setSuppressStepperClick(false);
        setSuppressCardClick(false);
        return;
      }

      if (suppressStepperClick) {
        setSuppressStepperClick(false);
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (suppressCardClick) {
        const card = e.target.closest('[data-product-card]');
        if (card && zone.contains(card)) {
          setSuppressCardClick(false);
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        setSuppressCardClick(false);
      }
      const del = e.target.closest('[data-swipe-delete]');
      if (del && zone.contains(del)) {
        const lineId = del.getAttribute('data-swipe-delete');
        if (lineId) removeCartLine(lineId);
      }
    }, true);

    zone.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      // 1) Stepper tahan-ulang (+/- kasir & kartu katalog)
      const stepper = e.target.closest('[data-repeat-target]');
      if (stepper && !stepper.disabled && zone.contains(stepper)) {
        const target = stepper.getAttribute('data-repeat-target');
        const delta = Number(stepper.getAttribute('data-repeat-delta')) || 1;
        const startX = e.clientX ?? 0;
        const startY = e.clientY ?? 0;
        const tick = () => updateCartQty(target, delta);
        const onMove = (ev) => {
          const dx = (ev.clientX ?? startX) - startX;
          const dy = (ev.clientY ?? startY) - startY;
          if (Math.hypot(dx, dy) > GESTURE_SLOP_PX) {
            // Bergeser = niat scroll, bukan tahan: batalkan repeat & telan klik
            setSuppressStepperClick(true);
            stopPressRepeat();
          }
        };
        const timer = setTimeout(() => {
          if (!pressRepeatState) return;
          pressRepeatState.interval = setInterval(tick, REPEAT_TICK_MS);
          tick();
          try { triggerHaptic('medium'); } catch (_) {}
          setSuppressStepperClick(true);
        }, REPEAT_HOLD_MS);
        pressRepeatState = { timer, interval: null, moveListener: onMove };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', stopPressRepeat);
        window.addEventListener('pointercancel', stopPressRepeat);
        return;
      }
      // 1b) Tahan badan kartu katalog = tambah cepat (di luar tombol).
      // Kurangi = lewat tombol minus-nya sendiri (stepper di atas).
      const cardEl = e.target.closest('[data-product-card]');
      if (cardEl && zone.contains(cardEl)) {
        if (e.target.closest('button, a, input, select, textarea, [data-repeat-target]')) return;
        if (cardEl.classList.contains('cursor-not-allowed')) return;
        const pid = cardEl.getAttribute('data-product-card');
        if (!pid) return;
        const startX = e.clientX ?? 0;
        const startY = e.clientY ?? 0;
        const startT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        cancelCardPress();
        setSuppressCardClick(false);
        const holdTimer = setTimeout(() => {
          const s = cardPressState;
          if (!s || s.moved) return;
          s.repeating = true;
          setSuppressCardClick(true);
          try { cardEl.classList.add('card-press-hold'); } catch (_) {}
          try { triggerHaptic('medium'); } catch (_) {}
          // Tambah pertama dari hold (tap biasa ditelan via suppressCardClick)
          try { addToCart(pid); } catch (_) {}
          s.interval = setInterval(() => {
            try { addToCart(pid); } catch (_) {}
          }, CARD_HOLD_TICK_MS);
        }, CARD_HOLD_MS);
        cardPressState = { cardEl, productId: pid, startX, startY, startT, holdTimer, interval: null, repeating: false, moved: false };
        window.addEventListener('pointermove', onCardPressMove);
        window.addEventListener('pointerup', onCardPressUp);
        window.addEventListener('pointercancel', onCardPressUp);
        return;
      }
      // 2) Usap-hapus baris (jangan mulai dari tombol/tautan/input)
      if (e.target.closest('button, a, input, select, textarea')) return;
      const row = e.target.closest('.cart-line-swipe');
      if (!row || !zone.contains(row)) return;
      const fg = row.querySelector('.cart-swipe-fg');
      if (!fg) return;
      closeOpenSwipeRow(row);
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      swipeState = { row, fg, zone, startX: e.clientX, startY: e.clientY, dx: 0, active: false, lastX: e.clientX, lastT: now, vx: 0 };
      window.addEventListener('pointermove', onSwipeMove, { passive: false });
      window.addEventListener('pointerup', onSwipeEnd);
      window.addEventListener('pointercancel', onSwipeEnd);
    });
  });
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
      <div class="cart-line-swipe relative overflow-hidden border-b border-stone-100 last:border-0" data-cart-line="${item.lineId}">
        <div class="absolute inset-y-0 right-0 w-[92px] bg-rose-600 text-white" aria-hidden="true">
          <button type="button" data-swipe-delete="${item.lineId}" data-tooltip="Hapus item" aria-label="Hapus ${escapeHtml(p.name)}"
            class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer">
            <span class="material-symbols-rounded text-xl">delete</span>
            <span class="text-[10px] font-black leading-none">Hapus</span>
          </button>
        </div>
        <div class="cart-swipe-fg relative bg-white py-2.5 flex items-start justify-between gap-1.5">
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
                data-tooltip="Ubah catatan"
                class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 transition text-left cursor-pointer shadow-2xs">
                <span class="material-symbols-rounded text-sm text-amber-700">edit_note</span>
                <span class="truncate max-w-[140px] sm:max-w-[200px]">${escapeHtml(item.note)}</span>
              </button>
            ` : `
              <button type="button" onclick="window.KasirApp.openItemNoteModal('${item.lineId}')"
                data-tooltip="Tambah catatan"
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
            data-tooltip="${hasNote ? `Catatan: ${escapeHtml(item.note)}` : 'Catatan & Add-on'}">
            <span class="material-symbols-rounded text-base sm:text-lg ${hasNote || hasAddOns ? 'text-amber-700' : 'text-stone-500'}">edit_note</span>
          </button>
          <button data-repeat-target="${item.lineId}" data-repeat-delta="-1" onclick="window.KasirApp.updateCartQty('${item.lineId}', -1)" data-tooltip="Kurangi 1" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-black text-sm flex items-center justify-center touch-target-large transition cursor-pointer">-</button>
          <button type="button" onclick="window.KasirApp.openQtyEditor('${item.lineId}')" data-tooltip="Ubah jumlah"
            class="w-8 min-w-[2rem] h-7 sm:h-8 px-1 rounded-lg hover:bg-emerald-50 border border-transparent hover:border-emerald-300 text-center font-black text-xs sm:text-sm text-stone-800 hover:text-emerald-800 transition active:scale-95 cursor-pointer touch-target-large">${item.qty}</button>
          <button data-repeat-target="${item.lineId}" data-repeat-delta="1" onclick="window.KasirApp.updateCartQty('${item.lineId}', 1)" data-tooltip="Tambah 1" class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center touch-target-large shadow-sm transition cursor-pointer">+</button>
        </div>
        </div>
      </div>
    `;
  }).join('');

  if (desktopList) desktopList.innerHTML = itemsHtml;

  const drawerList = document.getElementById('mobileDrawerCartItems');
  const drawerTotal = document.getElementById('mobileDrawerTotalDisplay');
  if (drawerList) drawerList.innerHTML = itemsHtml;
  if (drawerTotal) drawerTotal.innerText = formatRp(total);

  // PERF: renderCart TIDAK me-render ulang grid katalog. Setiap alur yang
  // mengubah isi keranjang wajib menyegarkan kartu yang terdampak via
  // updateProductCardDOM(productId) — jauh lebih murah daripada membangun
  // ulang puluhan kartu + foto tiap satu tap.
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
  // Indikator catatan di kartu katalog ikut berubah → segarkan 1 kartu saja
  // (renderCart tidak lagi membangun ulang grid demi performa).
  updateProductCardDOM(item.productId);
}
