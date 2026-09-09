/**
 * Kasir Mami - Utility Functions
 */

/**
 * Format angka ke mata uang Rupiah (Pure ASCII Space, anti anomali printer thermal)
 * @param {number} num
 * @returns {string} Contoh: "Rp 15.000"
 */
export const formatRp = (num) => {
  const val = Math.round(Number(num) || 0);
  return 'Rp ' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const formatRupiah = formatRp;

let audioCtx = null;
let hasUserInteracted = false;

const unlockAudio = () => {
  hasUserInteracted = true;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
};
window.addEventListener('click', unlockAudio, { capture: true, passive: true });
window.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });

function getAudioContext() {
  if (!hasUserInteracted) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch (e) {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx.state === 'running' ? audioCtx : null;
}

/**
 * Bunyikan audio beep taktil saat aksi kasir (Instant 0ms Audio)
 * @param {number} freq Frekuensi audio (Hz)
 * @param {number} duration Durasi dalam detik
 */
export function playBeep(freq = 600, duration = 0.08) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Ignore audio error if not permitted
  }
}

/**
 * Suara sentuhan taktil instan untuk berbagai aksi UI kasir
 * @param {'tap'|'keypad'|'cash'|'switch'|'pop'|'del'} type 
 */
export function playClick(type = 'tap') {
  const sounds = {
    tap: [650, 0.045],       // Sentuh produk / tambah item
    keypad: [750, 0.035],    // Ketik angka di keypad
    cash: [820, 0.07],       // Pilih pecahan uang
    switch: [520, 0.05],     // Ganti tab antrian / kategori / menu
    pop: [600, 0.06],        // Buka modal / aksi cepat
    del: [400, 0.06]         // Hapus / kurangi item
  };
  const [freq, duration] = sounds[type] || sounds.tap;
  playBeep(freq, duration);
}

/**
 * Nada sukses transaksi kasir (Pleasant Double Register Chime)
 */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Nada 1: E5 (659 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.value = 659.25;
    gain1.gain.setValueAtTime(0.14, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.15);

    // Nada 2: B5 (987 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.value = 987.77;
    gain2.gain.setValueAtTime(0.16, t + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.1);
    osc2.stop(t + 0.38);
  } catch (e) {}
}

/**
 * Format tanggal format pendek Indonesia (e.g. "27 Agu, 11:30")
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDateShort(dateVal) {
  return new Date(dateVal).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format tanggal panjang Indonesia (e.g. "27 Agustus 2026")
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDateFull(dateVal) {
  return new Date(dateVal).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Escape karakter berbahaya untuk keamanan rendering string
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Tampilkan Custom Toast Notification modern ala Material 3
 * @param {string} message Pesan teks
 * @param {'success'|'error'|'info'|'warning'} type Jenis toast
 * @param {number} duration Durasi tampil (ms)
 * @param {object|null} action Opsi tombol aksi { label: string, onClick: function }
 */
