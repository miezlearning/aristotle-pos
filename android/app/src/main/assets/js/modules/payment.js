import { state, saveProducts, saveHistory, saveQueues, saveTaxConfig, getCurrentCart, getActiveQueue, calculateCartTotal, getQueueLineItems } from '../state.js';
import { formatRp, formatDateShort, escapeHtml, showToast, showConfirmDialog, playClick, playSuccessChime } from '../utils.js';
import { renderOrderQueueTabs, renderCart, renderProducts, toggleMobileCartDrawer } from './pos.js';
import { syncAddTransaction, syncSaveQueues, syncSaveProduct, syncSaveTaxConfig } from '../firebase.js';
import { generateDynamicQRIS, renderQRToContainer, parseQRISMetadata } from '../qris.js';
import { printReceipt, printKitchenTicket, kickCashDrawer, renderPrintableReceiptArea, isLocalPrinterReady, isMobileBrowser } from './printer.js';
import { notifyPaymentSuccess, notifyLowStock } from './notification.js';
import { renderFinancialReport } from './report.js';
import { checkDemoTransactionLimit } from './license.js';

let paymentMethod = 'cash'; // 'cash' or 'qris'
let cashGiven = 0;
let cashContributions = [];
let currentReceiptTx = null;
let activeDiscount = null; // { type:'percent'|'nominal', value, amount, reason, by, approvedBy }
let discountModalType = 'percent'; // 'percent' or 'nominal'
let discountReason = null; // 'rutin'|'promo'|'rusak'|'acara'|null

// Standar industri warung: kasir boleh memberi diskon kecil langsung,
// selebihnya wajib persetujuan Owner (mencegah struk Rp0 fiktif).
export const CASHIER_DISCOUNT_MAX_PCT = 10;
export const DISCOUNT_REASONS = {
  rutin: 'Pelanggan',
  promo: 'Promo',
  rusak: 'Rusak',
  acara: 'Acara'
};

function currentActorName() {
  if (state.userRole === 'cashier') return state.activeCashier?.name || 'Kasir';
  return state.auth?.ownerName || state.storeProfile?.name || 'Owner';
}

export function setDiscountReason(r) {
  playClick('tap');
  discountReason = (discountReason === r) ? null : r;
  try {
    document.querySelectorAll('.discount-reason-chip').forEach(ch => {
      const on = ch.dataset.reason === discountReason;
      ch.className = 'discount-reason-chip py-1.5 px-1 rounded-xl border font-bold text-[11px] transition active:scale-95 touch-target-large text-center ' +
        (on ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
            : 'bg-stone-100 border-stone-200 text-stone-700');
    });
  } catch (_) {}
}

export function getActiveDiscount() {
  return activeDiscount;
}

export function getFinalPayableTotal() {
  const { total } = calculateCartTotal();
  if (!activeDiscount) return calcPayable(total, 0).total;
  let amount = 0;
  if (activeDiscount.type === 'percent') {
    amount = Math.round((total * activeDiscount.value) / 100);
  } else {
    amount = Math.min(activeDiscount.value, total);
  }
  activeDiscount.amount = Math.max(0, Math.min(amount, total));
  return calcPayable(total, activeDiscount.amount).total;
}

/**
 * Standar F&B Indonesia: service% dihitung dari penjualan bersih (setelah diskon),
 * lalu pajak (PBJT/PB1) dihitung dari DPP = penjualan + service.
 */
export function calcPayable(subtotal, discAmt = 0) {
  const sales = Math.max(0, (Number(subtotal) || 0) - Math.max(0, Number(discAmt) || 0));
  const cfg = state.taxConfig || {};
  if (!cfg.enabled) {
    return { sales, servicePct: 0, serviceAmt: 0, dpp: sales, taxPct: 0, taxAmt: 0, total: sales };
  }
  const sPct = Math.min(100, Math.max(0, Number(cfg.servicePct) || 0));
  const tPct = Math.min(100, Math.max(0, Number(cfg.taxPct) || 0));
  const serviceAmt = Math.round((sales * sPct) / 100);
  const dpp = sales + serviceAmt;
  const taxAmt = Math.round((dpp * tPct) / 100);
  return { sales, servicePct: sPct, serviceAmt, dpp, taxPct: tPct, taxAmt, total: dpp + taxAmt };
}

function taxLabel() {
  return String((state.taxConfig || {}).taxLabel || 'PBJT').slice(0, 12) || 'PBJT';
}

export function toggleTaxEnabled(on) {
  playClick('switch');
  if (state.userRole === 'cashier') {
    showToast('Pajak & service hanya bisa diubah Owner.', 'warning');
    renderTaxCard();
    return;
  }
  saveTaxConfig({ enabled: Boolean(on) });
  syncSaveTaxConfig(state.taxConfig);
  updatePaymentTotals();
  renderTaxCard();
}

