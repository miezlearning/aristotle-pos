/**
 * Aristotle POS - Ultra-Smooth Modern Custom Tooltip System
 * 
 * Sistem tooltip presisi, responsif, dan ringan untuk seluruh elemen interaktif
 * di Aristotle POS (stone dark theme, micro-arrow, smart auto-flip, dan warm sequence).
 * 
 * Fitur:
 * 1. Universal Coverage: Menjamin semua tombol, icon button, tab antrian, kartu menu,
 *    dan aksi interaktif memiliki tooltip yang rapi dan konsisten.
 * 2. Anti-Slop Simple Copy: Bahasa baku, padat, langsung ke intinya, tanpa kalimat berbunga-bunga.
 * 3. Smart Placement: Deteksi batas layar & auto-flip (top, bottom, left, right).
 * 4. Warm Sequence: Transisi instan (0ms) antar tombol saat kursor digeser.
 * 5. Keyboard Accessible: Mendukung Tab / :focus-visible.
 * 6. Zero Overhead: 1 shared DOM node global + MutationObserver otomatis.
 */

let tooltipContainer = null;
let bubbleEl = null;
let contentEl = null;
let arrowEl = null;

let currentTarget = null;
let showTimer = null;
let warmTimer = null;
let isWarm = false;

const INITIAL_DELAY_MS = 130;
const WARM_TIMEOUT_MS = 320;
const OFFSET_PX = 8;

/**
 * Pemetaan icon standar ke label singkat & jelas (Indonesian standard)
 */
const ICON_LABEL_MAP = {
  // Navigation & Core
  'point_of_sale': 'Kasir',
  'account_balance_wallet': 'Laporan',
  'inventory_2': 'Kelola Menu',
  'print': 'Status Printer',
  'schedule': 'Shift Kasir',
  'history': 'Riwayat',
  'shopping_cart': 'Keranjang',
  'remove_shopping_cart': 'Kosongkan keranjang',
  'fullscreen': 'Layar penuh',
  'fullscreen_exit': 'Keluar layar penuh',
  'chat': 'Bantuan WhatsApp',
  'help': 'Panduan Kasir',
  'settings': 'Pengaturan',
  'close': 'Tutup',
  'clear': 'Hapus',
  'add': 'Tambah',
  'remove': 'Kurangi',
  'delete': 'Hapus',
  'delete_outline': 'Hapus',
  'edit': 'Edit',
  'edit_note': 'Catatan & Add-on',
  'note_add': 'Catatan & Add-on',
  'search': 'Cari menu',
  'filter_list': 'Filter',
  'filter_alt': 'Filter',
  'tune': 'Filter',
  'refresh': 'Segarkan data',
  'sync': 'Sinkronisasi',
  'chevron_left': 'Sebelumnya',
  'chevron_right': 'Berikutnya',
  'arrow_back': 'Kembali',
  'arrow_forward': 'Lanjut',
  'arrow_drop_down': 'Buka menu',
  'unfold_more': 'Pilihan peran',
  'more_vert': 'Menu lainnya',
  'more_horiz': 'Menu lainnya',
  'download': 'Unduh',
  'file_download': 'Unduh CSV',
  'upload': 'Unggah',
  'file_upload': 'Import data',
  'share': 'Bagikan',
  'content_copy': 'Salin',
  'qr_code': 'QRIS',
  'qr_code_scanner': 'Pindai QRIS',
  'receipt': 'Struk',
  'receipt_long': 'Struk transaksi',
  'payments': 'Pembayaran tunai',
  'check': 'Selesai',
  'check_circle': 'Pilih',
  'visibility': 'Lihat',
  'visibility_off': 'Sembunyikan',
  'lock': 'Kunci',
  'lock_open': 'Buka kunci',
  'restaurant': 'Dapur',
  'bluetooth': 'Bluetooth',
  'usb': 'Kabel USB',
  'vpn_key': 'Lisensi',
  'storefront': 'Profil Toko',
  'apps': 'Semua menu',
  'lunch_dining': 'Kategori Makanan',
  'local_cafe': 'Kategori Minuman',
  'bakery_dining': 'Kategori Camilan',
  'extension': 'Kategori Topping',
  'table_rows': 'Tampilan tabel',
  'grid_view': 'Tampilan kartu',
  'key': 'PIN'
};

/**
 * Daftar pembersihan kalimat berbunga-bunga/panjang menjadi istilah simpel standar
 */
