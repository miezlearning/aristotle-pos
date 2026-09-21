/**
 * Aristotle POS - Responsive Spotlight Tour Guide (Ramah Lansia)
 * Sorot langsung ke elemen spesifik dengan SVG Mask cutout + Glow Pulse + Pointer + Kartu Responsif.
 */

import { playClick } from '../utils.js';

const TOUR_STEPS = [
  {
    selector: '#mobileStoreProfileBtn, #appHeaderStoreTitle',
    fallbackSelector: 'header .cursor-pointer',
    icon: 'storefront',
    iconColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    title: 'Info Toko & Hubungkan HP',
    desc: 'Lihat profil toko, ganti cabang, amankan kasir dengan PIN 6-digit, atau bagikan kode QR / tautan untuk menghubungkan HP staf secara realtime.',
    view: 'pos'
  },
  {
    selector: '#railShiftBtn, #headerShiftStatusBadge, #mobileHeaderShiftBtn',
    fallbackSelector: 'header',
    icon: 'schedule',
    iconColor: 'bg-teal-100 text-teal-800 border-teal-300',
    title: 'Shift Kasir & Laporan Z (Opsional)',
    desc: 'Buka shift untuk mencatat modal kas awal di laci (opsional, tidak memblokir kasir!). Saat tutup toko, hitung uang fisik dan cetak struk audit Laporan Z.',
    view: 'pos'
  },
  {
    selector: '#railPrinterBtn, #headerPrinterStatusBadge, #mobileHeaderPrinterBtn',
    fallbackSelector: 'header',
    icon: 'print',
    iconColor: 'bg-sky-100 text-sky-800 border-sky-300',
    title: 'Printer Thermal & Laci Kasir',
    desc: 'Hubungkan printer Bluetooth, USB, atau LAN untuk cetak struk pelanggan, cetak tiket pesanan dapur 🍳, dan buka laci uang otomatis saat pembayaran tunai.',
    view: 'pos'
  },
  {
    selector: '#cat-all',
    fallbackSelector: '.cat-pill',
    icon: 'category',
    iconColor: 'bg-amber-100 text-amber-800 border-amber-300',
    title: 'Pilih Kategori & Cari Menu',
    desc: 'Pilih kategori (Makanan, Minuman, Camilan) atau gunakan kolom pencarian untuk menemukan menu dengan cepat saat toko sedang ramai pembeli.',
    view: 'pos'
  },
  {
    selector: '#productGrid > *:first-child',
    fallbackSelector: '#productGrid',
    icon: 'touch_app',
    iconColor: 'bg-blue-100 text-blue-800 border-blue-300',
    title: 'Sentuh Menu untuk Memesan',
    desc: 'Cukup sentuh gambar menu untuk memasukkannya ke struk pesanan. Gunakan tombol plus (+) atau minus (-) pada kartu menu untuk mengatur jumlah porsi.',
    view: 'pos'
  },
  {
    selector: 'button[onclick*="addNewOrderQueue"]',
    fallbackSelector: '#orderQueueTabs',
    icon: 'table_restaurant',
    iconColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    title: 'Buka Antrian / Meja Baru',
    desc: 'Jika ada pelanggan baru datang saat pesanan sebelumnya belum selesai bayar, klik tombol "+ Antrian Baru" agar pesanan lama tersimpan aman.',
    view: 'pos'
  },
  {
    selector: '#btnCheckout',
    fallbackSelector: '#cartTotalDisplay',
    icon: 'payments',
    iconColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    title: 'Bayar, Diskon & QRIS Dinamis',
    desc: 'Klik tombol BAYAR untuk memilih Tunai atau QRIS Dinamis otomatis. Anda juga dapat memberikan diskon persentase (%) atau potongan nominal (Rp) pada tagihan.',
    view: 'pos'
  },
  {
    selector: '#btnNavReportDesktop, #btnNavReportMobile',
    fallbackSelector: 'button[onclick*="report"]',
    icon: 'account_balance_wallet',
    iconColor: 'bg-purple-100 text-purple-800 border-purple-300',
    title: 'Laporan Omset & Rekap Shift',
    desc: 'Buka menu Laporan setiap saat untuk melihat total uang masuk, riwayat tutup shift (Laporan Z), mencatat biaya belanja operasional, dan melihat laba bersih riil toko.',
    view: 'report'
  },
  {
    selector: '#btnNavAdminDesktop, #btnNavAdminMobile',
    fallbackSelector: 'button[onclick*="admin"]',
    icon: 'inventory_2',
    iconColor: 'bg-rose-100 text-rose-800 border-rose-300',
    title: 'Kelola Menu & Pasang QRIS',
    desc: 'Buka menu Kelola untuk menambah makanan/minuman baru, mengganti harga jual, mengatur stok porsi harian, dan mengunggah barcode QRIS toko Anda sendiri.',
    view: 'admin'
  }
];

