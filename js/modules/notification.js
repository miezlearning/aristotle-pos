/**
 * Aristotle POS - Module Notifikasi Sistem Multi-Device
 * Mendukung Android Native (APK), Web Notifications API (PWA), Service Worker,
 * Audio Chime, dan Getaran Perangkat (Vibration).
 */

import { state, saveNotificationConfig } from '../state.js';
import { formatRp, showToast, playSuccessChime, playClick } from '../utils.js';

// Cache status izin notifikasi
let hasPromptedPermissionThisSession = false;

/**
 * Cek status izin notifikasi saat ini
 * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
 */
export function getNotificationPermissionStatus() {
  if (window.AndroidBridge && typeof window.AndroidBridge.hasNotificationPermission === 'function') {
    return window.AndroidBridge.hasNotificationPermission() ? 'granted' : 'default';
  }

  if (!('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

/**
 * Meminta izin notifikasi dari pengguna dengan alur yang ramah
 */
export async function requestNotificationPermission() {
  playClick('pop');

  // 1. Jika di Android APK Native
  if (window.AndroidBridge && typeof window.AndroidBridge.requestNotificationPermission === 'function') {
    window.AndroidBridge.requestNotificationPermission();
    saveNotificationConfig({ enabled: true });
    showToast('Izin notifikasi diminta dari sistem HP.', 'info');
    updateNotificationUiState();
    return true;
  }

  // 2. Jika di Web / PWA
  if (!('Notification' in window)) {
    showToast('Perangkat / browser ini tidak mendukung notifikasi sistem.', 'warning');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      saveNotificationConfig({ enabled: true });
      showToast('Notifikasi HP berhasil diaktifkan!', 'success');
      // Kirim notifikasi uji coba
      sendSystemNotification({
        title: '🔔 Notifikasi Aristotle POS Aktif',
        body: 'Anda akan menerima pemberitahuan pesanan masuk dan transaksi.',
        tag: 'welcome_notification'
      });
      updateNotificationUiState();
      return true;
    } else if (permission === 'denied') {
      saveNotificationConfig({ enabled: false });
      showToast('Izin notifikasi ditolak. Anda dapat mengaktifkannya di Pengaturan Browser.', 'warning', 4000);
      updateNotificationUiState();
      return false;
    }
  } catch (err) {
    console.warn('Gagal meminta izin notifikasi:', err);
  }
  return false;
}

/**
 * Main dispatcher untuk mengirim notifikasi sistem ke bilah status perangkat
 */
export async function sendSystemNotification({ title, body, icon = './icon-192.png', tag = '', data = null }) {
  const cfg = state.notificationConfig || {};
  if (cfg.enabled === false) return;

  // 1. Umpan Balik Getaran HP (Haptic Feedback)
  if (cfg.vibrate !== false && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([200, 100, 200, 100, 300]);
    } catch (_) {}
  }

  // 2. Audio Chime (Suara Bel Kasir)
  if (cfg.sound !== false) {
    try {
      playSuccessChime();
    } catch (_) {}
  }

  // 3. Jalur Utama APK Android Native
  if (window.AndroidBridge && typeof window.AndroidBridge.showNotification === 'function') {
    try {
      window.AndroidBridge.showNotification(title, body, tag || String(Date.now()));
      return;
    } catch (e) {
      console.warn('Gagal kirim notifikasi native Android:', e);
    }
  }

  // 4. Jalur Web Notification / Service Worker PWA
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, {
            body,
            icon: icon || './icon-192.png',
            badge: './icon.png',
            tag: tag || 'aristotle_alert',
            vibrate: [200, 100, 200],
            data: data || {},
            renotify: true
          });
          return;
        }
      }

      // Fallback instance Web Notification standar jika Service Worker belum siap
      new Notification(title, {
        body,
        icon: icon || './icon-192.png',
        tag: tag || 'aristotle_alert'
      });
    } catch (err) {
      console.warn('Gagal memicu Web Notification:', err);
    }
  }
}

/**
 * Notifikasi: Pesanan Baru Masuk (dari Pelayan, Meja, atau Sinkronisasi Cloud)
 */
