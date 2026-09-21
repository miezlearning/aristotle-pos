/**
 * Aristotle POS - Enterprise Error Telemetry & Crash Reporter
 * Memantau error JavaScript, unhandled promise rejections, dan crash hardware/jaringan secara otomatis
 * dan mengirimkannya ke PROXY telemetri (Cloudflare Worker → Discord).
 * URL webhook Discord TIDAK ADA di aplikasi — proxy yang memegangnya.
 */

// Kunci override & URL proxy (publik, aman di-commit — bukan rahasia).
// URL proxy diisi saat Worker Cloudflare jadi; override darurat via localStorage.
const TELEMETRY_PROXY_KEY = 'aristotle_telemetry_proxy';
const TELEMETRY_PROXY_URL = 'https://aris-pos-telemetry.gottfriedemptiness.workers.dev/';

function resolveTelemetryProxyUrl() {
  try {
    if (typeof window !== 'undefined' && window.__ARISTOTLE_TELEMETRY_PROXY) {
      return window.__ARISTOTLE_TELEMETRY_PROXY;
    }
    const saved = localStorage.getItem(TELEMETRY_PROXY_KEY);
    if (saved && saved.startsWith('https://')) return saved;
  } catch (_) {}
  return TELEMETRY_PROXY_URL;
}

// In-memory cache untuk deduplikasi & rate-limiting
const errorDedupeCache = new Map();
let lastReportTimestamp = 0;
const MIN_REPORT_INTERVAL_MS = 2500; // Minimal jeda 2.5 detik per pesan agar tidak terkena rate limit Discord
const DEDUPE_WINDOW_MS = 60000; // Drop error kembar yang sama persis dalam 60 detik

/**
 * Buat fingerprint unik dari error untuk deduplikasi
 */
function getErrorFingerprint(name, message, stack, location) {
  const cleanMsg = (message || '').slice(0, 100);
  const cleanLoc = (location || '').slice(0, 80);
  return `${name}:${cleanMsg}:${cleanLoc}`;
}

/**
 * Ambil metadata lingkungan perangkat dan konteks operasional kasir
 */
function getTelemetryContext() {
  const storeId = window.state?.storeId || localStorage.getItem('active_store_id') || 'Belum Masuk Toko';
  const storeName = window.state?.storeProfile?.name || storeId;
  const role = window.state?.role || 'kasir';
  const currentView = window.state?.currentView || 'pos';
  const isOnline = navigator.onLine !== false;
  
  // Deteksi Perangkat
  const ua = navigator.userAgent || '';
  let osName = 'Unknown OS';
  if (/android/i.test(ua)) osName = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) osName = 'iOS';
  else if (/windows/i.test(ua)) osName = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) osName = 'macOS';
  else if (/linux/i.test(ua)) osName = 'Linux';

  const screenResolution = `${window.screen?.width || 0}x${window.screen?.height || 0} (DPR: ${window.devicePixelRatio || 1})`;
  const version = window.state?.appVersion || 'v1.2.32 (Code 80)';
  
  // Konteks Keranjang
  let queueContext = 'N/A';
  try {
    const q = window.state?.orderQueues?.find(item => item.id === window.state?.activeQueueId);
    if (q) {
      const itemCount = (q.items || []).reduce((acc, it) => acc + (it.qty || 1), 0);
      queueContext = `${q.name || 'Pesanan'} (${itemCount} Item)`;
    }
  } catch (_) {}

  return {
    storeId,
    storeName,
    role,
    currentView,
    isOnline,
    osName,
    ua,
    screenResolution,
    version,
    queueContext
  };
}

/**
 * Format stack trace agar pas dalam limit Discord embed field (max 1024 char)
 */
function formatStackTrace(stack) {
  if (!stack) return 'Tidak ada stack trace';
  const clean = String(stack).trim();
  if (clean.length > 950) {
    return clean.slice(0, 920) + '\n... [truncated]';
  }
  return clean;
}

/**
 * Kirim payload embed ke Discord Webhook
 */