export function showToast(message, type = 'success', duration = 3000, action = null) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  // 1. Anti-Spam: Abaikan jika toast dengan pesan yang sama persis sedang aktif di layar
  const existingSame = Array.from(container.children).find(el => el.dataset.toastMsg === message);
  if (existingSame) {
    return;
  }

  // 2. Batasi maksimal 2 toast di layar agar tidak menutupi antarmuka kasir
  while (container.children.length >= 2) {
    const oldest = container.firstElementChild;
    if (oldest) oldest.remove();
  }

  const toast = document.createElement('div');
  toast.dataset.toastMsg = message;

  const config = {
    success: {
      bg: 'bg-stone-900 text-white border-emerald-500/50',
      icon: 'check_circle',
      iconColor: 'text-emerald-400',
      sound: 800
    },
    error: {
      bg: 'bg-red-950 text-white border-red-500/50',
      icon: 'error',
      iconColor: 'text-red-400',
      sound: 300
    },
    warning: {
      bg: 'bg-amber-950 text-white border-amber-500/50',
      icon: 'warning',
      iconColor: 'text-amber-400',
      sound: 500
    },
    info: {
      bg: 'bg-stone-900 text-white border-stone-700',
      icon: 'info',
      iconColor: 'text-emerald-300',
      sound: 600
    }
  }[type] || {
    bg: 'bg-stone-900 text-white border-stone-700',
    icon: 'info',
    iconColor: 'text-emerald-400',
    sound: 600
  };

  toast.className = `toast-item px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center justify-between gap-3 w-full select-none ${config.bg}`;
  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0 flex-1">
      <span class="material-symbols-rounded text-2xl shrink-0 ${config.iconColor}">${config.icon}</span>
      <span class="text-xs sm:text-sm font-extrabold leading-snug break-words">${escapeHtml(message)}</span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      ${action ? `
        <button type="button" class="toast-action-btn px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs transition active:scale-95 shadow">
          ${escapeHtml(action.label || 'URUNGKAN')}
        </button>
      ` : ''}
      <button type="button" class="toast-close-btn opacity-40 hover:opacity-100 transition p-0.5">
        <span class="material-symbols-rounded text-base">close</span>
      </button>
    </div>
  `;

  playBeep(config.sound, 0.06);

  let isDismissed = false;
  const dismiss = () => {
    if (isDismissed) return;
    isDismissed = true;
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 220);
  };

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
  }

  if (action && action.onClick) {
    const actionBtn = toast.querySelector('.toast-action-btn');
    if (actionBtn) {
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        dismiss();
        action.onClick();
      };
    }
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * Custom Material Design 3 Confirmation Dialog (Pengganti confirm() browser)
 * @param {object} options
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog({ 
  title = 'Konfirmasi Tindakan', 
  message = 'Apakah Anda yakin ingin melanjutkan?', 
  confirmText = 'Ya, Lanjutkan', 
  confirmType = 'danger',
  icon = 'warning'
} = {}) {
  return new Promise((resolve) => {
    let modal = document.getElementById('customConfirmModal');
    if (!modal) {
      // Fallback if modal container not in DOM
      resolve(true);
      return;
    }

    const titleEl = document.getElementById('customConfirmTitle');
    const msgEl = document.getElementById('customConfirmMessage');
    const iconEl = document.getElementById('customConfirmIcon');
    const okBtn = document.getElementById('customConfirmOkBtn');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (iconEl) iconEl.innerText = icon;
    
    if (okBtn) {
      okBtn.innerText = confirmText;
      okBtn.className = confirmType === 'danger'
        ? 'px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm touch-target-large shadow transition active:scale-95'
        : 'px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-stone-950 font-black text-xs sm:text-sm touch-target-large shadow transition active:scale-95';
    }

    const cleanup = (result) => {
      modal.classList.add('hidden');
      if (okBtn) okBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
      resolve(result);
    };

    if (okBtn) okBtn.onclick = () => cleanup(true);
    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);

    // Instant zero-delay display
    modal.classList.remove('hidden');
    playBeep(450, 0.06);
  });
}

/**
 * Hash string menggunakan algoritma SHA-256 (Web Crypto API)
 */
export async function hashSha256(str) {
  if (!str && str !== 0) return '';
  try {
    const data = new TextEncoder().encode(String(str));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    console.warn('Crypto subtle digest error:', e);
    return String(str);
  }
}

/**
 * Kompresi gambar client-side menggunakan HTML5 Canvas
 * Mengubah file gambar menjadi DataURL WebP / JPEG ringan (maks 360x360 px, ~15-30 KB)
 * @param {File|Blob} file 
 * @param {number} maxDimension
 * @param {number} quality
 * @returns {Promise<string>}
 */
export function compressImageToDataUrl(file, maxDimension = 360, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('File yang dipilih bukan gambar valid.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memproses gambar.'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        // Scaling proporsional dengan maxDimension
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Latar belakang putih jika ada transparansi (misal PNG transparan)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // Prioritaskan format webp, fallback ke jpeg jika webp tidak disupport
        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
        } catch (_) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.showConfirmDialog = showConfirmDialog;
  window.playBeep = playBeep;
  window.playClick = playClick;
  window.playSuccessChime = playSuccessChime;
  window.hashSha256 = hashSha256;
  window.compressImageToDataUrl = compressImageToDataUrl;
}


