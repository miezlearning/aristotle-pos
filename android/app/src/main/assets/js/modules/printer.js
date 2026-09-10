/**
 * Kasir Mami - Module Printer Thermal (58mm / VSC TM-58V) & Cash Drawer
 * Mendukung Browser Print Dialog, Web Bluetooth ESC/POS, dan Web Serial USB Direct
 */

import { state, savePrinterConfig } from '../state.js';
import { GLOBAL_STORAGE_KEYS } from '../config.js';
import { formatRp, formatDateShort, showToast, playClick, escapeHtml } from '../utils.js';
import { renderQRToContainer } from '../qris.js';
import { 
  syncSavePrinterConfig,
  dispatchRemotePrintJob,
  listenToRemotePrintJobs,
  updateRemotePrintJobStatus,
  waitForRemotePrintJob,
  getDeviceId,
  registerRemotePrintListener,
  syncPublishHostPresence,
  listenToHostPresence,
  fetchHostPresenceDirect
} from '../firebase.js';

// State koneksi hardware di runtime
let bluetoothDevice = null;
let bluetoothCharacteristic = null;
let serialPort = null;
let serialWriter = null;

// Listener hasil print & drawer asinkron dari Native Android Bridge (Zero UI Freeze)
let lastNativeBluetoothError = '';
let lastNativeKickDrawerError = '';

if (typeof window !== 'undefined') {
  window.__onNativePrintResult = function(callbackId, success, errorMsg) {
    if (window.__nativePrintCallbacks && typeof window.__nativePrintCallbacks[callbackId] === 'function') {
      window.__nativePrintCallbacks[callbackId](success, errorMsg);
    }
  };

  // Pulihkan printer Bluetooth yang dipilih saat startup APK
  try {
    // 1. Cek dari preferensi Android Native jika tersedia
    if (window.AndroidBridge && typeof window.AndroidBridge.getPreferredPrinter === 'function') {
      const nativePref = window.AndroidBridge.getPreferredPrinter();
      if (nativePref) {
        if (!state.printerConfig) state.printerConfig = {};
        state.printerConfig.bluetoothAddress = nativePref;
      }
    }
    // 2. Cek dari localStorage (seluruh key kasir_*_printer_v1 atau aristotle_printer_config)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.endsWith('_printer_v1') || k === 'aristotle_printer_config')) {
        const val = localStorage.getItem(k);
        if (val) {
          const parsed = JSON.parse(val);
          if (parsed?.bluetoothAddress && window.AndroidBridge && typeof window.AndroidBridge.setPreferredPrinter === 'function') {
            window.AndroidBridge.setPreferredPrinter(parsed.bluetoothAddress);
            break;
          }
        }
      }
    }
  } catch (_) {}
}

/**
 * Kirim data raw ke printer Bluetooth Native (Android APK) secara asinkron tanpa memblokir UI
 */
