/**
 * Aristotle POS - Enterprise Error Telemetry & Discord Crash Reporter
 * Memantau error JavaScript, unhandled promise rejections, dan crash hardware/jaringan secara otomatis
 * dan mengirimkannya ke Discord Webhook dengan format embed standar industri.
 */

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1547145982947491941/tJFIxfrErcDXb1_N3Hd3BlIznMTX33DB-O6WhjxNILb0JinDVwpmdxPh6dt4Uk0HJgZg';

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

    // 4. Bangun Metadata Konteks
    const ctx = getTelemetryContext();

    // Pilih Warna Embed
    let embedColor = 0xEF4444; // Merah untuk Error/Crash
    if (level === 'warning') embedColor = 0xF59E0B; // Amber
    else if (level === 'info') embedColor = 0x3B82F6; // Biru
    else if (type.includes('Promise')) embedColor = 0xF97316; // Oranye

    const embed = {
      title: `🚨 [Aristotle POS] ${type}: ${errorName}`,
      description: `**Pesan Error:**\n\`\`\`\n${message.slice(0, 500)}\n\`\`\``,
      color: embedColor,
      fields: [
        {
          name: '🏷️ Versi & Build',
          value: `\`${ctx.version}\``,
          inline: true
        },
        {
          name: '🏪 Toko / Kasir',
          value: `**${ctx.storeName}**\n\`ID: ${ctx.storeId}\` (Role: ${ctx.role})`,
          inline: true
        },
        {
          name: '📱 Perangkat & Status',
          value: `${ctx.osName} • ${ctx.isOnline ? '🟢 Online' : '🔴 Offline'}\n${ctx.screenResolution}`,
          inline: true
        },
        {
          name: '🧭 Layar & Antrian',
          value: `View: \`${ctx.currentView}\`\nAntrian: \`${ctx.queueContext}\``,
          inline: true
        },
        {
          name: '📍 Lokasi Berkas',
          value: `\`${location || 'N/A'}\``,
          inline: true
        },
        {
          name: '📋 Stack Trace',
          value: `\`\`\`js\n${formatStackTrace(stack)}\n\`\`\``,
          inline: false
        }
      ],
      footer: {
        text: 'Aristotle POS Enterprise Crash Telemetry • Live Monitoring'
      },
      timestamp: new Date().toISOString()
    };

    // Tambahan Extra info jika ada
    if (extra && Object.keys(extra).length > 0) {
      try {
        const extraStr = JSON.stringify(extra, null, 2);
        if (extraStr.length < 900) {
          embed.fields.push({
            name: '🔍 Konteks Tambahan',
            value: `\`\`\`json\n${extraStr}\n\`\`\``,
            inline: false
          });
        }
      } catch (_) {}
    }

    const payload = {
      username: 'Aristotle POS Sentry',
      avatar_url: 'https://miezlearning.github.io/aristotle-pos/icon-192.png',
      embeds: [embed]
    };

    // Kirim via fetch
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok && response.status === 429) {
      console.warn('[Telemetry] Discord Webhook 429 Rate Limited. Backing off...');
    }

    return response.ok;
  } catch (telemetryErr) {
    // Telemetry tidak boleh pernah membuat aplikasi kasir crash
    console.error('[Telemetry] Gagal mengirim laporan error ke Discord:', telemetryErr);
    return false;
  }
}

/**
 * Inisialisasi Listener Global untuk Menangkap Semua Error
 */
export function initErrorTelemetry() {
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
  console.log('[Telemetry] Aristotle POS Enterprise Discord Crash Reporter Aktif.');
}
