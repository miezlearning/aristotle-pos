/**
 * Kasir Mami - Penyimpanan foto produk di IndexedDB (Dexie, dibundel lokal).
 *
 * Masalah: foto menu berupa data-URL base64 yang disimpan di localStorage
 * bersama produk — menggerus kuota ±5MB dan ikut di-stringify tiap simpan.
 * Solusi: byte foto tinggal di IndexedDB (kuota ratusan MB), `product.image`
 * dikosongkan. Cloud tetap membawa byte (kompatibel lintas perangkat).
 *
 * Kontrak:
 * - Cache memori sinkron → render tidak pernah menunggu IndexedDB.
 * - `resolveProductImage(p)` satu-satunya cara baca foto untuk render.
 * - Bila Dexie gagal dimuat, otomatis jatuh ke mode inline lama (foto tetap jalan).
 */

const PHOTO_DB_NAME = 'aristotle-pos';
const PHOTO_TABLE = 'photos';

const photoCache = new Map();
let photoDb = null;
let photoReady = null;

function getDexie() {
  try {
    return (typeof window !== 'undefined' && window.Dexie) ? window.Dexie : null;
  } catch (_) {
    return null;
  }
}

function openDb() {
  if (photoDb) return photoDb;
  const Dexie = getDexie();
  if (!Dexie) return null;
  try {
    photoDb = new Dexie(PHOTO_DB_NAME);
    photoDb.version(1).stores({ [PHOTO_TABLE]: 'id' });
  } catch (_) {
    photoDb = null;
  }
  return photoDb;
}

function isDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * Ambil byte foto dari cache memori (untuk backup & sync cloud) — sinkron.
 */
export function getCachedPhoto(productId) {
  try {
    return photoCache.get(productId) || '';
  } catch (_) {
    return '';
  }
}

/**
 * Baca foto untuk render — SINKRON, tidak pernah melempar.
 * Urutan: cache IndexedDB → inline lama (data-URL) → URL remote → kosong.
 */
export function resolveProductImage(p) {  try {
    if (!p) return '';
    const cached = photoCache.get(p.id);
    if (cached) return cached;
    const im = p.image || '';
    if (!im) return '';
    if (isDataUrl(im)) return im; // produk lama / fallback inline
    if (/^(https?:|blob:|file:)/i.test(im)) return im; // URL remote
    return '';
  } catch (_) {
    return '';
  }
}

/**
 * Simpan byte foto (data-URL) untuk satu produk. Kosong = hapus.
 * Mengembalikan true bila byte aman di IndexedDB (boleh kosongkan product.image).
 */
export async function putProductPhoto(productId, dataUrl) {
  try {
    if (!productId) return false;
    if (isDataUrl(dataUrl)) {
      photoCache.set(productId, dataUrl);
    } else {
      photoCache.delete(productId);
    }
    const db = openDb();
    if (!db) return false;
    await db.open();
    if (isDataUrl(dataUrl)) {
      await db.table(PHOTO_TABLE).put({ id: productId, dataUrl, updatedAt: new Date().toISOString() });
    } else {
      await db.table(PHOTO_TABLE).delete(productId);
    }
    return true;
  } catch (_) {
    return false;
  }
}

export async function deleteProductPhoto(productId) {
  return putProductPhoto(productId, '');
}

/**
 * Muat semua foto ke cache + pindahkan byte inline lama ke IndexedDB.
 * Dipanggil sekali saat boot (sebelum render pertama).
 * Mengembalikan jumlah produk yang dimigrasi (pemanggil wajib saveProducts).
 */
export async function preloadProductPhotos(products) {
  if (photoReady) return photoReady;
  photoReady = (async () => {
    try {
      const db = openDb();
      if (db) {
        await db.open();
        const rows = await db.table(PHOTO_TABLE).toArray();
        (rows || []).forEach(r => {
          if (r && r.id && isDataUrl(r.dataUrl)) photoCache.set(r.id, r.dataUrl);
        });
      }
    } catch (_) {}
    return migrateInlinePhotos(products);
  })();
  return photoReady;
}

/**
 * Pindahkan byte inline (data-URL di product.image) ke IndexedDB.
 * Dipakai saat boot dan setelah impor backup. Aman diulang.
 * Mengembalikan jumlah yang dipindahkan (pemanggil wajib saveProducts bila > 0).
 */
export async function migrateInlinePhotos(products) {
  let migrated = 0;
  try {
    const arr = Array.isArray(products) ? products : [];
    for (const p of arr) {
      const im = p ? p.image : '';
      if (p && p.id && isDataUrl(im)) {
        photoCache.set(p.id, im);
        p.image = '';
        migrated++;
        try {
          const db = openDb();
          if (db) {
            await db.open();
            await db.table(PHOTO_TABLE).put({ id: p.id, dataUrl: im, updatedAt: new Date().toISOString() });
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return migrated;
}