export function sendNativeBluetoothDataAsync(bytes) {
  return new Promise((resolve) => {
    if (!window.AndroidBridge) return resolve(false);

    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = window.btoa(binary);

    if (typeof window.AndroidBridge.printBluetoothAsync === 'function') {
      const callbackId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      window.__nativePrintCallbacks = window.__nativePrintCallbacks || {};
      const timer = setTimeout(() => {
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeBluetoothError = 'Koneksi ke printer timeout (15 detik).';
        resolve(false);
      }, 15000);

      window.__nativePrintCallbacks[callbackId] = (success, errorMsg) => {
        clearTimeout(timer);
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeBluetoothError = errorMsg || '';
        resolve(Boolean(success));
      };

      try {
        window.AndroidBridge.printBluetoothAsync(b64, callbackId);
      } catch (err) {
        clearTimeout(timer);
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeBluetoothError = err.message || '';
        console.warn('AndroidBridge printBluetoothAsync failed, fallback sync:', err);
        try {
          const ok = window.AndroidBridge.printBluetooth(b64);
          resolve(Boolean(ok));
        } catch (_) {
          resolve(false);
        }
      }
    } else if (typeof window.AndroidBridge.printBluetooth === 'function') {
      try {
        const ok = window.AndroidBridge.printBluetooth(b64);
        resolve(Boolean(ok));
      } catch (e) {
        lastNativeBluetoothError = e.message || '';
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

/**
 * Buka laci kasir native secara asinkron tanpa memblokir UI
 */
export function sendNativeKickDrawerAsync() {
  return new Promise((resolve) => {
    if (!window.AndroidBridge) return resolve(false);

    if (typeof window.AndroidBridge.kickDrawerAsync === 'function') {
      const callbackId = 'kd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      window.__nativePrintCallbacks = window.__nativePrintCallbacks || {};
      const timer = setTimeout(() => {
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeKickDrawerError = 'Koneksi ke printer timeout (15 detik).';
        resolve(false);
      }, 15000);

      window.__nativePrintCallbacks[callbackId] = (success, errorMsg) => {
        clearTimeout(timer);
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeKickDrawerError = errorMsg || '';
        resolve(Boolean(success));
      };

      try {
        window.AndroidBridge.kickDrawerAsync(callbackId);
      } catch (err) {
        clearTimeout(timer);
        delete window.__nativePrintCallbacks[callbackId];
        lastNativeKickDrawerError = err.message || '';
        try {
          const ok = window.AndroidBridge.kickDrawer();
          resolve(Boolean(ok));
        } catch (_) {
          resolve(false);
        }
      }
    } else if (typeof window.AndroidBridge.kickDrawer === 'function') {
      try {
        const ok = window.AndroidBridge.kickDrawer();
        resolve(Boolean(ok));
      } catch (e) {
        lastNativeKickDrawerError = e.message || '';
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

/**
 * Konversi Gambar Base64 menjadi Byte Array ESC/POS Raster (GS v 0)
 * Menggunakan algoritma Floyd-Steinberg Error Diffusion Dithering + Kontras Adaptif
 * Menghasilkan cetakan logo yang sangat tajam, halus, dan bertekstur pada printer thermal (58mm / 80mm)
 */
export async function convertImageToEscPosRaster(base64Data, maxWidth = null) {
  return new Promise((resolve) => {
    if (!base64Data) return resolve(new Uint8Array(0));
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // Tentukan batas lebar optimal: 288 dot untuk 58mm (36 byte) atau 384 dot untuk 80mm
      const paperWidth = state.printerConfig?.paperWidth || '58mm';
      const resolvedMaxWidth = maxWidth || (paperWidth === '80mm' ? 384 : 288);

      let w = img.width;
      let h = img.height;
      if (w > resolvedMaxWidth) {
        h = Math.round((h * resolvedMaxWidth) / w);
        w = resolvedMaxWidth;
      }
      w = Math.floor(w / 8) * 8; // Wajib kelipatan 8 bit untuk format raster
      if (w <= 0 || h <= 0) return resolve(new Uint8Array(0));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      }

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const bytesWidth = w / 8;

      // 1. Ekstraksi matriks Grayscale dengan Alpha Blending ke putih & Kurva Kontras
      const gray = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = data[idx + 3] / 255;
          // Komposisi warna dengan background putih (jika PNG transparan)
          const r = data[idx] * alpha + 255 * (1 - alpha);
          const g = data[idx + 1] * alpha + 255 * (1 - alpha);
          const b = data[idx + 2] * alpha + 255 * (1 - alpha);
          // Luminansi standar optik CIE: mata manusia peka pada hijau dan merah
          let lum = 0.299 * r + 0.587 * g + 0.114 * b;
          // Tingkatkan kontras sedikit (+20%) agar teks di dalam logo tajam pekat
          lum = ((lum - 128) * 1.2) + 128;
          gray[y * w + x] = Math.max(0, Math.min(255, lum));
        }
      }

      // 2. Terapkan Floyd-Steinberg Error Diffusion Dithering
      const bits = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const currentIdx = y * w + x;
          const oldVal = gray[currentIdx];
          let newVal;
          let err;
          // Ambang batas noise: bersihkan bintik kotor di background putih dan solidkan hitam pekat
          if (oldVal >= 250) {
            newVal = 255;
            err = 0;
          } else if (oldVal <= 15) {
            newVal = 0;
            err = 0;
          } else {
            newVal = oldVal < 128 ? 0 : 255;
            err = oldVal - newVal;
          }
          bits[currentIdx] = (newVal === 0) ? 1 : 0; // 1 = titik panas hitam thermal

          // Sebar sisa error kuantisasi ke tetangga (Floyd-Steinberg kernel: 7/16, 3/16, 5/16, 1/16)
          if (err !== 0) {
            if (x + 1 < w) {
              gray[currentIdx + 1] += (err * 7) / 16;
            }
            if (y + 1 < h) {
              if (x > 0) {
                gray[(y + 1) * w + (x - 1)] += (err * 3) / 16;
              }
              gray[(y + 1) * w + x] += (err * 5) / 16;
              if (x + 1 < w) {
                gray[(y + 1) * w + (x + 1)] += (err * 1) / 16;
              }
            }
          }
        }
      }

      // 3. Konversi susunan bit ke perintah byte array GS v 0 ESC/POS
      const rasterBytes = [];
      // Align Center: ESC a 1
      rasterBytes.push(0x1B, 0x61, 0x01);
      // Header GS v 0 m xL xH yL yH
      const xL = bytesWidth % 256;
      const xH = Math.floor(bytesWidth / 256);
      const yL = h % 256;
      const yH = Math.floor(h / 256);
      rasterBytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < bytesWidth; x++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const px = x * 8 + bit;
            if (bits[y * w + px] === 1) {
              byte |= (0x80 >> bit);
            }
          }
          rasterBytes.push(byte);
        }
      }

      // Reset Align: ESC a 0
      rasterBytes.push(0x1B, 0x61, 0x00);
      rasterBytes.push(0x0A); // Line feed pasca logo
      // Pulihkan mode text murni
      rasterBytes.push(0x1B, 0x40);
      rasterBytes.push(0x1B, 0x74, 0x00);
      resolve(new Uint8Array(rasterBytes));
    };
    img.onerror = () => resolve(new Uint8Array(0));
    img.src = base64Data;
  });
}

/**
 * Buat text struk 58mm persis sesuai struktur struk thermal modern
 * Pure ASCII Sanitized: Bebas anomali karakter (Rupiah bersih, tanpa 'Rpá')
 */
/**
 * Bersihkan karakter unicode yang bisa merusak printer thermal
 */
function cleanAscii(text) {
  return String(text || '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();
}

/**
 * Helper untuk membuat garis pembatas berdasarkan style dan lebar kertas
 */
export function getDividerString(style, width = 32) {
  const w = width || 32;
  switch (style) {
    case 'dotted':
      return '.'.repeat(w);
    case 'double':
      return '='.repeat(w);
    case 'star':
      return '*'.repeat(w);
    case 'solid':
      return '_'.repeat(w);
    case 'dashed':
    default:
      return '-'.repeat(w);
  }
}

export function generateReceiptPlainText(tx, customConfig = null) {
  const cfg = customConfig || state.printerConfig || {};
  const width = cfg.paperWidth === '80mm' ? 48 : 32;
  const sectionSpacing = cfg.sectionSpacing !== undefined ? Number(cfg.sectionSpacing) : 1;
  const dividerStyle = cfg.dividerStyle || 'dashed';
  const itemStyle = cfg.itemPriceStyle || 'compact';
  const divider = getDividerString(dividerStyle, width);

  const padCenter = (text) => {
    const str = cleanAscii(text);
    if (str.length >= width) return str.substring(0, width);
    const leftPad = Math.floor((width - str.length) / 2);
    const rightPad = width - str.length - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  };

  const padBetween = (left, right) => {
    const lStr = cleanAscii(left);
    const rStr = cleanAscii(right);
    const space = width - lStr.length - rStr.length;
    if (space < 1) {
      return lStr.substring(0, Math.max(1, width - rStr.length - 1)) + ' ' + rStr;
    }
    return lStr + ' '.repeat(space) + rStr;
  };

  const storeName = cfg.headerStoreName || state.storeProfile?.name || 'Toko Utama';
  const tagline = cfg.headerTagline || '';
  const address = cfg.headerAddress || state.storeProfile?.city || '';
  const phone = cfg.headerPhone || state.auth?.phone || '';
  const cashier = cfg.cashierName || state.auth?.ownerName || 'Kasir';
  
  const d = tx.date ? new Date(tx.date) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const txDate = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const rawOrder = String(tx.orderName || '01').replace(/^NO ANTRIAN:?\s*/i, '');
  const method = tx.method || 'TUNAI';

  let lines = [];
  // 1. Header Toko (Center)
  lines.push(padCenter(storeName));
  if (tagline) lines.push(padCenter(tagline));
  if (address) lines.push(padCenter(address));
  if (phone) lines.push(padCenter(phone));
  lines.push(padCenter(`No. Kwitansi   #${tx.id ? tx.id.replace('TX-', '') : '001'}`));
  if (sectionSpacing > 0) {
    for (let s = 0; s < sectionSpacing; s++) lines.push('');
  }

  // 2. Waktu Pesan & Kasir
  lines.push(padBetween('Waktu Pesan', txDate));
  lines.push(padBetween('Kasir', cleanAscii(cashier)));
  lines.push(divider);

  // 3. Daftar Item (Contoh: 2x Kopi Susu   30.000)
  if (Array.isArray(tx.items)) {
    tx.items.forEach(item => {
      const itemName = cleanAscii(item.name || 'Item');
      const prefix = `${item.qty}x `;
      const addOns = Array.isArray(item.addOns) ? item.addOns : [];
      const addOnTotal = addOns.reduce((sum, ao) => sum + (Number(ao.price) || 0), 0);
      const basePrice = (typeof item.basePrice === 'number') ? item.basePrice : Math.max(0, (Number(item.price) || 0) - addOnTotal);
      const hasPricedAddons = addOns.some(ao => Number(ao.price) > 0);

      if (hasPricedAddons) {
        const baseSubtotal = basePrice * item.qty;
        const basePriceStr = formatRp(baseSubtotal).replace('Rp ', '');
        
        if (itemStyle === 'detailed' && item.qty > 1) {
          lines.push(`${prefix}${itemName}`);
          const unitPriceStr = `@ ${formatRp(basePrice).replace('Rp ', '')}`;
          lines.push(padBetween(`   ${unitPriceStr}`, basePriceStr, width));
        } else {
          if ((prefix.length + itemName.length + basePriceStr.length + 1) <= width) {
            lines.push(padBetween(`${prefix}${itemName}`, basePriceStr, width));
          } else {
            lines.push(cleanAscii(`${prefix}${itemName}`));
            lines.push(' '.repeat(Math.max(0, width - basePriceStr.length)) + basePriceStr);
          }
        }

        addOns.forEach(ao => {
          const aoUnit = Number(ao.price) || 0;
          if (aoUnit > 0) {
            const aoSubtotal = aoUnit * item.qty;
            const aoPriceStr = formatRp(aoSubtotal).replace('Rp ', '');
            const aoLabel = cleanAscii(`   + ${ao.name}${item.qty > 1 ? ` (${item.qty}x)` : ''}`);
            if ((aoLabel.length + aoPriceStr.length + 1) <= width) {
              lines.push(padBetween(aoLabel, aoPriceStr, width));
            } else {
              lines.push(aoLabel);
              lines.push(' '.repeat(Math.max(0, width - aoPriceStr.length)) + aoPriceStr);
            }
          } else {
            lines.push(`   + ${cleanAscii(ao.name)}`);
          }
        });
      } else {
        const lineTotal = item.subtotal || (item.qty * item.price);
        const priceStr = formatRp(lineTotal).replace('Rp ', '');

        if (itemStyle === 'detailed' && item.qty > 1) {
          lines.push(`${prefix}${itemName}`);
          const unitPriceStr = `@ ${formatRp(item.price).replace('Rp ', '')}`;
          lines.push(padBetween(`   ${unitPriceStr}`, priceStr, width));
        } else {
          if ((prefix.length + itemName.length + priceStr.length + 1) <= width) {
            lines.push(padBetween(`${prefix}${itemName}`, priceStr, width));
          } else {
            lines.push(cleanAscii(`${prefix}${itemName}`));
            lines.push(' '.repeat(Math.max(0, width - priceStr.length)) + priceStr);
          }
        }

        if (addOns.length > 0) {
          addOns.forEach(ao => {
            lines.push(`   + ${cleanAscii(ao.name)}`);
          });
        }
      }

      if (item.note) {
        lines.push(`   * ${cleanAscii(item.note)}`);
      }
    });
  }

  lines.push(divider);

  // 4. Ringkasan Pembayaran
  const rawSubtotal = tx.subtotal || tx.total;
  lines.push(padBetween('Subtotal', formatRp(rawSubtotal)));
  if (tx.discount && tx.discount.amount > 0) {
    const discLabel = tx.discount.type === 'percent' ? `Diskon (${tx.discount.value}%)` : 'Diskon';
    lines.push(padBetween(discLabel, `-${formatRp(tx.discount.amount)}`));
  }
  lines.push(padBetween('TOTAL', formatRp(tx.total)));
  if (sectionSpacing > 0) {
    for (let s = 0; s < sectionSpacing; s++) lines.push('');
  }

  if (method === 'TUNAI') {
    lines.push(padBetween('Cash', formatRp(tx.cashGiven || tx.total)));
    const change = (tx.cashGiven || tx.total) - tx.total;
    if (change > 0) {
      lines.push(padBetween('Kembalian', formatRp(change)));
    }
  } else {
    lines.push(padBetween('Metode', 'QRIS (LUNAS)'));
  }

  // 5. Info Sosmed & Ucapan Terima Kasih (Center)
  if (sectionSpacing > 0) {
    for (let s = 0; s < sectionSpacing; s++) lines.push('');
  }
  if (cfg.footerSocial) {
    lines.push(padCenter(cfg.footerSocial));
  }
  lines.push(padCenter(cfg.footerNote || 'Terimakasih telah berkunjung.'));

  // 6. NO ANTRIAN (WAJIB ADA - Sesuai Permintaan & Foto)
  if (cfg.showQueueBottom !== false) {
    lines.push(divider);
    lines.push(padCenter(`NO ANTRIAN ${rawOrder.toUpperCase()}`));
    lines.push(divider);
  }

  // Feed baris kosong di akhir (hanya 1 baris agar tidak boros kertas)
  const feeds = Math.max(0, Math.min(2, Number(cfg.feedLines !== undefined ? cfg.feedLines : 1)));
  for (let i = 0; i < feeds; i++) {
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Konversi teks & perintah menjadi byte array ESC/POS terstruktur & rapi
 * Menggunakan perintah format native ESC/POS: Center, Bold, Double-Size Queue Number
 */
export async function buildEscPosBytes(tx, kickDrawer = false) {
  const cfg = state.printerConfig || {};
  const commands = [];

  const addBytes = (...bytes) => {
    for (let b of bytes) commands.push(b);
  };

  const addText = (text) => {
    const clean = String(text || '')
      .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '');
    for (let i = 0; i < clean.length; i++) {
      commands.push(clean.charCodeAt(i));
    }
  };

  const padBetween = (left, right, width = 32) => {
    const lStr = String(left || '').trim();
    const rStr = String(right || '').trim();
    const space = width - lStr.length - rStr.length;
    if (space < 1) {
      return lStr.substring(0, Math.max(1, width - rStr.length - 1)) + ' ' + rStr;
    }
    return lStr + ' '.repeat(space) + rStr;
  };

  // 1. Inisialisasi printer (ESC @) & Code Page PC437
  addBytes(0x1B, 0x40);
  addBytes(0x1B, 0x74, 0x00);

  // Jika diminta buka laci kasir (Cash Drawer Kick):
  // Kirim pulsa solenoid di AWAL agar laci langsung menyentak terbuka seketika tanpa menunggu selesai cetak
  if (kickDrawer) {
    const drawerBytes = buildOpenDrawerBytes();
    for (let b of drawerBytes) commands.push(b);
  }

  // 3. Sisipkan Logo Toko jika ada
  if (cfg.logoBase64 && cfg.showLogo !== false) {
    try {
      // Resolusi optimal thermal: 288 dot (36 byte) untuk 58mm atau 384 dot (48 byte) untuk 80mm
      const targetLogoWidth = (cfg.paperWidth === '80mm') ? 384 : 288;
      const logoRasterBytes = await convertImageToEscPosRaster(cfg.logoBase64, targetLogoWidth);
      for (let b of logoRasterBytes) commands.push(b);
      commands.push(0x1B, 0x40);
      commands.push(0x1B, 0x74, 0x00);
    } catch (e) {
      console.warn('Gagal render logo ESC/POS:', e);
    }
  }

  if (!tx) {
    return new Uint8Array(commands);
  }

  const storeName = cfg.headerStoreName || state.storeProfile?.name || 'Aristotle POS';
  const tagline = cfg.headerTagline || '';
  const address = cfg.headerAddress || state.storeProfile?.city || '';
  const phone = cfg.headerPhone || state.auth?.phone || '';
  const cashier = cfg.cashierName || state.auth?.ownerName || 'Kasir';
  const social = cfg.footerSocial || '';
  const note = cfg.footerNote || 'Terima kasih telah berkunjung.';

  const d = tx.date ? new Date(tx.date) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const txDate = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const rawOrder = String(tx.orderName || '01').replace(/^NO ANTRIAN:?\s*/i, '');
  const method = tx.method || 'TUNAI';

  const width = cfg.paperWidth === '80mm' ? 48 : 32;
  const divider = getDividerString(cfg.dividerStyle || 'dashed', width) + '\n';
  const sectionSpacing = cfg.sectionSpacing !== undefined ? Number(cfg.sectionSpacing) : 1;
  const gap = '\n'.repeat(sectionSpacing);
  const itemStyle = cfg.itemPriceStyle || 'compact';

  // Sesuaikan kerapatan baris (Line Pitch) native printer ESC/POS
  if (sectionSpacing === 0) {
    addBytes(0x1B, 0x33, 24); // ESC 3 24: Kerapatan sangat rapat (hemat kertas)
  } else if (sectionSpacing === 2) {
    addBytes(0x1B, 0x33, 34); // ESC 3 34: Kerapatan longgar & lapang
  } else {
    addBytes(0x1B, 0x32);     // ESC 2: Standar 1/6 inch
  }

  // 4. Header Toko (Align Center, Nama Toko Double-Height + Tebal Elegan)
  addBytes(0x1B, 0x61, 0x01); // Align Center
  addBytes(0x1D, 0x21, 0x01); // Double-Height ON (GS ! 1) - Teks tinggi, gagah & terbaca jelas
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addText(storeName + '\n');
  addBytes(0x1D, 0x21, 0x00); // Normal Font Size
  addBytes(0x1B, 0x45, 0x00); // Bold OFF

  if (tagline) addText(tagline + '\n');
  if (address) addText(address + '\n');
  if (phone) addText(phone + '\n');
  addText(`No. Kwitansi   #${tx.id ? tx.id.replace('TX-', '') : '001'}\n`);
  if (sectionSpacing > 0) addText(gap);

  // 5. Waktu & Kasir (Align Left)
  addBytes(0x1B, 0x61, 0x00); // Align Left
  addText(padBetween('Waktu Pesan', txDate, width) + '\n');
  addText(padBetween('Kasir', cashier, width) + '\n');
  addText(divider);

  // 6. Daftar Item (Contoh: 2x Kopi Susu   30.000)
  if (Array.isArray(tx.items)) {
    tx.items.forEach(item => {
      const itemName = cleanAscii(item.name || 'Item');
      const prefix = `${item.qty}x `;
      const addOns = Array.isArray(item.addOns) ? item.addOns : [];
      const addOnTotal = addOns.reduce((sum, ao) => sum + (Number(ao.price) || 0), 0);
      const basePrice = (typeof item.basePrice === 'number') ? item.basePrice : Math.max(0, (Number(item.price) || 0) - addOnTotal);
      const hasPricedAddons = addOns.some(ao => Number(ao.price) > 0);

      if (hasPricedAddons) {
        const baseSubtotal = basePrice * item.qty;
        const basePriceStr = formatRp(baseSubtotal).replace('Rp ', '');

        if (itemStyle === 'detailed' && item.qty > 1) {
          addText(`${prefix}${itemName}\n`);
          const unitPriceStr = `@ ${formatRp(basePrice).replace('Rp ', '')}`;
          addText(padBetween(`   ${unitPriceStr}`, basePriceStr, width) + '\n');
        } else {
          if ((prefix.length + itemName.length + basePriceStr.length + 1) <= width) {
            addText(padBetween(`${prefix}${itemName}`, basePriceStr, width) + '\n');
          } else {
            addText(`${prefix}${itemName}\n`);
            addText(' '.repeat(Math.max(0, width - basePriceStr.length)) + basePriceStr + '\n');
          }
        }

        addOns.forEach(ao => {
          const aoUnit = Number(ao.price) || 0;
          if (aoUnit > 0) {
            const aoSubtotal = aoUnit * item.qty;
            const aoPriceStr = formatRp(aoSubtotal).replace('Rp ', '');
            const aoLabel = cleanAscii(`   + ${ao.name}${item.qty > 1 ? ` (${item.qty}x)` : ''}`);
            if ((aoLabel.length + aoPriceStr.length + 1) <= width) {
              addText(padBetween(aoLabel, aoPriceStr, width) + '\n');
            } else {
              addText(aoLabel + '\n');
              addText(' '.repeat(Math.max(0, width - aoPriceStr.length)) + aoPriceStr + '\n');
            }
          } else {
            addText(`   + ${cleanAscii(ao.name)}\n`);
          }
        });
      } else {
        const lineTotal = item.subtotal || (item.qty * item.price);
        const priceStr = formatRp(lineTotal).replace('Rp ', '');

        if (itemStyle === 'detailed' && item.qty > 1) {
          addText(`${prefix}${itemName}\n`);
          const unitPriceStr = `@ ${formatRp(item.price).replace('Rp ', '')}`;
          addText(padBetween(`   ${unitPriceStr}`, priceStr, width) + '\n');
        } else {
          if ((prefix.length + itemName.length + priceStr.length + 1) <= width) {
            addText(padBetween(`${prefix}${itemName}`, priceStr, width) + '\n');
          } else {
            addText(`${prefix}${itemName}\n`);
            addText(' '.repeat(Math.max(0, width - priceStr.length)) + priceStr + '\n');
          }
        }

        if (addOns.length > 0) {
          addOns.forEach(ao => {
            addText(`   + ${cleanAscii(ao.name)}\n`);
          });
        }
      }

      if (item.note) {
        addText(`   * ${cleanAscii(item.note)}\n`);
      }
    });
  }

  addText(divider);

  // 7. Subtotal & TOTAL (Bold)
  const rawSubtotal = tx.subtotal || tx.total;
  addText(padBetween('Subtotal', formatRp(rawSubtotal), width) + '\n');
  if (tx.discount && tx.discount.amount > 0) {
    const discLabel = tx.discount.type === 'percent' ? `Diskon (${tx.discount.value}%)` : 'Diskon';
    addText(padBetween(discLabel, `-${formatRp(tx.discount.amount)}`, width) + '\n');
  }
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addText(padBetween('TOTAL', formatRp(tx.total), width) + '\n');
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  if (sectionSpacing > 0) addText(gap);

  // 8. Cash / QRIS & Kembalian
  if (method === 'TUNAI') {
    addText(padBetween('Cash', formatRp(tx.cashGiven || tx.total), width) + '\n');
    const change = (tx.cashGiven || tx.total) - tx.total;
    if (change > 0) {
      addText(padBetween('Kembalian', formatRp(change), width) + '\n');
    }
  } else {
    addText(padBetween('Metode', 'QRIS (LUNAS)', width) + '\n');
  }

  // 9. Info Sosmed & Ucapan Terima Kasih (Align Center)
  if (sectionSpacing > 0) addText(gap);
  addBytes(0x1B, 0x61, 0x01); // Align Center
  if (social) {
    addText(social + '\n');
  }
  if (note) {
    addText(note + '\n');
  }

  // 10. NO ANTRIAN BESAR (Double Width & Double Height + Bold - Persis Foto)
  if (cfg.showQueueBottom !== false) {
    addBytes(0x1B, 0x61, 0x00); // Align Left
    addText(divider);
    addBytes(0x1B, 0x61, 0x01); // Align Center
    addBytes(0x1B, 0x45, 0x01); // Bold ON
    addBytes(0x1D, 0x21, 0x11); // Double Width & Height ON
    addText(`NO ANTRIAN ${rawOrder.toUpperCase()}\n`);
    addBytes(0x1D, 0x21, 0x00); // Normal Size
    addBytes(0x1B, 0x45, 0x00); // Bold OFF
  }

  // 11. Trigger Cash Drawer di akhir struk jika diminta (setelah cetak tuntas agar tegangan solenoid maksimal)
  if (kickDrawer) {
    const drawerBytes = buildOpenDrawerBytes();
    for (let b of drawerBytes) commands.push(b);
  }

  // Feed baris minimal (hanya 1 baris agar pas di pisau gerigi tanpa ruang kosong berlebih)
  const feedCount = Math.max(1, Math.min(3, Number(cfg.feedLines !== undefined ? cfg.feedLines : 1)));
  addBytes(0x1B, 0x64, feedCount);

  // Perintah Cut hanya untuk printer 80mm yang memiliki pemotong otomatis
  const paperWidth = cfg.paperWidth || '58mm';
  if (paperWidth === '80mm') {
    addBytes(0x1D, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(commands);
}

/**
 * Perintah ESC/POS murni untuk membuka laci kasir (Cash Drawer Kick)
 * Mengirim pulsa solenoid elektrik langsung ke Pin 2 dan Pin 5 RJ11
 * MURNI pulsa elektrik TANPA pergerakan motor kertas (TANPA Line Feed / 0x0A)
 */
export function buildOpenDrawerBytes() {
  return new Uint8Array([
    // 1. ESC p Pin 2 (m = 0, t1 = 30 * 2ms = 60ms, t2 = 125 * 2ms = 250ms)
    0x1B, 0x70, 0x00, 0x1E, 0x7D,
    // 2. ESC p Pin 5 (m = 1)
    0x1B, 0x70, 0x01, 0x1E, 0x7D,
    // 3. ESC p Pin 2 Format Karakter ASCII '0' (0x30)
    0x1B, 0x70, 0x30, 0x1E, 0x7D,
    // 4. ESC p Pin 5 Format Karakter ASCII '1' (0x31)
    0x1B, 0x70, 0x31, 0x1E, 0x7D,
    // 5. DLE DC4 Real-time pulse Pin 2
    0x10, 0x14, 0x01, 0x00, 0x08,
    // 6. DLE DC4 Real-time pulse Pin 5
    0x10, 0x14, 0x01, 0x01, 0x08,
    // 7. Karakter BEL (0x07) standar pembuka laci kasir tertentu
    0x07
  ]);
}

/**
 * Buat Byte Array ESC/POS Khusus Tiket Dapur / Kitchen Checkpoint
 * Format tanpa harga, nomor antrian/meja ekstra besar, dan ada kotak checklist [  ]
 */
export function buildKitchenTicketEscPosBytes(tx, kickDrawer = false) {
  const cfg = state.printerConfig || {};
  const commands = [];

  const addBytes = (...bytes) => {
    for (let b of bytes) commands.push(b);
  };

  const addText = (text) => {
    const clean = String(text || '')
      .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '');
    for (let i = 0; i < clean.length; i++) {
      commands.push(clean.charCodeAt(i));
    }
  };

  const padBetween = (left, right, width = 32) => {
    const lStr = String(left || '').trim();
    const rStr = String(right || '').trim();
    const space = width - lStr.length - rStr.length;
    if (space < 1) {
      return lStr.substring(0, Math.max(1, width - rStr.length - 1)) + ' ' + rStr;
    }
    return lStr + ' '.repeat(space) + rStr;
  };

  // 1. Inisialisasi printer (ESC @ dan PC437)
  addBytes(0x1B, 0x40);
  addBytes(0x1B, 0x74, 0x00);

  // Jika diminta buka laci kasir saat cetak tiket dapur
  if (kickDrawer) {
    const drawerBytes = buildOpenDrawerBytes();
    for (let b of drawerBytes) commands.push(b);
  }

  if (!tx) {
    return new Uint8Array(commands);
  }

  const d = tx.date ? new Date(tx.date) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const txTime = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const rawOrder = String(tx.orderName || '01').replace(/^NO ANTRIAN:?\s*/i, '');
  const width = cfg.paperWidth === '80mm' ? 48 : 32;
  const divider = '-'.repeat(width) + '\n';
  const doubleDivider = '='.repeat(width) + '\n';

  // 2. Header: TIKET DAPUR / BAR
  addBytes(0x1B, 0x61, 0x01); // Align Center
  addText(doubleDivider);
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addText('*** TIKET DAPUR / BAR ***\n');
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  addText(doubleDivider);

  // 3. MEJA / NO ANTRIAN (Sangat Besar: Double Width & Double Height)
  addBytes(0x1B, 0x61, 0x01); // Align Center
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addBytes(0x1D, 0x21, 0x11); // Double Width & Height ON
  addText(`${rawOrder.toUpperCase()}\n`);
  addBytes(0x1D, 0x21, 0x00); // Normal Size
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  addText(`Waktu: ${txTime}\n`);
  addText(`No. Kwitansi: #${tx.id ? tx.id.replace('TX-', '') : '001'}\n`);

  // 4. Header Kolom Checklist
  addBytes(0x1B, 0x61, 0x00); // Align Left
  addText(divider);
  addText(padBetween('STATUS / MENU', 'PORSI', width) + '\n');
  addText(divider);

  // 5. Daftar Item dengan Kotak Checklist [  ]
  let totalQty = 0;
  if (Array.isArray(tx.items)) {
    tx.items.forEach(item => {
      const qty = item.qty || 1;
      totalQty += qty;
      const itemName = cleanAscii(item.name || 'Item');
      const qtyStr = `x${qty}`;
      const prefix = '[  ] ';

      addBytes(0x1B, 0x45, 0x01); // Bold ON
      if ((prefix.length + itemName.length + qtyStr.length + 1) <= width) {
        addText(padBetween(`${prefix}${itemName}`, qtyStr, width) + '\n');
      } else {
        addText(`${prefix}${itemName}\n`);
        addText(' '.repeat(Math.max(0, width - qtyStr.length)) + qtyStr + '\n');
      }
      addBytes(0x1B, 0x45, 0x00); // Bold OFF

      if (Array.isArray(item.addOns) && item.addOns.length > 0) {
        item.addOns.forEach(ao => {
          addText(`     + ${cleanAscii(ao.name)}\n`);
        });
      }
      if (item.note) {
        addText(`     * Ket: ${cleanAscii(item.note)}\n`);
      }
    });
  }

  // 6. Ringkasan Total Porsi
  addText(divider);
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addText(padBetween(`Total: ${tx.items ? tx.items.length : 0} Item`, `${totalQty} Porsi`, width) + '\n');
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  addText(divider);

  // 7. Checkpoint Selesai (Pas 25 karakter, tidak akan terpotong / turun baris)
  addBytes(0x1B, 0x61, 0x01); // Align Center
  addText('[  ] SELESAI --> SERAHKAN\n');
  addText(doubleDivider);

  if (kickDrawer) {
    const drawerBytes = buildOpenDrawerBytes();
    for (let b of drawerBytes) commands.push(b);
  }

  // 8. Feed baris minimal tanpa ruang kosong berlebih
  const kitchenFeeds = Math.max(1, Math.min(3, Number(cfg.feedLines !== undefined ? cfg.feedLines : 1)));
  addBytes(0x1B, 0x64, kitchenFeeds);

  return new Uint8Array(commands);
}

/**
 * Tampilkan modal bantuan / panduan izin Bluetooth HP
 */
export function openBluetoothTroubleshootModal(details = {}) {
  const modal = document.getElementById('bluetoothTroubleshootModal');
  if (!modal) return;

  const titleEl = document.getElementById('btTroubleTitle');
  const msgEl = document.getElementById('btTroubleMsg');
  const listEl = document.getElementById('btTroubleList');

  if (titleEl) titleEl.innerText = details.title || 'Panduan Izin Bluetooth HP';
  if (msgEl) msgEl.innerText = details.message || 'Ikuti langkah berikut agar printer terdeteksi lancar:';
  
  if (listEl) {
    const steps = details.steps || [
      'Nyalakan Bluetooth di menu pengaturan atas HP Anda.',
      'Nyalakan LOKASI / GPS di HP Anda (wajib oleh sistem Android).',
      'Buka Pengaturan HP > Aplikasi > Chrome > Izin > Izinkan "Perangkat di Sekitar".',
      'Pastikan web ini dibuka dengan HTTPS (bukan http:// biasa).'
    ];
    listEl.innerHTML = steps.map((s, idx) => `
      <li class="flex items-start gap-2.5 text-xs text-stone-700">
        <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">${idx + 1}</span>
        <span>${s}</span>
      </li>
    `).join('');
  }

  modal.classList.remove('hidden');
}

export function closeBluetoothTroubleshootModal() {
  const modal = document.getElementById('bluetoothTroubleshootModal');
  if (modal) modal.classList.add('hidden');
}

// ==================== BLUETOOTH PRINTER PICKER (NATIVE ANDROID APK) ====================

/**
 * Tampilkan modal pemilihan perangkat printer Bluetooth (Native Android APK)
 */
export function openNativeBluetoothDevicePickerModal(devices = []) {
  let modal = document.getElementById('nativeBtPickerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'nativeBtPickerModal';
    modal.className = 'fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  const selectedAddr = state.printerConfig?.bluetoothAddress || '';

  const listHtml = (devices && devices.length > 0) ? devices.map(d => {
    const isSelected = selectedAddr && (selectedAddr.toLowerCase() === (d.address || '').toLowerCase());
    return `
      <div onclick="KasirApp.selectNativeBluetoothPrinter('${escapeHtml(d.address)}', '${escapeHtml(d.name || 'Printer')}')"
        class="flex items-center justify-between p-3.5 rounded-2xl border ${isSelected ? 'border-emerald-500 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20' : 'border-stone-200 bg-white hover:bg-stone-50'} cursor-pointer active:scale-[0.98] transition">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${isSelected ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'} flex items-center justify-center shadow-2xs">
            <span class="material-symbols-rounded text-xl">print</span>
          </div>
          <div>
            <div class="font-extrabold text-stone-900 text-sm flex items-center gap-1.5">
              <span>${escapeHtml(d.name || 'Printer Bluetooth')}</span>
              ${isSelected ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">Aktif</span>' : ''}
            </div>
            <div class="text-xs text-stone-500 font-mono mt-0.5">${escapeHtml(d.address)}</div>
          </div>
        </div>
        <span class="material-symbols-rounded ${isSelected ? 'text-emerald-600 font-bold' : 'text-stone-400'}">
          ${isSelected ? 'check_circle' : 'chevron_right'}
        </span>
      </div>
    `;
  }).join('') : `
    <div class="text-center py-6 text-stone-500 text-sm">
      Tidak ada perangkat yang ditemukan.
    </div>
  `;

  modal.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[85vh]">
      <div class="p-4 bg-amber-500 text-white flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-rounded text-2xl">bluetooth</span>
          <div>
            <h3 class="font-black text-base leading-tight">Pilih Printer Bluetooth</h3>
            <p class="text-xs text-amber-100">Perangkat yang sudah di-pair di HP</p>
          </div>
        </div>
        <button type="button" onclick="KasirApp.closeNativeBluetoothDevicePickerModal()"
          class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition">
          <span class="material-symbols-rounded text-lg">close</span>
        </button>
      </div>

      <div class="p-4 overflow-y-auto flex flex-col gap-2.5 flex-1">
        <p class="text-xs text-stone-600 mb-1">
          Ketuk printer thermal kasir Anda untuk menghubungkan:
        </p>
        ${listHtml}
      </div>

      <div class="p-4 bg-stone-50 border-t border-stone-200 flex flex-col gap-2">
        <button type="button" onclick="KasirApp.openDeviceBluetoothSettings()"
          class="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition">
          <span class="material-symbols-rounded text-base text-blue-600">settings_bluetooth</span>
          <span>Buka Pengaturan Bluetooth HP (Pair Baru)</span>
        </button>
        <button type="button" onclick="KasirApp.closeNativeBluetoothDevicePickerModal()"
          class="w-full py-2.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-xs transition">
          Tutup
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

export function closeNativeBluetoothDevicePickerModal() {
  const modal = document.getElementById('nativeBtPickerModal');
  if (modal) modal.classList.add('hidden');
}

export function selectNativeBluetoothPrinter(address, name) {
  if (window.AndroidBridge && typeof window.AndroidBridge.setPreferredPrinter === 'function') {
    window.AndroidBridge.setPreferredPrinter(address);
  }
  if (!state.printerConfig) state.printerConfig = {};
  state.printerConfig.bluetoothAddress = address;
  state.printerConfig.bluetoothName = name;
  savePrinterConfig(state.printerConfig);
  syncSavePrinterConfig(state.printerConfig);

  updatePrinterStatusBadge('bluetooth', name);
  closeNativeBluetoothDevicePickerModal();
  showToast(`Printer kasir disetel: ${name}`, 'success', 3000);
}

export function openDeviceBluetoothSettings() {
  if (window.AndroidBridge && typeof window.AndroidBridge.openBluetoothSettings === 'function') {
    window.AndroidBridge.openBluetoothSettings();
  } else {
    showToast('Buka Pengaturan HP > Bluetooth untuk menyandingkan printer baru.', 'info', 4000);
  }
}

export function openNativeBluetoothPairingHelpModal() {
  openBluetoothTroubleshootModal({
    title: 'Belum Ada Printer Bluetooth di HP',
    message: 'HP ini belum memiliki printer thermal yang dipasangkan (paired) di Bluetooth sistem.',
    steps: [
      'Nyalakan printer thermal kasir Anda (pastikan lampu indikator menyala).',
      'Buka Pengaturan HP > Bluetooth > Nyalakan Bluetooth.',
      'Pindai & ketuk nama printer kasir Anda (misal: RPP02N, VSC, POS-58, dll).',
      'Masukkan PIN Bluetooth jika diminta (biasanya 0000 atau 1234).',
      'Setelah printer terpasang di HP, kembali ke kasir dan klik "Sambung Bluetooth" lagi.'
    ]
  });
}

/**
 * Koneksi ke Printer Thermal via Web Bluetooth API atau Native Android Bridge
 */
export async function connectBluetoothPrinter() {
  // 0. Jalur Utama APK Android Native
  if (window.AndroidBridge && typeof window.AndroidBridge.getPairedDevices === 'function') {
    try {
      showToast('Memeriksa printer Bluetooth HP...', 'info', 1200);
      const devicesJson = window.AndroidBridge.getPairedDevices();
      const devices = JSON.parse(devicesJson || '[]');
      if (!devices || devices.length === 0) {
        openNativeBluetoothPairingHelpModal();
        return false;
      }
      openNativeBluetoothDevicePickerModal(devices);
      return true;
    } catch (e) {
      console.warn('Gagal memuat perangkat Bluetooth native:', e);
      showToast('Gagal memuat daftar perangkat Bluetooth HP', 'error');
      return false;
    }
  }

  // 1. Cek dukungan Web Bluetooth browser
  if (!navigator.bluetooth) {
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isSecure) {
      openBluetoothTroubleshootModal({
        title: 'Wajib Dibuka via HTTPS',
        message: 'Google Chrome di HP mematikan fitur Bluetooth jika web dibuka lewat HTTP biasa (seperti IP 192.168.x.x).',
        steps: [
          'Buka kasir menggunakan tautan resmi HTTPS (Firebase / domain Anda).',
          'Atau di laptop, gunakan koneksi USB Serial yang tidak memerlukan HTTPS.'
        ]
      });
    } else {
      showToast('Browser ini belum mendukung Web Bluetooth. Gunakan Google Chrome versi terbaru.', 'error');
    }
    return false;
  }

  // Langsung buka dialog requestDevice murni tanpa dicegat getAvailability()
  try {
    showToast('Membuka jendela printer Bluetooth...', 'info');
    
    // Panggil langsung dengan acceptAllDevices agar popup Chrome Android seketika muncul
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455'
      ]
    });

    if (!bluetoothDevice) return false;

    showToast(`Menghubungkan ke ${bluetoothDevice.name || 'Printer'}...`, 'info');
    const server = await bluetoothDevice.gatt.connect();
    
    // Cari characteristic yang writable di seluruh service
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            bluetoothCharacteristic = char;
            break;
          }
        }
      } catch (_) {}
      if (bluetoothCharacteristic) break;
    }

    if (!bluetoothCharacteristic) {
      throw new Error('Printer tidak menyediakan port tulis BLE. Di Windows Laptop, silakan gunakan tombol "Pilih Port USB" (COM10).');
    }

    updatePrinterStatusBadge('bluetooth', bluetoothDevice.name || 'Bluetooth Printer');
    showToast(`Terhubung ke printer: ${bluetoothDevice.name || 'Printer Thermal'}`, 'success');
    return true;
  } catch (err) {
    if (err.name === 'NotFoundError' || err.message?.includes('User cancelled') || err.message?.includes('cancelled')) {
      return false; // Pengguna membatalkan dialog
    }
    
    console.warn('Bluetooth Connection Warning:', err);
    
    // Jika ada error izin Android atau adapter
    if (err.message?.includes('adapter') || err.message?.includes('Location') || err.name === 'SecurityError') {
      openBluetoothTroubleshootModal({
        title: 'Izin Bluetooth / Lokasi Belum Lengkap',
        message: 'Chrome tidak diizinkan memindai printer karena aturan privasi Android.',
        steps: [
          'Pastikan GPS / Lokasi di HP dalam kondisi MENYALA.',
          'Buka Pengaturan HP > Aplikasi > Chrome > Izin > Izinkan "Perangkat di Sekitar".',
          'Pastikan printer dalam kondisi hidup (lampu indikator menyala).'
        ]
      });
    } else {
      showToast(`Bluetooth: ${err.message || 'Gagal terhubung'}`, 'warning');
    }
    return false;
  }
}

