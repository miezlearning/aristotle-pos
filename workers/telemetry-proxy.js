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

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Aristotle POS telemetry proxy. POST JSON to report.', { status: 405 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateHit('ip:' + ip, RATE_MAX_PER_IP)) {
      return new Response('Rate limited', { status: 429 });
    }
    if (!rateHit('global', RATE_MAX_GLOBAL)) {
      return new Response('Rate limited', { status: 429 });
    }

    let b;
    try {
      b = await request.json();
    } catch (_) {
      return new Response('Bad JSON', { status: 400 });
    }
    if (!b || b.app !== 'aristotle-pos') {
      return new Response('Bad app', { status: 400 });
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

    const secret = (env && env.DISCORD_WEBHOOK_URL) || '';
    if (!secret.startsWith('https://discord.com/api/webhooks/')) {
      return new Response('Proxy belum dikonfigurasi (env DISCORD_WEBHOOK_URL).', { status: 500 });
    }

    const res = await fetch(secret, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Aristotle POS Sentry', embeds: [embed] })
    });
    return new Response(res.ok ? 'ok' : 'discord error', { status: res.ok ? 200 : 502 });
  }
};
