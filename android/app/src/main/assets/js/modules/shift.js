/**
 * Kasir Mami - Module Manajemen Shift & Rekap Tutup Kasir (Z-Report)
 * Mencatat modal kas awal, rekonsiliasi kas fisik vs sistem, dan cetak struk Laporan Z
 */

import { state, saveActiveShift, saveShifts } from '../state.js';
import { formatRp, formatDateShort, escapeHtml, showToast, playClick, playSuccessChime, showConfirmDialog } from '../utils.js';
import { syncSaveShift } from '../firebase.js';
import { printShiftZReport } from './printer.js';

/**
 * Format string tanggal & jam ringkas untuk struk / UI
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Hitung durasi dalam format jam dan menit
 */
function calculateDuration(startIso, endIso) {
  if (!startIso) return '-';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMinutes = Math.max(0, Math.floor((end - start) / (1000 * 60)));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours === 0) return `${mins} Menit`;
  return `${hours} Jam ${mins} Menit`;
}

/**
 * Inisialisasi status Shift saat aplikasi dimuat
 */
export function initShift() {
  updateShiftHeaderUI();
}

export function getActiveShift() {
  return state.activeShift;
}

/**
 * Update tampilan badge indikator shift di header (Desktop & Mobile)
 */
export function updateShiftHeaderUI() {
  const desktopBadge = document.getElementById('headerShiftStatusBadge');
  const desktopDot = document.getElementById('headerShiftDot');
  const desktopText = document.getElementById('headerShiftText');

  const mobileDot = document.getElementById('mobileHeaderShiftDot');
  const railShiftDot = document.getElementById('railShiftDot');

  const active = state.activeShift;

  if (active && active.status === 'open') {
    if (desktopBadge) {
      desktopBadge.className = 'hidden';
      desktopBadge.title = `Shift Aktif: ${active.cashierName} (Mulai: ${formatDateTime(active.startTime)}). Klik untuk Tutup Shift / Laporan Z.`;
    }
    if (desktopDot) {
      desktopDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs animate-pulse';
    }
    if (railShiftDot) {
      railShiftDot.classList.remove('hidden');
      railShiftDot.className = 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white animate-pulse';
    }
    if (desktopText) {
      desktopText.innerText = `Shift: ${active.cashierName}`;
    }
    if (mobileDot) {
      mobileDot.classList.remove('hidden');
      mobileDot.className = 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    }
  } else {
    if (desktopBadge) {
      desktopBadge.className = 'hidden';
      desktopBadge.title = 'Shift belum dibuka. Klik untuk Mulai Shift Kasir.';
    }
    if (desktopDot) {
      desktopDot.className = 'w-2 h-2 rounded-full bg-stone-400 shrink-0';
    }
    if (railShiftDot) {
      railShiftDot.classList.add('hidden');
    }
    if (desktopText) {
      desktopText.innerText = 'Buka Shift';
    }
    if (mobileDot) {
      mobileDot.classList.add('hidden');
    }
  }
}

/**
 * Handle klik pada tombol Shift di header
 */
export function handleShiftHeaderClick() {
  playClick('pop');
  if (state.activeShift && state.activeShift.status === 'open') {
    openCloseShiftModal();
  } else {
    openStartShiftModal();
  }
}

/**
 * Buka modal Buka Shift Baru
 */
export function openStartShiftModal() {
  playClick('pop');
  const modal = document.getElementById('startShiftModal');
  const cashierInput = document.getElementById('startShiftCashierName');
  const initialCashInput = document.getElementById('startShiftInitialCash');

  const defaultCashier = state.printerConfig?.cashierName || state.auth?.ownerName || 'Kasir';
  if (cashierInput) cashierInput.value = defaultCashier;
  if (initialCashInput) initialCashInput.value = '';

  if (modal) modal.classList.remove('hidden');
}

export function closeStartShiftModal() {
  playClick('pop');
  const modal = document.getElementById('startShiftModal');
  if (modal) modal.classList.add('hidden');
}

export function setQuickStartCash(amount) {
  playClick('tap');
  const input = document.getElementById('startShiftInitialCash');
  if (input) input.value = amount;
}

/**
 * Konfirmasi Buka Shift Baru (tolak buka ganda — shift lama wajib ditutup dulu)
 */