/**
 * Kirim data raw ke printer Bluetooth
 */
async function sendBluetoothData(bytes) {
  if (!bluetoothCharacteristic) {
    const ok = await connectBluetoothPrinter();
    if (!ok) {
      throw new Error('Bluetooth printer tidak terhubung.');
    }
  }

  try {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      await bluetoothCharacteristic.writeValue(chunk);
      await new Promise(r => setTimeout(r, 25)); // Buffer safety delay
    }
    return true;
  } catch (e) {
    console.error('Kirim Bluetooth gagal:', e);
    bluetoothCharacteristic = null;
    throw e;
  }
}

/**
 * Coba sambungkan otomatis ke port Serial yang sudah pernah diizinkan sebelumnya
 */
export async function autoReconnectSerial() {
  if (!navigator.serial) return false;
  try {
    const ports = await navigator.serial.getPorts();
    if (ports && ports.length > 0) {
      serialPort = ports[0];
      if (!serialPort.readable || !serialPort.writable) {
        await serialPort.open({ baudRate: 9600 });
      }
      serialWriter = serialPort.writable.getWriter();
      updatePrinterStatusBadge('serial', 'USB Serial Printer');
      console.log('Auto-reconnected to authorized serial/COM port');
      return true;
    }
  } catch (err) {
    console.warn('Auto reconnect serial note:', err);
  }
  return false;
}

// Inisialisasi auto-reconnect saat script dimuat
if (typeof navigator !== 'undefined' && navigator.serial) {
  setTimeout(() => { autoReconnectSerial().catch(() => {}); }, 500);
}

/**
 * Koneksi ke Printer via Web Serial (USB Port / Bluetooth Virtual COM di Windows)
 */
export async function connectSerialPrinter() {
  if (!navigator.serial) {
    showToast('Browser ini belum mendukung Web Serial. Gunakan Chrome / Edge desktop.', 'error');
    return false;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });
    serialWriter = serialPort.writable.getWriter();
    
    updatePrinterStatusBadge('serial', 'USB Serial Printer');
    showToast('Berhasil terhubung ke Printer Serial (COM / USB)!', 'success');
    return true;
  } catch (err) {
    if (err.name === 'NotFoundError' || err.message?.includes('No port selected')) {
      return false; // Pengguna membatalkan dialog
    }
    console.warn('Serial Connection Warning:', err);
    showToast(`Serial: ${err.message}`, 'warning');
    return false;
  }
}

/**
 * Kirim data raw ke printer Serial USB
 */
async function sendSerialData(bytes) {
  if (!serialWriter) {
    const ok = await connectSerialPrinter();
    if (!ok) {
      throw new Error('Serial USB printer tidak terhubung.');
    }
  }

  try {
    await serialWriter.write(bytes);
    return true;
  } catch (e) {
    console.error('Kirim Serial gagal:', e);
    if (serialWriter) {
      try { serialWriter.releaseLock(); } catch (_) {}
      serialWriter = null;
    }
    throw e;
  }
}

/**
 * Putuskan koneksi Serial USB
 */
export function disconnectSerialPrinter() {
  if (serialWriter) {
    try { serialWriter.releaseLock(); } catch (_) {}
    serialWriter = null;
  }
  if (serialPort) {
    try { serialPort.close(); } catch (_) {}
    serialPort = null;
  }
  resetPrinterStatusBadge();
  showToast('Koneksi port serial USB diputuskan.', 'info');
}

/**
 * Putuskan koneksi Bluetooth
 */
export function disconnectBluetoothPrinter() {
  if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    try { bluetoothDevice.gatt.disconnect(); } catch (_) {}
  }
  bluetoothDevice = null;
  bluetoothCharacteristic = null;
  resetPrinterStatusBadge();
  showToast('Koneksi Bluetooth diputuskan.', 'info');
}

/**
 * Reset badge status printer
 */
export function resetPrinterStatusBadge() {
  const badge = document.getElementById('printerConnectionBadge');
  if (badge) {
    badge.innerHTML = 'Siap Digunakan';
    badge.className = 'text-[10px] font-bold text-stone-500';
  }
}

/**
 * Deteksi apakah perangkat tersambung via Hotspot Kasir (Lokal Offline 192.168.43.x / 49.x / 44.x / 172.20.x)
 */
export function detectHotspotConnection() {
  if (window.AndroidBridge) {
    const ip = typeof window.AndroidBridge.getLocalIpAddress === 'function' ? window.AndroidBridge.getLocalIpAddress() : '';
    const gw = typeof window.AndroidBridge.getWifiGatewayIp === 'function' ? window.AndroidBridge.getWifiGatewayIp() : '';
    const isHs = (addr) => Boolean(addr && (
      addr.startsWith('192.168.43.') || 
      addr.startsWith('192.168.49.') || 
      addr.startsWith('192.168.50.') || 
      addr.startsWith('192.168.44.') || 
      addr.startsWith('172.20.10.')
    ));
    if (isHs(ip) || isHs(gw)) return true;
  }
  const savedIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip') || '';
  if (savedIp.startsWith('192.168.43.') || savedIp.startsWith('192.168.49.') || savedIp.startsWith('172.20.10.')) {
    return true;
  }
  return false;
}

/**
 * Dapatkan peran printer perangkat saat ini ('host' atau 'pelayan')
 */
export function getDevicePrinterMode() {
  const saved = localStorage.getItem('aristotle_printer_mode');
  if (saved === 'client' || saved === 'pelayan') {
    return 'pelayan';
  }
  if (saved === 'host') {
    return 'host';
  }
  const deviceRole = localStorage.getItem('aristotle_device_role');
  if (deviceRole === 'client' || deviceRole === 'pelayan') {
    return 'pelayan';
  }
  // Default perangkat kasir aktif adalah Kasir Utama (host)
  return 'host';
}

let isChangingDeviceRole = false;
let currentRoleEpoch = 0;

/**
 * Atur peran printer perangkat ('host' atau 'pelayan')
 */
export function setDevicePrinterMode(mode) {
  if (isChangingDeviceRole) return;
  isChangingDeviceRole = true;
  const epoch = ++currentRoleEpoch;

  try {
    const cleanMode = (mode === 'client' || mode === 'pelayan') ? 'pelayan' : 'host';
    localStorage.setItem('aristotle_printer_mode', cleanMode);
    localStorage.setItem('aristotle_device_role', cleanMode);

    // 1. UPDATE STATUS UI SECARA INSTAN (0ms Tanpa Blocking)
    updatePrinterUIStatus(true);
    showToast(cleanMode === 'host' ? 'Disetel sebagai Kasir Utama (Host Printer)' : 'Disetel sebagai HP Staf (Cloud Relay)', 'info', 2500);

    // 2. Transisi service & listener di background
    if (cleanMode === 'host') {
      stopHostPresenceListener();
      startHostHeartbeatLoop();
      setupRemotePrintHostListener();
    } else {
      stopHostHeartbeatLoop();
      if (remotePrintUnsubscribe) {
        try { remotePrintUnsubscribe(); } catch (_) {}
        remotePrintUnsubscribe = null;
      }
      setupHostPresenceListener();
      
      // Jalankan auto-reconnect di background tanpa memblokir thread UI sama sekali
      setTimeout(() => {
        if (currentRoleEpoch === epoch && getDevicePrinterMode() === 'pelayan') {
          reconnectPrinterHost(true, null, epoch);
        }
      }, 50);
    }
  } catch (err) {
    console.warn('Error setting device printer mode:', err);
  } finally {
    setTimeout(() => {
      isChangingDeviceRole = false;
    }, 150);
  }
}

/**
 * Cek apakah perangkat saat ini terhubung langsung ke printer fisik
 */
export function isLocalPrinterReady() {
  const role = getDevicePrinterMode();
  if (role === 'pelayan') {
    return false;
  }
  if (window.AndroidBridge && typeof window.AndroidBridge.printBluetooth === 'function') {
    return true;
  }
  if (bluetoothCharacteristic && bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    return true;
  }
  if (serialWriter && serialPort && serialPort.writable) {
    return true;
  }
  return false;
}

/**
 * Eksekusi Langsung Buka Laci Kasir secara lokal (hardware direct)
 */
export async function executeDirectLocalKickDrawer() {
  // 0. Jalur Utama APK Native (Bebas Dialog, Zero Freeze)
  if (window.AndroidBridge) {
    try {
      const ok = await sendNativeKickDrawerAsync();
      if (ok) {
        showToast('Laci kasir terbuka!', 'success');
        return true;
      } else {
        const errMsg = lastNativeKickDrawerError || 'Printer Bluetooth tidak merespons.';
        showToast('Gagal membuka laci: ' + errMsg, 'warning', 3500);

        if (errMsg.toLowerCase().includes('belum dipilih') || errMsg.toLowerCase().includes('belum ada printer')) {
          setTimeout(() => {
            connectBluetoothPrinter();
          }, 600);
        }
        return false;
      }
    } catch (e) {
      console.warn('Native Android kick error:', e);
      showToast('Gagal membuka laci: ' + (e.message || 'Kesalahan sistem'), 'warning', 3500);
      return false;
    }
  }

  const modalMethod = document.getElementById('printerMethodSelect')?.value;
  const cfg = state.printerConfig || {};
  const method = (modalMethod && !document.getElementById('printerConfigModal')?.classList.contains('hidden') ? modalMethod : cfg.printMethod) || 'browser';

  // 1. Mode RawBT (Khusus browser eksternal yang diinstal RawBT)
  if (method === 'rawbt') {
    try {
      const bytes = buildOpenDrawerBytes();
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = window.btoa(binary);
      const intentUri = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
      const link = document.createElement('a');
      link.href = intentUri;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { try { link.remove(); } catch (_) {} }, 500);
      showToast('Sinyal buka laci terkirim (RawBT)!', 'success');
      return true;
    } catch (e) {
      console.warn('RawBT kick error:', e);
      return false;
    }
  }

  // 2. Mode USB Serial
  if (method === 'serial') {
    try {
      const bytes = buildOpenDrawerBytes();
      await sendSerialData(bytes);
      showToast('Sinyal buka laci terkirim (USB Serial)!', 'success');
      return true;
    } catch (e) {
      console.warn('Serial kick error:', e);
      return false;
    }
  }

  // 3. Mode Web Bluetooth
  if (method === 'bluetooth') {
    if (bluetoothCharacteristic) {
      try {
        const bytes = buildOpenDrawerBytes();
        await sendBluetoothData(bytes);
        showToast('Sinyal buka laci kasir terkirim (Bluetooth)!', 'success');
        return true;
      } catch (e) {
        console.warn('Bluetooth kick error:', e);
        return false;
      }
    }
  }

  return false;
}