export async function sendTelemetryToDiscord({
  type = 'Uncaught Exception',
  errorName = 'Error',
  message = 'Unknown error occurred',
  stack = '',
  location = 'unknown',
  level = 'error',
  extra = {}
}) {
  try {
    // 0. Tanpa URL proxy, telemetri diam (tidak error, tidak spam).
    const proxyUrl = resolveTelemetryProxyUrl();
    if (!proxyUrl) return false;

    const now = Date.now();

    // 1. Deduplikasi: Cek apakah error yang sama sudah pernah dilaporkan dalam 60 detik terakhir
    const fingerprint = getErrorFingerprint(errorName, message, stack, location);
    const lastSeen = errorDedupeCache.get(fingerprint);
    if (lastSeen && (now - lastSeen) < DEDUPE_WINDOW_MS) {
      console.warn('[Telemetry] Error kembar di-throttle:', fingerprint);
      return false;
    }
    errorDedupeCache.set(fingerprint, now);

    // 2. Bersihkan cache yang kadaluarsa (> 5 menit)
    if (errorDedupeCache.size > 50) {
      for (const [key, ts] of errorDedupeCache.entries()) {
        if (now - ts > 300000) errorDedupeCache.delete(key);
      }
    }

    // 3. Rate-limiting interval
    const timeSinceLast = now - lastReportTimestamp;
    if (timeSinceLast < MIN_REPORT_INTERVAL_MS) {
      await new Promise(res => setTimeout(res, MIN_REPORT_INTERVAL_MS - timeSinceLast));
    }
    lastReportTimestamp = Date.now();

    // 4. Konteks + kirim field mentah ke proxy.
    // Embed Discord DIBANGUN server-side (anti-spam/karang-konten).
    const ctx = getTelemetryContext();

    const payload = {
      app: 'aristotle-pos',
      storeId: ctx.storeId,
      storeName: ctx.storeName,
      type,
      errorName,
      message,
      stack,
      location,
      level,
      os: ctx.osName,
      view: ctx.currentView,
      version: ctx.version
    };

    // Kirim via proxy
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok && response.status === 429) {
      console.warn('[Telemetry] Proxy 429 Rate Limited. Backing off...');
    }

    return response.ok;
  } catch (telemetryErr) {
    // Telemetry tidak boleh pernah membuat aplikasi kasir crash
    console.error('[Telemetry] Gagal mengirim laporan error:', telemetryErr);
    return false;
  }
}

/**
 * Inisialisasi Listener Global untuk Menangkap Semua Error
 */
export function initErrorTelemetry() {
  // 0. Tangkap kegagalan load resource/modul (MIME salah, 404 file JS/CSS,
  //    font). Error jenis ini TIDAK bubble — wajib capture:true — dan inilah
  //    yang menyebut NAMA FILE-nya (kasus fuse.min.mjs kemarin bisu).
  window.addEventListener('error', (event) => {
    try {
      const t = event.target || {};
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        const src = (t.src || t.href || '').slice(0, 200);
        sendTelemetryToDiscord({
          type: 'Resource Load Failure',
          errorName: 'ResourceError',
          message: `Gagal memuat: ${src || '(sumber tak dikenal)'}`,
          stack: '',
          location: src || 'unknown',
          level: 'error'
        });
      }
    } catch (_) {}
  }, true);

  // 1. Tangkap Uncaught JavaScript Error (syntax, runtime, null pointer)
  window.addEventListener('error', (event) => {
    try {
      const error = event.error || {};
      const location = `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`;
      sendTelemetryToDiscord({
        type: 'Uncaught Exception',
        errorName: error.name || 'RuntimeError',
        message: event.message || error.message || 'Error tanpa pesan',
        stack: error.stack || 'No stack trace available',
        location,
        level: 'error'
      });
    } catch (_) {}
  });

  // 2. Tangkap Unhandled Promise Rejections (Fetch gagal, async error)
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      let errorName = 'UnhandledPromiseRejection';
      let message = 'Promise rejected without error object';
      let stack = '';

      if (reason instanceof Error) {
        errorName = reason.name || errorName;
        message = reason.message || message;
        stack = reason.stack || '';
      } else if (typeof reason === 'string') {
        message = reason;
      } else if (reason && typeof reason === 'object') {
        try {
          message = JSON.stringify(reason);
        } catch (_) {}
      }

      sendTelemetryToDiscord({
        type: 'Unhandled Rejection',
        errorName,
        message,
        stack,
        location: 'Promise Async Call',
        level: 'warning'
      });
    } catch (_) {}
  });

  // 3. Expose ke window agar bisa dipanggil dari mana saja jika perlu manual log
  window.reportErrorToDiscord = sendTelemetryToDiscord;
  if (resolveTelemetryProxyUrl()) {
    console.log('[Telemetry] Crash Reporter Aktif (via proxy).');
  } else {
    console.log('[Telemetry] Nonaktif (URL proxy belum diisi).');
  }
}