const VERBOSE_REPLACEMENTS = [
  [/klik untuk info toko \/ hubungkan perangkat & ganti role.*$/i, 'Profil Toko & Peran'],
  [/profil toko & pengaturan akses/i, 'Profil Toko'],
  [/tekan tombol '\/' di keyboard untuk mencari cepat/i, 'Cari menu'],
  [/hapus pencarian \(esc\)/i, 'Hapus pencarian'],
  [/ketuk untuk tambah 1 • tahan untuk tambah cepat • ketuk angka untuk isi manual/i, 'Tambah ke pesanan'],
  [/ketuk untuk tambah 1, tahan untuk tambah cepat/i, 'Tambah 1'],
  [/ketuk tambah 1 • tahan tambah cepat/i, 'Tambah 1'],
  [/ketuk untuk kurangi 1, tahan untuk kurangi cepat/i, 'Kurangi 1'],
  [/ketuk kurangi 1 • tahan kurangi cepat/i, 'Kurangi 1'],
  [/ketuk untuk isi jumlah manual/i, 'Ubah jumlah'],
  [/hapus dari pesanan/i, 'Hapus item'],
  [/hapus item ini/i, 'Hapus item'],
  [/sambungkan printer thermal kasir lewat bluetooth.*/i, 'Hubungkan Bluetooth'],
  [/sambungkan printer lewat kabel usb.*/i, 'Hubungkan USB'],
  [/kirim 3 sinyal berbeda berurutan.*/i, 'Tes buka laci'],
  [/batalkan transaksi \(void berjejak\)/i, 'Batalkan transaksi (Void)'],
  [/lihat salinan berstempel void/i, 'Salinan Void'],
  [/lihat \/ cetak struk/i, 'Cetak Struk'],
  [/bantuan whatsapp: \d+/i, 'Bantuan WhatsApp'],
  [/panduan interaktif kasir/i, 'Panduan Kasir'],
  [/tahan lalu geser untuk mengubah urutan/i, 'Urutan antrian'],
  [/klik untuk ubah status ready\/habis/i, 'Ubah status stok'],
  [/ubah nama, harga, atau stok menu/i, 'Edit menu'],
  [/tambah banyak menu sekaligus.*/i, 'Import banyak menu'],
  [/kelola akun kasir & pin 6 digit/i, 'Kelola Kasir'],
  [/atur printer thermal & struk/i, 'Pengaturan Printer'],
  [/atur qris toko/i, 'Pengaturan QRIS'],
  [/cadangkan seluruh data toko ke file json/i, 'Cadangkan Data'],
  [/pulihkan data toko dari file json cadangan/i, 'Pulihkan Data'],
  [/lihat, salin, atau kirim data diagnostik.*/i, 'Data Diagnostik'],
  [/lihat jejak void, diskon, dan selisih laci/i, 'Audit Transaksi'],
  [/hapus seluruh data transaksi & pengeluaran hari ini.*/i, 'Reset data hari ini'],
  [/hapus seluruh riwayat semua periode/i, 'Hapus semua riwayat'],
  [/hapus baris yang namanya masih kosong/i, 'Hapus baris kosong'],
  [/hapus seluruh baris di tabel/i, 'Hapus semua baris'],
  [/isi otomatis dengan contoh 22 menu/i, 'Isi contoh menu'],
  [/cetak tiket dapur untuk koki/i, 'Cetak tiket dapur'],
  [/kirim sinyal buka laci uang/i, 'Buka laci uang'],
  [/buka pengaturan printer/i, 'Pengaturan printer'],
  [/tampilkan \/ sembunyikan pin/i, 'Lihat PIN'],
  [/tampilkan \/ sembunyikan passkey/i, 'Lihat Passkey'],
  [/lihat \/ sembunyikan kode/i, 'Lihat kode'],
  [/salin kode lisensi/i, 'Salin kode'],
  [/ganti peran kasir \/ owner/i, 'Ganti peran'],
  [/kelola shift & rekap tutup kasir \(z-report\)/i, 'Shift Kasir'],
  [/catat biaya belanja \/ operasional/i, 'Catat Pengeluaran'],
  [/kirim rekap laporan ke whatsapp/i, 'Kirim WhatsApp'],
  [/download excel csv/i, 'Unduh CSV'],
  [/filter rentang tanggal khusus/i, 'Filter tanggal']
];

/**
 * Bersihkan string agar ringkas, padat, dan non-flowery
 */
export function cleanTooltipText(str) {
  if (!str) return '';
  let s = String(str).trim();

  for (const [regex, replacement] of VERBOSE_REPLACEMENTS) {
    if (regex.test(s)) {
      return replacement;
    }
  }

  // Jika terdapat shortcut kurung seperti "Hapus pencarian (Esc)", biarkan atau pisahkan
  return s;
}

/**
 * Ambil teks bersih dari elemen tanpa teks icon
 */