/**
 * Eksekusi Langsung Cetak Struk Utama secara lokal (hardware direct)
 */
export async function executeDirectLocalPrintReceipt(tx, shouldKickDrawer, forceMethod = null) {
  const modalMethod = document.getElementById('printerMethodSelect')?.value;
  const cfg = state.printerConfig || {};
  const method = forceMethod || (modalMethod && !document.getElementById('printerConfigModal')?.classList.contains('hidden') ? modalMethod : cfg.printMethod) || 'browser';

  renderPrintableReceiptArea(tx, cfg);

  // 0. Jalur Utama APK Native (Bebas Dialog, Bebas RawBT, Zero UI Freeze)
  if (window.AndroidBridge) {
    try {
      const bytes = await buildEscPosBytes(tx, shouldKickDrawer);
      const ok = await sendNativeBluetoothDataAsync(bytes);
      if (ok) {
        showToast('Struk tercetak!', 'success');
        return true;
      } else {
        const errMsg = lastNativeBluetoothError || 'Printer Bluetooth tidak merespons. Pastikan printer hidup & terhubung.';
        showToast('Gagal mencetak: ' + errMsg, 'error', 4000);

        if (errMsg.toLowerCase().includes('belum dipilih') || errMsg.toLowerCase().includes('belum ada printer')) {
          setTimeout(() => {
            connectBluetoothPrinter();
          }, 600);
        }
        return false;
      }
    } catch (e) {
      console.warn('Native Android Bluetooth print error:', e);
      showToast('Gagal mencetak: ' + (e.message || 'Kesalahan printer'), 'error', 4000);
      return false;
    }
  }

  if (method === 'rawbt') {
    try {
      const bytes = await buildEscPosBytes(tx, shouldKickDrawer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = window.btoa(binary);
      const intentUri = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
      const link = document.createElement('a');
      link.href = intentUri;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { try { link.remove(); } catch (_) {} }, 500);
      showToast('Struk terkirim ke RawBT!', 'success');
      return true;
    } catch (e) {
      console.warn('RawBT print error:', e);
      window.print();
      return true;
    }
  } else if (method === 'bluetooth') {
    try {
      const bytes = await buildEscPosBytes(tx, shouldKickDrawer);
      await sendBluetoothData(bytes);
      showToast('Struk berhasil dicetak (Bluetooth)!', 'success');
      return true;
    } catch (e) {
      console.warn('Bluetooth print gagal:', e);
      window.print();
      return true;
    }
  } else if (method === 'serial') {
    try {
      const bytes = await buildEscPosBytes(tx, shouldKickDrawer);
      await sendSerialData(bytes);
      showToast('Struk berhasil dicetak (USB Serial)!', 'success');
      return true;
    } catch (e) {
      console.warn('Serial print gagal:', e);
      window.print();
      return true;
    }
  } else {
    window.print();
    return true;
  }
}

/**
 * Eksekusi Langsung Cetak Tiket Dapur secara lokal (hardware direct)
 */
export async function executeDirectLocalKitchenTicket(tx, shouldKickDrawer = false) {
  const bytes = buildKitchenTicketEscPosBytes(tx, shouldKickDrawer);
  const cfg = state.printerConfig || {};
  const method = cfg.printMethod || 'browser';

  // 1. Android APK Native (Bebas Dialog, Zero UI Freeze)
  if (window.AndroidBridge) {
    try {
      const ok = await sendNativeBluetoothDataAsync(bytes);
      if (ok) {
        showToast('Tiket dapur tercetak!', 'success');
        return true;
      } else {
        const errMsg = lastNativeBluetoothError || 'Printer Bluetooth tidak merespons. Pastikan printer hidup & terhubung.';
        showToast('Gagal mencetak tiket dapur: ' + errMsg, 'error', 4000);

        if (errMsg.toLowerCase().includes('belum dipilih') || errMsg.toLowerCase().includes('belum ada printer')) {
          setTimeout(() => {
            connectBluetoothPrinter();
          }, 600);
        }
        return false;
      }
    } catch (e) {
      console.warn('Android kitchen print note:', e);
      showToast('Gagal mencetak tiket dapur: ' + (e.message || 'Printer error'), 'error', 4000);
      return false;
    }
  }

  // 2. Web Bluetooth
  if (method === 'bluetooth' || bluetoothCharacteristic) {
    try {
      await sendBluetoothData(bytes);
      showToast('Tiket dapur tercetak (Bluetooth)!', 'success');
      return true;
    } catch (e) {
      console.warn('Bluetooth kitchen print note:', e);
    }
  }

  // 3. USB Serial
  if (method === 'serial' || serialWriter) {
    try {
      await sendSerialData(bytes);
      showToast('Tiket dapur tercetak (USB Serial)!', 'success');
      return true;
    } catch (e) {
      console.warn('Serial kitchen print note:', e);
    }
  }

  // 4. RawBT (Hanya untuk browser luar)
  if (method === 'rawbt') {
    try {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const link = document.createElement('a');
      link.href = `intent:base64,${window.btoa(binary)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { try { link.remove(); } catch (_) {} }, 500);
      showToast('Tiket dapur terkirim ke RawBT!', 'success');
      return true;
    } catch (e) {
      console.warn('RawBT kitchen print note:', e);
    }
  }

  // 5. Browser Fallback
  const kitchenEl = document.getElementById('kitchenPrintArea');
  if (kitchenEl) {
    const rawOrder = String(tx.orderName || '01').replace(/^NO ANTRIAN:?\s*/i, '');
    const itemsHtml = (tx.items || []).map(it => `
      <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dashed #ccc;">
        <span>[  ] <b>${it.name || 'Menu'}</b>${it.note ? `<br><small>* ${it.note}</small>` : ''}</span>
        <b>x${it.qty || 1}</b>
      </div>
    `).join('');

    kitchenEl.innerHTML = `
      <div style="font-family:sans-serif;font-size:11px;padding:5px;">
        <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:5px;margin-bottom:5px;">
          <b>*** TIKET DAPUR / BAR ***</b><br>
          <span style="font-size:18px;font-weight:900;">NO ANTRIAN ${rawOrder.toUpperCase()}</span>
        </div>
        ${itemsHtml}
        <div style="text-align:center;margin-top:10px;font-size:10px;">[  ] SELESAI DIMASAK</div>
      </div>
    `;
    document.body.classList.add('printing-kitchen');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-kitchen'), 1000);
    return true;
  }

  return false;
}

/**
 * Eksekusi Buka Laci Kasir (Cash Drawer Kick)
 * Jika perangkat terhubung printer -> Buka langsung.
 * Jika perangkat sekunder (Device 2) -> Relay via Cloud Firestore ke Device 1!
 */
/**
 * Dapatkan token autentikasi POS lokal deterministik berbasis Store ID
 */
export function getLocalPosToken(storeId) {
  const s = String(storeId || state.storeId || 'aristotle_pos').trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return 'pos_' + (hash >>> 0).toString(16) + '_sec';
}

/**
 * Mencoba mencetak via Local Wi-Fi / Hotspot LAN HTTP Server (Terproteksi Token)
 * Mengembalikan true jika berhasil, false jika gagal / timeout
 */
async function tryPrintViaLocalLan(bytes, overrideIp = null) {
  let hostIp = overrideIp || state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
  if (!hostIp) {
    if (window.AndroidBridge && typeof window.AndroidBridge.getWifiGatewayIp === 'function') {
      try {
        const gw = window.AndroidBridge.getWifiGatewayIp();
        if (gw && gw.trim() && !gw.startsWith('127.')) hostIp = gw.trim();
      } catch (_) {}
    }
  }
  if (!hostIp && detectHotspotConnection()) {
    hostIp = '192.168.43.1';
  }
  // Standar fallback hotspot tethering jika perangkat disetel sebagai pelayan
  if (!hostIp && getDevicePrinterMode() === 'pelayan') {
    hostIp = '192.168.43.1';
  }
  if (!hostIp) return false;

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = window.btoa(binary);
  const token = getLocalPosToken(state.storeId);

  // 1. Jalur Utama Native Android Bridge (Bebas Mixed-Content, Bypass Cellular Data, Timeout Cukup untuk Cold BT Handshake)
  if (window.AndroidBridge && typeof window.AndroidBridge.sendLocalHttpRequest === 'function') {
    try {
      const respStr = window.AndroidBridge.sendLocalHttpRequest(
        `http://${hostIp}:8088/print`,
        'POST',
        JSON.stringify({ base64: b64 }),
        token,
        6000
      );
      if (respStr) {
        const data = JSON.parse(respStr);
        if (data.status === 'success') return true;
      }
    } catch (err) {
      console.log('Native LAN print note:', err.message);
    }
  }

  // 2. Jalur Web Fetch Fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`http://${hostIp}:8088/print`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-POS-Token': token
      },
      body: JSON.stringify({ base64: b64 }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return data.status === 'success';
    }
  } catch (e) {
    console.log('Local LAN print note:', e.message);
  }
  return false;
}
async function tryKickDrawerViaLocalLan(overrideIp = null) {
  let hostIp = overrideIp || state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
  if (!hostIp) {
    if (window.AndroidBridge && typeof window.AndroidBridge.getWifiGatewayIp === 'function') {
      try {
        const gw = window.AndroidBridge.getWifiGatewayIp();
        if (gw && gw.trim() && !gw.startsWith('127.')) hostIp = gw.trim();
      } catch (_) {}
    }
  }
  if (!hostIp && detectHotspotConnection()) {
    hostIp = '192.168.43.1';
  }
  if (!hostIp && getDevicePrinterMode() === 'pelayan') {
    hostIp = '192.168.43.1';
  }
  if (!hostIp) return false;

  const token = getLocalPosToken(state.storeId);

  // 1. Jalur Utama Native Android Bridge
  if (window.AndroidBridge && typeof window.AndroidBridge.sendLocalHttpRequest === 'function') {
    try {
      const respStr = window.AndroidBridge.sendLocalHttpRequest(
        `http://${hostIp}:8088/drawer`,
        'POST',
        JSON.stringify({ action: 'kick' }),
        token,
        5000
      );
      if (respStr) {
        const data = JSON.parse(respStr);
        if (data.status === 'success') return true;
      }
    } catch (err) {
      console.log('Native LAN drawer note:', err.message);
    }
  }

  // 2. Jalur Web Fetch Fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`http://${hostIp}:8088/drawer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-POS-Token': token
      },
      body: JSON.stringify({ action: 'kick' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return data.status === 'success';
    }
  } catch (e) {
    console.log('Local LAN drawer note:', e.message);
  }
  return false;
}

// Anti-spam concurrency guard untuk seluruh interaksi printer & laci kasir
let isPrinterActionBusy = false;

export async function kickCashDrawer(directOnly = false) {
  playClick('cash');

  if (isPrinterActionBusy) {
    showToast('Perintah buka laci sedang diproses...', 'info', 1500);
    return false;
  }
  isPrinterActionBusy = true;

  try {
    const role = getDevicePrinterMode();

    // 1. Kasir Utama (Host) atau perangkat yang terhubung langsung ke hardware printer
    if (directOnly || isLocalPrinterReady() || role === 'host') {
      return await executeDirectLocalKickDrawer();
    }

    // 2. HP Staf: Coba via Wi-Fi Lokal / Hotspot
    let hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
    if (!hostIp && detectHotspotConnection()) hostIp = '192.168.43.1';
    if (hostIp) {
      try {
        const localOk = await tryKickDrawerViaLocalLan(hostIp);
        if (localOk) {
          showToast('Laci kasir berhasil dibuka.', 'success', 2500);
          return true;
        }
      } catch (_) {}
    }

    // Cek koneksi internet sebelum mencoba Cloud Relay
    if (!navigator.onLine) {
      showToast('Gagal: Perangkat kasir utama tidak terdeteksi di jaringan lokal.', 'warning', 3000);
      return false;
    }

    // 3. Jalur Cadangan (Fallback): Cloud Drawer Relay
    showToast('Membuka laci kasir...', 'info', 2000);
    const jobId = await dispatchRemotePrintJob({ type: 'drawer' });
    await waitForRemotePrintJob(jobId, 5000);
    showToast('Laci kasir berhasil dibuka.', 'success', 2500);
    return true;
  } catch (err) {
    console.warn('Remote drawer kick note:', err);
    showToast('Gagal buka laci: ' + (err.message || 'Printer Kasir tidak merespons.'), 'warning', 3500);
    return false;
  } finally {
    isPrinterActionBusy = false;
  }
}

/**
 * Cetak Transaksi Utama
 * Jika perangkat terhubung printer -> Cetak langsung.
 * Jika perangkat sekunder (HP Pelayan) -> Coba Wi-Fi Lokal dulu, fallback ke Cloud Relay.
 */
export async function printReceipt(tx, shouldKickDrawer = null, forceMethod = null) {
  playClick('pop');
  if (!tx) return false;

  const cfg = state.printerConfig || {};
  const isCash = tx?.method === 'TUNAI' || tx?.paymentMethod === 'TUNAI' || (!tx?.isQris && tx?.method !== 'QRIS');
  const resolvedKick = (shouldKickDrawer !== null && shouldKickDrawer !== undefined)
    ? Boolean(shouldKickDrawer)
    : Boolean(cfg.autoKickDrawer !== false && isCash);

  const role = getDevicePrinterMode();

  // 1. Kasir Utama yang terhubung ke printer fisik
  if (isLocalPrinterReady() || role === 'host') {
    return await executeDirectLocalPrintReceipt(tx, resolvedKick, forceMethod);
  }

  // 2. HP Pelayan (Secondary Device)
  // Jalur Utama: Coba Wi-Fi Lokal / Hotspot LAN
  let hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
  if (!hostIp && detectHotspotConnection()) {
    hostIp = '192.168.43.1';
  }

  if (hostIp) {
    try {
      const escPosBytes = await buildEscPosBytes(tx, resolvedKick);
      const localOk = await tryPrintViaLocalLan(escPosBytes, hostIp);
      if (localOk) {
        showToast('Struk berhasil dicetak.', 'success', 2500);
        return true;
      }
    } catch (err) {
      console.log('LAN lokal dilewati:', err);
    }
  }

  // Cek koneksi sebelum fallback cloud
  if (!navigator.onLine) {
    showToast('Gagal cetak: Kasir utama tidak terdeteksi di jaringan lokal.', 'warning', 3000);
    return false;
  }

  // Jalur Cadangan: Cloud Relay Firebase
  try {
    showToast('Mengirim struk ke printer kasir...', 'info', 2000);
    const jobId = await dispatchRemotePrintJob({
      type: 'receipt',
      tx: tx,
      kickDrawer: resolvedKick,
      forceMethod: forceMethod
    });
    await waitForRemotePrintJob(jobId, 7000);
    showToast('Struk berhasil dicetak.', 'success', 2500);
    return true;
  } catch (err) {
    showToast('Gagal cetak: ' + (err.message || 'Kasir utama belum merespons.'), 'warning', 3500);
    return false;
  }
}

/**
 * Cetak Tiket Dapur / Kitchen Checkpoint
 */
export async function printKitchenTicket(tx, shouldKickDrawer = false) {
  playClick('pop');
  if (!tx) {
    showToast('Tidak ada data transaksi untuk dicetak.', 'warning');
    return false;
  }

  const role = getDevicePrinterMode();

  // 1. Jika perangkat ini Kasir Utama (Host) atau terhubung ke printer lokal (Device 1)
  if (isLocalPrinterReady() || role === 'host') {
    return await executeDirectLocalKitchenTicket(tx, shouldKickDrawer);
  }

  // 2. Jalur Utama: Coba cetak langsung via Wi-Fi Lokal / Hotspot
  let hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
  if (!hostIp && detectHotspotConnection()) {
    hostIp = '192.168.43.1';
  }

  if (hostIp) {
    try {
      const escPosBytes = buildKitchenTicketEscPosBytes(tx, shouldKickDrawer);
      const localOk = await tryPrintViaLocalLan(escPosBytes, hostIp);
      if (localOk) {
        showToast('Tiket dapur berhasil dicetak.', 'success', 2500);
        return true;
      }
    } catch (err) {
      console.log('Gagal cetak dapur via LAN lokal, beralih ke Cloud Relay...', err);
    }
  }

  // Cek koneksi sebelum fallback cloud
  if (!navigator.onLine) {
    showToast('Gagal: Kasir utama tidak terdeteksi di jaringan lokal.', 'warning', 3000);
    return false;
  }

  // 3. Jalur Cadangan (Fallback): Cloud Print Relay Firebase
  try {
    showToast('Mengirim tiket dapur ke kasir utama...', 'info', 2000);
    const jobId = await dispatchRemotePrintJob({
      type: 'kitchen',
      tx: tx,
      kickDrawer: shouldKickDrawer
    });
    await waitForRemotePrintJob(jobId, 7000);
    showToast('Tiket dapur berhasil dicetak.', 'success', 2500);
    return true;
  } catch (err) {
    console.warn('Cloud kitchen print relay note:', err);
    // Fallback: cetak langsung secara lokal agar tidak mandek!
    return await executeDirectLocalKitchenTicket(tx);
  }
}

// ================= CLOUD REMOTE PRINT LISTENER (DAEMON HOST) =================
let remotePrintUnsubscribe = null;
let hostPrintJobQueue = Promise.resolve();

function enqueueHostPrintTask(taskFn) {
  const next = hostPrintJobQueue.then(() => taskFn()).catch(err => {
    console.warn('Host print queue task error:', err);
  });
  hostPrintJobQueue = next;
  return next;
}

/**
 * Aktifkan listener di background untuk memproses tugas cetak dari perangkat lain di toko
 */
export function setupRemotePrintHostListener() {
  if (remotePrintUnsubscribe) {
    try { remotePrintUnsubscribe(); } catch (_) {}
    remotePrintUnsubscribe = null;
  }

  const role = getDevicePrinterMode();
  if (role !== 'host') {
    console.log('Perangkat ini disetel sebagai Pelayan, host listener dinonaktifkan.');
    return;
  }

  console.log('Mengaktifkan Remote Print Host Listener untuk toko:', state.storeId);
  remotePrintUnsubscribe = listenToRemotePrintJobs((job) => {
    if (!job || job.status !== 'pending') return;

    enqueueHostPrintTask(async () => {
      console.log('Menerima tugas cetak dari pelayan (terantre):', job.createdByName, job);
      await updateRemotePrintJobStatus(job.id, 'processing');

      try {
        if (job.type === 'receipt' && job.tx) {
          const cfg = state.printerConfig || {};
          const isCash = job.tx.method === 'TUNAI';
          const shouldKick = job.kickDrawer !== undefined ? Boolean(job.kickDrawer) : Boolean(cfg.autoKickDrawer !== false && isCash);
          await executeDirectLocalPrintReceipt(job.tx, shouldKick, job.forceMethod);
          showToast(`Mencetak struk dari [${job.createdByName || 'Staf'}]`, 'info', 3000);
        } else if (job.type === 'kitchen' && job.tx) {
          const cfg = state.printerConfig || {};
          const isCash = job.tx.method === 'TUNAI';
          const shouldKick = job.kickDrawer !== undefined ? Boolean(job.kickDrawer) : Boolean(cfg.autoKickDrawer !== false && isCash);
          await executeDirectLocalKitchenTicket(job.tx, shouldKick);
          showToast(`Mencetak tiket dapur dari [${job.createdByName || 'Staf'}]`, 'info', 3000);
        } else if (job.type === 'drawer') {
          await executeDirectLocalKickDrawer();
          showToast(`Membuka laci kasir atas perintah [${job.createdByName || 'Staf'}]`, 'info', 3000);
        }

        await updateRemotePrintJobStatus(job.id, 'completed');
      } catch (err) {
        console.error('Eksekusi remote print job gagal:', err);
        await updateRemotePrintJobStatus(job.id, 'failed', { error: err.message || 'Gagal cetak' });
      }
    });
  });
}