let currentStep = -1;
let elementsCreated = false;

let overlaySvg = null;
let cutoutRect = null;
let glowBox = null;
let pointerBadge = null;
let cardEl = null;

function createTourElements() {
  if (elementsCreated) return;

  // 1. SVG Mask Overlay (Smooth dark backdrop with clean rounded hole)
  const svgNs = 'http://www.w3.org/2000/svg';
  overlaySvg = document.createElementNS(svgNs, 'svg');
  overlaySvg.id = 'tourSvgOverlay';
  overlaySvg.setAttribute('class', 'fixed inset-0 w-full h-full z-[9980] transition-opacity duration-300');
  overlaySvg.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; opacity: 0; pointer-events: none; display: none;';

  const defs = document.createElementNS(svgNs, 'defs');
  const mask = document.createElementNS(svgNs, 'mask');
  mask.setAttribute('id', 'tourMaskHole');

  // White base
  const whiteRect = document.createElementNS(svgNs, 'rect');
  whiteRect.setAttribute('x', '0');
  whiteRect.setAttribute('y', '0');
  whiteRect.setAttribute('width', '100%');
  whiteRect.setAttribute('height', '100%');
  whiteRect.setAttribute('fill', '#ffffff');
  mask.appendChild(whiteRect);

  // Black cutout
  cutoutRect = document.createElementNS(svgNs, 'rect');
  cutoutRect.setAttribute('x', '0');
  cutoutRect.setAttribute('y', '0');
  cutoutRect.setAttribute('width', '0');
  cutoutRect.setAttribute('height', '0');
  cutoutRect.setAttribute('rx', '18');
  cutoutRect.setAttribute('ry', '18');
  cutoutRect.setAttribute('fill', '#000000');
  mask.appendChild(cutoutRect);

  defs.appendChild(mask);
  overlaySvg.appendChild(defs);

  // Shaded Rect
  const shadeRect = document.createElementNS(svgNs, 'rect');
  shadeRect.setAttribute('x', '0');
  shadeRect.setAttribute('y', '0');
  shadeRect.setAttribute('width', '100%');
  shadeRect.setAttribute('height', '100%');
  shadeRect.setAttribute('fill', 'rgba(15, 23, 42, 0.72)');
  shadeRect.setAttribute('mask', 'url(#tourMaskHole)');
  overlaySvg.appendChild(shadeRect);

  document.body.appendChild(overlaySvg);

  // 2. Animated Glow Ring Box
  glowBox = document.createElement('div');
  glowBox.id = 'tourGlowBox';
  glowBox.className = 'tour-pulse-glow';
  glowBox.style.cssText = `
    position: fixed; z-index: 9985; pointer-events: none;
    border-radius: 18px; border: 3px solid #10b981;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    display: none;
  `;
  document.body.appendChild(glowBox);

  // 3. Bouncing Pointer Hand
  pointerBadge = document.createElement('div');
  pointerBadge.id = 'tourPointerBadge';
  pointerBadge.className = 'tour-bounce-pointer';
  pointerBadge.style.cssText = `
    position: fixed; z-index: 9988; pointer-events: none;
    display: none; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 99px;
    background: #10b981; color: white; font-size: 24px;
    box-shadow: 0 10px 25px rgba(16, 185, 129, 0.5);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  pointerBadge.innerHTML = '<span class="material-symbols-rounded text-white text-2xl">arrow_downward</span>';
  document.body.appendChild(pointerBadge);

  // 4. Responsive Guide Card
  cardEl = document.createElement('div');
  cardEl.id = 'tourCard';
  cardEl.style.cssText = `
    position: fixed; z-index: 9990;
    width: min(430px, calc(100vw - 28px));
    background: #ffffff; border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
    padding: 20px 22px 18px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    display: none; opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  document.body.appendChild(cardEl);

  // Click on background closes tour
  overlaySvg.addEventListener('click', () => {
    closeGuideTour();
  });

  elementsCreated = true;
}

function resolveTarget(step) {
  if (step.selector) {
    const selectors = step.selector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) {
        return el;
      }
    }
  }

  if (step.fallbackSelector) {
    const fallbacks = step.fallbackSelector.split(',').map(s => s.trim());
    for (const sel of fallbacks) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
  }

  return null;
}

