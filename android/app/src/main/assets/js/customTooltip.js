/**
 * Aristotle POS - Ultra-Smooth Modern Custom Tooltip System
 * 
 * Menggantikan tooltip native browser yang kaku dan lambat menjadi floating pill
 * modern berdesain presisi (stone dark theme, micro-arrow, smart auto-flip, dan warm sequence).
 * 
 * Fitur:
 * 1. Smart Placement: Otomatis mendeteksi tepi layar dan melakukan flip (top, bottom, left, right).
 * 2. Warm Sequence: Transisi antar-tombol instan (0ms) tanpa jeda saat kursor berpindah.
 * 3. Keyboard Accessible: Mendukung navigasi tombol via Tab / :focus-visible.
 * 4. Zero Overhead: Menggunakan 1 shared DOM node global.
 * 5. Touch Friendly: Otomatis nonaktif pada layar sentuh (mobile/tablet).
 */

let tooltipContainer = null;
let bubbleEl = null;
let contentEl = null;
let arrowEl = null;

let currentTarget = null;
let showTimer = null;
let warmTimer = null;
let isWarm = false;

const INITIAL_DELAY_MS = 140;
const WARM_TIMEOUT_MS = 300;
const OFFSET_PX = 8;

/**
 * Pastikan elemen tooltip singleton telah terpasang di DOM
 */
function ensureTooltipDOM() {
  if (tooltipContainer && document.body.contains(tooltipContainer)) return;

  tooltipContainer = document.createElement('div');
  tooltipContainer.id = 'aristotleCustomTooltip';
  tooltipContainer.setAttribute('role', 'tooltip');
  tooltipContainer.setAttribute('aria-hidden', 'true');
  tooltipContainer.className = 'aristotle-custom-tooltip';

  bubbleEl = document.createElement('div');
  bubbleEl.className = 'custom-tooltip-bubble';

  contentEl = document.createElement('span');
  contentEl.className = 'custom-tooltip-content';
  bubbleEl.appendChild(contentEl);

  arrowEl = document.createElement('div');
  arrowEl.className = 'custom-tooltip-arrow';

  tooltipContainer.appendChild(bubbleEl);
  tooltipContainer.appendChild(arrowEl);

  document.body.appendChild(tooltipContainer);
}

/**
 * Hitung posisi tooltip dan arrow relatif terhadap elemen target dan batas viewport
 */
function positionTooltip(targetEl, preferredPlacement = 'top') {
  if (!tooltipContainer || !targetEl) return;

  const targetRect = targetEl.getBoundingClientRect();
  const tw = tooltipContainer.offsetWidth || 120;
  const th = tooltipContainer.offsetHeight || 28;

  let placement = preferredPlacement;

  // Deteksi otomatis jika di nav rail sebelah kiri: prioritaskan 'right'
  if (targetEl.closest('#m3NavRail') || targetEl.getAttribute('data-tooltip-placement') === 'right') {
    placement = 'right';
  } else if (targetEl.getAttribute('data-tooltip-placement')) {
    placement = targetEl.getAttribute('data-tooltip-placement');
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Collision handling & auto-flip
  if (placement === 'top' && targetRect.top - th - OFFSET_PX < 6) {
    placement = 'bottom';
  } else if (placement === 'bottom' && targetRect.bottom + th + OFFSET_PX > vh - 6) {
    placement = 'top';
  } else if (placement === 'right' && targetRect.right + tw + OFFSET_PX > vw - 6) {
    placement = 'left';
  } else if (placement === 'left' && targetRect.left - tw - OFFSET_PX < 6) {
    placement = 'right';
  }

  let top = 0;
  let left = 0;
  let arrowTop = 0;
  let arrowLeft = 0;

  if (placement === 'top') {
    top = targetRect.top - th - OFFSET_PX;
    left = targetRect.left + (targetRect.width - tw) / 2;
    arrowTop = th - 3;
    arrowLeft = Math.max(8, Math.min(tw - 14, (targetRect.left + targetRect.width / 2) - left - 3));
  } else if (placement === 'bottom') {
    top = targetRect.bottom + OFFSET_PX;
    left = targetRect.left + (targetRect.width - tw) / 2;
    arrowTop = -3;
    arrowLeft = Math.max(8, Math.min(tw - 14, (targetRect.left + targetRect.width / 2) - left - 3));
  } else if (placement === 'right') {
    left = targetRect.right + OFFSET_PX;
    top = targetRect.top + (targetRect.height - th) / 2;
    arrowLeft = -3;
    arrowTop = Math.max(6, Math.min(th - 12, (targetRect.top + targetRect.height / 2) - top - 3));
  } else if (placement === 'left') {
    left = targetRect.left - tw - OFFSET_PX;
    top = targetRect.top + (targetRect.height - th) / 2;
    arrowLeft = tw - 3;
    arrowTop = Math.max(6, Math.min(th - 12, (targetRect.top + targetRect.height / 2) - top - 3));
  }

  // Clamp horizontal agar tidak keluar dari layar
  const clampedLeft = Math.max(8, Math.min(vw - tw - 8, left));
  const clampDiff = clampedLeft - left;
  if (placement === 'top' || placement === 'bottom') {
    arrowLeft = Math.max(8, Math.min(tw - 14, arrowLeft - clampDiff));
  }

  // Clamp vertical
  const clampedTop = Math.max(8, Math.min(vh - th - 8, top));

  tooltipContainer.style.transform = `translate3d(${Math.round(clampedLeft)}px, ${Math.round(clampedTop)}px, 0)`;
  tooltipContainer.setAttribute('data-placement', placement);

  if (arrowEl) {
    arrowEl.style.left = `${Math.round(arrowLeft)}px`;
    arrowEl.style.top = `${Math.round(arrowTop)}px`;
  }
}

function escapeTooltipHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Tampilkan tooltip untuk elemen target tertentu
 */
export function showTooltip(targetEl, text, placement = 'top', shortcut = '') {
  if (!targetEl || !text) return;

  ensureTooltipDOM();

  // Susun konten (teks + shortcut chip jika ada)
  let html = `<span class="truncate">${escapeTooltipHtml(text)}</span>`;
  if (shortcut) {
    html += `<kbd class="custom-tooltip-kbd">${escapeTooltipHtml(shortcut)}</kbd>`;
  }
  contentEl.innerHTML = html;

  currentTarget = targetEl;
  tooltipContainer.setAttribute('aria-hidden', 'false');

  // Posisikan
  positionTooltip(targetEl, placement);

  // Trigger animasi muncul
  tooltipContainer.classList.add('tooltip-visible');

  isWarm = true;
  if (warmTimer) clearTimeout(warmTimer);
}

/**
 * Sembunyikan custom tooltip
 */
export function hideTooltip(immediate = false) {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  if (!tooltipContainer || !currentTarget) return;

  currentTarget = null;

  if (immediate) {
    tooltipContainer.classList.remove('tooltip-visible');
    tooltipContainer.setAttribute('aria-hidden', 'true');
  } else {
    tooltipContainer.classList.remove('tooltip-visible');
    setTimeout(() => {
      if (!currentTarget && tooltipContainer) {
        tooltipContainer.setAttribute('aria-hidden', 'true');
      }
    }, 140);
  }

  // Kelola warm timer
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    isWarm = false;
  }, WARM_TIMEOUT_MS);
}