function getCleanElementText(element) {
  try {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.material-symbols-rounded, .material-icons, svg, [aria-hidden="true"]').forEach(n => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  } catch (_) {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Turunkan tooltip fallback otomatis untuk tombol atau elemen interaktif
 */
function deriveFallbackTooltip(el) {
  if (!el || el.disabled || el.classList.contains('no-tooltip')) return null;

  // 1. Cek aria-label
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) {
    return cleanTooltipText(aria.trim());
  }

  // 2. Cek apakah ini tombol nomor di keypad kasir (0-9, 00, 000, titik) -> lewati agar kasir cepat
  const rawText = getCleanElementText(el);
  if (/^([0-9]|00|000|\.)$/.test(rawText)) {
    return null;
  }

  // 3. Cek icon Material Symbols
  const icon = el.querySelector('.material-symbols-rounded, .material-icons');
  const iconName = icon ? icon.textContent.trim().toLowerCase() : '';

  // 4. Jika tombol memiliki teks ringkas yang jelas
  if (rawText && rawText.length >= 2 && rawText.length <= 32) {
    const lower = rawText.toLowerCase();
    if (lower === 'proses bayar' || lower === 'bayar sekarang' || lower === 'bayar') return 'Bayar pesanan';
    if (lower === 'antrian baru' || lower === 'baru') return 'Tambah antrian baru';
    if (lower === 'kosongkan') return 'Kosongkan keranjang';
    if (lower === 'semua') return 'Semua menu';
    if (lower === 'makanan') return 'Kategori Makanan';
    if (lower === 'minuman') return 'Kategori Minuman';
    if (lower === 'camilan') return 'Kategori Camilan';
    if (lower === 'topping') return 'Kategori Topping';
    if (lower === 'simpan') return 'Simpan data';
    if (lower === 'batal') return 'Batal';
    if (lower === 'tutup') return 'Tutup';
    if (lower === 'terapkan') return 'Terapkan filter';
    if (lower === 'reset') return 'Reset filter';
    if (lower === '+ tambah' || lower === 'tambah') return 'Tambah ke pesanan';
    if (lower === 'tambah menu') return 'Tambah menu baru';
    if (lower === 'import excel' || lower === 'import csv') return 'Import data menu';
    if (lower === 'uang pas') return 'Uang pas';
    return cleanTooltipText(rawText);
  }

  // 5. Jika hanya icon tanpa teks
  if (iconName && ICON_LABEL_MAP[iconName]) {
    return ICON_LABEL_MAP[iconName];
  }

  return null;
}

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
 * Ambil data tooltip dari elemen (data-tooltip, title, atau fallback cerdas)
 */
function getTooltipData(target) {
  if (!target || !(target instanceof HTMLElement)) return null;

  // Cari elemen interaktif terdekat
  const el = target.closest(
    '[data-tooltip], [title], [aria-label], button, a, [role="button"], summary, .cat-pill, .pos-product-card, .touch-target-large'
  );
  if (!el || el.disabled || el.classList.contains('no-tooltip')) return null;

  // Abaikan elemen dalam modal tersembunyi
  if (el.closest('.hidden')) return null;

  // Jika memiliki title native, migrasikan ke data-tooltip agar native tooltip tidak bentrok
  if (el.hasAttribute('title')) {
    const rawTitle = el.getAttribute('title');
    if (rawTitle && rawTitle.trim()) {
      const cleaned = cleanTooltipText(rawTitle.trim());
      el.setAttribute('data-tooltip', cleaned);
      el.removeAttribute('title');
    }
  }

  let text = el.getAttribute('data-tooltip');
  if (text) {
    text = cleanTooltipText(text);
  } else {
    // Cari fallback otomatis untuk tombol atau aksi interaktif
    text = deriveFallbackTooltip(el);
  }

  if (!text) return null;

  let shortcut = el.getAttribute('data-tooltip-shortcut') || '';
  if (!shortcut) {
    // Deteksi shortcut bawaan dari teks seperti (F9) atau (Esc) atau (/)
    const match = text.match(/\((F\d+|Esc|\/|\+|-)\)$/);
    if (match) {
      shortcut = match[1];
      text = text.replace(/\s*\((F\d+|Esc|\/|\+|-)\)$/, '').trim();
    }
  }

  const placement = el.getAttribute('data-tooltip-placement') || 'top';

  return { el, text, shortcut, placement };
}

/**
 * Migrasikan seluruh atribut title native yang ada di dokumen ke data-tooltip bersih
 */
export function migrateAllNativeTitles(root = document) {
  try {
    root.querySelectorAll('[title]').forEach(el => {
      if (el.classList.contains('no-tooltip')) return;
      const raw = el.getAttribute('title');
      if (raw && raw.trim()) {
        const cleaned = cleanTooltipText(raw.trim());
        el.setAttribute('data-tooltip', cleaned);
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

  // Observer untuk elemen yang baru dirender secara dinamis
  try {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              migrateAllNativeTitles(node);
            }
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  // 1. Pointer Move (Mouse hover)
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
  document.addEventListener('pointerover', handleMove, { passive: true });
  document.addEventListener('mousemove', handleMove, { passive: true });
  document.addEventListener('pointerout', handlePointerOut, { passive: true });
  document.addEventListener('mouseout', handlePointerOut, { passive: true });

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