export function setTaxPct(v) {
  if (state.userRole === 'cashier') {
    showToast('Pajak & service hanya bisa diubah Owner.', 'warning');
    renderTaxCard();
    return;
  }
  saveTaxConfig({ taxPct: v });
  syncSaveTaxConfig(state.taxConfig);
  updatePaymentTotals();
  renderTaxCard();
}

export function setServicePct(v) {
  if (state.userRole === 'cashier') {
    showToast('Pajak & service hanya bisa diubah Owner.', 'warning');
    renderTaxCard();
    return;
  }
  saveTaxConfig({ servicePct: v });
  syncSaveTaxConfig(state.taxConfig);
  updatePaymentTotals();
  renderTaxCard();
}

export function renderTaxCard() {
  const cfg = state.taxConfig || {};
  const isOwner = state.userRole !== 'cashier';
  const tgl = document.getElementById('taxToggleEnabled');
  if (tgl) tgl.checked = Boolean(cfg.enabled);
  const tp = document.getElementById('taxPctInput');
  if (tp) { tp.value = cfg.taxPct ?? 10; tp.disabled = !isOwner; }
  const sp = document.getElementById('servicePctInput');
  if (sp) { sp.value = cfg.servicePct ?? 0; sp.disabled = !isOwner; }
  const st = document.getElementById('taxCardStatus');
  const rows = document.getElementById('taxCalcRows');
  try {
    const { total } = calculateCartTotal();
    const dAmt = (activeDiscount && activeDiscount.amount) || 0;
    const pay = calcPayable(total, dAmt);
    if (st) {
      st.innerText = cfg.enabled
        ? `Aktif • Service ${pay.servicePct}% + ${taxLabel()} ${pay.taxPct}%`
        : 'Mati • cocok untuk warung mikro (bukan objek pajak)';
    }
    if (rows) {
      rows.innerHTML = (cfg.enabled && (pay.serviceAmt > 0 || pay.taxAmt > 0))
        ? `<div class="flex justify-between text-[11px] font-bold text-stone-600"><span>Service (${pay.servicePct}%)</span><span>+${formatRp(pay.serviceAmt)}</span></div>
           <div class="flex justify-between text-[11px] font-bold text-stone-600"><span>${escapeHtml(taxLabel())} (${pay.taxPct}%)</span><span>+${formatRp(pay.taxAmt)}</span></div>`
        : '';
    }
  } catch (_) {}
}

export function updatePaymentTotals() {
  const { total: rawTotal } = calculateCartTotal();
  const finalTotal = getFinalPayableTotal();

  const totalEl = document.getElementById('payModalTotal');
  if (totalEl) totalEl.innerText = formatRp(finalTotal);

  const subtotalRow = document.getElementById('payModalSubtotalRow');
  const subtotalVal = document.getElementById('payModalSubtotalVal');
  const badgeContainer = document.getElementById('activeDiscountBadge');
  const btnOpenDisc = document.getElementById('btnOpenDiscountModal');
  const activeDiscText = document.getElementById('activeDiscountText');

  if (activeDiscount && activeDiscount.amount > 0) {
    if (subtotalRow) subtotalRow.classList.remove('hidden');
    if (subtotalVal) subtotalVal.innerText = formatRp(rawTotal);
    if (badgeContainer) badgeContainer.classList.remove('hidden');
    if (btnOpenDisc) btnOpenDisc.classList.add('hidden');
    if (activeDiscText) {
      activeDiscText.innerText = activeDiscount.type === 'percent'
        ? `Diskon ${activeDiscount.value}% (-${formatRp(activeDiscount.amount)})`
        : `Diskon -${formatRp(activeDiscount.amount)}`;
    }
  } else {
    if (subtotalRow) subtotalRow.classList.add('hidden');
    if (badgeContainer) badgeContainer.classList.add('hidden');
    if (btnOpenDisc) btnOpenDisc.classList.remove('hidden');
  }

  if (paymentMethod === 'qris') {
    renderDynamicQrisCode();
  } else {
    updateChangeDisplay();
  }
  try { renderTaxCard(); } catch (_) {}
}