function updateHighlight(targetEl) {
  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const pad = 8;

  const x = Math.max(4, rect.left - pad);
  const y = Math.max(4, rect.top - pad);
  const width = Math.min(window.innerWidth - x - 4, rect.width + pad * 2);
  const height = Math.min(window.innerHeight - y - 4, rect.height + pad * 2);

  // Update SVG Mask cutout
  cutoutRect.setAttribute('x', x);
  cutoutRect.setAttribute('y', y);
  cutoutRect.setAttribute('width', width);
  cutoutRect.setAttribute('height', height);

  // Update Glow Box
  glowBox.style.display = 'block';
  glowBox.style.left = `${x}px`;
  glowBox.style.top = `${y}px`;
  glowBox.style.width = `${width}px`;
  glowBox.style.height = `${height}px`;

  // Update Pointer Hand
  pointerBadge.style.display = 'flex';
  const pointerX = x + width / 2 - 22;
  let pointerY = y - 48;
  if (pointerY < 10) {
    pointerY = y + height + 10;
    pointerBadge.innerHTML = '<span class="material-symbols-rounded text-white text-2xl">arrow_upward</span>';
  } else {
    pointerBadge.innerHTML = '<span class="material-symbols-rounded text-white text-2xl">arrow_downward</span>';
  }
  pointerBadge.style.left = `${pointerX}px`;
  pointerBadge.style.top = `${pointerY}px`;
}

function updateCardPosition(targetEl) {
  if (!targetEl || !cardEl) return;

  const rect = targetEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const cardRect = cardEl.getBoundingClientRect();
  const cardWidth = cardRect.width || 380;
  const cardHeight = cardRect.height || 260;

  let top = 0;
  let left = 0;

  // Mobile View (< 768px): Dock safely to bottom or top
  if (vw < 768) {
    left = (vw - cardWidth) / 2;
    // If target is in top half, dock card at bottom
    if (rect.top < vh * 0.52) {
      top = vh - cardHeight - 16;
    } else {
      // Dock card at top
      top = 16;
    }
  } else {
    // Desktop View: Smart Adjacent Placement
    // Try placing below target
    if (rect.bottom + cardHeight + 20 < vh) {
      top = rect.bottom + 16;
      left = rect.left + rect.width / 2 - cardWidth / 2;
    } else if (rect.top - cardHeight - 20 > 0) {
      // Place above target
      top = rect.top - cardHeight - 16;
      left = rect.left + rect.width / 2 - cardWidth / 2;
    } else {
      // Place beside
      top = Math.max(16, rect.top);
      if (rect.right + cardWidth + 20 < vw) {
        left = rect.right + 16;
      } else {
        left = Math.max(16, rect.left - cardWidth - 16);
      }
    }
  }

  // Viewport boundary clamp
  left = Math.max(14, Math.min(left, vw - cardWidth - 14));
  top = Math.max(14, Math.min(top, vh - cardHeight - 14));

  cardEl.style.left = `${left}px`;
  cardEl.style.top = `${top}px`;
  cardEl.style.display = 'block';

  requestAnimationFrame(() => {
    cardEl.style.opacity = '1';
    cardEl.style.transform = 'translateY(0)';
  });
}

