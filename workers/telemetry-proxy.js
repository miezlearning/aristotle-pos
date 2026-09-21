/**
 * Aristotle POS - Telemetry Proxy (Cloudflare Worker, gratis)
 * ============================================================
 * Kenapa ada: URL webhook Discord TIDAK BOLEH ada di aplikasi (bocor = spam
 * channel + dihapus Discord). Worker ini yang memegang rahasianya; aplikasi
 * hanya memanggil URL worker ini (publik, aman) dan embed Discord DIBANGUN
 * DI SINI — kiriman jahat tidak bisa mengarang isi pesan.
 *
 * CARA PASANG (5 menit, sekali saja):
 * 1. Daftar/login https://dash.cloudflare.com (gratis) → Workers & Pages
 *    → Create → Create Worker → beri nama mis. `aris-pos-telemetry` → Deploy.
 * 2. Di halaman Worker → Edit code → hapus isi → tempel SELURUH file ini → Deploy.
 * 3. Buat webhook Discord baru: Server Discord → channel → Edit Channel →
 *    Integrations → Webhooks → New Webhook → Copy Webhook URL.
 *    (JANGAN tempel URL itu di mana pun selain langkah 4.)
 * 4. Di halaman Worker → Settings → Variables → Add variable:
 *      Name  = DISCORD_WEBHOOK_URL
 *      Value = <URL webhook tadi> → Save (Encrypt).
 * 5. Salin URL worker-mu (mis. https://aris-pos-telemetry.kamu.workers.dev),
 *    berikan ke developer untuk ditulis ke aplikasi → rilis. Selesai.
 *    Semua HP kasir otomatis melapor ke 1 channel, tanpa setting per HP.
 */

const RATE_WINDOW_MS = 60000;
const RATE_MAX_PER_IP = 20;   // maks 20 laporan/menit per IP
const RATE_MAX_GLOBAL = 200;  // maks 200 laporan/menit seluruh armada
const hits = new Map();       // per-isolate (aproksimasi, cukup untuk UMKM)

function rateHit(key, max) {
  const now = Date.now();
  let arr = hits.get(key);
  if (!arr) { arr = []; hits.set(key, arr); }
  while (arr.length && now - arr[0] > RATE_WINDOW_MS) arr.shift();
  if (arr.length >= max) return false;
  arr.push(now);
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
      if (hits.size <= 300) break;
    }
  }
  return true;
}

const cap = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// CORS: aplikasi memanggil dari origin mana pun (Pages, localhost, APK).
// Preflight browser (OPTIONS, karena Content-Type: application/json)
// WAJIB dijawab — tanpanya fetch diblokir sebelum sampai logika.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const corsReply = (body, status) =>
  new Response(body, { status, headers: CORS_HEADERS });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return corsReply('Aristotle POS telemetry proxy. POST JSON to report.', 405);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateHit('ip:' + ip, RATE_MAX_PER_IP)) {
      return corsReply('Rate limited', 429);
    }
    if (!rateHit('global', RATE_MAX_GLOBAL)) {
      return corsReply('Rate limited', 429);
    }

    let b;
    try {
      b = await request.json();
    } catch (_) {
      return corsReply('Bad JSON', 400);
    }
    if (!b || b.app !== 'aristotle-pos') {
      return corsReply('Bad app', 400);
    }

    const secret = (env && env.DISCORD_WEBHOOK_URL) || '';
    if (!secret.startsWith('https://discord.com/api/webhooks/')) {
      return corsReply('Proxy belum dikonfigurasi (env DISCORD_WEBHOOK_URL).', 500);
    }

    // Bundel diagnostik 1-tap: embed ringkas server-side, rinci tapi terbatas.
    if (b.kind === 'diagnostics') {
      const d = (b.data && typeof b.data === 'object') ? b.data : {};
      const errLines = Array.isArray(d.errors) ? d.errors.slice(0, 4).map(e =>
        `${cap(e.at, 16).slice(5) || '?'} — ${cap(e.errorName, 30)}: ${cap(e.message, 80)}`
      ).join('\n') : '';
      const diagEmbed = {
        title: `🩺 [Aristotle POS] Diagnostik: ${cap(d.storeName, 50) || '-'}`,
        description: `Laporan 1-tap dari perangkat kasir`,
        color: 0x3B82F6,
        fields: [
          {
            name: '🏪 Toko & Aplikasi',
            value: `**${cap(d.storeName, 50) || '-'}** (\`${cap(d.storeId, 30)}\`)\nApp ${cap(d.appVersion, 20) || '?'} • ${cap(d.os, 20) || '?'} • ${d.online === false ? '🔴 Offline' : '🟢 Online'}`,
            inline: false
          },
          {
            name: '💾 Data Lokal',
            value: `${cap(d.storageText, 60) || '-'}\nProduk ${d.products | 0} • Transaksi ${d.transactions | 0} • Biaya ${d.expenses | 0}`,
            inline: true
          },
          {
            name: '🖨️ Printer',
            value: `${cap(d.printerText, 90) || '-'}`,
            inline: true
          },
          {
            name: '📋 Error Terakhir',
            value: errLines ? `\`\`\`\n${errLines}\n\`\`\`` : 'Bersih — tidak ada error tercatat.',
            inline: false
          }
        ],
        footer: { text: 'Aristotle POS Telemetry Proxy • diagnostik' },
        timestamp: new Date().toISOString()
      };
      const res = await fetch(secret, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Aristotle POS Sentry', embeds: [diagEmbed] })
      });
      return corsReply(res.ok ? 'ok' : 'discord error', res.ok ? 200 : 502);
    }

    const level = b.level === 'warning' ? 'warning' : b.level === 'info' ? 'info' : 'error';
    const color = level === 'warning' ? 0xF59E0B : level === 'info' ? 0x3B82F6 : 0xEF4444;

    // Embed dibangun server-side dari field tervalidasi — client tidak bisa
    // mengarang username, avatar, atau konten bebas.
    const embed = {
      title: `🚨 [Aristotle POS] ${cap(b.type, 60) || 'Error'}: ${cap(b.errorName, 80) || 'Error'}`,
      description: `**Pesan Error:**\n\`\`\`\n${cap(b.message, 500) || '-'}\n\`\`\``,
      color,
      fields: [
        {
          name: '🏪 Toko',
          value: `**${cap(b.storeName, 60) || '-'}**\n\`ID: ${cap(b.storeId, 40) || '-'}\``,
          inline: true
        },
        {
          name: '📱 Perangkat',
          value: `${cap(b.os, 24) || '-'} • View: \`${cap(b.view, 24) || '-'}\``,
          inline: true
        },
        {
          name: '📍 Lokasi',
          value: `\`${cap(b.location, 100) || 'N/A'}\``,
          inline: true
        },
        {
          name: '📋 Stack Trace',
          value: `\`\`\`js\n${cap(b.stack, 900) || '-'}\n\`\`\``,
          inline: false
        }
      ],
      footer: { text: 'Aristotle POS Telemetry Proxy' },
      timestamp: new Date().toISOString()
    };

    const res = await fetch(secret, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Aristotle POS Sentry', embeds: [embed] })
    });
    return corsReply(res.ok ? 'ok' : 'discord error', res.ok ? 200 : 502);
  }
};