export function submitStartShift() {
  const cashierInput = document.getElementById('startShiftCashierName');
  const initialCashInput = document.getElementById('startShiftInitialCash');

  if (state.activeShift && state.activeShift.status === 'open') {
    playClick('error');
    showToast(`Shift ${state.activeShift.cashierName || ''} masih terbuka. Tutup dulu sebelum buka baru.`, 'warning', 4000);
    closeStartShiftModal();
    openCloseShiftModal();
    return;
  }

  const cashierName = (cashierInput?.value || '').trim() || state.auth?.ownerName || 'Kasir';
  const initialCash = Math.max(0, parseInt(initialCashInput?.value || 0, 10) || 0);

  const newShift = {
    id: 'SHIFT-' + Date.now(),
    storeId: state.storeId || 'toko_utama',
    cashierName,
    startTime: new Date().toISOString(),
    endTime: null,
    initialCash,
    status: 'open',
    actualCash: null,
    difference: null,
    closingNotes: '',
    summary: null
  };

  state.activeShift = newShift;
  saveActiveShift();
  syncSaveShift(newShift);
  updateShiftHeaderUI();
  closeStartShiftModal();
  playSuccessChime();

  showToast(`Shift dimulai untuk ${cashierName}. Modal Kas: ${formatRp(initialCash)}`, 'success', 4000);
}

/**
 * Hitung Akumulasi Transaksi & Pengeluaran selama Shift Berjalan
 */
export function calculateShiftSummary(shift = null) {
  const targetShift = shift || state.activeShift;
  if (!targetShift) return null;

  const startTime = new Date(targetShift.startTime);
  const endTime = targetShift.endTime ? new Date(targetShift.endTime) : new Date();

  // Filter transaksi kasir selama shift (void tidak dihitung ke omzet,
  // tapi diringkas terpisah untuk audit Laporan Z)
  const txs = (state.transactions || []).filter(t => {
    if (!t || t.voided || !t.date) return false;
    const d = new Date(t.date);
    return d >= startTime && d <= endTime;
  });

  // Jejak void dalam rentang shift yang sama (audit, bukan omzet)
  const voidTxs = (state.transactions || []).filter(t => {
    if (!t || !t.voided || !t.date) return false;
    const d = new Date(t.date);
    return d >= startTime && d <= endTime;
  });
  const voidCount = voidTxs.length;
  const voidNominal = voidTxs.reduce((s, t) => s + (Number(t.total) || 0), 0);

  const cashSales = txs.filter(t => (t.method || '').toUpperCase() === 'TUNAI').reduce((sum, t) => sum + (t.total || 0), 0);
  const qrisSales = txs.filter(t => (t.method || '').toUpperCase() === 'QRIS').reduce((sum, t) => sum + (t.total || 0), 0);
  const totalSales = cashSales + qrisSales;
  const txCount = txs.length;

  // Filter pengeluaran toko selama shift
  const exps = (state.expenses || []).filter(e => {
    if (!e.date) return false;
    const d = new Date(e.date);
    return d >= startTime && d <= endTime;
  });
  const totalExpenses = exps.reduce((sum, e) => sum + (e.amount || 0), 0);

  const initialCash = Number(targetShift.initialCash || 0);
  const expectedCash = Math.max(0, initialCash + cashSales - totalExpenses);

  const actualCash = (targetShift.actualCash !== null && targetShift.actualCash !== undefined)
    ? Number(targetShift.actualCash)
    : null;

  const difference = actualCash !== null ? (actualCash - expectedCash) : null;

  return {
    shiftId: targetShift.id,
    cashierName: targetShift.cashierName,
    startTime: targetShift.startTime,
    endTime: targetShift.endTime || endTime.toISOString(),
    duration: calculateDuration(targetShift.startTime, targetShift.endTime),
    initialCash,
    cashSales,
    qrisSales,
    totalSales,
    txCount,
    voidCount,
    voidNominal,
    totalExpenses,
    expectedCash,
    actualCash,
    difference,
    closingNotes: targetShift.closingNotes || ''
  };
}

/**
 * Buka Modal Tutup Shift & Audit Uang Kas
 */
