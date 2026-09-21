/**
 * Kasir Mami - Pencarian menu toleran-typo (ramah lansia).
 * Engine: Fuse.js v7 basic (dibundel lokal di js/lib/fuse.min.mjs — TANPA CDN).
 * Contoh: "nasgor" → "Nasi Goreng Spesial", "teh" → "Teh Manis Dingin".
 */

import Fuse from '../lib/fuse.min.js';

const FUSE_OPTS = {
  keys: ['name', 'category'],
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

function substringFallback(list, q) {
  const s = q.toLowerCase();
  return list.filter(p =>
    (p.name || '').toLowerCase().includes(s) ||
    (p.category || '').toLowerCase().includes(s)
  );
}

/**
 * Saring daftar produk berdasarkan kueri.
 * - Kosong → semua (perilaku lama).
 * - 1 huruf → substring biasa (lebih terduga).
 * - ≥2 huruf → Fuse.js, jatuh ke substring bila lib gagal / tanpa hasil.
 */
export function fuzzyFilterProducts(list, query) {
  const arr = Array.isArray(list) ? list : [];
  const q = (query || '').trim();
  if (!q) return arr;
  if (q.length < 2) {
    const s = q.toLowerCase();
    return arr.filter(p => (p.name || '').toLowerCase().includes(s));
  }
  try {
    const hits = new Fuse(arr, FUSE_OPTS).search(q);
    if (hits.length > 0) return hits.map(h => h.item);
  } catch (_) {}
  return substringFallback(arr, q);
}