// Otomatis kaitkan listener saat modul dimuat & Firebase siap
try {
  registerRemotePrintListener(() => setupRemotePrintHostListener());
} catch (_) {}

/**
 * Update realtime UI indikator status printer di Header & Modal
 */
export function updatePrinterUIStatus(skipHeartbeat = false) {
  const isReady = isLocalPrinterReady();
  let printerName = '';

  if (window.AndroidBridge && typeof window.AndroidBridge.getConnectedPrinterInfo === 'function') {
    try {
      printerName = window.AndroidBridge.getConnectedPrinterInfo();
    } catch (_) {}
  }

  // Header badges
  const headerBadge = document.getElementById('headerPrinterStatusBadge');
  const headerDot = document.getElementById('headerPrinterDot');
  const headerIcon = document.getElementById('headerPrinterIcon');
  const headerText = document.getElementById('headerPrinterText');
  const mobileDot = document.getElementById('mobileHeaderPrinterDot');
  const railDot = document.getElementById('railPrinterDot');

  // Modal elements
  const modalBadge = document.getElementById('printerConnectionBadge');
  const roleCard = document.getElementById('multiDeviceRoleCard');
  const roleDot = document.getElementById('multiDeviceRoleDot');
  const roleTitle = document.getElementById('multiDeviceRoleTitle');
  const roleBadge = document.getElementById('multiDeviceRoleBadge');
  const roleDesc = document.getElementById('multiDeviceRoleDesc');
  const rolePrinterName = document.getElementById('multiDevicePrinterNameDisplay');
  const btnTestRelay = document.getElementById('btnTestCloudRelay');
  const isHotspot = detectHotspotConnection();

  const currentRole = getDevicePrinterMode();

  if (currentRole === 'host') {
    // KASIR UTAMA (HOST POS & PRINTER HUB)
    if (!skipHeartbeat) {
      if (!hostHeartbeatTimer) startHostHeartbeatLoop();
      if (!remotePrintUnsubscribe) setupRemotePrintHostListener();
    }
    const displayName = isHotspot ? 'Kasir (Hotspot)' : (printerName ? `Printer: ${printerName}` : (isReady ? 'Printer Siap' : 'Kasir Utama'));
    if (headerBadge) {
      headerBadge.className = 'hidden';
    }
    if (headerDot) headerDot.className = isHotspot ? 'w-2 h-2 rounded-full bg-amber-500 shrink-0' : 'w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse';
    if (railDot) railDot.className = isHotspot ? 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white' : 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white animate-pulse';
    if (headerIcon) {
      headerIcon.textContent = isHotspot ? 'wifi_tethering' : 'print';
      headerIcon.className = isHotspot ? 'material-symbols-rounded text-sm text-amber-700' : 'material-symbols-rounded text-sm text-emerald-700';
    }
    if (headerText) headerText.textContent = displayName;
    if (mobileDot) mobileDot.className = isHotspot ? 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500' : 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse';

    if (modalBadge) {
      modalBadge.innerHTML = isHotspot 
        ? `<span class="text-amber-800 font-bold text-[11px]">Hotspot Aktif</span>`
        : `<span class="text-emerald-700 font-bold text-[11px]">${printerName || 'Terhubung (Kasir Host)'}</span>`;
    }

    if (roleCard) {
      roleCard.className = isHotspot
        ? 'bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-col gap-2'
        : 'bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex flex-col gap-2';
    }
    if (roleDot) roleDot.className = isHotspot ? 'w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0' : 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0';
    if (roleTitle) roleTitle.textContent = 'Kasir Utama';
    if (roleBadge) {
      roleBadge.textContent = isHotspot ? 'Hotspot Aktif' : 'Host Wi-Fi';
      roleBadge.className = isHotspot 
        ? 'px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 font-extrabold text-[10px] shrink-0'
        : 'px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 font-extrabold text-[10px] shrink-0';
    }
    if (roleDesc) {
      roleDesc.textContent = isHotspot
        ? 'Hotspot HP aktif. HP Staf dapat tersambung langsung.'
        : `Terhubung langsung ke printer (${printerName || 'Bluetooth'}). Menerima pesanan cetak dari HP staf.`;
    }
    if (rolePrinterName) rolePrinterName.textContent = isHotspot ? 'Jalur: Hotspot HP (192.168.43.1)' : (printerName ? `Hardware: ${printerName}` : 'Hardware: Bluetooth Standby');

    const isAndroidApk = Boolean(window.AndroidBridge && typeof window.AndroidBridge.getLocalIpAddress === 'function');
    const localOfflineInfo = document.getElementById('localOfflineHostInfo');
    const webHostInfo = document.getElementById('webBrowserHostInfo');
    const localIpBadge = document.getElementById('localHostIpBadge');
    const localHostIpContainer = document.getElementById('localHostIpInputContainer');

    if (isAndroidApk) {
      if (localOfflineInfo) localOfflineInfo.classList.remove('hidden');
      if (webHostInfo) webHostInfo.classList.add('hidden');
      const myIp = window.AndroidBridge.getLocalIpAddress();
      if (localIpBadge) localIpBadge.textContent = `${myIp}:8088`;
      const posToken = getLocalPosToken(state.storeId);
      if (typeof window.AndroidBridge.setLocalPosToken === 'function') {
        window.AndroidBridge.setLocalPosToken(posToken);
      }
      try {
        syncPublishHostPresence(myIp, printerName || 'HP Kasir');
      } catch (_) {}
    } else {
      if (localOfflineInfo) localOfflineInfo.classList.add('hidden');
      if (webHostInfo) webHostInfo.classList.remove('hidden');
    }

    if (localHostIpContainer) localHostIpContainer.classList.add('hidden');
    if (btnTestRelay) btnTestRelay.classList.add('hidden');

    const hardwareSection = document.getElementById('hostHardwareConfigSection');
    const previewSection = document.getElementById('printerPreviewSection');
    const submitBtn = document.getElementById('printerModalSubmitBtn');
    const leftCol = document.getElementById('printerConfigLeftCol');
    if (hardwareSection) hardwareSection.classList.remove('hidden');
    if (previewSection) previewSection.classList.remove('hidden');
    if (submitBtn) submitBtn.classList.remove('hidden');
    if (leftCol) {
      leftCol.classList.remove('md:col-span-12', 'max-w-xl', 'mx-auto', 'w-full');
      leftCol.classList.add('md:col-span-7');
    }

  } else {
    // HP STAF
    if (headerBadge) {
      headerBadge.className = 'hidden';
    }
    if (headerDot) headerDot.className = 'w-2 h-2 rounded-full bg-sky-500 shrink-0';
    if (railDot) railDot.className = 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 border border-white';
    if (headerIcon) {
      headerIcon.textContent = 'smartphone';
      headerIcon.className = 'material-symbols-rounded text-sm text-sky-700';
    }
    if (headerText) headerText.textContent = 'HP Staf';
    if (mobileDot) mobileDot.className = 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-sky-500';

    if (modalBadge) {
      modalBadge.innerHTML = `<span class="text-sky-700 font-bold text-[11px]">HP Staf</span>`;
    }

    if (roleCard) {
      roleCard.className = 'bg-sky-50 border border-sky-200 rounded-2xl p-3 flex flex-col gap-2';
    }
    if (roleDot) roleDot.className = 'w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0';
    if (roleTitle) roleTitle.textContent = 'HP Staf';
    if (roleBadge) {
      roleBadge.textContent = 'Siap';
      roleBadge.className = 'px-2 py-0.5 rounded-full bg-sky-200/80 text-sky-900 font-extrabold text-[10px] shrink-0';
    }
    if (roleDesc) {
      roleDesc.textContent = 'Pesanan dan cetak struk otomatis terkirim ke kasir utama.';
    }
    if (rolePrinterName) {
      rolePrinterName.textContent = 'Tersambung ke Kasir';
    }

    const localOfflineInfo = document.getElementById('localOfflineHostInfo');
    const webHostInfo = document.getElementById('webBrowserHostInfo');
    const localHostIpContainer = document.getElementById('localHostIpInputContainer');
    if (localOfflineInfo) localOfflineInfo.classList.add('hidden');
    if (webHostInfo) webHostInfo.classList.add('hidden');
    if (localHostIpContainer) localHostIpContainer.classList.remove('hidden');

    // Sembunyikan bagian pengaturan hardware printer & simpan untuk HP Pelayan
    const hardwareSection = document.getElementById('hostHardwareConfigSection');
    const previewSection = document.getElementById('printerPreviewSection');
    const submitBtn = document.getElementById('printerModalSubmitBtn');
    const leftCol = document.getElementById('printerConfigLeftCol');
    if (hardwareSection) hardwareSection.classList.add('hidden');
    if (previewSection) previewSection.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (leftCol) {
      leftCol.classList.remove('md:col-span-7');
      leftCol.classList.add('md:col-span-12', 'max-w-xl', 'mx-auto', 'w-full');
    }

    // Pasang listener status Kasir Utama realtime
    if (!skipHeartbeat && !hostPresenceUnsub) {
      setupHostPresenceListener();
    }
  }

  // Update styling tombol toggle peran
  const btnHost = document.getElementById('btnRoleHost');
  const btnPelayan = document.getElementById('btnRolePelayan');
  if (btnHost && btnPelayan) {
    const base = 'h-9 px-2 rounded-lg text-xs flex items-center justify-center gap-1 transition ';
    if (currentRole === 'host') {
      btnHost.className = base + 'font-black bg-emerald-700 text-white';
      btnPelayan.className = base + 'font-bold text-stone-600';
    } else {
      btnHost.className = base + 'font-bold text-stone-600';
      btnPelayan.className = base + 'font-black bg-sky-600 text-white';
    }
  }
}

/**
 * Uji Coba Pengiriman Cetak dari HP Pelayan ke Kasir Utama (Coba LAN Zero-Delay dulu, lalu Cloud)
 */
export async function testCloudRelayPrint() {
  playClick('pop');
  const tx = {
    id: 'TES-' + Math.floor(1000 + Math.random() * 9000),
    date: new Date().toISOString(),
    items: [
      { name: 'Tes Koneksi Multi-Device', qty: 1, price: 0, subtotal: 0 },
      { name: 'Dari: HP Pelayan', qty: 1, price: 0, subtotal: 0 },
      { name: 'Ke: Printer Kasir Utama', qty: 1, price: 0, subtotal: 0 }
    ],
    total: 0,
    paid: 0,
    change: 0,
    method: 'TUNAI',
    cashier: getDeviceName() || 'Pelayan'
  };

  // 1. Coba via Jaringan Lokal jika ada Host IP
  let hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip');
  if (!hostIp && detectHotspotConnection()) hostIp = '192.168.43.1';

  if (hostIp) {
    try {
      showToast('Mengirim tes cetak...', 'info', 2000);
      const escPosBytes = await buildEscPosBytes(tx, false);
      const localOk = await tryPrintViaLocalLan(escPosBytes, hostIp);
      if (localOk) {
        showToast('Struk tes berhasil dicetak.', 'success', 3000);
        return true;
      }
    } catch (e) {
      console.log('Local LAN test print bypassed:', e);
    }
  }

  // 2. Fallback via Cloud Relay Firebase
  try {
    showToast('Mengirim tes cetak via cloud...', 'info', 2000);
    const jobId = await dispatchRemotePrintJob({
      type: 'receipt',
      tx: tx
    });
    showToast('Menunggu respon kasir utama...', 'info', 2000);
    await waitForRemotePrintJob(jobId, 12000);
    showToast('Struk tes berhasil dicetak.', 'success', 3000);
    return true;
  } catch (err) {
    showToast('Gagal tes cetak: ' + (err.message || 'Kasir utama tidak merespons.'), 'error', 4000);
    return false;
  }
}

// Auto-update UI status badge periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    try { updatePrinterUIStatus(); } catch (_) {}
  }, 3500);
}

/**
 * Render elemen HTML #printArea agar pas 100% untuk kertas thermal 58mm
 */