export function applyDiscount(type, value) {
  playClick('pop');
  const { total } = calculateCartTotal();
  if (total <= 0) return;

  const numVal = Math.max(0, Number(value) || 0);
  if (numVal <= 0) {
    removeDiscount();
    return;
  }

  let amount = 0;
  let pctEquiv = 0;
  let clampedPct = 0;
  if (type === 'percent') {
    clampedPct = Math.min(100, Math.max(1, numVal));
    amount = Math.round((total * clampedPct) / 100);
    pctEquiv = clampedPct;
  } else {
    amount = Math.min(numVal, total);
    pctEquiv = total > 0 ? (amount / total) * 100 : 0;
  }

  // Wewenang kasir: tombol cepat ≤ batas langsung; selebihnya approval Owner.
  const isCashier = state.userRole === 'cashier';
  if (isCashier && pctEquiv > CASHIER_DISCOUNT_MAX_PCT) {
    closeDiscountModal();
    const desc = type === 'percent' ? `Diskon ${clampedPct}%` : `Diskon ${formatRp(amount)}`;
    showConfirmDialog({
      title: 'Butuh Persetujuan Owner',
      message: `${desc} melebihi wewenang kasir (maks ${CASHIER_DISCOUNT_MAX_PCT}%). Minta Owner verifikasi — buka ganti peran sekarang?`,
      confirmText: 'Minta Owner',
      confirmType: 'success',
      icon: 'shield_person'
    }).then(ok => {
      if (ok && window.KasirApp && typeof window.KasirApp.openRoleSwitchModal === 'function') {
        window.KasirApp.openRoleSwitchModal('owner');
      }
    });
    return;
  }

  const actor = currentActorName();
  if (type === 'percent') {
    activeDiscount = { type: 'percent', value: clampedPct, amount, reason: discountReason, by: actor, approvedBy: isCashier ? null : actor };
  } else {
    activeDiscount = { type: 'nominal', value: numVal, amount, reason: discountReason, by: actor, approvedBy: isCashier ? null : actor };
  }

  updatePaymentTotals();
  closeDiscountModal();
  showToast(`Diskon ${formatRp(activeDiscount.amount)} berhasil diterapkan!`, 'success');
}

export function removeDiscount() {
  playClick('del');
  activeDiscount = null;
  updatePaymentTotals();
  showToast('Diskon dibatalkan', 'info');
}

export function openDiscountModal() {
  playClick('pop');
  // Kasir boleh masuk (preset kecil wewenangnya); selebihnya digate di applyDiscount.
  discountReason = null;
  try {
    document.querySelectorAll('.discount-reason-chip').forEach(ch => {
      ch.className = 'discount-reason-chip py-1.5 px-1 rounded-xl bg-stone-100 border border-stone-200 font-bold text-[11px] text-stone-700 transition active:scale-95 touch-target-large text-center';
    });
  } catch (_) {}
  const hint = document.getElementById('discountRoleHint');
  if (hint) hint.classList.toggle('hidden', state.userRole !== 'cashier');
  const { total } = calculateCartTotal();
  const subtotalEl = document.getElementById('discountModalSubtotal');
  if (subtotalEl) subtotalEl.innerText = formatRp(total);

  const inputVal = document.getElementById('discountCustomInput');
  if (inputVal) inputVal.value = '';

  setDiscountModalType('percent');

  const modal = document.getElementById('discountSelectionModal');
  if (modal) modal.classList.remove('hidden');
}

export function closeDiscountModal() {
  playClick('pop');
  const modal = document.getElementById('discountSelectionModal');
  if (modal) modal.classList.add('hidden');
}

export function setDiscountModalType(type) {
  playClick('switch');
  discountModalType = type;
  const btnPct = document.getElementById('btnDiscountTypePercent');
  const btnNom = document.getElementById('btnDiscountTypeNominal');
  const unitLabel = document.getElementById('discountInputUnit');
  const inputEl = document.getElementById('discountCustomInput');

  if (type === 'percent') {
    if (btnPct) btnPct.className = 'py-2 px-3 rounded-xl bg-rose-600 text-white font-black text-xs transition shadow-sm';
    if (btnNom) btnNom.className = 'py-2 px-3 rounded-xl bg-stone-100 text-stone-700 font-bold text-xs hover:bg-stone-200 transition';
    if (unitLabel) unitLabel.innerText = '%';
    if (inputEl) {
      inputEl.placeholder = 'Contoh: 10';
      inputEl.max = '100';
    }
  } else {
    if (btnNom) btnNom.className = 'py-2 px-3 rounded-xl bg-rose-600 text-white font-black text-xs transition shadow-sm';
    if (btnPct) btnPct.className = 'py-2 px-3 rounded-xl bg-stone-100 text-stone-700 font-bold text-xs hover:bg-stone-200 transition';
    if (unitLabel) unitLabel.innerText = 'Rp';
    if (inputEl) {
      inputEl.placeholder = 'Contoh: 5000';
      inputEl.removeAttribute('max');
    }
  }
}

export function submitCustomDiscount() {
  const inputEl = document.getElementById('discountCustomInput');
  const val = inputEl ? Number(inputEl.value) : 0;
  if (!val || val <= 0) {
    showToast('Masukkan nilai diskon yang valid', 'warning');
    return;
  }
  applyDiscount(discountModalType, val);
}

