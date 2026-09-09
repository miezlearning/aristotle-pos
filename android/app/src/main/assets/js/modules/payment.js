import { state, saveProducts, saveHistory, saveQueues, getCurrentCart, getActiveQueue, calculateCartTotal, getQueueLineItems } from '../state.js';
import { formatRp, formatDateShort, escapeHtml, showToast, playClick, playSuccessChime } from '../utils.js';
import { renderOrderQueueTabs, renderCart, renderProducts, toggleMobileCartDrawer } from './pos.js';
import { syncAddTransaction, syncSaveQueues, syncSaveProduct } from '../firebase.js';
import { generateDynamicQRIS, renderQRToContainer, parseQRISMetadata } from '../qris.js';
import { printReceipt, printKitchenTicket, kickCashDrawer, renderPrintableReceiptArea } from './printer.js';

let paymentMethod = 'cash'; // 'cash' or 'qris'
let cashGiven = 0;
let cashContributions = [];
let currentReceiptTx = null;
let activeDiscount = null; // { type: 'percent'|'nominal', value: number, amount: number }
let discountModalType = 'percent'; // 'percent' or 'nominal'

export function getActiveDiscount() {
  return activeDiscount;
}

export function getFinalPayableTotal() {
  const { total } = calculateCartTotal();
  if (!activeDiscount) return total;
  let amount = 0;
  if (activeDiscount.type === 'percent') {
    amount = Math.round((total * activeDiscount.value) / 100);
  } else {
    amount = Math.min(activeDiscount.value, total);
  }
  activeDiscount.amount = Math.max(0, Math.min(amount, total));
  return Math.max(0, total - activeDiscount.amount);
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
  if (type === 'percent') {
    const clampedPct = Math.min(100, Math.max(1, numVal));
    amount = Math.round((total * clampedPct) / 100);
    activeDiscount = { type: 'percent', value: clampedPct, amount };
  } else {
    amount = Math.min(numVal, total);
    activeDiscount = { type: 'nominal', value: numVal, amount };
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

export function completeTransaction() {
  if (isCompletingTransaction) return;

  const finalPayable = getFinalPayableTotal();
  if (finalPayable < 0) return;

  const isQris = paymentMethod === 'qris';
  if (!isQris && cashGiven < finalPayable) return;

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
        amount: discAmt
      };
    }

    const finalCash = isQris ? finalVerifiedTotal : cashGiven;
    const finalChange = isQris ? 0 : (cashGiven - finalVerifiedTotal);

    const newTx = {
      id: 'TX-' + Date.now(),
      date: new Date().toISOString(),
      orderName: queueName,
      method: isQris ? 'QRIS' : 'TUNAI',
      items: orderItems,
      subtotal: verifiedRawSubtotal,
      discount: txDiscount,
      total: finalVerifiedTotal,
      cashGiven: finalCash,
      change: finalChange,
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

    // 1. Auto-Print Struk Kasir / Tiket Dapur & Buka Laci Kasir
    const printerCfg = state.printerConfig || {};
    const isCash = !isQris;
    const shouldKick = Boolean(printerCfg.autoKickDrawer !== false && isCash);

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
      // Jika tidak mencetak otomatis, picu buka laci langsung saat bayar tunai
      setTimeout(() => {
        kickCashDrawer();
      }, 300);
    }

    if (state.orderQueues.length > 1) {
      state.orderQueues = state.orderQueues.filter(q => q.id !== state.activeQueueId);
      state.activeQueueId = state.orderQueues[0].id;
    } else {
      // Jika hanya 1 antrian, kosongkan keranjang dan kembalikan namanya menjadi 'Pesanan #1'
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
    window.print();
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
