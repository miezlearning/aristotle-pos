/**
 * Kasir Mami - Financial Report & Bookkeeping Module
 */

import { state, saveExpenses, saveHistory } from '../state.js';
import { formatRp, formatDateShort, formatDateFull, escapeHtml, showToast, showConfirmDialog, playClick } from '../utils.js';
import { showReceipt } from './payment.js';
import { 
  syncAddExpense, 
  syncDeleteExpense, 
  syncDeleteTransaction, 
  syncClearTodayData, 
  syncClearAllHistory 
} from '../firebase.js';

export function setReportPeriod(period) {
  if (period === 'range' && !state.reportRange) {
    openDatePicker('range');
    return;
  }
  playClick('switch');
  state.currentPeriod = period;
  if (period !== 'range') {
    state.reportRange = null;
  }
  updateReportPeriodUI();
  renderFinancialReport();
  if (currentReportViewMode === 'visual') renderInsights();
}

export function setReportMonth(ymValue) {
  if (!ymValue || !ymValue.includes('-')) return;
  const [y, m] = ymValue.split('-').map(Number);
  if (!y || !m) return;
  const lastDay = new Date(y, m, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  state.reportRange = {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay)}`
  };
  state.currentPeriod = 'range';
  updateReportPeriodUI();
  renderFinancialReport();
  if (currentReportViewMode === 'visual') renderInsights();
}

function fmtRangeShort(from, to) {
  if (!from) return 'Rentang Tanggal';
  const [fy, fm, fd] = from.split('-').map(Number);
  if (!to || from === to) return `${fd} ${MONTH_NAMES[fm - 1]}`;
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${MONTH_NAMES[fm - 1]}`;
  if (fy === ty) return `${fd} ${MONTH_NAMES[fm - 1]} – ${td} ${MONTH_NAMES[tm - 1]}`;
  return `${fd}/${fm} – ${td}/${tm}`;
}