export function renderDynamicQrisCode() {
  const finalTotal = getFinalPayableTotal();
  const qrisContainer = document.getElementById('qrisDynamicContainer');
  const qrisTotalEl = document.getElementById('qrisDynamicTotal');
  const merchantNameEl = document.getElementById('qrisMerchantName');
  const nmidEl = document.getElementById('qrisNmidDisplay');
  const acquirerEl = document.getElementById('qrisAcquirerDisplay');
  const badgeEl = document.getElementById('qrisModeBadge');

  if (qrisTotalEl) qrisTotalEl.innerText = formatRp(finalTotal);

  if (!state.qrisPayload || !state.qrisPayload.trim()) {
    if (merchantNameEl) merchantNameEl.innerText = state.storeProfile?.name || 'Toko Baru';
    if (nmidEl) nmidEl.innerText = 'NMID: Belum diatur';
    if (acquirerEl) acquirerEl.innerText = 'QRIS Belum Dipasang';
    if (badgeEl) {
      badgeEl.innerText = 'Belum Ada QRIS';
      badgeEl.className = 'px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black';
    }
    if (qrisContainer) {
      qrisContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center p-5 text-center text-stone-500">
          <span class="material-symbols-rounded text-4xl text-amber-500 mb-2">qr_code_scanner</span>
          <p class="text-xs font-bold text-stone-800">QRIS Toko Belum Dipasang</p>
          <p class="text-[11px] text-stone-500 mt-1 mb-3 max-w-[200px] leading-snug">
            Pasang kode QRIS toko Anda agar pembeli bisa scan pembayaran secara otomatis.
          </p>
          <button type="button" onclick="KasirApp.openQrisModal()" class="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs">
            + Pasang QRIS Toko
          </button>
        </div>
      `;
    }
    return;
  }

  const meta = parseQRISMetadata(state.qrisPayload);
  if (merchantNameEl) merchantNameEl.innerText = state.storeProfile?.name || meta.merchantName || 'Toko Saya';
  if (nmidEl) nmidEl.innerText = meta.nmid ? `NMID: ${meta.nmid}` : (state.storeProfile?.nmid ? `NMID: ${state.storeProfile.nmid}` : '');
  if (acquirerEl) acquirerEl.innerText = meta.acquirer || state.storeProfile?.acquirer || 'QRIS GPN';

  const isDynamic = state.qrisMode !== 'static';
  if (badgeEl) {
    badgeEl.innerText = isDynamic ? 'Nominal Pas' : 'Nominal Bebas';
    badgeEl.className = isDynamic 
      ? 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black'
      : 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black';
  }

  if (qrisContainer) {
    const payload = isDynamic ? generateDynamicQRIS(state.qrisPayload, finalTotal) : state.qrisPayload;
    renderQRToContainer(qrisContainer, payload, 220);
  }
}

export function toggleQrisPaymentMode() {
  playClick('switch');
  state.qrisMode = (state.qrisMode === 'static') ? 'dynamic' : 'static';
  renderDynamicQrisCode();
}

export function openPaymentModal() {
  playClick('pop');
  const { total } = calculateCartTotal();
  if (total <= 0) return;

  // Cek Batasan Kuota Akun Demo (Maksimal 25 Transaksi)
  const quotaCheck = checkDemoTransactionLimit(state.storeId, (state.transactions || []).length);
  if (!quotaCheck.allowed) {
    playClick('error');
    if (window.KasirApp && typeof window.KasirApp.openQuotaLimitModal === 'function') {
      window.KasirApp.openQuotaLimitModal();
    } else {
      showToast('Batas kuota demo tercapai (25/25)! Silakan aktivasi lisensi resmi.', 'warning', 5000);
    }
    return;
  }

  activeDiscount = null;
  updatePaymentTotals();

  paymentMethod = 'cash';
  setPaymentMethod('cash');

  cashGiven = 0;
  cashContributions = [];

  const manualInput = document.getElementById('cashInputManual');
  if (manualInput) manualInput.value = '';

  const keypad = document.getElementById('customKeypadArea');
  if (keypad) keypad.classList.add('hidden');

  const toggleAcc = document.getElementById('toggleAccumulateCash');
  if (toggleAcc) toggleAcc.checked = false;

  resetSplitBill();
  updateChangeDisplay();
  
  const modal = document.getElementById('paymentModal');
  if (modal) modal.classList.remove('hidden');
}

export function closePaymentModal() {
  playClick('pop');
  const modal = document.getElementById('paymentModal');
  if (modal) modal.classList.add('hidden');
}

export function setPaymentMethod(method) {
  playClick('switch');
  paymentMethod = method;
  const btnCash = document.getElementById('btnPayMethodCash');
  const btnQris = document.getElementById('btnPayMethodQris');
  const cashSection = document.getElementById('cashPaymentSection');
  const qrisSection = document.getElementById('qrisPaymentSection');
  const btnFinish = document.getElementById('btnFinishPayment');

  if (method === 'cash') {
    if (btnCash) btnCash.className = 'py-2.5 px-3 rounded-2xl border-2 border-emerald-600 bg-emerald-50 text-stone-950 font-black text-sm flex items-center justify-center gap-2 transition touch-target-large shadow-sm';
    if (btnQris) btnQris.className = 'py-2.5 px-3 rounded-2xl border-2 border-stone-200 bg-white text-stone-700 font-bold text-sm flex items-center justify-center gap-2 transition touch-target-large';
    if (cashSection) cashSection.classList.remove('hidden');
    if (qrisSection) qrisSection.classList.add('hidden');
    updateChangeDisplay();
  } else {
    if (btnQris) btnQris.className = 'py-2.5 px-3 rounded-2xl border-2 border-emerald-600 bg-emerald-50 text-stone-950 font-black text-sm flex items-center justify-center gap-2 transition touch-target-large shadow-sm';
    if (btnCash) btnCash.className = 'py-2.5 px-3 rounded-2xl border-2 border-stone-200 bg-white text-stone-700 font-bold text-sm flex items-center justify-center gap-2 transition touch-target-large';
    if (cashSection) cashSection.classList.add('hidden');
    if (qrisSection) qrisSection.classList.remove('hidden');
    if (btnFinish) btnFinish.disabled = false; // QRIS is instantly marked paid
    renderDynamicQrisCode();
  }
}

export function calculateSplitBill(persons) {
  playClick('tap');
  const finalTotal = getFinalPayableTotal();
  const perPerson = Math.ceil(finalTotal / persons);
  const banner = document.getElementById('splitResultBanner');
  const btnReset = document.getElementById('btnResetSplit');

  if (banner) {
    banner.innerHTML = `
      <div class="flex items-center justify-between text-emerald-950">
        <span>${persons} Orang:</span>
        <span class="text-sm font-black text-emerald-800">${formatRp(perPerson)} / orang</span>
      </div>
    `;
    banner.classList.remove('hidden');
  }
  if (btnReset) btnReset.classList.remove('hidden');

  const toggleAcc = document.getElementById('toggleAccumulateCash');
  if (toggleAcc) toggleAcc.checked = true;
}

export function resetSplitBill() {
  playClick('tap');
  const banner = document.getElementById('splitResultBanner');
  const btnReset = document.getElementById('btnResetSplit');
  if (banner) banner.classList.add('hidden');
  if (btnReset) btnReset.classList.add('hidden');
}

export function selectQuickCash(amount) {
  playClick('cash');
  const finalTotal = getFinalPayableTotal();
  const toggleAcc = document.getElementById('toggleAccumulateCash');
  const isAccumulate = toggleAcc ? toggleAcc.checked : false;
  
  let incomingVal = 0;
  if (amount === 'exact') {
    incomingVal = isAccumulate ? (finalTotal - cashGiven) : finalTotal;
    if (incomingVal < 0) incomingVal = 0;
  } else {
    incomingVal = amount;
  }

  if (isAccumulate) {
    cashContributions.push(incomingVal);
    cashGiven += incomingVal;
  } else {
    cashContributions = [incomingVal];
    cashGiven = incomingVal;
  }

  const manualInput = document.getElementById('cashInputManual');
  if (manualInput) manualInput.value = cashGiven;
  renderCashContributions();
  updateChangeDisplay();
}

export function renderCashContributions() {
  const area = document.getElementById('cashContributionsArea');
  const list = document.getElementById('cashContributionList');
  if (!area || !list) return;

  if (cashContributions.length > 1) {
    area.classList.remove('hidden');
    list.innerHTML = cashContributions.map((c, i) => `
      <span class="px-1.5 py-0.5 bg-white rounded border border-stone-300 text-stone-700">
        Org ${i+1}: ${formatRp(c)}
      </span>
    `).join(' + ');
  } else {
    area.classList.add('hidden');
  }
}

export function toggleCustomKeypad() {
  playClick('pop');
  const keypad = document.getElementById('customKeypadArea');
  if (!keypad) return;
  keypad.classList.toggle('hidden');
  if (!keypad.classList.contains('hidden')) {
    const manualInput = document.getElementById('cashInputManual');
    if (manualInput) manualInput.focus();
  }
}

export function handleManualCashInput() {
  const manualInput = document.getElementById('cashInputManual');
  const val = parseInt(manualInput ? manualInput.value : 0, 10);
  cashGiven = isNaN(val) ? 0 : val;
  cashContributions = [cashGiven];
  renderCashContributions();
  updateChangeDisplay();
}

export function addKeypadDigit(digit) {
  playClick('keypad');
  const input = document.getElementById('cashInputManual');
  if (!input) return;
  input.value = (input.value || '') + digit;
  handleManualCashInput();
}

export function backspaceKeypad() {
  playClick('tap');
  const input = document.getElementById('cashInputManual');
  if (!input) return;
  input.value = input.value.slice(0, -1);
  handleManualCashInput();
}

export function clearManualCash() {
  playClick('del');
  const input = document.getElementById('cashInputManual');
  if (input) input.value = '';
  cashGiven = 0;
  cashContributions = [];
  renderCashContributions();
  updateChangeDisplay();
}

export function updateChangeDisplay() {
  if (paymentMethod === 'qris') return;

  const finalTotal = getFinalPayableTotal();
  const change = cashGiven - finalTotal;
  const btnFinish = document.getElementById('btnFinishPayment');
  const changeDisplay = document.getElementById('changeDisplay');
  const cashGivenDisplay = document.getElementById('cashGivenDisplay');
  const changeNotice = document.getElementById('changeNotice');

  if (cashGivenDisplay) cashGivenDisplay.innerText = formatRp(cashGiven);

  if (cashGiven >= finalTotal && finalTotal >= 0) {
    if (changeDisplay) {
      changeDisplay.innerText = formatRp(change);
      changeDisplay.className = 'text-xl sm:text-3xl font-black text-emerald-700';
    }
    if (changeNotice) {
      changeNotice.innerText = change === 0 ? 'Uang pas, tidak ada kembalian' : `Kembalikan ${formatRp(change)}`;
    }
    if (btnFinish) btnFinish.disabled = false;
  } else {
    if (changeDisplay) {
      changeDisplay.innerText = cashGiven === 0 ? 'Rp 0' : `Kurang ${formatRp(finalTotal - cashGiven)}`;
      changeDisplay.className = 'text-lg sm:text-2xl font-black text-red-600';
    }
    if (changeNotice) {
      changeNotice.innerText = cashGiven === 0 ? 'Pilih nominal uang pembeli' : 'Uang masih kurang!';
    }
    if (btnFinish) btnFinish.disabled = true;
  }
}

let isCompletingTransaction = false;

export async function completeTransaction() {
  if (isCompletingTransaction) return;

  const finalPayable = getFinalPayableTotal();
  if (finalPayable < 0) return;

  const isQris = paymentMethod === 'qris';
  if (!isQris && cashGiven < finalPayable) return;

  // Kuota demo ditegakkan ulang saat commit (bukan cuma saat modal dibuka).
  const quotaCheck = checkDemoTransactionLimit(state.storeId, (state.transactions || []).length);
  if (!quotaCheck.allowed) {
    playClick('error');
    if (window.KasirApp && typeof window.KasirApp.openQuotaLimitModal === 'function') {
      window.KasirApp.openQuotaLimitModal();
    } else {
      showToast('Batas kuota demo tercapai (25/25)! Silakan aktivasi lisensi resmi.', 'warning', 5000);
    }
    return;
  }

  // QRIS tanpa bukti bayar tidak boleh menjadi omzet sah (standar industri
  // untuk POS tanpa callback bank: kasir mengesahkan dana sudah masuk).
  if (isQris) {
    const hasQris = state.qrisPayload && state.qrisPayload.trim();
    if (!hasQris) {
      playClick('error');
      showToast('QRIS toko belum dipasang. Pasang dulu atau pilih Tunai.', 'warning', 4000);
      if (window.KasirApp && typeof window.KasirApp.openQrisModal === 'function') {
        window.KasirApp.openQrisModal();
      }
      return;
    }
    const confirmed = await showConfirmDialog({
      title: 'Konfirmasi Dana QRIS Masuk',
      message: `Pastikan pembeli sudah scan & bayar ${formatRp(finalPayable)} (cek mutasi / aplikasi QRIS Anda) sebelum menyimpan.`,
      confirmText: 'Sudah Dibayar, Simpan',
      confirmType: 'success',
      icon: 'qr_code_scanner'
    });
    if (!confirmed) return;
  }

  isCompletingTransaction = true;
  const finishBtn = document.getElementById('btnFinishPayment');
  if (finishBtn) finishBtn.disabled = true;

  try {
    const activeQueue = getActiveQueue();
    const rawItems = activeQueue ? getQueueLineItems(activeQueue) : [];
    
    // Hitung nomor antrian harian otomatis (Reset ke 01 setiap hari baru)
    const todayStr = new Date().toDateString();
    const todayTxCount = (state.transactions || []).filter(t => new Date(t.date).toDateString() === todayStr).length + 1;
    const queueNoFormatted = String(todayTxCount).padStart(2, '0');
    
    let queueName = queueNoFormatted;
    if (activeQueue && activeQueue.name && !activeQueue.name.toLowerCase().includes('pesanan')) {
      queueName = `${queueNoFormatted} (${activeQueue.name})`;
    }

    const orderItems = rawItems.map(it => {
      const p = state.products.find(prod => prod.id === it.productId);
      const validAddOns = Array.isArray(it.addOns) ? it.addOns.map(ao => ({
        name: String(ao.name || '').trim(),
        price: Number(ao.price) || 0
      })) : [];
      const addOnTotal = validAddOns.reduce((sum, ao) => sum + ao.price, 0);
      const basePrice = p ? p.price : 0;
      const finalUnitPrice = basePrice + addOnTotal;

      return {
        id: it.productId,
        lineId: it.lineId,
        name: p ? p.name : 'Item',
        basePrice: basePrice,
        price: finalUnitPrice,
        qty: it.qty,
        subtotal: finalUnitPrice * it.qty,
        note: it.note || '',
        addOns: validAddOns
      };
    });

    // Validasi Integritas Harga & Transaksi: Pastikan item & harga cocok 100% dengan master katalog
    let verifiedRawSubtotal = 0;
    for (const item of orderItems) {
      const masterProd = state.products.find(prod => prod.id === item.id);
      if (!masterProd || typeof masterProd.price !== 'number' || masterProd.price < 0 || item.qty <= 0) {
        showToast('Peringatan: Data produk tidak valid. Transaksi dibatalkan demi keamanan.', 'error', 4000);
        return;
      }
      const addOnTotal = (item.addOns || []).reduce((sum, ao) => sum + (Number(ao.price) || 0), 0);
      item.basePrice = masterProd.price;
      item.price = masterProd.price + addOnTotal;
      item.subtotal = item.price * item.qty;
      verifiedRawSubtotal += item.subtotal;
    }

    if (verifiedRawSubtotal <= 0) {
      showToast('Total transaksi tidak valid.', 'error');
      return;
    }

    // Validasi stok saat commit: tolak oversell diam-diam (standar opname).
    for (const item of orderItems) {
      const prod = state.products.find(p => p.id === item.id);
      if (prod && prod.trackStock && typeof prod.stock === 'number' && prod.stock < item.qty) {
        showToast(`Stok "${prod.name}" sisa ${prod.stock}, tidak cukup untuk ${item.qty}. Kurangi jumlah atau opname dulu.`, 'warning', 4500);
        return;
      }
    }

    // Hitung diskon secara presisi terhadap verifiedRawSubtotal
    let finalVerifiedTotal = verifiedRawSubtotal;
    let txDiscount = null;
    if (activeDiscount) {
      let discAmt = 0;
      if (activeDiscount.type === 'percent') {
        discAmt = Math.round((verifiedRawSubtotal * activeDiscount.value) / 100);
      } else {
        discAmt = Math.min(activeDiscount.value, verifiedRawSubtotal);
      }
      discAmt = Math.max(0, Math.min(discAmt, verifiedRawSubtotal));
      finalVerifiedTotal = Math.max(0, verifiedRawSubtotal - discAmt);
      txDiscount = {
        type: activeDiscount.type,
        value: activeDiscount.value,
        amount: discAmt,
        reason: activeDiscount.reason || null,
        by: activeDiscount.by || null,
        approvedBy: activeDiscount.approvedBy || null
      };
    }

    const finalCash = isQris ? finalVerifiedTotal : cashGiven;
    const finalChange = isQris ? 0 : (cashGiven - finalVerifiedTotal);

    // Pajak & service mengikuti rumus standar (service → DPP → pajak).
    const payCalc = calcPayable(verifiedRawSubtotal, (txDiscount && txDiscount.amount) || 0);
    finalVerifiedTotal = payCalc.total;
    const finalCashAdj = isQris ? finalVerifiedTotal : cashGiven;
    const finalChangeAdj = isQris ? 0 : (cashGiven - finalVerifiedTotal);
    const txTax = (payCalc.serviceAmt > 0 || payCalc.taxAmt > 0) ? {
      servicePct: payCalc.servicePct,
      serviceAmt: payCalc.serviceAmt,
      dpp: payCalc.dpp,
      taxPct: payCalc.taxPct,
      taxAmt: payCalc.taxAmt,
      label: taxLabel()
    } : null;

    const newTx = {
      id: 'TX-' + Date.now(),
      date: new Date().toISOString(),
      orderName: queueName,
      method: isQris ? 'QRIS' : 'TUNAI',
      items: orderItems,
      subtotal: verifiedRawSubtotal,
      discount: txDiscount,
      tax: txTax,
      total: finalVerifiedTotal,
      cashGiven: finalCashAdj,
      change: finalChangeAdj,
      contributions: (!isQris && cashContributions.length > 1) ? cashContributions : null
    };

    state.transactions.unshift(newTx);
    saveHistory();
    syncAddTransaction(newTx);

    // Auto decrement stock for tracked items
    let hasStockUpdate = false;
    orderItems.forEach(item => {
      const prod = state.products.find(p => p.id === item.id);
      if (prod && prod.trackStock) {
        prod.stock = Math.max(0, (prod.stock || 0) - item.qty);
        if (prod.stock === 0) {
          prod.isAvailable = false;
        }
        syncSaveProduct(prod);
        hasStockUpdate = true;
      }
    });
    if (hasStockUpdate) {
      saveProducts();
    }

    showReceipt(newTx);
    playSuccessChime();

    // Notifikasi Transaksi Berhasil ke Bilah Status HP
    try {
      notifyPaymentSuccess(newTx);
      if (newTx.items && Array.isArray(newTx.items)) {
        newTx.items.forEach(it => {
          const prod = (state.products || []).find(p => p.id === it.id);
          if (prod && typeof prod.stock === 'number' && prod.stock <= (state.notificationConfig?.lowStockThreshold || 3)) {
            notifyLowStock(prod);
          }
        });
      }
    } catch (e) {
      console.warn('Notification trigger note:', e);
    }

    // 1. Auto-Print Struk Kasir / Tiket Dapur & Buka Laci Kasir (Smart Guard Anti-Spooler)
    const printerCfg = state.printerConfig || {};
    const isCash = !isQris;
    const shouldKick = Boolean(printerCfg.autoKickDrawer !== false && isCash);
    const hasPrinterReady = isLocalPrinterReady() || !isMobileBrowser();

    if (hasPrinterReady) {
      if (printerCfg.autoPrintKitchen && printerCfg.autoPrint) {
        setTimeout(() => {
          printKitchenTicket(newTx, false);
          setTimeout(() => {
            printReceipt(newTx, shouldKick);
          }, 700);
        }, 300);
      } else if (printerCfg.autoPrintKitchen) {
        setTimeout(() => {
          printKitchenTicket(newTx, shouldKick);
          if (shouldKick) {
            setTimeout(() => kickCashDrawer(), 500);
          }
        }, 300);
      } else if (printerCfg.autoPrint) {
        setTimeout(() => {
          printReceipt(newTx, shouldKick);
        }, 300);
      } else if (shouldKick) {
        setTimeout(() => {
          kickCashDrawer();
        }, 300);
      }
    } else {
      // Perangkat HP tanpa printer aktif: Lewati pencetakan agar tidak memicu Print Spooler Android
      if (shouldKick) {
        setTimeout(() => kickCashDrawer(), 300);
      }
      if (printerCfg.autoPrint || printerCfg.autoPrintKitchen) {
        console.log('Cetak otomatis dilewati: printer belum terhubung di perangkat HP ini.');
      }
    }

    if (state.orderQueues.length > 1) {
      state.orderQueues = state.orderQueues.filter(q => q.id !== state.activeQueueId);
      state.activeQueueId = state.orderQueues[0].id;
    } else {
      // Jika hanya 1 antrian, kosongkan keranjang dan kembalikan namanya menjadi 'Pesanan #1'
      state.orderQueues[0].items = [];
      state.orderQueues[0].cart = {};
      state.orderQueues[0].notes = {};
      state.orderQueues[0].name = 'Pesanan #1';
    }

    saveQueues();
    syncSaveQueues(state.orderQueues, true);
    closePaymentModal();
    toggleMobileCartDrawer(false);
    renderOrderQueueTabs();
    renderCart();
    renderProducts();

    // Live update laporan keuangan & grafik bisnis seketika
    try {
      renderFinancialReport();
    } catch (reportErr) {
      console.warn('Live financial report update note:', reportErr);
    }

    showToast(`Pembayaran ${formatRp(newTx.total)} Berhasil (${newTx.method})!`, 'success');
  } finally {
    setTimeout(() => {
      isCompletingTransaction = false;
      const b = document.getElementById('btnFinishPayment');
      if (b) b.disabled = false;
    }, 600);
  }
}

export function showReceipt(tx) {
  currentReceiptTx = tx;
  const modal = document.getElementById('receiptModal');

  // Render receipt items & details formatted for 58mm thermal
  renderPrintableReceiptArea(tx, state.printerConfig);

  if (modal) modal.classList.remove('hidden');
}

export function printCurrentReceipt() {
  if (currentReceiptTx) {
    const isCash = currentReceiptTx.method === 'TUNAI' || (!currentReceiptTx.isQris && currentReceiptTx.method !== 'QRIS');
    const shouldKick = Boolean(state.printerConfig?.autoKickDrawer !== false && isCash);
    printReceipt(currentReceiptTx, shouldKick);
  } else {
    if (!isMobileBrowser()) {
      window.print();
    } else {
      showToast('Belum ada transaksi aktif untuk dicetak.', 'warning');
    }
  }
}

export async function printCurrentKitchenTicket() {
  if (currentReceiptTx) {
    try {
      const isCash = currentReceiptTx.method === 'TUNAI' || (!currentReceiptTx.isQris && currentReceiptTx.method !== 'QRIS');
      const shouldKick = Boolean(state.printerConfig?.autoKickDrawer !== false && isCash);
      await printKitchenTicket(currentReceiptTx, shouldKick);
    } catch (err) {
      console.error('Print kitchen ticket error:', err);
      showToast('Gagal cetak tiket dapur: ' + (err.message || 'Kesalahan sistem'), 'error');
    }
  } else {
    showToast('Belum ada transaksi aktif.', 'warning');
  }
}

export function kickCurrentDrawer() {
  kickCashDrawer();
}

export function closeReceiptModal() {
  const modal = document.getElementById('receiptModal');
  if (modal) modal.classList.add('hidden');
}