function renderCard(step, idx) {
  const total = TOUR_STEPS.length;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;

  // Progress Dots
  const dotsHtml = TOUR_STEPS.map((_, i) => `
    <button type="button" onclick="KasirApp.goToTourStep(${i})" data-tooltip="Langkah ${i + 1}"
      class="h-2 rounded-full transition-all duration-300 ${i === idx ? 'w-6 bg-emerald-700' : 'w-2 bg-stone-300 hover:bg-stone-400'}">
    </button>
  `).join('');

  cardEl.innerHTML = `
    <!-- Top Header -->
    <div class="flex items-center justify-between pb-3 border-b border-stone-100">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
        <span class="text-xs font-black text-emerald-950 uppercase tracking-wide">
          Langkah ${idx + 1} dari ${total}
        </span>
      </div>
      <button type="button" onclick="KasirApp.closeGuideTour()"
        class="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition touch-target-large" data-tooltip="Tutup Panduan">
        <span class="material-symbols-rounded text-xl">close</span>
      </button>
    </div>

    <!-- Body -->
    <div class="py-4 flex items-start gap-3.5">
      <div class="w-12 h-12 rounded-2xl flex items-center justify-center border-2 shrink-0 ${step.iconColor} shadow-sm">
        <span class="material-symbols-rounded text-2xl">${step.icon}</span>
      </div>
      <div class="flex-1 min-w-0">
        <h4 class="text-base sm:text-lg font-black text-stone-900 leading-snug">${step.title}</h4>
        <p class="text-xs sm:text-sm text-stone-600 font-medium mt-1 leading-relaxed">${step.desc}</p>
      </div>
    </div>

    <!-- Footer Controls -->
    <div class="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
      <button type="button" onclick="KasirApp.closeGuideTour()"
        class="text-xs font-bold text-stone-400 hover:text-stone-700 px-2 py-1.5 transition">
        Lewati
      </button>

      <div class="flex items-center gap-1.5">
        ${dotsHtml}
      </div>

      <div class="flex items-center gap-2">
        ${!isFirst ? `
          <button type="button" onclick="KasirApp.prevTourStep()"
            class="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs flex items-center gap-1 transition active:scale-95 touch-target-large">
            <span class="material-symbols-rounded text-base">arrow_back</span>
            <span>Balik</span>
          </button>
        ` : ''}

        <button type="button" onclick="${isLast ? 'KasirApp.closeGuideTour()' : 'KasirApp.nextTourStep()'}"
          class="py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md hover:shadow-lg transition active:scale-95 touch-target-large">
          <span>${isLast ? 'Mulai Kasir' : 'Lanjut'}</span>
          <span class="material-symbols-rounded text-base">${isLast ? 'check_circle' : 'arrow_forward'}</span>
        </button>
      </div>
    </div>
  `;
}

function showStep(stepIdx) {
  createTourElements();
  const step = TOUR_STEPS[stepIdx];
  if (!step) return;

  currentStep = stepIdx;

  // Auto-switch view if needed
  if (step.view && window.KasirApp && window.KasirApp.switchView) {
    window.KasirApp.switchView(step.view);
  }

  // Small delay for view DOM rendering
  setTimeout(() => {
    const target = resolveTarget(step);
    if (!target) {
      if (stepIdx < TOUR_STEPS.length - 1) {
        showStep(stepIdx + 1);
      } else {
        closeGuideTour();
      }
      return;
    }

    // Scroll into view if needed
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      renderCard(step, stepIdx);
      updateHighlight(target);
      updateCardPosition(target);
    }, 200);
  }, 100);
}

function handleReposition() {
  if (currentStep < 0 || currentStep >= TOUR_STEPS.length) return;
  const step = TOUR_STEPS[currentStep];
  if (!step) return;

  const target = resolveTarget(step);
  if (target) {
    updateHighlight(target);
    updateCardPosition(target);
  }
}

export function openGuideTour(stepIdx = 0) {
  playClick('pop');
  createTourElements();

  if (overlaySvg) {
    overlaySvg.style.display = 'block';
    overlaySvg.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      if (overlaySvg) overlaySvg.style.opacity = '1';
    });
  }

  window.addEventListener('resize', handleReposition);
  window.addEventListener('scroll', handleReposition, true);

  showStep(stepIdx);
}

export function closeGuideTour() {
  playClick('pop');
  currentStep = -1;

  if (overlaySvg) {
    overlaySvg.style.opacity = '0';
    overlaySvg.style.pointerEvents = 'none';
    setTimeout(() => {
      if (overlaySvg && currentStep === -1) {
        overlaySvg.style.display = 'none';
      }
    }, 300);
  }

  if (glowBox) glowBox.style.display = 'none';
  if (pointerBadge) pointerBadge.style.display = 'none';

  if (cardEl) {
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'translateY(12px)';
    setTimeout(() => {
      if (cardEl && currentStep === -1) {
        cardEl.style.display = 'none';
      }
    }, 300);
  }

  window.removeEventListener('resize', handleReposition);
  window.removeEventListener('scroll', handleReposition, true);

  // Return smoothly to POS Kasir view so user is ready to make orders
  if (window.KasirApp && window.KasirApp.switchView) {
    window.KasirApp.switchView('pos');
  }
}

export function nextTourStep() {
  playClick('tap');
  if (currentStep < TOUR_STEPS.length - 1) {
    showStep(currentStep + 1);
  } else {
    closeGuideTour();
  }
}

export function prevTourStep() {
  playClick('tap');
  if (currentStep > 0) {
    showStep(currentStep - 1);
  }
}

export function goToTourStep(idx) {
  playClick('tap');
  if (idx >= 0 && idx < TOUR_STEPS.length) {
    showStep(idx);
  }
}
