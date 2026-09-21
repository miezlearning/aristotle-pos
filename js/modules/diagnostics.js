/**
 * Kasir Mami - Bundel Diagnostik 1-Tap (dukungan teknis).
 * Merangkum versi, data lokal, printer, dan error terakhir menjadi paket
 * yang bisa disalin (untuk WA) atau dikirim ke Discord via proxy telemetri.
 */

import { state, currentStorageKeys } from '../state.js';
import { showToast, playClick } from '../utils.js';
import { isLocalPrinterReady, getDevicePrinterMode } from './printer.js';
import { getRecentErrors, resolveTelemetryProxyUrl } from './telemetry.js';

function bytesToMB(b) {
  return (b / 1048576).toFixed(1) + ' MB';
}

function localDataBreakdown() {
  const out = { total: 0, parts: {} };
  try {
    if (!currentStorageKeys) return out;
    const keys = {
      Transaksi: currentStorageKeys.HISTORY,
      Biaya: currentStorageKeys.EXPENSES,
      Produk: currentStorageKeys.PRODUCTS,
      Antrian: currentStorageKeys.QUEUES
    };
    Object.entries(keys).forEach(([label, k]) => {
      if (!k) return;
      const v = localStorage.getItem(k);
      const b = v ? v.length * 2 : 0;
      out.parts[label] = b;
      out.total += b;
    });
  } catch (_) {}
  return out;
}

function detectOS() {
  try {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os x/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
  } catch (_) {}
  return '?';
}

async function readAppVersion() {
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (r.ok) {
      const v = await r.json();
      if (v && v.versionName) return `v${v.versionName} (${v.versionCode || '?'})`;
    }
  } catch (_) {}
  return '?';
}

function printerSummary() {
  try {
    const cfg = state.printerConfig || {};
    const ready = isLocalPrinterReady();
    const mode = getDevicePrinterMode();
    const method = cfg.printMethod || (window.AndroidBridge ? 'rawbt' : 'browser');
    const last = cfg.drawerLastTest;
    const lastTxt = (last && last.at)
      ? (last.opened ? 'tes: terbuka' : 'tes: tidak terbuka')
      : 'belum dites';
    return `${ready ? 'Terhubung' : 'Tidak terhubung'} • ${mode} • ${method} • laci ${lastTxt}`;
  } catch (_) {
    return 'Tidak diketahui';
  }
}

/**
 * Susun objek bundel diagnostik (siap kirim / tampil / salin).
 */
export async function buildDiagnosticsBundle() {
  const storage = localDataBreakdown();
  const errors = getRecentErrors().slice(-8).reverse();
  return {
    app: 'aristotle-pos',
    kind: 'diagnostics',
    at: new Date().toISOString(),
    storeId: state.storeId || '-',
    storeName: state.storeProfile?.name || state.storeId || '-',
    role: state.userRole || 'kasir',
    appVersion: await readAppVersion(),
    os: detectOS(),
    online: (typeof navigator !== 'undefined') ? navigator.onLine !== false : true,
    swControlled: (typeof navigator !== 'undefined' && navigator.serviceWorker && !!navigator.serviceWorker.controller),
    storageBytes: storage.total,
    storageText: `${bytesToMB(storage.total)} (${Object.entries(storage.parts).map(([k, v]) => `${k} ${bytesToMB(v)}`).join(' • ')})`,
    products: (state.products || []).length,
    transactions: (state.transactions || []).length,
    expenses: (state.expenses || []).length,
    printerText: printerSummary(),
    errors: errors.map(e => ({ at: e.at, type: e.type, errorName: e.errorName, message: e.message, location: e.location }))
  };
}

/**
 * Versi teks polos untuk clipboard / WhatsApp.
 */
export function bundleToText(b) {
  const lines = [
    `DIAGNOSTIK ARISTOTLE POS (${b.at || '-'})`,
    `Toko: ${b.storeName} (${b.storeId}) • Peran: ${b.role}`,
    `Aplikasi: ${b.appVersion} • ${b.os} • ${b.online ? 'Online' : 'Offline'} • SW: ${b.swControlled ? 'aktif' : 'tidak'}`,
    `Lokal: ${b.storageText}`,
    `Data: ${b.products} produk • ${b.transactions} transaksi • ${b.expenses} biaya`,
    `Printer: ${b.printerText}`,
    `Error terakhir (${(b.errors || []).length}):`
  ];
  (b.errors || []).forEach(e => {
    lines.push(`- ${e.at || '?'} ${e.errorName || ''}: ${(e.message || '').slice(0, 120)}`);
  });
  return lines.join('\n');
}

/**
 * Kirim bundel ke Discord via proxy. false bila proxy belum dikonfigurasi.
 */
export async function sendDiagnosticsBundle(bundle) {
  const proxyUrl = resolveTelemetryProxyUrl();
  if (!proxyUrl) {
    showToast('Telemetri belum dikonfigurasi di rilis ini.', 'warning');
    return false;
  }
  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'aristotle-pos',
        kind: 'diagnostics',
        data: {
          storeId: bundle.storeId,
          storeName: bundle.storeName,
          appVersion: bundle.appVersion,
          os: bundle.os,
          online: bundle.online,
          storageText: bundle.storageText,
          products: bundle.products,
          transactions: bundle.transactions,
          expenses: bundle.expenses,
          printerText: bundle.printerText,
          errors: bundle.errors
        }
      })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

// ================= MODAL DIAGNOSTIK (Owner) =================
let cachedBundleText = '';

export async function openDiagnosticsModal() {
  if (state.userRole === 'cashier') {
    showToast('Akses dibatasi. Diagnostik hanya untuk Mode Owner.', 'warning');
    return;
  }
  playClick('pop');
  const modal = document.getElementById('diagnosticsModal');
  const pre = document.getElementById('diagnosticsPre');
  if (pre) pre.innerText = 'Menyiapkan data...';
  if (modal) modal.classList.remove('hidden');
  try {
    const bundle = await buildDiagnosticsBundle();
    cachedBundleText = bundleToText(bundle);
    window.__lastDiagnosticsBundle = bundle;
    if (pre) pre.innerText = cachedBundleText;
  } catch (_) {
    if (pre) pre.innerText = 'Gagal menyiapkan data diagnostik.';
  }
}

export function closeDiagnosticsModal() {
  playClick('pop');
  const modal = document.getElementById('diagnosticsModal');
  if (modal) modal.classList.add('hidden');
}

export async function copyDiagnosticsText() {
  playClick('tap');
  const text = cachedBundleText || '';
  if (!text) {
    showToast('Belum ada data untuk disalin.', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Ringkasan disalin — tempel ke WA support.', 'success');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('Ringkasan disalin.', 'success'); }
    catch (_) { showToast('Gagal menyalin otomatis.', 'error'); }
    ta.remove();
  }
}

export async function sendDiagnosticsNow() {
  playClick('pop');
  const bundle = window.__lastDiagnosticsBundle || await buildDiagnosticsBundle().catch(() => null);
  if (!bundle) {
    showToast('Gagal menyiapkan data.', 'error');
    return;
  }
  showToast('Mengirim data diagnostik...', 'info', 2000);
  const ok = await sendDiagnosticsBundle(bundle);
  showToast(ok ? 'Data diagnostik terkirim ke Discord.' : 'Gagal terkirim. Cek koneksi / konfigurasi telemetri.', ok ? 'success' : 'error', 3500);
}