export function renderPrintableReceiptArea(tx, cfg = null) {
  const config = cfg || state.printerConfig || {};
  const logoImgEl = document.getElementById('receiptLogoImg');
  const storeNameEl = document.getElementById('receiptStoreName');
  const taglineEl = document.getElementById('receiptTagline');
  const addressEl = document.getElementById('receiptAddress');
  const phoneEl = document.getElementById('receiptPhone');
  const txIdEl = document.getElementById('receiptTxId');
  const dateEl = document.getElementById('receiptDate');
  const orderTimeEl = document.getElementById('receiptOrderTime');
  const cashierEl = document.getElementById('receiptCashier');
  const itemListEl = document.getElementById('receiptItemList');
  const subtotalEl = document.getElementById('receiptSubtotal');
  const totalEl = document.getElementById('receiptTotal');
  const cashRow = document.getElementById('receiptCashRow');
  const changeRow = document.getElementById('receiptChangeRow');
  const socialEl = document.getElementById('receiptSocial');
  const footerNoteEl = document.getElementById('receiptFooterNote');
  const queueBoxEl = document.getElementById('receiptQueueBottomBox');
  const queueTextEl = document.getElementById('receiptQueueBottomText');

  // Logo Toko
  if (logoImgEl) {
    if (config.logoBase64 && config.showLogo !== false) {
      logoImgEl.src = config.logoBase64;
      logoImgEl.classList.remove('hidden');
    } else {
      logoImgEl.src = '';
      logoImgEl.classList.add('hidden');
    }
  }

  const activeStoreName = config.headerStoreName || state.storeProfile?.name || 'TOKO UTAMA';
  if (storeNameEl) storeNameEl.innerText = activeStoreName.toUpperCase();
  if (taglineEl) {
    taglineEl.innerText = config.headerTagline || '';
    taglineEl.style.display = config.headerTagline ? 'block' : 'none';
  }
  if (addressEl) {
    addressEl.innerText = config.headerAddress || state.storeProfile?.city || '';
    addressEl.style.display = (config.headerAddress || state.storeProfile?.city) ? 'block' : 'none';
  }
  if (phoneEl) {
    const ph = config.headerPhone || state.auth?.phone || '';
    phoneEl.innerText = ph ? `Telp/WA: ${ph}` : '';
    phoneEl.style.display = ph ? 'block' : 'none';
  }

  const d = tx.date ? new Date(tx.date) : new Date();
  const txDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  
  if (txIdEl) txIdEl.innerText = `No. Kwitansi: #${tx.id ? tx.id.replace('TX-', '') : '001'}`;
  if (dateEl) dateEl.innerText = txDate;
  if (orderTimeEl) orderTimeEl.innerText = txDate;
  if (cashierEl) cashierEl.innerText = config.cashierName || state.auth?.ownerName || 'Kasir';

  const itemStyle = config.itemPriceStyle || 'compact';
  const sectionSpacing = config.sectionSpacing !== undefined ? Number(config.sectionSpacing) : 1;

  const printArea = document.getElementById('printArea');
  if (printArea) {
    printArea.classList.remove('gap-1', 'gap-1.5', 'gap-2', 'gap-3', 'leading-tight', 'leading-normal', 'leading-relaxed');
    if (sectionSpacing === 0) {
      printArea.classList.add('gap-1', 'leading-tight');
    } else if (sectionSpacing === 2) {
      printArea.classList.add('gap-3', 'leading-relaxed');
    } else {
      printArea.classList.add('gap-1.5', 'leading-normal');
    }
  }

  if (itemListEl && Array.isArray(tx.items)) {
    itemListEl.innerHTML = tx.items.map(item => {
      const addOns = Array.isArray(item.addOns) ? item.addOns : [];
      const addOnTotal = addOns.reduce((sum, ao) => sum + (Number(ao.price) || 0), 0);
      const basePrice = (typeof item.basePrice === 'number') ? item.basePrice : Math.max(0, (Number(item.price) || 0) - addOnTotal);
      const hasPricedAddons = addOns.some(ao => Number(ao.price) > 0);
      const baseSubtotal = (hasPricedAddons ? basePrice : (Number(item.price) || basePrice)) * item.qty;
      const basePriceStr = formatRp(baseSubtotal).replace('Rp ', '');
      const hasDetail = itemStyle === 'detailed' && item.qty > 1;
      const unitPriceStr = formatRp(hasPricedAddons ? basePrice : item.price).replace('Rp ', '');

      return `
        <div class="py-0.5 flex flex-col text-[10.5px] leading-tight">
          <div class="flex justify-between items-start gap-1">
            <span class="font-bold text-stone-900 break-words flex-1 text-left">${item.qty}x ${escapeHtml(item.name)}</span>
            <span class="font-black text-stone-900 whitespace-nowrap text-right shrink-0">${basePriceStr}</span>
          </div>
          ${hasDetail ? `<div class="text-[9.5px] text-stone-500 pl-3">@ ${unitPriceStr}</div>` : ''}
          ${hasPricedAddons ? `
            <div class="flex flex-col pl-3 mt-0.5 gap-0.5">
              ${addOns.map(ao => {
                const aoUnit = Number(ao.price) || 0;
                const aoSub = aoUnit * item.qty;
                return `
                  <div class="flex justify-between text-[9.5px] text-stone-700">
                    <span>+ ${escapeHtml(ao.name)}${item.qty > 1 ? ` (${item.qty}x)` : ''}</span>
                    <span class="font-semibold">${aoUnit > 0 ? formatRp(aoSub).replace('Rp ', '') : 'Gratis'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : (addOns.length > 0 ? `
            <div class="text-[9.5px] text-stone-600 pl-3">
              ${addOns.map(ao => `+ ${escapeHtml(ao.name)}`).join(', ')}
            </div>
          ` : '')}
          ${item.note ? `<span class="text-[9px] text-stone-600 italic pl-3 mt-0.5">* ${escapeHtml(item.note)}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  const rawSubtotal = tx.subtotal || tx.total;
  if (subtotalEl) subtotalEl.innerText = formatRp(rawSubtotal);

  const discountRow = document.getElementById('receiptDiscountRow');
  const discountLabelEl = document.getElementById('receiptDiscountLabel');
  const discountValEl = document.getElementById('receiptDiscountVal');

  if (tx.discount && tx.discount.amount > 0) {
    if (discountRow) discountRow.style.display = 'flex';
    if (discountLabelEl) {
      discountLabelEl.innerText = tx.discount.type === 'percent' 
        ? `Diskon (${tx.discount.value}%):` 
        : 'Diskon:';
    }
    if (discountValEl) discountValEl.innerText = `-${formatRp(tx.discount.amount)}`;
  } else {
    if (discountRow) discountRow.style.display = 'none';
  }

  if (totalEl) totalEl.innerText = formatRp(tx.total);

  if (tx.method === 'QRIS') {
    if (cashRow) cashRow.style.display = 'none';
    if (changeRow) changeRow.style.display = 'none';
  } else {
    if (cashRow) {
      cashRow.style.display = 'flex';
      const cashValEl = document.getElementById('receiptCash');
      if (cashValEl) cashValEl.innerText = formatRp(tx.cashGiven || tx.total);
    }
    if (changeRow) {
      const changeVal = (tx.cashGiven || tx.total) - tx.total;
      if (changeVal > 0) {
        changeRow.style.display = 'flex';
        const changeValEl = document.getElementById('receiptChange');
        if (changeValEl) changeValEl.innerText = formatRp(changeVal);
      } else {
        changeRow.style.display = 'none';
      }
    }
  }

  if (socialEl) {
    socialEl.innerText = config.footerSocial || '';
    socialEl.style.display = config.footerSocial ? 'block' : 'none';
  }
  if (footerNoteEl) {
    footerNoteEl.innerText = config.footerNote || 'Terimakasih telah berkunjung.';
  }

  // Banner No Antrian Besar di Bawah
  if (queueBoxEl) {
    queueBoxEl.style.display = config.showQueueBottom !== false ? 'block' : 'none';
    if (queueTextEl) {
      queueTextEl.innerText = `NO ANTRIAN ${tx.orderName ? tx.orderName.toUpperCase() : '01'}`;
    }
  }
}

/**
 * Handle Upload Gambar Logo Toko
 */
export function handleLogoUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target.result;
    
    // Resize & convert via canvas agar ramah memori & thermal
    const img = new Image();
    img.onload = () => {
      const maxDim = 512;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      }
      const optimizedBase64 = canvas.toDataURL('image/png');

      // Update state
      if (!state.printerConfig) state.printerConfig = {};
      state.printerConfig.logoBase64 = optimizedBase64;
      state.printerConfig.showLogo = true;

      // Update Preview di Form Modal
      const previewImg = document.getElementById('printerLogoPreviewImg');
      const placeholder = document.getElementById('printerLogoPlaceholder');
      const removeBtn = document.getElementById('printerRemoveLogoBtn');
      if (previewImg) {
        previewImg.src = optimizedBase64;
        previewImg.classList.remove('hidden');
      }
      if (placeholder) placeholder.classList.add('hidden');
      if (removeBtn) removeBtn.classList.remove('hidden');

      updateLiveReceiptPreview();
      showToast('Logo toko berhasil diunggah!', 'success');
    };
    img.src = base64;
  };
  reader.readAsDataURL(file);
}

/**
 * Hapus Gambar Logo Toko
 */
export function removeLogoImage() {
  playClick('tap');
  if (!state.printerConfig) state.printerConfig = {};
  state.printerConfig.logoBase64 = '';
  
  const previewImg = document.getElementById('printerLogoPreviewImg');
  const placeholder = document.getElementById('printerLogoPlaceholder');
  const removeBtn = document.getElementById('printerRemoveLogoBtn');
  const logoInput = document.getElementById('printerLogoInput');

  if (previewImg) {
    previewImg.src = '';
    previewImg.classList.add('hidden');
  }
  if (placeholder) placeholder.classList.remove('hidden');
  if (removeBtn) removeBtn.classList.add('hidden');
  if (logoInput) logoInput.value = '';

  updateLiveReceiptPreview();
  showToast('Logo toko dihapus.', 'info');
}

/**
 * Ambil daftar produk riil toko untuk sampel struk
 */
function getSampleTxData() {
  const realProducts = Array.isArray(state.products) && state.products.length > 0 ? state.products : null;
  let items = [];

  if (realProducts && realProducts.length >= 2) {
    const hasAddonsOnFirst = Array.isArray(realProducts[0].addOns) && realProducts[0].addOns.length > 0;
    const sampleAddon = hasAddonsOnFirst ? realProducts[0].addOns[0] : { name: 'Ekstra Topping', price: 3000 };
    items = [
      { 
        name: realProducts[0].name, 
        basePrice: realProducts[0].price, 
        price: realProducts[0].price + (Number(sampleAddon.price) || 0), 
        qty: 1, 
        subtotal: realProducts[0].price + (Number(sampleAddon.price) || 0),
        addOns: [sampleAddon]
      },
      { name: realProducts[1].name, basePrice: realProducts[1].price, price: realProducts[1].price, qty: 2, subtotal: realProducts[1].price * 2 }
    ];
  } else {
    items = [
      { name: 'Nasi Uduk Komplit', basePrice: 14000, price: 17000, qty: 1, subtotal: 17000, addOns: [{ name: 'Telur Balado', price: 3000 }] },
      { name: 'Ayam Geprek + Nasi', basePrice: 17000, price: 17000, qty: 1, subtotal: 17000 },
      { name: 'Es Teh Manis', basePrice: 5000, price: 5000, qty: 2, subtotal: 10000 }
    ];
  }

  const total = items.reduce((sum, it) => sum + it.subtotal, 0);

  return {
    id: 'TX-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toISOString(),
    orderName: '01',
    method: 'TUNAI',
    items,
    total,
    cashGiven: total + 10000,
    change: 10000
  };
}

/**
 * Uji Coba Cetak Struk 58mm (Sample Test Print Menu Riil Toko)
 */
export async function testPrintReceipt() {
  playClick('tap');
  if (isPrinterActionBusy) {
    showToast('Sedang memproses uji coba sebelumnya...', 'info', 1500);
    return;
  }
  isPrinterActionBusy = true;

  try {
    const sampleTx = getSampleTxData();
    const role = getDevicePrinterMode();
    const modalCheckbox = document.getElementById('printerAutoKickDrawer');
    const autoKickFromModal = modalCheckbox ? modalCheckbox.checked : undefined;
    const cfgKick = state.printerConfig?.autoKickDrawer !== false;
    const shouldKick = autoKickFromModal !== undefined ? autoKickFromModal : cfgKick;

    if (role === 'pelayan') {
      await printReceipt(sampleTx, shouldKick);
    } else {
      showToast('Menguji cetak struk kasir...', 'info', 2000);
      await executeDirectLocalPrintReceipt(sampleTx, shouldKick);
    }
  } catch (err) {
    console.error('Test receipt error:', err);
    showToast('Gagal tes struk: ' + (err.message || 'Kesalahan sistem'), 'error');
  } finally {
    isPrinterActionBusy = false;
  }
}

/**
 * Uji Coba Cetak Tiket Dapur 58mm (Sample Test Print Kitchen Ticket)
 */
export async function testPrintKitchenTicket() {
  playClick('tap');
  if (isPrinterActionBusy) {
    showToast('Sedang memproses uji coba sebelumnya...', 'info', 1500);
    return;
  }
  isPrinterActionBusy = true;

  try {
    const sampleTx = getSampleTxData();
    const role = getDevicePrinterMode();
    const modalCheckbox = document.getElementById('printerAutoKickDrawer');
    const autoKickFromModal = modalCheckbox ? modalCheckbox.checked : undefined;
    const cfgKick = state.printerConfig?.autoKickDrawer !== false;
    const shouldKick = autoKickFromModal !== undefined ? autoKickFromModal : cfgKick;

    if (role === 'pelayan') {
      await printKitchenTicket(sampleTx, shouldKick);
    } else {
      showToast('Menguji cetak tiket dapur...', 'info', 2000);
      await executeDirectLocalKitchenTicket(sampleTx, shouldKick);
    }
  } catch (err) {
    console.error('Test kitchen ticket error:', err);
    showToast('Gagal tes tiket dapur: ' + (err.message || 'Kesalahan sistem'), 'error');
  } finally {
    isPrinterActionBusy = false;
  }
}

/**
 * Buka Modal Pengaturan Printer & Struk
 */
export function openPrinterConfigModal() {
  playClick('pop');
  const cfg = state.printerConfig || {};
  
  const modal = document.getElementById('printerConfigModal');
  const paperWidthSelect = document.getElementById('printerPaperWidth');
  const printMethodSelect = document.getElementById('printerMethodSelect');
  const autoPrintCheckbox = document.getElementById('printerAutoPrint');
  const autoPrintKitchenCheckbox = document.getElementById('printerAutoPrintKitchen');
  const autoKickCheckbox = document.getElementById('printerAutoKickDrawer');
  const showLogoCheckbox = document.getElementById('printerShowLogo');
  const previewImg = document.getElementById('printerLogoPreviewImg');
  const placeholder = document.getElementById('printerLogoPlaceholder');
  const removeBtn = document.getElementById('printerRemoveLogoBtn');
  const storeNameInput = document.getElementById('printerStoreNameInput');
  const taglineInput = document.getElementById('printerTaglineInput');
  const addressInput = document.getElementById('printerAddressInput');
  const phoneInput = document.getElementById('printerPhoneInput');
  const cashierInput = document.getElementById('printerCashierInput');
  const socialInput = document.getElementById('printerSocialInput');
  const footerNoteInput = document.getElementById('printerFooterNoteInput');
  const showQueueBottomCheckbox = document.getElementById('printerShowQueueBottom');
  const feedLinesSelect = document.getElementById('printerFeedLinesSelect');
  const sectionSpacingSelect = document.getElementById('printerSectionSpacingSelect');
  const dividerStyleSelect = document.getElementById('printerDividerStyleSelect');
  const itemPriceStyleSelect = document.getElementById('printerItemPriceStyleSelect');

  if (paperWidthSelect) paperWidthSelect.value = cfg.paperWidth || '58mm';
  if (printMethodSelect) printMethodSelect.value = cfg.printMethod || 'browser';
  if (feedLinesSelect) feedLinesSelect.value = String(cfg.feedLines !== undefined ? cfg.feedLines : 1);
  if (sectionSpacingSelect) sectionSpacingSelect.value = String(cfg.sectionSpacing !== undefined ? cfg.sectionSpacing : 1);
  if (dividerStyleSelect) dividerStyleSelect.value = cfg.dividerStyle || 'dashed';
  if (itemPriceStyleSelect) itemPriceStyleSelect.value = cfg.itemPriceStyle || 'compact';
  if (autoPrintCheckbox) autoPrintCheckbox.checked = !!cfg.autoPrint;
  if (autoPrintKitchenCheckbox) autoPrintKitchenCheckbox.checked = !!cfg.autoPrintKitchen;
  if (autoKickCheckbox) autoKickCheckbox.checked = cfg.autoKickDrawer !== false;
  if (showLogoCheckbox) showLogoCheckbox.checked = cfg.showLogo !== false;

  if (cfg.logoBase64) {
    if (previewImg) { previewImg.src = cfg.logoBase64; previewImg.classList.remove('hidden'); }
    if (placeholder) placeholder.classList.add('hidden');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
    if (placeholder) placeholder.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
  }

  if (storeNameInput) storeNameInput.value = cfg.headerStoreName || state.storeProfile?.name || '';
  if (taglineInput) taglineInput.value = cfg.headerTagline || '';
  if (addressInput) addressInput.value = cfg.headerAddress || state.storeProfile?.city || '';
  if (phoneInput) phoneInput.value = cfg.headerPhone || state.auth?.phone || '';
  if (cashierInput) cashierInput.value = cfg.cashierName || 'Kasir';
  if (socialInput) socialInput.value = cfg.footerSocial || '';
  if (footerNoteInput) footerNoteInput.value = cfg.footerNote || 'Terimakasih telah berkunjung.';
  if (showQueueBottomCheckbox) showQueueBottomCheckbox.checked = cfg.showQueueBottom !== false;

  const localHostIpInput = document.getElementById('printerLocalHostIp');
  if (localHostIpInput) {
    localHostIpInput.value = cfg.localHostIp || localStorage.getItem('aristotle_local_host_ip') || '';
  }

  updateLiveReceiptPreview();
  updatePrinterUIStatus();

  if (modal) modal.classList.remove('hidden');
}

/**
 * Tutup Modal Pengaturan Printer
 */
export function closePrinterConfigModal() {
  const modal = document.getElementById('printerConfigModal');
  if (modal) modal.classList.add('hidden');
}

let liveReceiptPreviewTimer = null;

/**
 * Perbarui teks pratinjau struk secara realtime di dalam modal (Smooth Debounced)
 */
export function updateLiveReceiptPreview(immediate = false) {
  if (liveReceiptPreviewTimer) {
    clearTimeout(liveReceiptPreviewTimer);
    liveReceiptPreviewTimer = null;
  }

  if (immediate) {
    _renderLiveReceiptPreviewInternal();
    return;
  }

  liveReceiptPreviewTimer = setTimeout(() => {
    _renderLiveReceiptPreviewInternal();
  }, 40);
}

function _renderLiveReceiptPreviewInternal() {
  const cfg = {
    paperWidth: document.getElementById('printerPaperWidth')?.value || '58mm',
    logoBase64: state.printerConfig?.logoBase64 || '',
    showLogo: document.getElementById('printerShowLogo')?.checked !== false,
    headerStoreName: document.getElementById('printerStoreNameInput')?.value || '',
    headerTagline: document.getElementById('printerTaglineInput')?.value || '',
    headerAddress: document.getElementById('printerAddressInput')?.value || '',
    headerPhone: document.getElementById('printerPhoneInput')?.value || '',
    cashierName: document.getElementById('printerCashierInput')?.value || 'Kasir',
    footerSocial: document.getElementById('printerSocialInput')?.value || '',
    footerNote: document.getElementById('printerFooterNoteInput')?.value || 'Terimakasih telah berkunjung.',
    footerHelp: 'Powered by Aristotle POS',
    showQueueBottom: document.getElementById('printerShowQueueBottom')?.checked !== false,
    feedLines: Number(document.getElementById('printerFeedLinesSelect')?.value) || 1
  };

  const sampleTx = getSampleTxData();

  // 1. Update Realistic Paper Container Width & Badge
  const paperContainer = document.getElementById('liveReceiptPaper');
  const paperBadge = document.getElementById('previewPaperBadge');
  if (paperContainer) {
    if (cfg.paperWidth === '80mm') {
      paperContainer.className = 'w-full max-w-[340px] bg-white p-4 shadow-md rounded-xl border border-dashed border-stone-300 text-stone-900 font-sans text-xs leading-normal flex flex-col gap-1.5 transition-all';
      if (paperBadge) paperBadge.innerText = '80mm (Lebar)';
    } else {
      paperContainer.className = 'w-full max-w-[280px] bg-white p-3.5 shadow-md rounded-xl border border-dashed border-stone-300 text-stone-900 font-sans text-xs leading-normal flex flex-col gap-1.5 transition-all';
      if (paperBadge) paperBadge.innerText = '58mm (Standar)';
    }
  }

  // 2. Logo Toko
  const logoImg = document.getElementById('prevReceiptLogoImg');
  if (logoImg) {
    if (cfg.logoBase64 && cfg.showLogo) {
      logoImg.src = cfg.logoBase64;
      logoImg.classList.remove('hidden');
    } else {
      logoImg.src = '';
      logoImg.classList.add('hidden');
    }
  }

  // 3. Header Informasi Toko
  const storeNameEl = document.getElementById('prevReceiptStoreName');
  if (storeNameEl) {
    storeNameEl.innerText = (cfg.headerStoreName || state.storeProfile?.name || 'TOKO SAYA').toUpperCase();
  }

  const taglineEl = document.getElementById('prevReceiptTagline');
  if (taglineEl) {
    taglineEl.innerText = cfg.headerTagline || '';
    taglineEl.style.display = cfg.headerTagline ? 'block' : 'none';
  }

  const addressEl = document.getElementById('prevReceiptAddress');
  if (addressEl) {
    addressEl.innerText = cfg.headerAddress || state.storeProfile?.city || '';
    addressEl.style.display = (cfg.headerAddress || state.storeProfile?.city) ? 'block' : 'none';
  }

  const phoneEl = document.getElementById('prevReceiptPhone');
  if (phoneEl) {
    phoneEl.innerText = cfg.headerPhone ? 'Telp/WA: ' + cfg.headerPhone : '';
    phoneEl.style.display = cfg.headerPhone ? 'block' : 'none';
  }

  const cashierEl = document.getElementById('prevReceiptCashier');
  if (cashierEl) {
    cashierEl.innerText = cfg.cashierName || state.auth?.ownerName || 'Kasir';
  }

  const modalSectionSpacing = document.getElementById('printerSectionSpacingSelect')?.value;
  const sectionSpacing = modalSectionSpacing !== undefined ? Number(modalSectionSpacing) : (cfg.sectionSpacing !== undefined ? Number(cfg.sectionSpacing) : 1);
  const modalItemStyle = document.getElementById('printerItemPriceStyleSelect')?.value;
  const itemStyle = modalItemStyle || cfg.itemPriceStyle || 'compact';

  const livePaper = document.getElementById('liveReceiptPaper');
  if (livePaper) {
    livePaper.classList.remove('gap-1', 'gap-1.5', 'gap-2', 'gap-3', 'leading-tight', 'leading-normal', 'leading-relaxed');
    if (sectionSpacing === 0) {
      livePaper.classList.add('gap-1', 'leading-tight');
    } else if (sectionSpacing === 2) {
      livePaper.classList.add('gap-3', 'leading-relaxed');
    } else {
      livePaper.classList.add('gap-1.5', 'leading-normal');
    }
  }

  // 4. Sample Item List (Mirip 100% #printArea)
  const itemListEl = document.getElementById('prevReceiptItemList');
  if (itemListEl && Array.isArray(sampleTx.items)) {
    itemListEl.innerHTML = sampleTx.items.map(it => {
      const priceStr = formatRp(it.subtotal || (it.qty * it.price)).replace('Rp ', '');
      const unitPriceStr = formatRp(it.price).replace('Rp ', '');
      const hasDetail = itemStyle === 'detailed' && it.qty > 1;

      return `
        <div class="py-0.5 flex flex-col text-[10.5px] leading-tight">
          <div class="flex justify-between items-start gap-1">
            <span class="font-bold text-stone-900 break-words flex-1 text-left">${it.qty}x ${it.name}</span>
            <span class="font-black text-stone-900 whitespace-nowrap text-right shrink-0">${priceStr}</span>
          </div>
          ${hasDetail ? `<div class="text-[9.5px] text-stone-500 pl-3">@ ${unitPriceStr}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // 5. Totals & Payment
  const subtotalEl = document.getElementById('prevReceiptSubtotal');
  if (subtotalEl) subtotalEl.innerText = formatRp(sampleTx.total);
  const totalEl = document.getElementById('prevReceiptTotal');
  if (totalEl) totalEl.innerText = formatRp(sampleTx.total);
  const cashEl = document.getElementById('prevReceiptCash');
  if (cashEl) cashEl.innerText = formatRp(sampleTx.cashGiven);
  const changeEl = document.getElementById('prevReceiptChange');
  if (changeEl) changeEl.innerText = formatRp(sampleTx.change);

  // 6. Footer Notes & Social
  const socialEl = document.getElementById('prevReceiptSocial');
  if (socialEl) {
    socialEl.innerText = cfg.footerSocial ? cfg.footerSocial : '';
    socialEl.style.display = cfg.footerSocial ? 'block' : 'none';
  }

  const footerNoteEl = document.getElementById('prevReceiptFooterNote');
  if (footerNoteEl) {
    footerNoteEl.innerText = cfg.footerNote || 'Terimakasih telah berkunjung.';
  }

  // 7. Bottom Queue Banner
  const queueBox = document.getElementById('prevReceiptQueueBottomBox');
  if (queueBox) {
    queueBox.style.display = cfg.showQueueBottom ? 'block' : 'none';
  }
}

/**
 * Simpan Formulir Pengaturan Printer
 */
export function savePrinterSettings(e) {
  if (e) e.preventDefault();
  playClick('pop');

  const paperWidth = document.getElementById('printerPaperWidth')?.value || '58mm';
  const printMethod = document.getElementById('printerMethodSelect')?.value || 'browser';
  const autoPrint = document.getElementById('printerAutoPrint')?.checked || false;
  const autoPrintKitchen = document.getElementById('printerAutoPrintKitchen')?.checked || false;
  const autoKickDrawer = document.getElementById('printerAutoKickDrawer')?.checked !== false;
  const showLogo = document.getElementById('printerShowLogo')?.checked !== false;
  const logoBase64 = state.printerConfig?.logoBase64 || '';
  const headerStoreName = document.getElementById('printerStoreNameInput')?.value.trim() || '';
  const headerTagline = document.getElementById('printerTaglineInput')?.value.trim() || '';
  const headerAddress = document.getElementById('printerAddressInput')?.value.trim() || '';
  const headerPhone = document.getElementById('printerPhoneInput')?.value.trim() || '';
  const cashierName = document.getElementById('printerCashierInput')?.value.trim() || 'Kasir';
  const footerSocial = document.getElementById('printerSocialInput')?.value.trim() || '';
  const footerNote = document.getElementById('printerFooterNoteInput')?.value.trim() || 'Terimakasih telah berkunjung.';
  const showQueueBottom = document.getElementById('printerShowQueueBottom')?.checked !== false;
  const feedLines = Number(document.getElementById('printerFeedLinesSelect')?.value) || 1;
  const sectionSpacing = Number(document.getElementById('printerSectionSpacingSelect')?.value ?? 1);
  const dividerStyle = document.getElementById('printerDividerStyleSelect')?.value || 'dashed';
  const itemPriceStyle = document.getElementById('printerItemPriceStyleSelect')?.value || 'compact';

  const newConfig = {
    paperWidth,
    printMethod,
    autoPrint,
    autoPrintKitchen,
    autoKickDrawer,
    showLogo,
    logoBase64,
    cashierName,
    headerStoreName,
    headerTagline,
    headerAddress,
    headerPhone,
    footerSocial,
    footerNote,
    footerHelp: 'Powered by Aristotle POS',
    showQueueBottom,
    feedLines,
    sectionSpacing,
    dividerStyle,
    itemPriceStyle,
    localHostIp: document.getElementById('printerLocalHostIp')?.value.trim() || ''
  };

  if (newConfig.localHostIp) {
    localStorage.setItem('aristotle_local_host_ip', newConfig.localHostIp);
  } else {
    localStorage.removeItem('aristotle_local_host_ip');
  }

  savePrinterConfig(newConfig);
  syncSavePrinterConfig(newConfig);
  closePrinterConfigModal();
  showToast('Pengaturan printer & struk berhasil disimpan!', 'success');
}

/**
 * Handler input manual alamat IP Kasir Utama
 * Menyimpan seketika tanpa perlu submit tombol, dan menguji otomatis jika sudah 4 blok angka
 */
export function handleLocalHostIpInput(val) {
  const cleanIp = (val || '').trim();
  if (!state.printerConfig) state.printerConfig = {};
  state.printerConfig.localHostIp = cleanIp;
  if (cleanIp) {
    localStorage.setItem('aristotle_local_host_ip', cleanIp);
  } else {
    localStorage.removeItem('aristotle_local_host_ip');
  }

  // Jika format IP 4 oktet sudah lengkap (misal 192.168.1.5), uji otomatis seketika!
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
    testLocalLanPing(true, cleanIp);
  }
}

// ==================== HOST HEARTBEAT LOOP & STATUS (INDUSTRY POS) ====================
let hostHeartbeatTimer = null;
let hostPresenceUnsub = null;
let lastKnownHostPresence = null;

export function startHostHeartbeatLoop() {
  stopHostHeartbeatLoop();
  const role = getDevicePrinterMode();
  if (role !== 'host') return;

  pulseHostPresence(true);
  hostHeartbeatTimer = setInterval(() => {
    if (getDevicePrinterMode() === 'host') {
      pulseHostPresence();
    } else {
      stopHostHeartbeatLoop();
    }
  }, 30000);
}

export function stopHostHeartbeatLoop() {
  if (hostHeartbeatTimer) {
    clearInterval(hostHeartbeatTimer);
    hostHeartbeatTimer = null;
  }
}

let lastPublishedIp = null;
let lastPublishedPrinter = null;
let lastPublishedTime = 0;

export function pulseHostPresence(force = false) {
  const role = getDevicePrinterMode();
  if (role !== 'host') return;

  let hostIp = '';
  if (window.AndroidBridge && typeof window.AndroidBridge.getLocalIpAddress === 'function') {
    try {
      const ip = window.AndroidBridge.getLocalIpAddress();
      if (ip && ip !== '127.0.0.1') hostIp = ip;
    } catch (_) {}
  }
  if (!hostIp) {
    hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip') || '';
  }

  let printerName = '';
  if (window.AndroidBridge && typeof window.AndroidBridge.getConnectedPrinterInfo === 'function') {
    try { printerName = window.AndroidBridge.getConnectedPrinterInfo(); } catch (_) {}
  }
  if (!printerName) {
    printerName = isLocalPrinterReady() ? 'Printer Siap' : 'Kasir Utama Standby';
  }

  const now = Date.now();
  // Hemat kuota Firestore & cegah DOM churn: hanya kirim jika ada perubahan status atau sudah lewat 60 detik
  if (!force && hostIp === lastPublishedIp && printerName === lastPublishedPrinter && (now - lastPublishedTime < 60000)) {
    return;
  }

  lastPublishedIp = hostIp;
  lastPublishedPrinter = printerName;
  lastPublishedTime = now;

  try {
    syncPublishHostPresence(hostIp, printerName, true);
  } catch (_) {}
}

export function renderPelayanConnectionStatus(data = lastKnownHostPresence) {
  // Guard mutlak: jika peran saat ini BUKAN pelayan, jangan sentuh UI Kasir Utama
  if (getDevicePrinterMode() !== 'pelayan') return;

  const titleEl = document.getElementById('pelayanLiveHostTitle');
  const descEl = document.getElementById('pelayanLiveHostDesc');
  const dotEl = document.getElementById('pelayanLiveHostDot');
  const badgeEl = document.getElementById('pelayanLiveHostBadge');
  const lanBadge = document.getElementById('localLanStatusBadge');
  const headerText = document.getElementById('headerPrinterText');
  const headerDot = document.getElementById('headerPrinterDot');

  const now = Date.now();
  // Toleransi 90 detik agar tidak mudah terputus saat kasir sejenak beralih aplikasi
  const isOnline = Boolean(data && data.updatedAt && (now - data.updatedAt < 90000));

  if (isOnline) {
    const storeName = state.storeProfile?.name || state.storeId || 'Toko';
    const printerInfo = data.printerName || 'Printer Siap';
    if (titleEl) titleEl.textContent = 'Kasir Utama Aktif';
    if (descEl) descEl.textContent = `Toko: ${storeName} • ${printerInfo} • Siap cetak otomatis`;
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    if (badgeEl) {
      badgeEl.textContent = 'Terhubung';
      badgeEl.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
    }
    if (lanBadge) {
      lanBadge.textContent = 'Otomatis (Hotspot & Cloud)';
      lanBadge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
    }
    if (headerText) headerText.textContent = `Kasir Aktif`;
    if (headerDot) headerDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
  } else {
    if (titleEl) titleEl.textContent = 'Kasir Utama Belum Terdeteksi';
    if (descEl) descEl.textContent = 'Pastikan HP Kasir Utama membuka aplikasi Toko ini, atau scan ulang QR Kasir.';
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    if (badgeEl) {
      badgeEl.textContent = 'Terputus';
      badgeEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800';
    }
    if (lanBadge) {
      lanBadge.textContent = 'Belum Terhubung';
      lanBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600';
    }
    if (headerText) headerText.textContent = 'HP Staf';
    if (headerDot) headerDot.className = 'w-2 h-2 rounded-full bg-amber-500';
  }
}

export function stopHostPresenceListener() {
  if (hostPresenceUnsub) {
    try { hostPresenceUnsub(); } catch (_) {}
    hostPresenceUnsub = null;
  }
}

export function setupHostPresenceListener() {
  stopHostPresenceListener();
  const role = getDevicePrinterMode();
  if (role !== 'pelayan') return;

  const currentEpoch = currentRoleEpoch;
  try {
    hostPresenceUnsub = listenToHostPresence((data) => {
      // Abaikan jika peran sudah berganti atau epoch sudah usang
      if (!data || currentRoleEpoch !== currentEpoch || getDevicePrinterMode() !== 'pelayan') return;
      lastKnownHostPresence = data;
      if (data.ip) {
        localStorage.setItem('aristotle_local_host_ip', data.ip);
        if (!state.printerConfig) state.printerConfig = {};
        state.printerConfig.localHostIp = data.ip;
      }
      renderPelayanConnectionStatus(data);
    });
  } catch (_) {}
}

let isReconnectingHost = false;

/**
 * Uji probe satu IP (Native Socket TCP jika APK, atau Fetch AbortController)
 */
async function probeSingleHostIp(ip) {
  if (!ip) throw new Error('Empty IP');

  // Yield ke browser event loop agar rendering dan touch tetap 100% responsif
  await new Promise(resolve => setTimeout(resolve, 0));

  // 1. Native Socket Check (Zero Mixed-Content, Sangat Cepat)
  if (window.AndroidBridge && typeof window.AndroidBridge.probeLocalHost === 'function') {
    try {
      const isLive = window.AndroidBridge.probeLocalHost(ip, 8088, 250);
      if (isLive) return ip;
    } catch (_) {}
  }

  // 2. Web Fetch Fallback
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 400);
  try {
    const res = await fetch(`http://${ip}:8088/ping`, { signal: ctrl.signal });
    clearTimeout(tm);
    if (res && res.ok) return ip;
  } catch (_) {
    clearTimeout(tm);
  }
  throw new Error('Unreachable: ' + ip);
}

/**
 * Hubungkan Kembali (1-Tap Reconnect & Parallel Diagnose - Bebas Lag)
 */
export async function reconnectPrinterHost(silent = false, customTargetIp = null, expectedEpoch = null) {
  // Jika epoch sudah usang atau bukan mode pelayan, batalkan seketika
  if (expectedEpoch !== null && expectedEpoch !== currentRoleEpoch) return false;
  if (getDevicePrinterMode() !== 'pelayan') return false;

  if (isReconnectingHost) return false;
  isReconnectingHost = true;

  if (!silent) playClick('tap');

  const btnText = document.getElementById('btnReconnectHostText');
  const badge = document.getElementById('localLanStatusBadge');
  if (btnText) btnText.textContent = 'Menghubungkan...';
  if (badge) {
    badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse';
    badge.textContent = 'Memeriksa...';
  }

  try {
    // 1. Kumpulkan kandidat IP prioritas tinggi secara cerdas
    const candidateSet = new Set();

    if (customTargetIp && customTargetIp.trim()) {
      candidateSet.add(customTargetIp.trim());
    }

    // IP presence cloud terakhir (IP aktual yang baru saja diumumkan oleh Kasir Utama)
    if (lastKnownHostPresence?.ip && lastKnownHostPresence.ip.trim()) {
      candidateSet.add(lastKnownHostPresence.ip.trim());
    }

    // IP tersimpan di config / localStorage
    const savedIp = (state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip') || '').trim();
    if (savedIp) {
      candidateSet.add(savedIp);
    }

    // Default Gateway Wi-Fi perangkat (Sangat akurat saat HP staf nempel ke hotspot kasir)
    if (window.AndroidBridge && typeof window.AndroidBridge.getWifiGatewayIp === 'function') {
      try {
        const gw = window.AndroidBridge.getWifiGatewayIp();
        if (gw && gw.trim() && !gw.startsWith('127.')) {
          candidateSet.add(gw.trim());
        }
      } catch (_) {}
    }

    // Ekstrak prefix gateway dari IP lokal perangkat sendiri (misal 192.168.49.123 -> 192.168.49.1)
    if (window.AndroidBridge && typeof window.AndroidBridge.getLocalIpAddress === 'function') {
      try {
        const myIp = window.AndroidBridge.getLocalIpAddress();
        if (myIp && myIp.includes('.')) {
          const parts = myIp.split('.');
          if (parts.length === 4) {
            candidateSet.add(`${parts[0]}.${parts[1]}.${parts[2]}.1`);
          }
        }
      } catch (_) {}
    }

    // Default hotspot IP candidates (Android Tethering 192.168.43.1 & iOS 172.20.10.1)
    if (detectHotspotConnection() || window.AndroidBridge || getDevicePrinterMode() === 'pelayan') {
      candidateSet.add('192.168.43.1');
      candidateSet.add('172.20.10.1');
      candidateSet.add('192.168.49.1');
    }

    const candidateIps = Array.from(candidateSet).filter(Boolean);

    // 2. Eksekusi Probe Sekuensial dengan Short-Circuit (Cepat ~5-10ms jika ketemu)
    let localConnected = false;
    let winningIp = null;

    for (const ip of candidateIps) {
      if (getDevicePrinterMode() !== 'pelayan' || (expectedEpoch !== null && expectedEpoch !== currentRoleEpoch)) {
        return false;
      }
      try {
        const liveIp = await probeSingleHostIp(ip);
        if (liveIp) {
          localConnected = true;
          winningIp = liveIp;
          localStorage.setItem('aristotle_local_host_ip', winningIp);
          if (!state.printerConfig) state.printerConfig = {};
          state.printerConfig.localHostIp = winningIp;
          break; // Host ditemukan, hentikan probe kandidat lain
        }
      } catch (_) {}
    }

    if (getDevicePrinterMode() !== 'pelayan' || (expectedEpoch !== null && expectedEpoch !== currentRoleEpoch)) {
      return false;
    }

    // 3. Ambil data presence Cloud terbaru (One-Shot Direct Fetch)
    let freshPresence = null;
    try {
      freshPresence = await fetchHostPresenceDirect();
      if (freshPresence && getDevicePrinterMode() === 'pelayan') {
        lastKnownHostPresence = freshPresence;
        // Jika belum terhubung lokal tapi cloud mengumumkan IP baru, coba probe sekali lagi
        if (!localConnected && freshPresence.ip && !candidateSet.has(freshPresence.ip)) {
          try {
            const probeOk = await probeSingleHostIp(freshPresence.ip);
            if (probeOk && getDevicePrinterMode() === 'pelayan') {
              localConnected = true;
              winningIp = freshPresence.ip;
              localStorage.setItem('aristotle_local_host_ip', freshPresence.ip);
              if (!state.printerConfig) state.printerConfig = {};
              state.printerConfig.localHostIp = freshPresence.ip;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // Pastikan masih dalam mode pelayan sebelum render hasil
    if (getDevicePrinterMode() !== 'pelayan' || (expectedEpoch !== null && expectedEpoch !== currentRoleEpoch)) {
      return false;
    }

    const isCloudOnline = Boolean(lastKnownHostPresence && lastKnownHostPresence.updatedAt && (Date.now() - lastKnownHostPresence.updatedAt < 90000));

    renderPelayanConnectionStatus(lastKnownHostPresence);

    if (btnText) btnText.textContent = 'Hubungkan Kembali';
    if (badge) {
      if (localConnected) {
        badge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        badge.textContent = winningIp ? `Hotspot (${winningIp})` : 'Hotspot Direct';
      } else if (isCloudOnline) {
        badge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        badge.textContent = 'Cloud Relay';
      } else {
        badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600';
        badge.textContent = 'Belum Terhubung';
      }
    }

    if (!silent) {
      if (localConnected) {
        showToast(`Terhubung ke Kasir Utama via Hotspot (${winningIp || 'Lokal'})!`, 'success', 2500);
      } else if (isCloudOnline) {
        showToast('Terhubung ke Kasir Utama via Cloud Relay!', 'success', 2500);
      } else {
        showToast('Kasir Utama belum terdeteksi. Pastikan HP Kasir membuka aplikasi.', 'warning', 3000);
      }
    }

    return localConnected || isCloudOnline;

  } finally {
    isReconnectingHost = false;
  }
}

export function autoDiscoverLocalPrinterHost(silent = false) {
  return reconnectPrinterHost(silent);
}

/**
 * Uji Koneksi IP Wi-Fi Lokal
 */
export async function testLocalLanPing(silent = false, targetIp = null) {
  return reconnectPrinterHost(silent, targetIp);
}

/**
 * Update Status Badge UI
 */
function updatePrinterStatusBadge(type, name) {
  const badge = document.getElementById('printerConnectionBadge');
  if (badge) {
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span>${type.toUpperCase()}: ${name}</span>
    `;
    badge.className = 'px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold text-[11px] flex items-center gap-1.5';
  }
}

// ==================== SISTEM PAIRING QR CODE (SENIOR & CASUAL FRIENDLY) ====================

/**
 * Buka Modal Tampilan QR Code di HP Kasir Utama (Host)
 */
export function openHostQrPairingModal() {
  playClick('tap');
  const modal = document.getElementById('hostQrPairingModal');
  if (!modal) return;

  const storeId = state.storeId;
  const storeName = state.storeProfile?.name || storeId;
  let hostIp = '';
  if (window.AndroidBridge && typeof window.AndroidBridge.getLocalIpAddress === 'function') {
    try {
      const ip = window.AndroidBridge.getLocalIpAddress();
      if (ip && ip !== '127.0.0.1') hostIp = ip;
    } catch (_) {}
  }
  if (!hostIp) {
    hostIp = state.printerConfig?.localHostIp || localStorage.getItem('aristotle_local_host_ip') || '';
  }
  if (!hostIp && detectHotspotConnection()) {
    hostIp = '192.168.43.1';
  }

  // Gunakan Canonical Production Web URL jika berjalan di APK (file:///android_asset/...)
  let baseUrl = window.location.origin + window.location.pathname;
  if (!baseUrl || baseUrl.startsWith('file:') || baseUrl.startsWith('null') || baseUrl.includes('/android_asset/')) {
    baseUrl = 'https://miezlearning.github.io/aristotle-pos/';
  }

  // URL pairing lengkap yang memuat store, role, auth, token, dan hostIp
  const params = new URLSearchParams();
  params.set('store', storeId);
  params.set('role', 'pelayan');
  params.set('auth', '1');
  const token = getLocalPosToken(storeId);
  if (token) params.set('token', token);
  if (hostIp) params.set('hostIp', hostIp);
  const pairingUrl = `${baseUrl.split('?')[0]}?${params.toString()}`;

  const container = document.getElementById('hostQrCanvasContainer');
  if (container) {
    renderQRToContainer(container, pairingUrl, 220);
  }

  const nameEl = document.getElementById('hostQrStoreName');
  if (nameEl) nameEl.textContent = storeName;

  const ipEl = document.getElementById('hostQrIpDisplay');
  if (ipEl) {
    const isHs = hostIp && hostIp.startsWith('192.168.43.');
    const netLabel = isHs ? `Hotspot (${hostIp})` : (hostIp ? `Wi-Fi Lokal (${hostIp})` : 'Cloud Firebase');
    ipEl.textContent = `Toko: ${storeName} • Jalur: ${netLabel}`;
  }

  modal.classList.remove('hidden');
}

export function closeHostQrPairingModal() {
  playClick('tap');
  const modal = document.getElementById('hostQrPairingModal');
  if (modal) modal.classList.add('hidden');
}

// State Live Camera Scanner untuk HP Pelayan
let qrScanStream = null;
let qrScanAnimFrame = null;
let isScanning = false;

/**
 * Buka Modal Live Camera Scanner di HP Pelayan
 */
export async function openQrPairingScannerModal() {
  playClick('tap');
  const modal = document.getElementById('qrPairingScannerModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const video = document.getElementById('qrScanVideo');
  const errorEl = document.getElementById('qrScanError');
  if (errorEl) errorEl.classList.add('hidden');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (errorEl) {
      errorEl.textContent = 'Browser ini belum mendukung akses kamera langsung. Silakan gunakan tombol pilih foto QR.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    isScanning = true;
    qrScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    if (video) {
      video.srcObject = qrScanStream;
      video.setAttribute('playsinline', true);
      await video.play();
      qrScanAnimFrame = requestAnimationFrame(tickQrScanner);
    }
  } catch (err) {
    console.warn('Camera open error:', err);
    isScanning = false;
    if (errorEl) {
      errorEl.textContent = 'Izin kamera belum aktif. Berikan izin kamera di pengaturan browser/HP, atau gunakan tombol pilih foto QR di bawah.';
      errorEl.classList.remove('hidden');
    }
  }
}

function tickQrScanner() {
  if (!isScanning) return;
  const video = document.getElementById('qrScanVideo');
  const canvas = document.getElementById('qrScanCanvasHidden');
  if (!video || !canvas) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (window.jsQR) {
      const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      if (code && code.data) {
        isScanning = false;
        handleScannedPairingData(code.data);
        return;
      }
    }
  }

  qrScanAnimFrame = requestAnimationFrame(tickQrScanner);
}

export function closeQrPairingScannerModal() {
  playClick('tap');
  isScanning = false;
  if (qrScanAnimFrame) {
    cancelAnimationFrame(qrScanAnimFrame);
    qrScanAnimFrame = null;
  }
  if (qrScanStream) {
    qrScanStream.getTracks().forEach(t => t.stop());
    qrScanStream = null;
  }
  const modal = document.getElementById('qrPairingScannerModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Tangani Data QR yang Terbaca (Auto-Pairing & Auto-Login Toko)
 */
export function handleScannedPairingData(rawText) {
  closeQrPairingScannerModal();
  if (!rawText || typeof rawText !== 'string') {
    showToast('Kode QR kosong atau tidak terbaca.', 'warning', 3000);
    return;
  }

  try {
    let store = '';
    let role = 'pelayan';
    let hostIp = '';

    const trimmed = rawText.trim();

    // 1. Format JSON standar
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        store = obj.store || obj.storeId || obj.id || '';
        if (obj.role) role = (obj.role === 'client' || obj.role === 'pelayan') ? 'pelayan' : 'host';
        hostIp = obj.hostIp || obj.ip || '';
      } catch (_) {}
    }

    // 2. Format URL atau Query string (?store=... atau store=...)
    if (!store) {
      let queryString = '';
      if (trimmed.includes('?')) {
        queryString = trimmed.substring(trimmed.indexOf('?') + 1);
      } else if (trimmed.includes('store=')) {
        queryString = trimmed;
      }

      if (queryString) {
        const searchParams = new URLSearchParams(queryString);
        store = searchParams.get('store') || '';
        const rawRole = searchParams.get('role');
        if (rawRole) {
          role = (rawRole === 'client' || rawRole === 'pelayan') ? 'pelayan' : 'host';
        }
        hostIp = searchParams.get('hostIp') || '';
      }
    }

    // 3. Regex Fallback
    if (!store) {
      const matchStore = trimmed.match(/[?&]?store=([^&#\s]+)/i);
      if (matchStore && matchStore[1]) {
        store = decodeURIComponent(matchStore[1]);
      }
      const matchIp = trimmed.match(/[?&]?hostIp=([^&#\s]+)/i);
      if (matchIp && matchIp[1]) {
        hostIp = decodeURIComponent(matchIp[1]);
      }
    }

    if (!store) {
      showToast('Kode QR tidak valid (Data toko tidak ditemukan).', 'warning', 3000);
      return;
    }

    const cleanStore = store.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    // 1. Otorisasi sesi toko ini di perangkat ini secara permanen sebagai Staf
    sessionStorage.removeItem('is_logged_out_state');
    localStorage.setItem('auth_store_session_' + cleanStore, '1');
    localStorage.setItem(GLOBAL_STORAGE_KEYS.ACTIVE_STORE_ID, cleanStore);
    localStorage.setItem('aristotle_active_store_id', cleanStore);
    localStorage.setItem('aristotle_device_role', role);
    localStorage.setItem('aristotle_printer_mode', role);

    if (hostIp) {
      localStorage.setItem('aristotle_local_host_ip', hostIp);
      if (!state.printerConfig) state.printerConfig = {};
      state.printerConfig.localHostIp = hostIp;
    }

    // 2. Terapkan peran printer
    setDevicePrinterMode(role);

    // 3. Beralih ke toko langsung di memori tanpa reload halaman sama sekali
    if (window.KasirApp && typeof window.KasirApp.quickSelectStore === 'function') {
      window.KasirApp.quickSelectStore(cleanStore);
    }

    // 4. Tutup modal yang sedang terbuka
    if (window.KasirApp && typeof window.KasirApp.closeUniversalLoginModal === 'function') {
      window.KasirApp.closeUniversalLoginModal();
    }
    closePrinterConfigModal();

    // 5. Trigger auto-connect ke kasir utama
    setTimeout(() => {
      reconnectPrinterHost(false, hostIp || null);
    }, 120);

    showToast(`Berhasil login ke toko [${cleanStore.replace(/_/g, ' ').toUpperCase()}] sebagai HP Staf!`, 'success', 3500);
  } catch (err) {
    console.error('Scan parse error:', err);
    showToast('Gagal memproses kode QR.', 'warning', 3000);
  }
}

/**
 * Pindai dari File / Gambar Galeri HP jika kamera tidak dapat dibuka
 */
export function handleQrScanFromFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (window.jsQR) {
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });
        if (code && code.data) {
          handleScannedPairingData(code.data);
          return;
        }
      }
      showToast('Tidak ada kode QR pairing yang terdeteksi pada gambar.', 'warning', 4000);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Konversi Data Rekap Shift / Tutup Kasir (Z-Report) menjadi ESC/POS Byte Array
 */
export async function buildShiftZReportEscPosBytes(shiftSummary) {
  const cfg = state.printerConfig || {};
  const width = cfg.paperWidth === '80mm' ? 48 : 32;
  const divider = '-'.repeat(width) + '\n';
  const doubleDivider = '='.repeat(width) + '\n';
  const commands = [];

  const addBytes = (...bytes) => {
    for (let b of bytes) commands.push(b);
  };

  const addText = (text) => {
    const clean = String(text || '')
      .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '');
    for (let i = 0; i < clean.length; i++) {
      commands.push(clean.charCodeAt(i));
    }
  };

  const padCenter = (text) => {
    const str = String(text || '').trim();
    if (str.length >= width) return str.substring(0, width);
    const leftPad = Math.floor((width - str.length) / 2);
    const rightPad = width - str.length - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  };

  const padBetween = (left, right) => {
    const lStr = String(left || '').trim();
    const rStr = String(right || '').trim();
    const space = width - lStr.length - rStr.length;
    if (space < 1) {
      return lStr.substring(0, Math.max(1, width - rStr.length - 1)) + ' ' + rStr;
    }
    return lStr + ' '.repeat(space) + rStr;
  };

  // Init ESC @ PC437
  addBytes(0x1B, 0x40);
  addBytes(0x1B, 0x74, 0x00);

  const storeName = cfg.headerStoreName || state.storeProfile?.name || 'TOKO UTAMA';
  const cashier = shiftSummary.cashierName || state.auth?.ownerName || 'Kasir';

  const formatDt = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Header Laporan
  addBytes(0x1B, 0x61, 0x01); // Center
  addText(doubleDivider);
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addBytes(0x1D, 0x21, 0x11); // Double size
  addText('LAPORAN Z\n');
  addBytes(0x1D, 0x21, 0x00); // Normal size
  addText('REKAP TUTUP SHIFT KASIR\n');
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  addText(storeName.toUpperCase() + '\n');
  addText(doubleDivider);

  // Detail Shift (Align Left)
  addBytes(0x1B, 0x61, 0x00); // Left
  addText(padBetween('No. Shift', '#' + (shiftSummary.shiftId ? shiftSummary.shiftId.replace('SHIFT-', '') : '001')) + '\n');
  addText(padBetween('Kasir', cashier) + '\n');
  addText(padBetween('Buka Shift', formatDt(shiftSummary.startTime)) + '\n');
  addText(padBetween('Tutup Shift', formatDt(shiftSummary.endTime)) + '\n');
  addText(divider);

  // Penjualan & Modal
  addText(padBetween('Modal Awal (Kas)', formatRp(shiftSummary.initialCash || 0)) + '\n');
  addText(padBetween('Penjualan Tunai', formatRp(shiftSummary.cashSales || 0)) + '\n');
  addText(padBetween('Penjualan QRIS', formatRp(shiftSummary.qrisSales || 0)) + '\n');
  if (shiftSummary.totalExpenses > 0) {
    addText(padBetween('Pengeluaran Kas', '-' + formatRp(shiftSummary.totalExpenses)) + '\n');
  }
  addText(divider);

  // Total Omset Penjualan
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addText(padBetween('TOTAL OMSET', formatRp(shiftSummary.totalSales || 0)) + '\n');
  addText(padBetween('Total Transaksi', `${shiftSummary.txCount || 0} Struk`) + '\n');
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  addText(divider);

  // Audit Uang Fisik Laci
  addText(padBetween('Kas Seharusnya', formatRp(shiftSummary.expectedCash || 0)) + '\n');
  if (shiftSummary.actualCash !== null && shiftSummary.actualCash !== undefined) {
    addText(padBetween('Kas Fisik Aktual', formatRp(shiftSummary.actualCash)) + '\n');
    const diff = shiftSummary.difference || 0;
    let diffStatus = 'Rp 0 (PAS)';
    if (diff > 0) diffStatus = `+${formatRp(diff)} (LEBIH)`;
    else if (diff < 0) diffStatus = `-${formatRp(Math.abs(diff))} (KURANG)`;

    addBytes(0x1B, 0x45, 0x01); // Bold ON
    addText(padBetween('Selisih Kas', diffStatus) + '\n');
    addBytes(0x1B, 0x45, 0x00); // Bold OFF
  }
  addText(divider);

  if (shiftSummary.closingNotes) {
    addText(`Catatan: ${shiftSummary.closingNotes}\n`);
    addText(divider);
  }

  // Footer & Tanda Tangan
  addBytes(0x1B, 0x61, 0x01); // Center
  addText('Dicetak Otomatis • Aristotle POS\n\n');
  addText('(___________________)\n');
  addText(`Ttd. Kasir (${cashier})\n\n`);

  addBytes(0x1B, 0x64, 0x03); // Feed 3 baris
  return new Uint8Array(commands);
}

/**
 * Render HTML printable Z-Report area
 */
export function renderPrintableShiftZReport(shiftSummary) {
  let container = document.getElementById('shiftZReportPrintArea');
  if (!container) {
    container = document.createElement('div');
    container.id = 'shiftZReportPrintArea';
    container.className = 'hidden';
    document.body.appendChild(container);
  }

  const storeName = state.printerConfig?.headerStoreName || state.storeProfile?.name || 'TOKO UTAMA';
  const cashier = shiftSummary.cashierName || state.auth?.ownerName || 'Kasir';

  const formatDt = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const diff = shiftSummary.difference || 0;
  let diffStatus = 'Rp 0 (PAS)';
  if (diff > 0) diffStatus = `+${formatRp(diff)} (LEBIH)`;
  else if (diff < 0) diffStatus = `-${formatRp(Math.abs(diff))} (KURANG)`;

  container.innerHTML = `
    <div style="max-width: 300px; margin: 0 auto; font-family: monospace; font-size: 11px; line-height: 1.3; color: #000; padding: 8px;">
      <div style="text-align: center; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-size: 14px; font-weight: 900;">LAPORAN Z</div>
        <div style="font-size: 11px;">REKAP TUTUP SHIFT KASIR</div>
        <div style="font-size: 12px; margin-top: 2px;">${escapeHtml(storeName.toUpperCase())}</div>
      </div>
      <div style="display: flex; justify-content: space-between;"><span>No. Shift:</span><span>#${escapeHtml((shiftSummary.shiftId || '001').replace('SHIFT-', ''))}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Kasir:</span><span>${escapeHtml(cashier)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Buka:</span><span>${formatDt(shiftSummary.startTime)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Tutup:</span><span>${formatDt(shiftSummary.endTime)}</span></div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="display: flex; justify-content: space-between;"><span>Modal Awal:</span><span>${formatRp(shiftSummary.initialCash || 0)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Penjualan Tunai:</span><span>${formatRp(shiftSummary.cashSales || 0)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Penjualan QRIS:</span><span>${formatRp(shiftSummary.qrisSales || 0)}</span></div>
      ${shiftSummary.totalExpenses > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Pengeluaran:</span><span>-${formatRp(shiftSummary.totalExpenses)}</span></div>` : ''}
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="display: flex; justify-content: space-between; font-weight: 900;"><span>TOTAL OMSET:</span><span>${formatRp(shiftSummary.totalSales || 0)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Total Struk:</span><span>${shiftSummary.txCount || 0} Transaksi</span></div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="display: flex; justify-content: space-between;"><span>Kas Seharusnya:</span><span>${formatRp(shiftSummary.expectedCash || 0)}</span></div>
      <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Kas Fisik di Laci:</span><span>${formatRp(shiftSummary.actualCash !== null ? shiftSummary.actualCash : shiftSummary.expectedCash)}</span></div>
      <div style="display: flex; justify-content: space-between; font-weight: 900;"><span>Selisih:</span><span>${diffStatus}</span></div>
      ${shiftSummary.closingNotes ? `<div style="border-top: 1px dashed #000; margin: 6px 0;"></div><div>Catatan: ${escapeHtml(shiftSummary.closingNotes)}</div>` : ''}
      <div style="text-align: center; margin-top: 16px; border-top: 1px dashed #000; padding-top: 8px;">
        <div>Aristotle POS • Kasir Pintar UMKM</div>
        <div style="margin-top: 24px;">(___________________)</div>
        <div style="margin-top: 4px;">Ttd. Kasir (${escapeHtml(cashier)})</div>
      </div>
    </div>
  `;
}

/**
 * Cetak Struk Rekap Tutup Shift (Z-Report) ke Thermal / Browser
 */
export async function printShiftZReport(shiftSummary) {
  if (!shiftSummary) {
    showToast('Data shift tidak ditemukan', 'warning');
    return false;
  }

  showToast('Menyiapkan struk Laporan Z...', 'info');
  renderPrintableShiftZReport(shiftSummary);

  // 1. Coba cetak ke native Android Service jika di aplikasi APK (Asinkron & Bebas Freeze)
  if (window.AndroidBridge) {
    try {
      const bytes = await buildShiftZReportEscPosBytes(shiftSummary);
      const ok = await sendNativeBluetoothDataAsync(bytes);
      if (ok) {
        showToast('Laporan Z berhasil dicetak!', 'success');
        return true;
      } else {
        const errMsg = lastNativeBluetoothError || 'Printer Bluetooth tidak merespons.';
        showToast('Gagal cetak Laporan Z: ' + errMsg, 'error', 3500);
        return false;
      }
    } catch (e) {
      console.warn('Native Android Bluetooth print Z-Report error:', e);
      showToast('Gagal cetak Laporan Z: ' + (e.message || 'Kesalahan printer'), 'error', 3500);
      return false;
    }
  }

  // 2. Cek koneksi Bluetooth Web API
  if (bluetoothCharacteristic) {
    try {
      const bytes = await buildShiftZReportEscPosBytes(shiftSummary);
      await sendBluetoothData(bytes);
      showToast('Laporan Z tercetak (Bluetooth)!', 'success');
      return true;
    } catch (e) {
      console.warn('Bluetooth print Z-Report gagal:', e);
    }
  }

  // 3. Cek koneksi USB Serial
  if (serialWriter) {
    try {
      const bytes = await buildShiftZReportEscPosBytes(shiftSummary);
      await sendSerialData(bytes);
      showToast('Laporan Z tercetak (USB Serial)!', 'success');
      return true;
    } catch (e) {
      console.warn('Serial print Z-Report gagal:', e);
    }
  }

  // 4. Fallback ke Print Dialog Browser
  const printEl = document.getElementById('shiftZReportPrintArea');
  if (printEl) {
    document.body.classList.add('printing-shift-z');
    printEl.classList.remove('hidden');
    window.print();
    setTimeout(() => {
      printEl.classList.add('hidden');
      document.body.classList.remove('printing-shift-z');
    }, 1500);
    return true;
  }
  return false;
}


