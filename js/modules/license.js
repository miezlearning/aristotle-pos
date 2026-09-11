/**
 * Kasir Mami / Aristotle POS - Cryptographic License & Demo Sandbox Middleware
 * 
 * Features:
 * 1. Cryptographic HMAC-SHA256 Checksum for Offline & Online validation
 * 2. Multi-tier encoding (e.g., LT = Lifetime Standard, PR = Pro Lifetime)
 * 3. Device Fingerprint Generator for anti-tamper & anti-abuse demo sandboxing
 * 4. Demo Transaction & Product Quota Guards (Max 25 Transactions, Max 10 Products)
 */

import { hashSha256 } from '../utils.js';

// Internal Secret Salt for Checksum Generation & Integrity Verification
const LICENSE_SECRET_SALT = 'ARISTOTLE_POS_CORE_SAAS_LIC_SALT_2026_MIEZ_99X';
export const DEMO_MAX_TRANSACTIONS = 25;
export const DEMO_MAX_PRODUCTS = 10;

/**
 * Generate a unique, persistent Device Fingerprint for anti-demo reset abuse
 */
export function getOrCreateDeviceFingerprint() {
  const STORAGE_KEY = 'aristotle_device_hardware_uuid_v1';
  let fp = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (!fp) {
    const winScreen = typeof window !== 'undefined' && window.screen ? window.screen : {};
    const winNav = typeof navigator !== 'undefined' ? navigator : {};
    const screenData = `${winScreen.width || 0}x${winScreen.height || 0}x${winScreen.colorDepth || 0}`;
    const navData = `${winNav.userAgent || ''}-${winNav.language || ''}-${winNav.hardwareConcurrency || 2}`;
    const randomEntropy = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    let hash = 0;
    const str = `${screenData}|${navData}|${randomEntropy}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
    fp = `DEV-${hex}-${Date.now().toString(36).toUpperCase()}`;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, fp);
      }
    } catch (_) {}
  }
  return fp;
}

/**
 * Helper: Hitung signature checksum 4-karakter untuk payload lisensi
 */
export async function calculateLicenseChecksum(payload) {
  const raw = `${payload}|${LICENSE_SECRET_SALT}`;
  const fullHash = await hashSha256(raw);
  return (fullHash.substring(2, 6) + fullHash.substring(10, 12)).substring(0, 4).toUpperCase();
}

/**
 * Generator Kode Lisensi Resmi (Digunakan oleh Super Admin)
 * Format: ARIS-[TIER][RANDOM]-[BLOCK2]-[BLOCK3]-[CHECKSUM]
 * Contoh: ARIS-LT8F-92B1-4C70-E82A
 * 
 * @param {string} tier - 'LT' (Lifetime Standard) atau 'PR' (Lifetime Pro Multi-Cashier)
 */
export async function generateOfficialLicenseKey(tier = 'LT') {
  const safeTier = (tier === 'PR' ? 'PR' : 'LT').toUpperCase();
  
  const randChars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const getRandBlock = (len) => {
    let res = '';
    const bytes = new Uint8Array(len);
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' ? window.crypto : null);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(bytes);
      for (let i = 0; i < len; i++) {
        res += randChars[bytes[i] % randChars.length];
      }
    } else {
      for (let i = 0; i < len; i++) {
        res += randChars[Math.floor(Math.random() * randChars.length)];
      }
    }
    return res;
  };

  const block1 = `${safeTier}${getRandBlock(2)}`;
  const block2 = getRandBlock(4);
  const block3 = getRandBlock(4);
  
  const payloadToSign = `ARIS-${block1}-${block2}-${block3}`;
  const checksum = await calculateLicenseChecksum(payloadToSign);
  
  return `${payloadToSign}-${checksum}`;
}

/**
 * Middleware Validasi Kriptografis Tingkat 1 (Algorithmic Integrity)
 * Memeriksa apakah format dan checksum tanda tangan valid tanpa membebani server
 * 
 * @param {string} licenseKey - Format ARIS-XXXX-XXXX-XXXX-XXXX
 * @returns {Promise<{ valid: boolean, tier?: string, message?: string, cleanKey?: string }>}
 */
export async function validateLicenseChecksumAlgorithm(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, message: 'Kode lisensi wajib diisi' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const parts = cleanKey.split('-');

  if (parts.length !== 5 || parts[0] !== 'ARIS') {
    return { valid: false, message: 'Format lisensi harus: ARIS-XXXX-XXXX-XXXX-XXXX' };
  }

  const [header, block1, block2, block3, checksum] = parts;
  if (block1.length !== 4 || block2.length !== 4 || block3.length !== 4 || checksum.length !== 4) {
    return { valid: false, message: 'Panjang karakter kode lisensi tidak valid' };
  }

  const payload = `${header}-${block1}-${block2}-${block3}`;
  const expectedChecksum = await calculateLicenseChecksum(payload);

  if (checksum !== expectedChecksum) {
    return { valid: false, message: 'Tanda tangan verifikasi lisensi tidak cocok (Kode tidak sah)' };
  }

  const tierCode = block1.substring(0, 2);
  const tier = tierCode === 'PR' ? 'PRO_LIFETIME' : 'LIFETIME_STANDARD';

  return {
    valid: true,
    tier,
    cleanKey
  };
}

/**
 * Cek apakah toko berstatus Akun Demo atau Berlisensi Resmi
 */
export function getStoreLicenseStatus(storeId) {
  if (!storeId) return { isDemo: false, isLicensed: false };
  
  const safeId = storeId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const storageKey = `kasir_${safeId}_license_v1`;
  
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {
        isDemo: true,
        isLicensed: false,
        tier: 'DEMO',
        licenseKey: null
      };
    }
    const data = JSON.parse(raw);
    if (data && data.isLicensed && data.licenseKey) {
      return {
        isDemo: false,
        isLicensed: true,
        tier: data.tier || 'LIFETIME_STANDARD',
        licenseKey: data.licenseKey,
        activatedAt: data.activatedAt
      };
    }
  } catch (_) {}

  return {
    isDemo: true,
    isLicensed: false,
    tier: 'DEMO',
    licenseKey: null
  };
}

/**
 * Simpan status lisensi toko di Local Storage secara terisolasi
 */
export function setStoreLicenseLocal(storeId, licenseInfo) {
  if (!storeId) return;
  const safeId = storeId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const storageKey = `kasir_${safeId}_license_v1`;
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      isLicensed: Boolean(licenseInfo.isLicensed),
      tier: licenseInfo.tier || 'LIFETIME_STANDARD',
      licenseKey: licenseInfo.licenseKey || null,
      activatedAt: licenseInfo.activatedAt || new Date().toISOString()
    }));
  } catch (e) {
    console.error('Failed to save store license locally:', e);
  }
}

/**
 * Guard Transaksi Demo: Memeriksa apakah transaksi demo sudah melebihi batas 25
 */
export function checkDemoTransactionLimit(storeId, currentHistoryCount = 0) {
  const status = getStoreLicenseStatus(storeId);
  if (status.isLicensed) {
    return {
      allowed: true,
      isDemo: false,
      currentCount: currentHistoryCount,
      maxAllowed: Infinity
    };
  }

  // Jika Akun Demo
  const allowed = currentHistoryCount < DEMO_MAX_TRANSACTIONS;
  const remaining = Math.max(0, DEMO_MAX_TRANSACTIONS - currentHistoryCount);
  
  return {
    allowed,
    isDemo: true,
    currentCount: currentHistoryCount,
    maxAllowed: DEMO_MAX_TRANSACTIONS,
    remaining
  };
}