export function openCloseShiftModal() {
  playClick('pop');
  const active = state.activeShift;
  if (!active) {
    showToast('Belum ada shift aktif yang dibuka.', 'warning');
    return;
  }

  const summary = calculateShiftSummary(active);
  if (!summary) return;

  const modal = document.getElementById('closeShiftModal');
  const cashierEl = document.getElementById('closeShiftCashier');
  const timeEl = document.getElementById('closeShiftTimeRange');
  const initialCashEl = document.getElementById('closeShiftInitialCash');
  const cashSalesEl = document.getElementById('closeShiftCashSales');
  const qrisSalesEl = document.getElementById('closeShiftQrisSales');
  const expensesEl = document.getElementById('closeShiftExpenses');
  const expectedCashEl = document.getElementById('closeShiftExpectedCash');
  const totalOmsetEl = document.getElementById('closeShiftTotalOmset');
  const txCountEl = document.getElementById('closeShiftTxCount');
  const actualCashInput = document.getElementById('closeShiftActualCash');
  const notesInput = document.getElementById('closeShiftNotes');

  if (cashierEl) cashierEl.innerText = summary.cashierName;
  if (timeEl) timeEl.innerText = `${formatDateTime(summary.startTime)} (${summary.duration})`;
  if (initialCashEl) initialCashEl.innerText = formatRp(summary.initialCash);
  if (cashSalesEl) cashSalesEl.innerText = formatRp(summary.cashSales);
  if (qrisSalesEl) qrisSalesEl.innerText = formatRp(summary.qrisSales);
  if (expensesEl) expensesEl.innerText = '-' + formatRp(summary.totalExpenses);
  if (expectedCashEl) expectedCashEl.innerText = formatRp(summary.expectedCash);
  if (totalOmsetEl) totalOmsetEl.innerText = formatRp(summary.totalSales);
  if (txCountEl) txCountEl.innerText = summary.voidCount > 0
    ? `${summary.txCount} Struk • Void ${summary.voidCount}x (${formatRp(summary.voidNominal)})`
    : `${summary.txCount} Struk Transaksi`;

  if (actualCashInput) {
    // Default isi dengan expected cash agar kasir mudah mencocokkan jika uangnya pas
    actualCashInput.value = summary.expectedCash;
  }
  if (notesInput) notesInput.value = '';

  handleActualCashInput();

  if (modal) modal.classList.remove('hidden');
}