export function notifyNewOrder(queue) {
  const cfg = state.notificationConfig || {};
  if (cfg.notifyNewOrder === false) return;

  const queueName = queue?.name || 'Pesanan Pelanggan';
  const itemCount = Object.values(queue?.cart || {}).reduce((acc, count) => acc + count, 0);

  sendSystemNotification({
    title: '🔔 Pesanan Baru Masuk!',
    body: `${queueName} - ${itemCount} Menu dipesan. Buka kasir/dapur untuk memproses.`,
    tag: `new_order_${queue?.id || Date.now()}`,
    data: { url: './', queueId: queue?.id }
  });
}

/**
 * Notifikasi: Pembayaran Transaksi Berhasil (Tunai / QRIS)
 */
export function notifyPaymentSuccess(tx) {
  const cfg = state.notificationConfig || {};
  if (cfg.notifyPayment === false) return;

  const totalStr = formatRp(tx?.total || 0);
  const methodStr = tx?.isQris || tx?.method === 'QRIS' ? 'QRIS' : 'Tunai';

  sendSystemNotification({
    title: `💰 Pembayaran ${methodStr} Berhasil`,
    body: `${totalStr} telah diterima (${tx?.queueName || 'Struk Kasir'}).`,
    tag: `pay_${tx?.id || Date.now()}`,
    data: { url: './', txId: tx?.id }
  });
}

/**
 * Notifikasi: Stok Produk Kritis / Menipis
 */
export function notifyLowStock(product) {
  const cfg = state.notificationConfig || {};
  if (cfg.notifyLowStock === false) return;

  sendSystemNotification({
    title: '⚠️ Peringatan Stok Menipis!',
    body: `Stok "${product.name}" tersisa ${product.stock} pcs. Segera lakukan restok.`,
    tag: `low_stock_${product.id}`,
    data: { url: './', productId: product.id }
  });
}

/**
 * Inisialisasi & Setup Event Listeners Notifikasi
 */
export function initNotificationModule() {
  updateNotificationUiState();

  // Tampilkan tawaran izin notifikasi jika belum pernah diatur (sekali saja secara halus)
  const perm = getNotificationPermissionStatus();
  if (perm === 'default' && !hasPromptedPermissionThisSession) {
    hasPromptedPermissionThisSession = true;
    setTimeout(() => {
      // Hanya tawarkan jika toko sudah aktif dan bukan mode tamu tanpa store
      if (state.storeId && state.isSessionActive) {
        showNotificationPermissionModal();
      }
    }, 4000);
  }
}

/**
 * Tampilkan modal tawaran aktivasi notifikasi yang ramah pengguna UMKM
 */
export function showNotificationPermissionModal() {
  const modal = document.getElementById('notificationPermissionModal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

export function closeNotificationPermissionModal() {
  const modal = document.getElementById('notificationPermissionModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Update UI Toggle di Pengaturan Toko
 */
export function updateNotificationUiState() {
  const perm = getNotificationPermissionStatus();
  const cfg = state.notificationConfig || {};

  const badgeEl = document.getElementById('notifPermissionBadge');
  const toggleEnabled = document.getElementById('notifToggleEnabled');
  const toggleSound = document.getElementById('notifToggleSound');
  const toggleVibrate = document.getElementById('notifToggleVibrate');
  const toggleNewOrder = document.getElementById('notifToggleNewOrder');
  const togglePayment = document.getElementById('notifTogglePayment');
  const toggleLowStock = document.getElementById('notifToggleLowStock');

  if (badgeEl) {
    if (perm === 'granted') {
      badgeEl.innerText = 'Aktif (Diizinkan)';
      badgeEl.className = 'text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full';
    } else if (perm === 'denied') {
      badgeEl.innerText = 'Diblokir Sistem';
      badgeEl.className = 'text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full';
    } else {
      badgeEl.innerText = 'Belum Aktif';
      badgeEl.className = 'text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full';
    }
  }

  if (toggleEnabled) toggleEnabled.checked = Boolean(cfg.enabled);
  if (toggleSound) toggleSound.checked = Boolean(cfg.sound !== false);
  if (toggleVibrate) toggleVibrate.checked = Boolean(cfg.vibrate !== false);
  if (toggleNewOrder) toggleNewOrder.checked = Boolean(cfg.notifyNewOrder !== false);
  if (togglePayment) togglePayment.checked = Boolean(cfg.notifyPayment !== false);
  if (toggleLowStock) toggleLowStock.checked = Boolean(cfg.notifyLowStock !== false);
}