export function updateReportPeriodUI() {
  const activeCls = 'period-btn pl-2.5 pr-3 py-1.5 rounded-full font-black text-xs sm:text-sm bg-stone-900 text-white shadow-sm transition whitespace-nowrap flex items-center gap-1 cursor-pointer';
  const idleCls = 'period-btn pl-2.5 pr-3 py-1.5 rounded-full font-bold text-xs sm:text-sm text-stone-600 hover:text-stone-900 transition whitespace-nowrap flex items-center gap-1 cursor-pointer';

  [['today', 'period-today'], ['month', 'period-month'], ['all', 'period-all']].forEach(([p, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const on = (p === state.currentPeriod);
    btn.className = on ? activeCls : idleCls;
    const check = btn.querySelector('.seg-check');
    if (check) check.classList.toggle('hidden', !on);
  });

  const rangeBtn = document.getElementById('btnReportDateRange');
  const rangeLabel = document.getElementById('reportRangeBtnLabel');
  const rangeIcon = rangeBtn?.querySelector('.material-symbols-rounded');

  if (rangeBtn) {
    const on = state.currentPeriod === 'range' && state.reportRange;
    if (on) {
      rangeBtn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-emerald-700 text-white border-emerald-700 font-black text-xs sm:text-sm shadow-sm transition shrink-0 cursor-pointer';
      if (rangeIcon) rangeIcon.className = 'material-symbols-rounded text-base text-white';
      if (rangeLabel) rangeLabel.innerText = fmtRangeShort(state.reportRange.from, state.reportRange.to);
    } else {
      rangeBtn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-white text-stone-700 border-stone-300 hover:border-stone-400 font-extrabold text-xs sm:text-sm transition shrink-0 shadow-2xs cursor-pointer';
      if (rangeIcon) rangeIcon.className = 'material-symbols-rounded text-base text-emerald-700';
      if (rangeLabel) rangeLabel.innerText = 'Rentang Tanggal';
    }
  }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function getPeriodLabel() {
  if (state.currentPeriod === 'today') return 'Hari Ini';
  if (state.currentPeriod === 'month') return 'Bulan Ini';
  if (state.currentPeriod === 'custom' && state.reportMonth) {
    return `${MONTH_FULL[state.reportMonth.m - 1]} ${state.reportMonth.y}`;
  }
  if (state.currentPeriod === 'range' && state.reportRange) {
    const [fy, fm, fd] = state.reportRange.from.split('-').map(Number);
    const [ty, tm, td] = state.reportRange.to.split('-').map(Number);
    if (state.reportRange.from === state.reportRange.to) return `${fd} ${MONTH_FULL[fm - 1]} ${fy}`;
    if (fy === ty && fm === tm) return `${fd}–${td} ${MONTH_FULL[fm - 1]} ${fy}`;
    if (fy === ty) return `${fd} ${MONTH_FULL[fm - 1]} – ${td} ${MONTH_FULL[tm - 1]} ${fy}`;
    return `${fd} ${MONTH_FULL[fm - 1]} ${fy} – ${td} ${MONTH_FULL[tm - 1]} ${ty}`;
  }
  return 'Semua Periode';
}

export function filterByPeriod(items) {
  const now = new Date();
  return items.filter(item => {
    const itemDate = new Date(item.date);
    if (state.currentPeriod === 'today') {
      return itemDate.toDateString() === now.toDateString();
    } else if (state.currentPeriod === 'month') {
      return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
    } else if (state.currentPeriod === 'custom' && state.reportMonth) {
      return (itemDate.getMonth() + 1) === state.reportMonth.m && itemDate.getFullYear() === state.reportMonth.y;
    } else if (state.currentPeriod === 'range' && state.reportRange) {
      const ymd = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`;
      return ymd >= state.reportRange.from && ymd <= state.reportRange.to;
    }
    return true; // 'all'
  });
}

export function renderReportSkeletons() {
  const txContainer = document.getElementById('transactionHistoryList');
  const expContainer = document.getElementById('expenseHistoryList');
  const skeletonItem = `
    <div class="py-3 flex items-center justify-between gap-3 border-b border-stone-100 animate-pulse">
      <div class="space-y-1.5 flex-1">
        <div class="w-24 h-4 rounded skeleton-shimmer"></div>
        <div class="w-48 h-3 rounded skeleton-shimmer"></div>
      </div>
      <div class="w-8 h-8 rounded-xl skeleton-shimmer shrink-0"></div>
    </div>
  `;
  if (txContainer) txContainer.innerHTML = Array(4).fill(skeletonItem).join('');
  if (expContainer) expContainer.innerHTML = Array(3).fill(skeletonItem).join('');
}

export function renderFinancialReport() {
  const filteredTx = filterByPeriod(state.transactions);
  const filteredExp = filterByPeriod(state.expenses);

  let totalRevenue = 0;
  let totalCash = 0;
  let totalQris = 0;
  const itemSalesCounter = {};

  filteredTx.forEach(tx => {
    totalRevenue += tx.total;
    if (tx.method === 'QRIS') {
      totalQris += tx.total;
    } else {
      totalCash += tx.total;
    }

    tx.items.forEach(i => {
      itemSalesCounter[i.name] = (itemSalesCounter[i.name] || 0) + i.qty;
    });
  });

  let totalExpenses = 0;
  filteredExp.forEach(e => {
    totalExpenses += e.amount;
  });

  const netProfit = totalRevenue - totalExpenses;

  // 1. Update Kartu Metrik
  const revEl = document.getElementById('statTotalRevenue');
  const revSubEl = document.getElementById('statRevenueSub');
  const expEl = document.getElementById('statTotalExpenses');
  const expSubEl = document.getElementById('statExpenseSub');
  const netProfitEl = document.getElementById('statNetProfit');
  const cashEl = document.getElementById('statCashTotal');
  const qrisEl = document.getElementById('statQrisTotal');

  if (revEl) revEl.innerText = formatRp(totalRevenue);
  if (revSubEl) revSubEl.innerText = `${filteredTx.length} Transaksi Selesai`;

  if (expEl) expEl.innerText = formatRp(totalExpenses);
  if (expSubEl) expSubEl.innerText = `${filteredExp.length} Catatan Biaya`;

  if (netProfitEl) {
    netProfitEl.innerText = formatRp(netProfit);
    netProfitEl.className = netProfit >= 0
      ? 'text-xl sm:text-3xl font-black text-emerald-700 mt-1 truncate'
      : 'text-xl sm:text-3xl font-black text-red-600 mt-1 truncate';
  }

  if (cashEl) cashEl.innerText = formatRp(totalCash);
  if (qrisEl) qrisEl.innerText = formatRp(totalQris);

  // 2. Render Widget Menu Terlaris
  const topList = document.getElementById('topSellingList');
  if (topList) {
    const sortedItems = Object.entries(itemSalesCounter).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (sortedItems.length === 0) {
      topList.innerHTML = `<div class="col-span-full text-center text-stone-400 text-xs py-2 font-bold">Belum ada penjualan menu pada periode ini</div>`;
    } else {
      topList.innerHTML = sortedItems.map(([name, qty], idx) => `
        <div class="bg-emerald-50/80 border border-emerald-300/80 p-2 rounded-xl flex items-center justify-between shadow-sm">
          <div class="truncate">
            <span class="text-[10px] font-black text-emerald-900">#${idx + 1}</span>
            <p class="font-extrabold text-stone-800 text-xs truncate">${escapeHtml(name)}</p>
          </div>
          <span class="px-2 py-0.5 bg-emerald-300 text-stone-900 font-black text-xs rounded-lg">${qty}x</span>
        </div>
      `).join('');
    }
  }

  // 3. Render Riwayat Penjualan dengan Tombol Cetak & Hapus Satuan
  const txContainer = document.getElementById('txHistoryCardList');
  if (txContainer) {
    if (filteredTx.length === 0) {
      txContainer.innerHTML = `<div class="py-6 text-center text-stone-400 font-bold text-xs">Belum ada transaksi penjualan di periode ini</div>`;
    } else {
      txContainer.innerHTML = filteredTx.map(tx => {
        const dateStr = formatDateShort(tx.date);
        const summaryItems = tx.items.map(i => `${i.qty}x ${escapeHtml(i.name)}`).join(', ');

        return `
          <div class="py-2.5 flex items-center justify-between gap-1.5 hover:bg-stone-50 transition border-b border-stone-100 last:border-0">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-black text-stone-900 text-xs sm:text-sm">${formatRp(tx.total)}</span>
                <span class="text-[10px] text-stone-500 font-bold">${dateStr}</span>
                <span class="text-[9px] ${tx.method === 'QRIS' ? 'bg-emerald-100 text-emerald-900 font-black' : 'bg-stone-100 text-stone-800 font-black'} px-1.5 py-0.2 rounded">${tx.method || 'TUNAI'}</span>
              </div>
              <p class="text-[11px] text-stone-600 truncate mt-0.5">${summaryItems}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick='window.KasirApp.reprintTx("${tx.id}")' class="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold transition touch-target-large" title="Lihat / Cetak Struk">
                <span class="material-symbols-rounded text-base">receipt</span>
              </button>
              <button onclick='window.KasirApp.deleteTransaction("${tx.id}")' class="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold transition touch-target-large" title="Hapus transaksi ini (koreksi kesalahan input)">
                <span class="material-symbols-rounded text-base">delete</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Render Riwayat Pengeluaran
  const expContainer = document.getElementById('expenseHistoryList');
  if (expContainer) {
    if (filteredExp.length === 0) {
      expContainer.innerHTML = `<div class="py-6 text-center text-stone-400 font-bold text-xs">Belum ada catatan pengeluaran di periode ini</div>`;
    } else {
      expContainer.innerHTML = filteredExp.map(exp => {
        const dateStr = formatDateShort(exp.date);
        return `
          <div class="py-2.5 flex items-center justify-between gap-1.5 hover:bg-stone-50 transition border-b border-stone-100 last:border-0">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-black text-red-600 text-xs sm:text-sm">- ${formatRp(exp.amount)}</span>
                <span class="text-[10px] text-stone-500 font-bold">${dateStr}</span>
              </div>
              <p class="text-[11px] font-bold text-stone-700 truncate mt-0.5">${escapeHtml(exp.name)} <span class="text-[10px] text-stone-400 font-normal">(${escapeHtml(exp.category)})</span></p>
            </div>
            <button onclick="window.KasirApp.deleteExpense('${exp.id}')" class="p-1.5 rounded-xl text-red-500 hover:bg-red-50 font-bold transition touch-target-large" title="Hapus catatan">
              <span class="material-symbols-rounded text-base">delete</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // Saran selalu segar di semua tab (kartu di level halaman)
  renderSaran();

  // Live update visual insights if currently viewing visual mode
  if (currentReportViewMode === 'visual') {
    renderInsights();
  }
}

export function reprintTx(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (tx) {
    showReceipt(tx);
  }
}

/**
 * HAPUS DATA HARI INI (Transaksi Penjualan & Pengeluaran Hari Ini Saja)
 */
export async function clearTodayData() {
  const now = new Date();
  const todayStr = now.toDateString();

  const todayTxCount = state.transactions.filter(t => new Date(t.date).toDateString() === todayStr).length;
  const todayExpCount = state.expenses.filter(e => new Date(e.date).toDateString() === todayStr).length;

  if (todayTxCount === 0 && todayExpCount === 0) {
    showToast('Tidak ada catatan transaksi penjualan atau pengeluaran pada hari ini.', 'info');
    return;
  }

  const ok = await showConfirmDialog({
    title: 'Hapus Data Hari Ini?',
    message: `Hapus ${todayTxCount} transaksi penjualan & ${todayExpCount} pengeluaran hari ini? (Data hari kemarin tetap aman tersimpan).`,
    confirmText: 'Hapus Data Hari Ini',
    confirmType: 'danger',
    icon: 'delete_sweep'
  });

  if (ok) {
    state.transactions = state.transactions.filter(t => new Date(t.date).toDateString() !== todayStr);
    state.expenses = state.expenses.filter(e => new Date(e.date).toDateString() !== todayStr);
    saveHistory();
    saveExpenses();
    syncClearTodayData();
    renderFinancialReport();
    showToast('Data penjualan dan pengeluaran hari ini berhasil dihapus.', 'success');
  }
}

/**
 * HAPUS SATU TRANSAKSI SPESIFIK (Untuk koreksi jika salah input)
 */
export async function deleteTransaction(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;

  const itemSummary = tx.items.map(i => `${i.qty}x ${i.name}`).join(', ');
  const ok = await showConfirmDialog({
    title: 'Hapus Transaksi Penjualan',
    message: `Hapus transaksi ${tx.orderName || 'Pesanan'} senilai ${formatRp(tx.total)} (${itemSummary})?`,
    confirmText: 'Hapus Transaksi',
    confirmType: 'danger',
    icon: 'delete'
  });

  if (ok) {
    state.transactions = state.transactions.filter(t => t.id !== txId);
    saveHistory();
    syncDeleteTransaction(txId);
    renderFinancialReport();
    showToast('Catatan transaksi berhasil dihapus.', 'info');
  }
}

// ================= EXPENSE FORM MODAL =================
export function openExpenseModal() {
  playClick('pop');
  const nameEl = document.getElementById('expName');
  const amountEl = document.getElementById('expAmount');
  const modal = document.getElementById('expenseModal');

  if (nameEl) nameEl.value = '';
  if (amountEl) amountEl.value = '';
  if (modal) modal.classList.remove('hidden');
}

export function closeExpenseModal() {
  playClick('pop');
  const modal = document.getElementById('expenseModal');
  if (modal) modal.classList.add('hidden');
}

export function saveExpense(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('expName').value.trim();
  const amount = parseInt(document.getElementById('expAmount').value, 10);
  const category = document.getElementById('expCategory').value;

  if (!name || isNaN(amount) || amount <= 0) return;

  const newExp = {
    id: 'exp_' + Date.now(),
    date: new Date().toISOString(),
    name,
    amount,
    category
  };

  state.expenses.unshift(newExp);

  saveExpenses();
  syncAddExpense(newExp);
  closeExpenseModal();
  renderFinancialReport();
}

export async function deleteExpense(id) {
  const exp = state.expenses.find(e => e.id === id);
  const expName = exp ? `${exp.name} (${formatRp(exp.amount)})` : 'ini';
  const ok = await showConfirmDialog({
    title: 'Hapus Catatan Pengeluaran',
    message: `Hapus catatan pengeluaran ${expName}?`,
    confirmText: 'Hapus Biaya',
    confirmType: 'danger',
    icon: 'delete'
  });
  if (ok) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveExpenses();
    syncDeleteExpense(id);
    renderFinancialReport();
    showToast('Catatan pengeluaran berhasil dihapus.', 'info');
  }
}

// ================= SHARE WHATSAPP & EXPORT CSV =================
export function shareReportWhatsApp() {
  const filteredTx = filterByPeriod(state.transactions);
  const filteredExp = filterByPeriod(state.expenses);

  let totalRevenue = 0;
  let totalCash = 0;
  let totalQris = 0;
  filteredTx.forEach(t => {
    totalRevenue += t.total;
    if (t.method === 'QRIS') totalQris += t.total;
    else totalCash += t.total;
  });

  let totalExpenses = 0;
  filteredExp.forEach(e => {
    totalExpenses += e.amount;
  });

  const netProfit = totalRevenue - totalExpenses;
  const periodLabel = getPeriodLabel();
  const storeName = state.storeProfile?.name || 'Kasir UMKM';

  const message = `*REKAP LAPORAN PENJUALAN - ${storeName.toUpperCase()}*
Periode: ${periodLabel} (${formatDateFull(new Date())})

*Pemasukan (Omset)*: ${formatRp(totalRevenue)} (${filteredTx.length} Transaksi)
   • Tunai di Laci: ${formatRp(totalCash)}
   • QRIS / Transfer: ${formatRp(totalQris)}

*Total Pengeluaran*: ${formatRp(totalExpenses)}
*LABA BERSIH (UNTUNG)*: ${formatRp(netProfit)}

_Dibuat otomatis oleh Aristotle POS_
_Layanan & Bantuan: 081345028895_`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
}

export function exportReportCSV() {
  const filteredTx = filterByPeriod(state.transactions);
  if (filteredTx.length === 0) {
    showToast('Tidak ada data transaksi untuk diekspor!', 'warning');
    return;
  }

  const storeSlug = (state.storeProfile?.name || 'Toko').replace(/[^a-zA-Z0-9]/g, '_');
  let csv = 'ID Transaksi,Tanggal,Nama Pesanan,Metode,Total,Uang Masuk,Kembalian,Menu Item\n';
  filteredTx.forEach(t => {
    const itemStr = t.items.map(i => `${i.qty}x ${i.name}`).join(' | ').replace(/,/g, ' ');
    csv += `"${t.id}","${t.date}","${t.orderName || 'Kasir'}","${t.method || 'TUNAI'}","${t.total}","${t.cashGiven}","${t.change}","${itemStr}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Laporan_${storeSlug}_AristotlePOS_${Date.now()}.csv`;
  link.click();
  link.remove();
  showToast('File Excel CSV berhasil diunduh!', 'success');
}

export function clearTransactionHistory() {
  clearAllHistory();
}

export async function clearAllHistory() {
  if (state.transactions.length === 0 && state.expenses.length === 0) {
    showToast('Riwayat transaksi dan pengeluaran sudah kosong.', 'info');
    return;
  }
  const ok = await showConfirmDialog({
    title: 'Hapus Seluruh Riwayat',
    message: 'PERINGATAN: Hapus SELURUH riwayat transaksi penjualan & pengeluaran untuk semua periode? Data tidak dapat dipulihkan kembali.',
    confirmText: 'Hapus Seluruh Data',
    confirmType: 'danger',
    icon: 'warning'
  });
  if (ok) {
    state.transactions = [];
    state.expenses = [];
    saveHistory();
    saveExpenses();
    syncClearAllHistory();
    renderFinancialReport();
    showToast('Seluruh riwayat penjualan & pengeluaran telah dikosongkan.', 'success');
  }
}

// ================= GRAFIK USAHA (VISUALISASI KEPUTUSAN BISNIS, TANPA LIB) =================
export let currentReportViewMode = 'data';

export function updateReportToggleUI(mode = currentReportViewMode) {
  const btnData = document.getElementById('tabBtnReportData');
  const btnVisual = document.getElementById('tabBtnReportVisual');
  const slider = document.getElementById('reportToggleSlider');

  const isVisual = mode === 'visual';
  if (btnData) {
    btnData.className = isVisual
      ? 'relative z-10 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors duration-200 text-stone-500 hover:text-stone-800 cursor-pointer'
      : 'relative z-10 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors duration-200 text-stone-900 cursor-pointer';
  }
  if (btnVisual) {
    btnVisual.className = isVisual
      ? 'relative z-10 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors duration-200 text-stone-900 cursor-pointer'
      : 'relative z-10 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors duration-200 text-stone-500 hover:text-stone-800 cursor-pointer';
  }

  if (slider) {
    const targetBtn = isVisual ? btnVisual : btnData;
    if (targetBtn && targetBtn.offsetWidth > 0) {
      slider.style.left = `${targetBtn.offsetLeft}px`;
      slider.style.width = `${targetBtn.offsetWidth}px`;
    } else {
      slider.style.left = isVisual ? 'calc(50% + 2px)' : '4px';
      slider.style.width = 'calc(50% - 6px)';
    }
  }
}

export function switchReportViewMode(mode = 'data') {
  playClick('tap');
  currentReportViewMode = mode;

  updateReportToggleUI(mode);

  const viewData = document.getElementById('reportDataView');
  const viewVisual = document.getElementById('reportVisualView');

  if (mode === 'visual') {
    if (viewData) {
      viewData.classList.add('hidden');
      viewData.classList.remove('report-slide-left');
    }
    if (viewVisual) {
      viewVisual.classList.remove('hidden');
      viewVisual.classList.add('report-slide-right');
    }
    renderInsights();
  } else {
    if (viewVisual) {
      viewVisual.classList.add('hidden');
      viewVisual.classList.remove('report-slide-right');
    }
    if (viewData) {
      viewData.classList.remove('hidden');
      viewData.classList.add('report-slide-left');
    }
    renderFinancialReport();
  }
}

export function openInsightModal() {
  switchReportViewMode('visual');
}

export function closeInsightModal() {
  switchReportViewMode('data');
}

function barRow(label, valueText, pct, colorClass, tipText) {
  const w = Math.max(2, Math.min(100, Math.round(pct)));
  const tip = tipText || `${label}: ${valueText}`;
  return `
    <div class="group flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-stone-50 transition cursor-default" title="${escapeHtml(tip)}">
      <span class="w-24 shrink-0 truncate font-bold text-stone-600">${escapeHtml(label)}</span>
      <div class="flex-1 h-2.5 rounded-full bg-stone-100 overflow-hidden">
        <div class="h-full rounded-full ${colorClass} group-hover:brightness-95 transition" style="width:${w}%"></div>
      </div>
      <span class="w-24 shrink-0 text-right font-black text-stone-800 tabular-nums truncate">${escapeHtml(valueText)}</span>
    </div>`;
}

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function shortRp(v) {
  v = Math.round(v || 0);
  if (v >= 1000000) {
    const jt = v / 1000000;
    return (Number.isInteger(jt) ? String(jt) : jt.toFixed(1).replace('.', ',')) + 'jt';
  }
  if (v >= 1000) {
    const rb = v / 1000;
    return (Number.isInteger(rb) ? String(rb) : rb.toFixed(1).replace('.', ',')) + 'rb';
  }
  return String(v);
}

export function showInsightDayDetail(idx) {
  const days = window.__insightDaily || [];
  const d = days[idx];
  const el = document.getElementById('insightDayDetail');
  if (!d || !el) return;
  el.innerText = `${d.full}: ${formatRp(d.total)} • ${d.count} struk`;
}

export function setInsightRange(n) {
  playClick('tap');
  window.__insightRangeDays = [7, 14, 30].includes(n) ? n : 14;
  renderInsights();
}

function ensureChartTip() {
  let el = document.getElementById('chartTip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chartTip';
    el.className = 'fixed hidden z-[100] pointer-events-none whitespace-nowrap rounded-xl bg-stone-900 px-3 py-1.5 text-[11px] leading-tight font-bold text-white shadow-2xl text-center';
    document.body.appendChild(el);
  }
  return el;
}

export function showDayTip(e, idx) {
  const d = (window.__insightDaily || [])[idx];
  if (!d) return;
  const el = ensureChartTip();
  el.innerHTML = `${escapeHtml(d.full)}<br><span class="text-emerald-300 tabular-nums">${escapeHtml(formatRp(d.total))}</span><span class="text-stone-300"> • ${d.count} struk</span>`;
  el.classList.remove('hidden');
  moveDayTip(e);
  showInsightDayDetail(idx);
}

export function moveDayTip(e) {
  const el = document.getElementById('chartTip');
  if (!el || el.classList.contains('hidden') || !e) return;
  const pad = 8;
  const r = el.getBoundingClientRect();
  let x = (e.clientX || 0) - r.width / 2;
  let y = (e.clientY || 0) - r.height - 14;
  x = Math.max(pad, Math.min(window.innerWidth - r.width - pad, x));
  if (y < pad) y = (e.clientY || 0) + 18;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

export function hideDayTip() {
  const el = document.getElementById('chartTip');
  if (el) el.classList.add('hidden');
}

// ================= KALENDER M3 CUSTOM (DIALOG TENGAH, ID) =================
// Kalender bawaan browser tidak mengikuti Material 3 dan sering kepotong di
// dalam strip geser, jadi field Bulan/Dari/Sampai memakai dialog ini.
let m3Cal = null;

const M3_WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DAY_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function m3ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function m3fmtFull(ymd) {
  const [y, m, d] = (ymd || '').split('-').map(Number);
  if (!y || !m || !d) return '–';
  const wd = DAY_FULL[new Date(y, m - 1, d).getDay()];
  return `${wd}, ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function m3fmtShort(ymd) {
  const [y, m, d] = (ymd || '').split('-').map(Number);
  if (!y || !m || !d) return '–';
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

function ensureM3Cal() {
  let ov = document.getElementById('m3CalOverlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'm3CalOverlay';
  ov.className = 'fixed inset-0 z-[110] hidden items-center justify-center bg-black/50 p-4';
  ov.innerHTML = `
    <div class="w-[min(94vw,370px)] rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col border border-stone-200" role="dialog" aria-modal="true" aria-label="Pilih Rentang Tanggal">
      <!-- Header -->
      <div class="px-5 pt-4 pb-2 border-b border-stone-100 bg-stone-50/60">
        <div class="flex items-center justify-between">
          <span id="m3CalKicker" class="text-[11px] font-black uppercase tracking-wider text-emerald-700">Pilih Rentang Tanggal</span>
          <button type="button" id="m3CalClose" class="w-7 h-7 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 flex items-center justify-center transition cursor-pointer">
            <span class="material-symbols-rounded text-base">close</span>
          </button>
        </div>
        <h3 id="m3CalHeadline" class="text-base sm:text-lg leading-tight font-black text-stone-900 mt-1">Pilih tanggal awal & akhir</h3>
      </div>

      <!-- Quick Presets -->
      <div class="px-3 py-2 border-b border-stone-100 flex items-center gap-1.5 overflow-x-auto custom-scroll bg-stone-50/80 shrink-0">
        <button type="button" data-preset="today" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-2xs whitespace-nowrap cursor-pointer">Hari Ini</button>
        <button type="button" data-preset="yesterday" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-2xs whitespace-nowrap cursor-pointer">Kemarin</button>
        <button type="button" data-preset="7days" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-2xs whitespace-nowrap cursor-pointer">7 Hari</button>
        <button type="button" data-preset="30days" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-2xs whitespace-nowrap cursor-pointer">30 Hari</button>
        <button type="button" data-preset="thisMonth" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 shadow-2xs whitespace-nowrap cursor-pointer">Bulan Ini</button>
      </div>

      <!-- Month Navigation -->
      <div class="px-4 pt-3 pb-1 flex items-center justify-between">
        <button type="button" id="m3CalPrev" class="w-9 h-9 rounded-full hover:bg-stone-100 text-stone-700 flex items-center justify-center transition cursor-pointer" title="Bulan Sebelumnya">
          <span class="material-symbols-rounded">chevron_left</span>
        </button>
        <button type="button" id="m3CalTitle" class="text-sm font-black text-stone-900 px-3 h-9 rounded-xl hover:bg-stone-100 transition flex items-center gap-1 cursor-pointer" title="Pilih Bulan / Tahun">
          <span id="m3CalTitleText">–</span>
          <span class="material-symbols-rounded text-base text-stone-400">arrow_drop_down</span>
        </button>
        <button type="button" id="m3CalNext" class="w-9 h-9 rounded-full hover:bg-stone-100 text-stone-700 flex items-center justify-center transition cursor-pointer" title="Bulan Berikutnya">
          <span class="material-symbols-rounded">chevron_right</span>
        </button>
      </div>

      <!-- Calendar Body -->
      <div class="px-4 pb-3 min-h-[260px] flex flex-col justify-center">
        <div id="m3CalWeekRow" class="grid grid-cols-7 text-center text-[11px] font-bold text-stone-400 mb-1">
          <span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span>
        </div>
        <div id="m3CalGrid" class="grid grid-cols-7 gap-y-0.5"></div>
        <div id="m3CalMonthGrid" class="hidden grid-cols-3 gap-2 py-2"></div>
      </div>

      <!-- Footer Buttons -->
      <div class="px-4 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
        <button type="button" id="m3CalClear" class="px-3 h-9 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition cursor-pointer">Reset</button>
        <div class="flex gap-2">
          <button type="button" id="m3CalCancel" class="px-3.5 h-9 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-200 transition cursor-pointer">Batal</button>
          <button type="button" id="m3CalOk" class="px-5 h-9 rounded-xl text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition cursor-pointer">Terapkan</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeM3Cal(); });
  ov.querySelector('#m3CalClose').onclick = () => closeM3Cal();
  ov.querySelector('#m3CalPrev').onclick = () => shiftM3Cal(-1);
  ov.querySelector('#m3CalNext').onclick = () => shiftM3Cal(1);
  ov.querySelector('#m3CalTitle').onclick = () => {
    if (m3Cal) {
      m3Cal.pickMonth = !m3Cal.pickMonth;
      renderM3Cal();
    }
  };
  ov.querySelector('#m3CalCancel').onclick = () => closeM3Cal();
  ov.querySelector('#m3CalClear').onclick = () => clearM3Cal();
  ov.querySelector('#m3CalOk').onclick = () => confirmM3Cal();

  // Presets
  ov.querySelectorAll('[data-preset]').forEach(btn => {
    btn.onclick = () => {
      applyRangePreset(btn.getAttribute('data-preset'));
    };
  });

  // Day click
  ov.querySelector('#m3CalGrid').onclick = (e) => {
    const btn = e.target.closest('[data-ymd]');
    if (!btn || !m3Cal) return;
    pickM3Day(btn.getAttribute('data-ymd'));
  };

  // Month select click
  ov.querySelector('#m3CalMonthGrid').onclick = (e) => {
    const btn = e.target.closest('[data-mi]');
    if (!btn || !m3Cal) return;
    const mi = Number(btn.getAttribute('data-mi'));
    m3Cal.m = mi;
    m3Cal.pickMonth = false;
    renderM3Cal();
  };

  return ov;
}

export function openDatePicker(mode = 'range') {
  playClick('tap');
  ensureM3Cal();
  const now = new Date();
  const r = (state.currentPeriod === 'range') ? state.reportRange : null;

  let fy = now.getFullYear();
  let fm = now.getMonth();
  if (r && r.from) {
    const [y, m] = r.from.split('-').map(Number);
    fy = y;
    fm = m - 1;
  }

  m3Cal = {
    mode: 'range',
    pickMonth: false,
    y: fy,
    m: fm,
    from: r ? r.from : null,
    to: r ? r.to : null
  };

  const ov = document.getElementById('m3CalOverlay');
  if (ov) {
    ov.classList.remove('hidden');
    ov.classList.add('flex');
  }
  renderM3Cal();
}

export function closeM3Cal() {
  const ov = document.getElementById('m3CalOverlay');
  if (!ov) return;
  ov.classList.add('hidden');
  ov.classList.remove('flex');
}

function shiftM3Cal(dir) {
  if (!m3Cal) return;
  playClick('tap');
  if (m3Cal.pickMonth) {
    m3Cal.y += dir;
  } else {
    m3Cal.m += dir;
    if (m3Cal.m < 0) { m3Cal.m = 11; m3Cal.y -= 1; }
    if (m3Cal.m > 11) { m3Cal.m = 0; m3Cal.y += 1; }
  }
  renderM3Cal();
}

export function applyRangePreset(preset) {
  playClick('tap');
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let fromStr = '';
  let toStr = fmt(now);

  if (preset === 'today') {
    fromStr = toStr;
  } else if (preset === 'yesterday') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    fromStr = fmt(y);
    toStr = fromStr;
  } else if (preset === '7days') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    fromStr = fmt(d);
  } else if (preset === '30days') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    fromStr = fmt(d);
  } else if (preset === 'thisMonth') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    fromStr = fmt(d);
  }

  if (m3Cal) {
    m3Cal.from = fromStr;
    m3Cal.to = toStr;
    const [fy, fm] = fromStr.split('-').map(Number);
    m3Cal.y = fy;
    m3Cal.m = fm - 1;
    m3Cal.pickMonth = false;
    renderM3Cal();
  }
}

function pickM3Day(ymd) {
  playClick('tap');
  if (!m3Cal) return;
  if (!m3Cal.from || (m3Cal.from && m3Cal.to)) {
    m3Cal.from = ymd;
    m3Cal.to = null;
  } else {
    if (ymd < m3Cal.from) {
      m3Cal.to = m3Cal.from;
      m3Cal.from = ymd;
    } else {
      m3Cal.to = ymd;
    }
  }
  renderM3Cal();
}

function clearM3Cal() {
  playClick('tap');
  if (m3Cal) {
    m3Cal.from = null;
    m3Cal.to = null;
  }
  closeM3Cal();
  state.reportRange = null;
  setReportPeriod('today');
}

function confirmM3Cal() {
  if (!m3Cal || !m3Cal.from) return;
  playClick('tap');
  const from = m3Cal.from;
  const to = m3Cal.to || m3Cal.from;

  closeM3Cal();
  state.reportRange = { from, to };
  state.currentPeriod = 'range';

  updateReportPeriodUI();
  renderFinancialReport();
  if (currentReportViewMode === 'visual') renderInsights();
}

function renderM3Cal() {
  if (!m3Cal) return;
  const ov = ensureM3Cal();

  const headline = ov.querySelector('#m3CalHeadline');
  const titleText = ov.querySelector('#m3CalTitleText');
  const weekRow = ov.querySelector('#m3CalWeekRow');
  const grid = ov.querySelector('#m3CalGrid');
  const mgrid = ov.querySelector('#m3CalMonthGrid');
  const okBtn = ov.querySelector('#m3CalOk');

  if (titleText) {
    titleText.innerText = m3Cal.pickMonth ? String(m3Cal.y) : `${MONTH_FULL[m3Cal.m]} ${m3Cal.y}`;
  }

  if (headline) {
    if (m3Cal.from && m3Cal.to && m3Cal.from !== m3Cal.to) {
      headline.innerText = `${m3fmtShort(m3Cal.from)} – ${m3fmtShort(m3Cal.to)}`;
    } else if (m3Cal.from && m3Cal.to && m3Cal.from === m3Cal.to) {
      headline.innerText = m3fmtFull(m3Cal.from);
    } else if (m3Cal.from) {
      headline.innerText = `${m3fmtShort(m3Cal.from)} – Pilih tanggal akhir`;
    } else {
      headline.innerText = 'Pilih tanggal awal & akhir';
    }
  }

  if (m3Cal.pickMonth) {
    if (weekRow) weekRow.classList.add('hidden');
    if (grid) {
      grid.classList.add('hidden');
      grid.classList.remove('grid');
    }
    if (mgrid) {
      mgrid.className = 'grid grid-cols-3 gap-2 py-3 px-1';
      mgrid.innerHTML = MONTH_NAMES.map((n, mi) => {
        const on = m3Cal.m === mi;
        return `<button type="button" data-mi="${mi}"
          class="h-11 rounded-2xl text-xs font-black transition cursor-pointer ${on ? 'bg-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}">${n}</button>`;
      }).join('');
    }
  } else {
    if (mgrid) {
      mgrid.classList.add('hidden');
      mgrid.classList.remove('grid');
    }
    if (weekRow) weekRow.classList.remove('hidden');
    if (grid) {
      grid.className = 'grid grid-cols-7 gap-y-0.5';
      const today = new Date();
      const tStr = m3ymd(today.getFullYear(), today.getMonth(), today.getDate());
      const first = new Date(m3Cal.y, m3Cal.m, 1);
      const offset = first.getDay();
      let html = '';
      for (let i = 0; i < 42; i++) {
        const dt = new Date(m3Cal.y, m3Cal.m, 1 - offset + i);
        const ymd = m3ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const inMonth = dt.getMonth() === m3Cal.m;
        const isFrom = m3Cal.from === ymd;
        const isTo = m3Cal.to === ymd;
        const inRange = m3Cal.from && m3Cal.to && ymd > m3Cal.from && ymd < m3Cal.to;
        const isToday = ymd === tStr && !isFrom && !isTo;

        let wrapCls = 'h-9 flex items-center justify-center relative';
        if (inRange) {
          wrapCls += ' bg-emerald-100';
        } else if (isFrom && m3Cal.to && m3Cal.to !== m3Cal.from) {
          wrapCls += ' rounded-l-full bg-emerald-100';
        } else if (isTo && m3Cal.from && m3Cal.to !== m3Cal.from) {
          wrapCls += ' rounded-r-full bg-emerald-100';
        }

        let btnCls = 'w-8 h-8 rounded-full text-xs font-bold transition flex items-center justify-center cursor-pointer';
        if (isFrom || isTo) {
          btnCls += ' bg-emerald-700 text-white font-black shadow-2xs';
        } else if (inRange) {
          btnCls += ' text-emerald-950 font-extrabold hover:bg-emerald-200';
        } else if (isToday) {
          btnCls += ' text-stone-900 font-black ring-1 ring-stone-900 ring-inset hover:bg-stone-100';
        } else if (inMonth) {
          btnCls += ' text-stone-800 hover:bg-stone-100';
        } else {
          btnCls += ' text-stone-300 hover:bg-stone-50';
        }

        html += `<div class="${wrapCls}">
          <button type="button" data-ymd="${ymd}" class="${btnCls}">${dt.getDate()}</button>
        </div>`;
      }
      grid.innerHTML = html;
    }
  }

  if (okBtn) {
    const ok = !!m3Cal.from;
    okBtn.disabled = !ok;
    okBtn.className = 'px-5 h-9 rounded-xl text-xs font-black transition ' +
      (ok ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm cursor-pointer' : 'bg-stone-200 text-stone-400 cursor-not-allowed');
  }
}

// Agregat 12 bulan terakhir: omzet, biaya, jumlah struk per bulan
function monthlyAgg() {
  const arr = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      y: d.getFullYear(), m: d.getMonth(),
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      rev: 0, exp: 0, n: 0
    });
  }
  (state.transactions || []).forEach(t => {
    const dt = new Date(t.date);
    const f = arr.find(a => a.y === dt.getFullYear() && a.m === dt.getMonth());
    if (f) { f.rev += t.total || 0; f.n += 1; }
  });
  (state.expenses || []).forEach(e => {
    const dt = new Date(e.date);
    const f = arr.find(a => a.y === dt.getFullYear() && a.m === dt.getMonth());
    if (f) f.exp += e.amount || 0;
  });
  return arr;
}

export function exportMonthlyCSV() {
  const mAgg = monthlyAgg();
  if (!mAgg.some(a => a.n > 0)) {
    showToast('Belum ada data untuk diunduh', 'warning');
    return;
  }
  const storeSlug = (state.storeProfile?.name || 'Toko').replace(/[^a-zA-Z0-9]/g, '_');
  let csv = 'Bulan,Struk,Omzet,Biaya,Laba\n';
  mAgg.forEach(a => {
    csv += `"${MONTH_FULL[a.m]} ${a.y}",${a.n},${a.rev},${a.exp},${a.rev - a.exp}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Rekap_Bulanan_${storeSlug}_${Date.now()}.csv`;
  link.click();
  link.remove();
  showToast('Rekap bulanan diunduh', 'success');
}

export function renderInsights() {
  const txs = state.transactions || [];
  const exps = state.expenses || [];

  const labelEl = document.getElementById('insightPeriodLabel');
  if (labelEl) {
    const n = txs.length;
    labelEl.innerText = n === 0 ? 'Belum ada data penjualan' : `${n} transaksi dihitung • ${getPeriodLabel()} untuk kartu, grafik pakai semua data`;
  }

  // Ringkasan angka
  let rev = 0, cash = 0, qris = 0;
  txs.forEach(t => {
    rev += t.total || 0;
    if (t.method === 'QRIS') qris += t.total || 0;
    else cash += t.total || 0;
  });
  let expTotal = 0;
  exps.forEach(e => { expTotal += e.amount || 0; });
  const profit = rev - expTotal;
  const avg = txs.length ? Math.round(rev / txs.length) : 0;

  const sumEl = document.getElementById('insightSummary');
  if (sumEl) {
    const card = (t, v, sub) => `
      <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3">
        <p class="text-[11px] font-bold text-stone-500">${t}</p>
        <p class="text-sm sm:text-base font-black text-stone-900 tabular-nums truncate mt-0.5">${v}</p>
        <p class="text-[11px] text-stone-500 mt-0.5">${sub}</p>
      </div>`;
    sumEl.innerHTML =
      card('Total Omzet', formatRp(rev), `${txs.length} struk`) +
      card('Laba Bersih', formatRp(profit), `Biaya ${formatRp(expTotal)}`) +
      card('Rata-rata Struk', formatRp(avg), 'per transaksi') +
      card('QRIS', formatRp(qris), txs.length ? `${Math.round(qris / Math.max(1, rev) * 100)}% dari omzet` : 'belum ada');
  }

  // KPI pertumbuhan & operasional
  const kpiEl = document.getElementById('insightKpi');
  if (kpiEl) {
    const now0 = new Date();
    now0.setHours(0, 0, 0, 0);
    const dayMs = 86400000;
    let last30 = 0, prev30 = 0;
    const dayTot = {};
    txs.forEach(t => {
      const dd = new Date(t.date);
      dd.setHours(0, 0, 0, 0);
      const diff = Math.round((now0 - dd) / dayMs);
      if (diff >= 0 && diff < 30) last30 += t.total || 0;
      else if (diff >= 30 && diff < 60) prev30 += t.total || 0;
      const k = dd.toDateString();
      dayTot[k] = dayTot[k] || { total: 0, n: 0, d: dd };
      dayTot[k].total += t.total || 0;
      dayTot[k].n += 1;
    });
    const days = Object.values(dayTot);
    const bestD = days.slice().sort((a, b) => b.total - a.total)[0];
    let gTxt = '–', gCls = 'text-stone-400', gSub = 'belum ada data';
    if (prev30 > 0) {
      const g = Math.round((last30 - prev30) / prev30 * 100);
      gTxt = (g >= 0 ? '+' : '') + g + '%';
      gCls = g >= 0 ? 'text-emerald-700' : 'text-red-600';
      gSub = 'vs 30 hari sebelumnya';
    } else if (last30 > 0) {
      gSub = '30 hari terakhir';
    }
    const kcard = (t, v, vCls, sub) => `
      <div class="bg-white border border-stone-200 rounded-2xl p-3">
        <p class="text-[11px] font-bold text-stone-500">${t}</p>
        <p class="text-sm sm:text-base font-black tabular-nums truncate mt-0.5 ${vCls}">${v}</p>
        <p class="text-[11px] text-stone-500 mt-0.5 truncate">${sub}</p>
      </div>`;
    kpiEl.innerHTML =
      kcard('Pertumbuhan omzet', gTxt, gCls, gSub) +
      kcard('Hari terbaik', bestD ? formatRp(bestD.total) : '–', bestD ? 'text-stone-900' : 'text-stone-400',
        bestD ? `${bestD.d.getDate()} ${MONTH_NAMES[bestD.d.getMonth()]} • ${bestD.n} struk` : 'belum ada') +
      kcard('Struk per hari', days.length ? (txs.length / days.length).toFixed(1).replace('.', ',') : '–', days.length ? 'text-stone-900' : 'text-stone-400',
        days.length ? `${days.length} hari aktif` : 'belum ada');
  }

  // 1. Omzet harian (rentang 7/14/30 + sumbu Y + tooltip anti-kepotong)
  const dailyEl = document.getElementById('insightDailyChart');
  if (!window.__insightRangeDays) window.__insightRangeDays = 14;
  const rangeDays = window.__insightRangeDays;
  document.querySelectorAll('#insightRangeSeg [data-range]').forEach(b => {
    const on = Number(b.getAttribute('data-range')) === rangeDays;
    b.className = 'px-3 py-1.5 rounded-lg font-black text-xs transition ' + (on ? 'bg-stone-900 text-white shadow-sm' : 'font-bold text-stone-500 hover:text-stone-900');
  });
  if (dailyEl) {
    const days = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toDateString(),
        tgl: d.getDate(),
        mon: d.getMonth(),
        full: `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
        total: 0,
        count: 0
      });
    }
    const map = {};
    days.forEach(d => { map[d.key] = d; });
    txs.forEach(t => {
      const k = new Date(t.date).toDateString();
      if (map[k]) { map[k].total += t.total || 0; map[k].count += 1; }
    });
    window.__insightDaily = days;
    const max = Math.max(0, ...days.map(d => d.total));
    const yEl = document.getElementById('insightDailyY');
    if (yEl) {
      yEl.innerHTML = max <= 0
        ? `<span>–</span><span>–</span><span>0</span>`
        : `<span>${shortRp(max)}</span><span>${shortRp(max / 2)}</span><span>0</span>`;
    }
    if (max <= 0) {
      dailyEl.innerHTML = `<div class="w-full h-28 flex items-center justify-center text-xs font-bold text-stone-400">Belum ada penjualan ${rangeDays} hari terakhir</div>`;
    } else {
      const minW = rangeDays <= 7 ? 'min-w-[44px]' : (rangeDays <= 14 ? 'min-w-[28px]' : 'min-w-[20px]');
      dailyEl.innerHTML = days.map((d, idx) => {
        const h = d.total <= 0 ? 3 : Math.max(8, Math.round(d.total / max * 100));
        const best = d.total === max;
        const xLabel = (rangeDays <= 14)
          ? `${d.tgl} ${MONTH_NAMES[d.mon]}`
          : (d.tgl === 1 ? `1 ${MONTH_NAMES[d.mon]}` : String(d.tgl));
        return `
        <div class="flex-1 ${minW} flex flex-col items-center gap-1 cursor-pointer rounded-md hover:bg-stone-100 transition py-0.5"
          onclick="KasirApp.hideDayTip();KasirApp.showInsightDayDetail(${idx})" onmouseenter="KasirApp.showDayTip(event,${idx})" onmousemove="KasirApp.moveDayTip(event)" onmouseleave="KasirApp.hideDayTip()">
          <div class="w-full flex items-end h-24">
            <div class="w-full rounded-t-md ${d.total <= 0 ? 'bg-stone-200' : (best ? 'bg-emerald-700' : 'bg-emerald-300')} transition" style="height:${h}%"></div>
          </div>
          <span class="text-[9px] leading-tight text-center font-bold ${d.tgl === 1 ? 'text-emerald-800' : 'text-stone-400'}">${xLabel}</span>
        </div>`;
      }).join('');
    }
  }

  // 2. Tren 12 bulan
  const monEl = document.getElementById('insightMonthlyChart');
  let bestMonth = null;
  if (monEl) {
    const arr = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({ y: d.getFullYear(), m: d.getMonth(), label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, total: 0, count: 0 });
    }
    txs.forEach(t => {
      const dt = new Date(t.date);
      const f = arr.find(a => a.y === dt.getFullYear() && a.m === dt.getMonth());
      if (f) { f.total += t.total || 0; f.count += 1; }
    });
    const max = Math.max(1, ...arr.map(a => a.total));
    const tot12 = arr.reduce((s, a) => s + a.total, 0) || 1;
    bestMonth = arr.slice().sort((a, b) => b.total - a.total)[0];
    monEl.innerHTML = arr.map(a => barRow(
      a.label,
      formatRp(a.total),
      a.total / max * 100,
      'bg-emerald-600',
      `${MONTH_FULL[a.m]} ${a.y} — ${formatRp(a.total)} • ${a.count} struk (${Math.round(a.total / tot12 * 100)}% dari 12 bulan)`
    )).join('');
  }

  // 3. Jam ramai (06-21)
  const hourEl = document.getElementById('insightHourlyChart');
  let bestHour = null;
  if (hourEl) {
    const buckets = [];
    for (let h = 6; h <= 21; h++) buckets.push({ h, n: 0, rp: 0 });
    txs.forEach(t => {
      const hh = new Date(t.date).getHours();
      const b = buckets.find(x => x.h === hh);
      if (b) { b.n += 1; b.rp += t.total || 0; }
    });
    const max = Math.max(1, ...buckets.map(b => b.n));
    bestHour = buckets.slice().sort((a, b) => b.n - a.n)[0];
    const top = buckets.filter(b => b.n > 0).sort((a, b) => b.n - a.n).slice(0, 6).sort((a, b) => a.h - b.h);
    hourEl.innerHTML = top.length === 0
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada data jam.</p>'
      : top.map(b => barRow(
        `${String(b.h).padStart(2, '0')}.00`,
        `${b.n} struk`,
        b.n / max * 100,
        'bg-amber-500',
        `Pukul ${String(b.h).padStart(2, '0')}.00–${String(b.h).padStart(2, '0')}.59 — ${b.n} struk • ${formatRp(b.rp)}`
      )).join('');
  }

  // 4. Tunai vs QRIS
  const payEl = document.getElementById('insightPayChart');
  if (payEl) {
    const tot = Math.max(1, cash + qris);
    const pc = Math.round(cash / tot * 100);
    const pq = 100 - pc;
    const nCash = txs.filter(t => t.method !== 'QRIS').length;
    const nQris = txs.length - nCash;
    payEl.innerHTML = `
      <div class="flex rounded-full overflow-hidden bg-stone-100 h-4">
        <div class="group relative bg-stone-800 hover:bg-stone-700 transition cursor-default" style="width:${pc}%" title="Tunai — ${formatRp(cash)} • ${nCash} struk (${pc}%)">
          <span class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-[10px] font-bold text-white shadow-xl z-10">Tunai • ${pc}%</span>
        </div>
        <div class="group relative bg-emerald-500 hover:bg-emerald-600 transition cursor-default" style="width:${pq}%" title="QRIS — ${formatRp(qris)} • ${nQris} struk (${pq}%)">
          <span class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-[10px] font-bold text-white shadow-xl z-10">QRIS • ${pq}%</span>
        </div>
      </div>
      <div class="mt-2.5 flex flex-col gap-1.5 text-xs font-bold text-stone-700">
        <div class="flex items-center justify-between rounded-lg px-1.5 py-1 hover:bg-stone-50 transition" title="Tunai — ${formatRp(cash)} • ${nCash} struk dari ${txs.length} transaksi"><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-stone-800"></span>Tunai (${nCash} struk)</span><span class="tabular-nums">${formatRp(cash)} • ${pc}%</span></div>
        <div class="flex items-center justify-between rounded-lg px-1.5 py-1 hover:bg-stone-50 transition" title="QRIS — ${formatRp(qris)} • ${nQris} struk dari ${txs.length} transaksi"><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>QRIS (${nQris} struk)</span><span class="tabular-nums">${formatRp(qris)} • ${pq}%</span></div>
      </div>`;
  }

  // 5. Pengeluaran per kategori
  const expEl = document.getElementById('insightExpenseChart');
  if (expEl) {
    const byCat = {}, nCat = {};
    exps.forEach(e => {
      const c = e.category || 'Lainnya';
      byCat[c] = (byCat[c] || 0) + (e.amount || 0);
      nCat[c] = (nCat[c] || 0) + 1;
    });
    const arr = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...arr.map(a => a[1]));
    const totE = arr.reduce((s, a) => s + a[1], 0) || 1;
    expEl.innerHTML = arr.length === 0
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada biaya tercatat.</p>'
      : arr.map(([c, v]) => barRow(c, formatRp(v), v / max * 100, 'bg-red-400', `${c} — ${formatRp(v)} • ${nCat[c]} catatan (${Math.round(v / totE * 100)}% dari biaya)`)).join('');
  }

  // 6. Menu paling cuan (rupiah)
  const menuEl = document.getElementById('insightMenuChart');
  let bestMenu = null;
  if (menuEl) {
    const revByMenu = {}, qtyByMenu = {};
    txs.forEach(t => {
      (t.items || []).forEach(i => {
        const v = i.subtotal || ((i.qty || 0) * (i.price || 0));
        revByMenu[i.name] = (revByMenu[i.name] || 0) + v;
        qtyByMenu[i.name] = (qtyByMenu[i.name] || 0) + (i.qty || 0);
      });
    });
    const arr = Object.entries(revByMenu).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...arr.map(a => a[1]));
    const totM = arr.reduce((s, a) => s + a[1], 0) || 1;
    bestMenu = arr[0] || null;
    menuEl.innerHTML = arr.length === 0
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada penjualan menu.</p>'
      : arr.map(([n, v]) => barRow(`${n} (${qtyByMenu[n]}x)`, formatRp(v), v / max * 100, 'bg-stone-800', `${n} — ${qtyByMenu[n]} porsi • ${formatRp(v)} (${Math.round(v / totM * 100)}% dari 6 besar)`)).join('');
  }

  // 7. Laba, rata-rata, pola hari, sebaran, tabel (butuh agregat bulanan)
  const mAgg = monthlyAgg();

  const profitEl = document.getElementById('insightProfitChart');
  if (profitEl) {
    const has = mAgg.some(a => a.rev > 0 || a.exp > 0);
    profitEl.innerHTML = !has
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada data.</p>'
      : mAgg.map(a => {
        const laba = a.rev - a.exp;
        const mx = Math.max(1, a.rev, a.exp);
        return `<div class="flex items-center gap-2 text-xs" title="${MONTH_FULL[a.m]} ${a.y} — Omzet ${formatRp(a.rev)} • Biaya ${formatRp(a.exp)} • Laba ${formatRp(laba)}">
          <span class="w-14 shrink-0 truncate font-bold text-stone-600">${escapeHtml(a.label)}</span>
          <div class="flex-1 flex flex-col gap-0.5">
            <div class="h-2 rounded-full bg-stone-100 overflow-hidden"><div class="h-full rounded-full bg-emerald-600" style="width:${Math.max(2, Math.round(a.rev / mx * 100))}%"></div></div>
            <div class="h-2 rounded-full bg-stone-100 overflow-hidden"><div class="h-full rounded-full bg-red-400" style="width:${Math.max(2, Math.round(a.exp / mx * 100))}%"></div></div>
          </div>
          <span class="w-20 shrink-0 text-right font-black tabular-nums truncate ${laba >= 0 ? 'text-emerald-700' : 'text-red-600'}">${formatRp(laba)}</span>
        </div>`;
      }).join('');
  }

  const avgEl = document.getElementById('insightAvgChart');
  if (avgEl) {
    const rows = mAgg.map(a => ({ ...a, avg: a.n ? Math.round(a.rev / a.n) : 0 })).filter(a => a.n > 0);
    const max = Math.max(1, ...rows.map(a => a.avg));
    avgEl.innerHTML = rows.length === 0
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada data.</p>'
      : rows.map(a => barRow(
        a.label, formatRp(a.avg), a.avg / max * 100, 'bg-teal-700',
        `${MONTH_FULL[a.m]} ${a.y} — rata-rata ${formatRp(a.avg)} dari ${a.n} struk`
      )).join('');
  }

  const weekEl = document.getElementById('insightWeekdayChart');
  if (weekEl) {
    const WD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const buckets = WD.map((label, i) => ({ label, i, rev: 0, n: 0 }));
    txs.forEach(t => {
      const b = buckets[(new Date(t.date).getDay() + 6) % 7];
      b.rev += t.total || 0;
      b.n += 1;
    });
    const max = Math.max(1, ...buckets.map(b => b.rev));
    const totW = buckets.reduce((s, b) => s + b.rev, 0) || 1;
    weekEl.innerHTML = buckets.map(b => barRow(
      b.label, `${formatRp(b.rev)} • ${b.n}`, b.rev / max * 100, 'bg-amber-500',
      `Hari ${b.label} — ${formatRp(b.rev)} • ${b.n} struk (${Math.round(b.rev / totW * 100)}% omzet)`
    )).join('');
  }

  const basketEl = document.getElementById('insightBasketChart');
  if (basketEl) {
    const defs = [
      { label: 'Di bawah 10rb', test: v => v < 10000 },
      { label: '10–25rb', test: v => v >= 10000 && v < 25000 },
      { label: '25–50rb', test: v => v >= 25000 && v < 50000 },
      { label: 'Di atas 50rb', test: v => v >= 50000 }
    ];
    const rows = defs.map(d => ({ ...d, n: 0 }));
    txs.forEach(t => {
      const r = rows.find(r => r.test(t.total || 0));
      if (r) r.n += 1;
    });
    const tot = txs.length || 1;
    const max = Math.max(1, ...rows.map(r => r.n));
    basketEl.innerHTML = txs.length === 0
      ? '<p class="text-xs text-stone-400 font-bold">Belum ada data.</p>'
      : rows.map(r => barRow(
        r.label, `${r.n} struk`, r.n / max * 100, 'bg-sky-600',
        `${r.label} — ${r.n} struk (${Math.round(r.n / tot * 100)}% transaksi)`
      )).join('');
  }

  const mBody = document.getElementById('insightMonthBody');
  const mFoot = document.getElementById('insightMonthFoot');
  if (mBody) {
    const rows = [...mAgg].reverse();
    mBody.innerHTML = rows.map(a => {
      const laba = a.rev - a.exp;
      return `<tr class="border-b border-stone-100 last:border-0">
        <td class="py-2 pr-2 font-bold text-stone-700 whitespace-nowrap">${MONTH_FULL[a.m]} ${a.y}</td>
        <td class="py-2 px-2 text-right tabular-nums text-stone-600">${a.n}</td>
        <td class="py-2 px-2 text-right tabular-nums font-bold text-stone-800">${formatRp(a.rev)}</td>
        <td class="py-2 px-2 text-right tabular-nums text-red-600">${formatRp(a.exp)}</td>
        <td class="py-2 pl-2 text-right tabular-nums font-black ${laba >= 0 ? 'text-emerald-700' : 'text-red-600'}">${formatRp(laba)}</td>
      </tr>`;
    }).join('');
  }
  if (mFoot) {
    const tRev = mAgg.reduce((s, a) => s + a.rev, 0);
    const tExp = mAgg.reduce((s, a) => s + a.exp, 0);
    const tN = mAgg.reduce((s, a) => s + a.n, 0);
    mFoot.innerHTML = `<tr class="bg-stone-50 font-black">
      <td class="py-2 pr-2 text-stone-900">Total</td>
      <td class="py-2 px-2 text-right tabular-nums text-stone-800">${tN}</td>
      <td class="py-2 px-2 text-right tabular-nums text-stone-900">${formatRp(tRev)}</td>
      <td class="py-2 px-2 text-right tabular-nums text-red-600">${formatRp(tExp)}</td>
      <td class="py-2 pl-2 text-right tabular-nums ${tRev - tExp >= 0 ? 'text-emerald-700' : 'text-red-600'}">${formatRp(tRev - tExp)}</td>
    </tr>`;
  }

  // 8. Saran (kartu di level halaman, tampil di semua tab)
  renderSaran();

  initInsightAI();
}

// Saran ringkas + inisialisasi panel AI. Mandiri (hitung sendiri) sehingga
// bisa dipanggil dari renderFinancialReport maupun renderInsights.
export function renderSaran() {
  const txs = state.transactions || [];
  const exps = state.expenses || [];
  let rev = 0, qris = 0;
  const revByMenu = {}, qtyByMenu = {};
  const monthTot = {};
  const hourN = {};
  txs.forEach(t => {
    rev += t.total || 0;
    if (t.method === 'QRIS') qris += t.total || 0;
    const dt = new Date(t.date);
    const mk = `${dt.getFullYear()}-${dt.getMonth()}`;
    monthTot[mk] = (monthTot[mk] || 0) + (t.total || 0);
    const hh = dt.getHours();
    if (hh >= 6 && hh <= 21) hourN[hh] = (hourN[hh] || 0) + 1;
    (t.items || []).forEach(i => {
      const v = i.subtotal || ((i.qty || 0) * (i.price || 0));
      revByMenu[i.name] = (revByMenu[i.name] || 0) + v;
      qtyByMenu[i.name] = (qtyByMenu[i.name] || 0) + (i.qty || 0);
    });
  });
  let expTotal = 0;
  exps.forEach(e => { expTotal += e.amount || 0; });
  const avg = txs.length ? Math.round(rev / txs.length) : 0;
  const bestMk = Object.entries(monthTot).sort((a, b) => b[1] - a[1])[0];
  const bestHr = Object.entries(hourN).sort((a, b) => b[1] - a[1])[0];
  const bestMn = Object.entries(revByMenu).sort((a, b) => b[1] - a[1])[0];

  const tipsEl = document.getElementById('insightTips');
  if (tipsEl) {
    const tips = [];
    if (txs.length === 0) {
      tips.push('Belum ada transaksi.');
    } else {
      if (bestMk && bestMk[1] > 0) {
        const [y, m] = bestMk[0].split('-').map(Number);
        tips.push(`Bulan ramai: ${MONTH_NAMES[m]} ${y} (${formatRp(bestMk[1])}).`);
      }
      if (bestHr && bestHr[1] > 0) tips.push(`Jam ramai: ${String(bestHr[0]).padStart(2, '0')}.00 (${bestHr[1]} struk).`);
      if (bestMn) tips.push(`Menu cuan: ${bestMn[0]} (${formatRp(bestMn[1])}).`);
      if (avg > 0) tips.push(`Rata-rata ${formatRp(avg)}/struk.`);
      if (rev > 0 && qris / rev > 0.5) tips.push('QRIS >50%. Pastikan QR terlihat.');
      else if (rev > 0) tips.push('Tunai dominan. Siapkan kembalian.');
      if (expTotal > rev * 0.7 && expTotal > 0) tips.push('Biaya >70% omzet. Pangkas yang tidak perlu.');
    }
    tipsEl.innerHTML = tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  }
}

// ================= ANALISIS AI (MODEL GRATIS, OPSIONAL) =================
// Endpoint tanpa kunci. Yang dikirim hanya rekap angka, tanpa data pribadi.
const AI_URL = 'https://api.fikridev.me/api/text/gpt-5-4-nano';

function aiCacheName() {
  return `m3_ai_cache_${state.storeId || 'nastore'}`;
}

function aiDataSignature() {
  const txs = state.transactions || [];
  const exps = state.expenses || [];
  let rev = 0;
  txs.forEach(t => { rev += t.total || 0; });
  let exp = 0;
  exps.forEach(e => { exp += e.amount || 0; });
  return `${txs.length}:${rev}:${exps.length}:${exp}`;
}

function setAiStatus(text, tone) {
  const badge = document.getElementById('aiStatusBadge');
  if (!badge) return;
  badge.innerText = text;
  badge.className = 'ml-auto text-[10px] font-bold ' + (tone === 'ok'
    ? 'text-emerald-700'
    : (tone === 'busy' ? 'text-amber-700' : 'text-stone-400'));
}

function initInsightAI() {
  const badge = document.getElementById('aiStatusBadge');
  if (!badge || badge.dataset.bound) return;
  badge.dataset.bound = '1';
  setAiStatus('Siap', 'ok');
  // Tampilkan hasil tersimpan bila datanya belum berubah
  try {
    const raw = localStorage.getItem(aiCacheName());
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.sig === aiDataSignature() && cached.text) {
        showAiResult(document.getElementById('aiInsightResult'), cached.text, true);
        setAiStatus('Tersimpan', 'ok');
      }
    }
  } catch (_) {}
}

function buildAiPrompt() {
  const txs = state.transactions || [];
  const exps = state.expenses || [];
  let rev = 0, cash = 0, qris = 0;
  const qtyByMenu = {}, revByMenu = {}, hourCount = {};
  txs.forEach(t => {
    rev += t.total || 0;
    if (t.method === 'QRIS') qris += t.total || 0;
    else cash += t.total || 0;
    const hh = new Date(t.date).getHours();
    hourCount[hh] = (hourCount[hh] || 0) + 1;
    (t.items || []).forEach(i => {
      const v = i.subtotal || ((i.qty || 0) * (i.price || 0));
      revByMenu[i.name] = (revByMenu[i.name] || 0) + v;
      qtyByMenu[i.name] = (qtyByMenu[i.name] || 0) + (i.qty || 0);
    });
  });
  let expTotal = 0;
  const expByCat = {};
  exps.forEach(e => {
    expTotal += e.amount || 0;
    const c = e.category || 'Lainnya';
    expByCat[c] = (expByCat[c] || 0) + (e.amount || 0);
  });
  const avg = txs.length ? Math.round(rev / txs.length) : 0;
  const topMenu = Object.entries(revByMenu).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([n, v]) => `${n} (${qtyByMenu[n]} porsi, Rp${v})`).join('; ') || '-';
  const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([h, n]) => `pukul ${String(h).padStart(2, '0')} (${n} struk)`).join(', ') || '-';
  const topExp = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([c, v]) => `${c} Rp${v}`).join('; ') || '-';
  const storeName = state.storeProfile?.name || 'warung';

  return `Kamu analis usaha warung makan kecil Indonesia bernama "${storeName}". Data (rupiah, seluruh periode): omzet Rp${rev} dari ${txs.length} struk, rata-rata Rp${avg}/struk, tunai Rp${cash}, QRIS Rp${qris}, biaya Rp${expTotal}, laba Rp${rev - expTotal}. Menu teratas: ${topMenu}. Jam ramai: ${topHour}. Biaya terbesar: ${topExp}. ` +
    `Tulis Bahasa Indonesia singkat, maksimal 120 kata, tanpa pembuka, tanpa jargon Inggris. Format markdown: heading ## Pola (2 poin), ## Saran (3 poin), ## Risiko (1 poin); tiap poin satu baris diawali "- ".`;
}

// Markdown ringan untuk hasil AI (tanpa library, aman dari HTML asing)
function mdInlineAI(s) {
  return s
    .replace(/`([^`\n]+)`/g, '<code class="px-1 rounded bg-stone-100 border border-stone-200 font-mono text-[11px]">$1</code>')
    .replace(/\*\*([^*`\n]+)\*\*/g, '<strong class="font-black text-stone-900">$1</strong>')
    .replace(/(^|[\s('">])\*([^*\n`]+)\*/g, '$1<em>$2</em>');
}

function renderMarkdownAI(text) {
  const safe = escapeHtml(text || '').replace(/&quot;/g, '"');
  const lines = safe.split('\n');
  let html = '', inUl = false, inOl = false;
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeLists(); continue; }
    let m;
    if ((m = line.match(/^#{1,3}\s+(.*)/))) {
      closeLists();
      html += `<p class="mt-2.5 first:mt-0 text-[11px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5"><span class="w-3.5 h-px bg-emerald-500 shrink-0"></span><span>${mdInlineAI(m[1])}</span></p>`;
    } else if ((m = line.match(/^([-*•])\s+(.*)/))) {
      if (!inUl) { closeLists(); html += '<ul class="flex flex-col gap-1.5 mt-1">'; inUl = true; }
      html += `<li class="flex gap-2 text-xs leading-relaxed text-stone-700"><span class="mt-[7px] w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span><span>${mdInlineAI(m[2])}</span></li>`;
    } else if ((m = line.match(/^(\d+)[.)]\s+(.*)/))) {
      if (!inOl) { closeLists(); html += '<ol class="flex flex-col gap-1.5 mt-1">'; inOl = true; }
      html += `<li class="flex gap-2 text-xs leading-relaxed text-stone-700"><span class="font-black text-emerald-700 shrink-0">${m[1]}.</span><span>${mdInlineAI(m[2])}</span></li>`;
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeLists();
      html += '<hr class="border-stone-200 my-1.5">';
    } else if ((m = line.match(/^&gt;\s?(.*)/))) {
      closeLists();
      html += `<p class="text-xs text-stone-500 border-l-2 border-stone-300 pl-2 italic">${mdInlineAI(m[1])}</p>`;
    } else {
      closeLists();
      html += `<p class="text-xs leading-relaxed text-stone-700">${mdInlineAI(line)}</p>`;
    }
  }
  closeLists();
  return html;
}

function showAiResult(box, text, cached) {
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = renderMarkdownAI(text) +
    `<p class="mt-2.5 pt-2 border-t border-stone-100 text-[10px] text-stone-400">Dari AI, cek ulang sebelum dipakai.${cached ? ' (hasil lama)' : ''}</p>`;
}

export async function requestAiInsight() {
  if ((state.transactions || []).length === 0) {
    showToast('Belum ada data penjualan', 'info');
    return;
  }
  const btn = document.getElementById('aiAnalyzeBtn');
  const box = document.getElementById('aiInsightResult');
  if (btn) btn.disabled = true;
  setAiStatus('Menganalisis…', 'busy');
  if (box) {
    box.classList.remove('hidden');
    box.innerText = 'Menganalisis…';
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: buildAiPrompt() }] }),
      signal: ctrl.signal
    });
    if (res.status === 429) throw new Error('Server sibuk. Coba lagi.');
    if (!res.ok) throw new Error(`AI balas ${res.status}. Coba lagi.`);
    const data = await res.json();
    const text = (data && (data.result || data.data || data.message || '')).toString().trim();
    if (!text || data.status === false) throw new Error('AI tidak menjawab. Coba lagi.');
    showAiResult(box, text, false);
    try {
      localStorage.setItem(aiCacheName(), JSON.stringify({ sig: aiDataSignature(), text }));
    } catch (_) {}
    setAiStatus('Selesai', 'ok');
  } catch (err) {
    const msg = err && err.name === 'AbortError'
      ? 'Koneksi lambat. Coba lagi.'
      : (err && err.message) || 'Gagal. Coba lagi.';
    if (box) box.innerText = msg;
    setAiStatus('Gagal', '');
    showToast(msg, 'danger');
  } finally {
    clearTimeout(timer);
    if (btn) btn.disabled = false;
  }
}