/**
 * Ambil data tooltip dari elemen (data-tooltip atau migrasi title)
 */
function getTooltipData(target) {
  if (!target || !(target instanceof HTMLElement)) return null;

  const el = target.closest('[data-tooltip], [title]');
  if (!el || el.disabled || el.classList.contains('no-tooltip')) return null;

  // Abaikan elemen dalam modal tersembunyi
  if (el.closest('.hidden')) return null;

  // Jika masih punya title native, migrasikan ke data-tooltip agar native tooltip tidak muncul
  if (el.hasAttribute('title')) {
    const rawTitle = el.getAttribute('title');
    if (rawTitle && rawTitle.trim()) {
      el.setAttribute('data-tooltip', rawTitle.trim());
      el.removeAttribute('title');
    }
  }

  const text = el.getAttribute('data-tooltip');
  if (!text) return null;

  const shortcut = el.getAttribute('data-tooltip-shortcut') || '';
  const placement = el.getAttribute('data-tooltip-placement') || 'top';

  return { el, text, shortcut, placement };
}

/**
 * Migrasikan seluruh atribut title native yang ada di dokumen
 */
export function migrateAllNativeTitles(root = document) {
  try {
    root.querySelectorAll('[title]').forEach(el => {
      if (el.classList.contains('no-tooltip')) return;
      const raw = el.getAttribute('title');
      if (raw && raw.trim()) {
        el.setAttribute('data-tooltip', raw.trim());
        el.removeAttribute('title');
      }
    });
  } catch (_) {}
}

/**
 * Inisialisasi event listener global untuk Custom Tooltip
 */
export function initCustomTooltip() {
  if (typeof window === 'undefined' || window._aristotleTooltipInitialized) return;
  window._aristotleTooltipInitialized = true;

  ensureTooltipDOM();
  migrateAllNativeTitles();

  // 1. Mouse Move & Pointer Move
  const handleMove = (e) => {
    if (e.pointerType === 'touch') return;

    const data = getTooltipData(e.target);
    if (!data) {
      if (currentTarget) hideTooltip(false);
      return;
    }

    if (currentTarget === data.el) return;

    if (showTimer) clearTimeout(showTimer);

    const delay = isWarm ? 0 : INITIAL_DELAY_MS;
    showTimer = setTimeout(() => {
      showTooltip(data.el, data.text, data.placement, data.shortcut);
    }, delay);
  };

  const handlePointerOut = (e) => {
    if (!currentTarget) return;
    const related = e.relatedTarget;
    if (related && currentTarget.contains(related)) return;

    hideTooltip(false);
  };

  document.addEventListener('pointermove', handleMove, { passive: true });
  document.addEventListener('pointerout', handlePointerOut, { passive: true });

  // 2. Focus-in (Keyboard navigation accessibility)
  document.addEventListener('focusin', (e) => {
    const data = getTooltipData(e.target);
    if (!data) return;
    showTooltip(data.el, data.text, data.placement, data.shortcut);
  });

  // 3. Focus-out
  document.addEventListener('focusout', () => {
    hideTooltip(true);
  });

  // 4. Tutup seketika jika diklik, discroll, atau tekan tombol Escape
  document.addEventListener('pointerdown', () => hideTooltip(true), { passive: true });
  window.addEventListener('scroll', () => hideTooltip(true), { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip(true);
  });
}

// Pasang ke window object untuk akses global
if (typeof window !== 'undefined') {
  window.initCustomTooltip = initCustomTooltip;
  window.showTooltip = showTooltip;
  window.hideTooltip = hideTooltip;
  window.migrateAllNativeTitles = migrateAllNativeTitles;
}