export function closeCloseShiftModal() {
  playClick('pop');
  const modal = document.getElementById('closeShiftModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Live feedback selisih uang fisik vs kas sistem
 */
export function handleActualCashInput() {
  const summary = calculateShiftSummary(state.activeShift);
  if (!summary) return;

  const actualInput = document.getElementById('closeShiftActualCash');
  const diffBadge = document.getElementById('closeShiftDiffBadge');
  const diffValText = document.getElementById('closeShiftDiffValText');

  const rawVal = actualInput ? parseInt(actualInput.value || 0, 10) : 0;
  const actualVal = isNaN(rawVal) ? 0 : rawVal;
  const diff = actualVal - summary.expectedCash;

  if (diffBadge) {
    if (diff === 0) {
      diffBadge.className = 'p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-between shadow-2xs';
      if (diffValText) {
        diffValText.innerHTML = `
          <div class="flex items-center gap-1.5 text-emerald-800 font-black text-sm">
            <span class="material-symbols-rounded text-lg">check_circle</span>
            <span>UANG KAS PAS</span>
          </div>
          <span class="text-xs font-bold text-emerald-700">Tidak ada selisih (Rp 0)</span>
        `;
      }
    } else if (diff > 0) {
      diffBadge.className = 'p-3 rounded-2xl bg-blue-50 border-2 border-blue-300 flex items-center justify-between shadow-2xs';
      if (diffValText) {
        diffValText.innerHTML = `
          <div class="flex items-center gap-1.5 text-blue-800 font-black text-sm">
            <span class="material-symbols-rounded text-lg">trending_up</span>
            <span>LEBIH FISIK (+${formatRp(diff)})</span>
          </div>
          <span class="text-xs font-bold text-blue-700">Uang fisik lebih dari catatan sistem</span>
        `;
      }
    } else {
      diffBadge.className = 'p-3 rounded-2xl bg-rose-50 border-2 border-rose-300 flex items-center justify-between shadow-2xs';
      if (diffValText) {
        diffValText.innerHTML = `
          <div class="flex items-center gap-1.5 text-rose-800 font-black text-sm">
            <span class="material-symbols-rounded text-lg">error</span>
            <span>SELISIH KURANG (${formatRp(diff)})</span>
          </div>
          <span class="text-xs font-bold text-rose-700">Uang fisik kurang ${formatRp(Math.abs(diff))}</span>
        `;
      }
    }
  }
}

/**
 * Cetak Laporan Z Langsung dari Modal Tutup Shift (Sebelum / Sesudah Tutup)
 */
export async function printCurrentShiftZReport() {
  const active = state.activeShift;
  if (!active) {
    showToast('Belum ada shift aktif.', 'warning');
    return;
  }

  const actualInput = document.getElementById('closeShiftActualCash');
  const notesInput = document.getElementById('closeShiftNotes');

  const actualVal = actualInput ? parseInt(actualInput.value || 0, 10) : 0;
  const notes = notesInput ? notesInput.value.trim() : '';

  const summary = calculateShiftSummary(active);
  if (!summary) return;

  summary.actualCash = isNaN(actualVal) ? summary.expectedCash : actualVal;
  summary.difference = summary.actualCash - summary.expectedCash;
  summary.closingNotes = notes;

  await printShiftZReport(summary);
}

/**
 * Finalisasi Tutup Shift Kasir (Simpan Riwayat, Clear Active Shift, Cetak Z-Report)
 */
export async function finalizeCloseShift() {
  playClick('pop');
  const active = state.activeShift;
  if (!active) return;

  const actualInput = document.getElementById('closeShiftActualCash');
  const notesInput = document.getElementById('closeShiftNotes');

  // Wajib isi hitung fisik eksplisit (input kosong = belum dihitung, bukan Rp0).
  const rawActual = actualInput ? String(actualInput.value).trim() : '';
  if (rawActual === '') {
    playClick('error');
    showToast('Hitung dulu uang fisik di laci, lalu isi nominalnya. Tidak boleh kosong.', 'warning', 4000);
    if (actualInput) actualInput.focus();
    return;
  }
  const actualVal = parseInt(rawActual, 10);
  if (isNaN(actualVal) || actualVal < 0) {
    playClick('error');
    showToast('Nominal uang fisik tidak valid.', 'warning');
    return;
  }
  const notes = notesInput ? notesInput.value.trim() : '';

  const summary = calculateShiftSummary(active);
  if (!summary) return;

  summary.actualCash = actualVal;
  summary.difference = summary.actualCash - summary.expectedCash;
  summary.closingNotes = notes;
  summary.endTime = new Date().toISOString();

  // Selisih ≠ 0 wajib dikonfirmasi eksplisit (standar rekonsiliasi kas).
  if (summary.difference !== 0) {
    const ok = await showConfirmDialog({
      title: summary.difference > 0 ? 'Laci Lebih — Tetap Tutup?' : 'Laci Kurang — Tetap Tutup?',
      message: `Selisih ${formatRp(summary.difference)} (fisik ${formatRp(summary.actualCash)} vs sistem ${formatRp(summary.expectedCash)}). Selisih tercatat permanen di Laporan Z. Lanjut tutup shift?`,
      confirmText: 'Ya, Tutup Shift',
      confirmType: summary.difference > 0 ? 'success' : 'danger',
      icon: 'account_balance_wallet'
    });
    if (!ok) return;
  }

  const closedShift = {
    ...active,
    endTime: summary.endTime,
    status: 'closed',
    actualCash: summary.actualCash,
    difference: summary.difference,
    closingNotes: notes,
    summary
  };

  // Simpan ke riwayat shift lokal
  if (!Array.isArray(state.shifts)) state.shifts = [];
  state.shifts.unshift(closedShift);
  saveShifts();

  // Reset shift aktif
  state.activeShift = null;
  saveActiveShift();

  // Sinkronisasi cloud
  syncSaveShift(closedShift);

  updateShiftHeaderUI();
  closeCloseShiftModal();
  playSuccessChime();

  // Auto-Print Z-Report
  await printShiftZReport(summary);

  showToast(`Shift resmi ditutup. Laporan Z untuk ${closedShift.cashierName} telah dicatat!`, 'success', 5000);
}
