/**
 * In-App Auto Updater Module for Aristotle POS
 * Mendeteksi versi rilis baru dari cloud (version.json)
 * dan memicu pengunduhan serta instalasi APK otomatis di Android atau download di browser
 */
import { showToast, playClick } from '../utils.js';

let updateInfo = null;

/**
 * Dapatkan versi terpasang saat ini
 */
export function getCurrentAppVersion() {
  if (window.AndroidBridge && typeof window.AndroidBridge.getAppVersionCode === 'function') {
    return {
      code: window.AndroidBridge.getAppVersionCode(),
      name: window.AndroidBridge.getAppVersionName ? window.AndroidBridge.getAppVersionName() : '1.1.8',
      isNative: true
    };
  }
  const badgeEl = document.getElementById('appVersionBadge');
  const webVersionName = badgeEl ? badgeEl.textContent.replace('v', '').trim() : '1.1.8';
  return {
    code: 999999,
    name: webVersionName,
    isNative: false
  };
}

/**
 * Periksa pembaruan aplikasi ke server
 * @param {boolean} manual Jika true, tampilkan feedback jika sudah versi terbaru
 */
export async function checkForAppUpdates(manual = false) {
  try {
    const current = getCurrentAppVersion();
    
    // Perbarui teks versi di UI profil jika elemennya ada
    const versionLabel = document.getElementById('appVersionLabel');
    if (versionLabel) {
      versionLabel.textContent = `v${current.name} (${current.isNative ? 'Android APK' : 'Web PWA'})`;
    }

    // Ambil version.json dengan cache-busting timestamp (Gunakan URL cloud absolut jika berjalan di Native Android APK)
    const updateUrl = current.isNative
      ? `https://miezlearning.github.io/aristotle-pos/version.json?_t=${Date.now()}`
      : `version.json?_t=${Date.now()}`;
    const res = await fetch(updateUrl, { cache: 'no-store' });
    if (!res.ok) {
      if (manual) showToast('Gagal memeriksa pembaruan (Server tidak merespons).', 'warning');
      return;
    }

    const data = await res.json();
    updateInfo = data;

    // Hanya native APK yang otomatis popup bandingkan versionCode.
    const isNewer = current.isNative
      ? (Number(data.versionCode) > Number(current.code))
      : (manual && data.versionName !== current.name);

    if (isNewer) {
      if (!manual && sessionStorage.getItem(`update_dismissed_${data.versionCode}`)) {
        return;
      }
      showUpdateModal(data, current);
    } else if (manual) {
      showToast(`Aplikasi sudah menggunakan versi terbaru (v${current.name}).`, 'success');
    }
  } catch (err) {
    console.warn('Check update error:', err);
    if (manual) {
      showToast('Gagal terhubung ke server pembaruan.', 'warning');
    }
  }
}

/**
 * Tampilkan modal notifikasi pembaruan
 */
export async function showUpdateModal(newRelease, current) {
  const modal = document.getElementById('updateAppModal');
  if (!modal) return;

  // Pastikan font ikon sudah siap sebelum modal dibuka agar tidak FOUT
  if (document.fonts && !document.fonts.check('24px "Material Symbols Rounded"')) {
    try {
      await Promise.race([
        document.fonts.load('24px "Material Symbols Rounded"'),
        document.fonts.ready,
        new Promise(r => setTimeout(r, 2000))
      ]);
    } catch (_) {}
    document.documentElement.classList.remove('fonts-loading');
  }

  const versionBadgeEl = document.getElementById('updateModalVersionBadge');
  const currentVersionEl = document.getElementById('updateModalCurrentVersion');
  const changelogEl = document.getElementById('updateModalChangelog');
  const progressBar = document.getElementById('updateProgressBar');
  const progressContainer = document.getElementById('updateProgressContainer');
  const downloadBtn = document.getElementById('updateDownloadBtn');
  const cancelBtn = document.getElementById('updateCancelBtn');

  if (versionBadgeEl) {
    versionBadgeEl.textContent = `v${newRelease.versionName || 'Terbaru'}`;
  }
  if (currentVersionEl) {
    currentVersionEl.textContent = `Versi Anda saat ini: v${current.name}`;
  }
  const fromEl = document.getElementById('updateFromVersion');
  if (fromEl) fromEl.textContent = `v${current.name || '?'}`;
  const toEl = document.getElementById('updateToVersion');
  if (toEl) toEl.textContent = `v${newRelease.versionName || 'baru'}`;

  if (changelogEl && Array.isArray(newRelease.changelog)) {
    changelogEl.innerHTML = newRelease.changelog.map(item => `
      <li class="flex items-start gap-2 text-xs text-stone-700">
        <span class="text-emerald-600 font-black">•</span>
        <span>${item}</span>
      </li>
    `).join('');
  }

  const installBtn = document.getElementById('updateInstallBtn');
  if (installBtn) installBtn.classList.add('hidden');
  if (progressContainer) progressContainer.classList.add('hidden');
  if (progressBar) {
    progressBar.classList.remove('update-bar-indeterminate');
    progressBar.style.width = '0%';
  }
  resetUpdateProgressStats();
  if (downloadBtn) {
    downloadBtn.classList.remove('hidden');
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <span class="material-symbols-rounded text-base">cloud_download</span>
      <span>Perbarui Sekarang</span>
    `;
  }
  if (cancelBtn) cancelBtn.disabled = false;

  // Cek apakah file APK pembaruan sudah pernah selesai diunduh di cache perangkat
  if (window.AndroidBridge && typeof window.AndroidBridge.hasDownloadedUpdateApk === 'function') {
    try {
      if (window.AndroidBridge.hasDownloadedUpdateApk()) {
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '100%';
        const statusText = document.getElementById('updateProgressStatus');
        if (statusText) {
          statusText.innerHTML = `
            <span class="text-emerald-700 font-bold">Paket pembaruan sudah siap di perangkat!</span>
            <span class="block text-[10px] text-stone-500 font-normal mt-0.5">Tekan tombol hijau <strong>"Pasang Sekarang"</strong> di bawah untuk memasang.</span>
          `;
        }
        if (downloadBtn) downloadBtn.classList.add('hidden');
        if (installBtn) {
          installBtn.classList.remove('hidden');
          installBtn.disabled = false;
        }
      }
    } catch (_) {}
  }

  modal.classList.remove('hidden');
}

/**
 * Tutup modal pembaruan
 */
export function closeUpdateModal() {
  const modal = document.getElementById('updateAppModal');
  if (modal) modal.classList.add('hidden');
  if (updateInfo && updateInfo.versionCode) {
    sessionStorage.setItem(`update_dismissed_${updateInfo.versionCode}`, '1');
  }
}

/**
 * Pasang file APK pembaruan yang sudah terunduh
 */
export function installDownloadedUpdate() {
  playClick('pop');
  if (window.AndroidBridge && typeof window.AndroidBridge.installDownloadedApk === 'function') {
    const ok = window.AndroidBridge.installDownloadedApk();
    if (ok) {
      showToast('Membuka jendela pemasang Android...', 'info');
      return;
    }
  }

  // Jika belum ada file di cache atau gagal, tawarkan unduh ulang
  if (updateInfo && updateInfo.apkUrl) {
    showToast('Mengunduh ulang paket pembaruan...', 'info');
    startAppUpdate();
  } else {
    showToast('File paket pembaruan belum siap.', 'warning');
  }
}

/**
 * Mulai proses pengunduhan & instalasi pembaruan
 */
export function startAppUpdate() {
  playClick('pop');
  if (!updateInfo || !updateInfo.apkUrl) {
    showToast('Tautan pembaruan tidak valid.', 'error');
    return;
  }

  const downloadBtn = document.getElementById('updateDownloadBtn');
  const installBtn = document.getElementById('updateInstallBtn');
  const cancelBtn = document.getElementById('updateCancelBtn');
  const progressContainer = document.getElementById('updateProgressContainer');
  const statusText = document.getElementById('updateProgressStatus');

  if (installBtn) installBtn.classList.add('hidden');
  if (progressContainer) progressContainer.classList.remove('hidden');
  resetUpdateProgressStats();
  const percentEl = document.getElementById('updateProgressPercent');
  if (percentEl) percentEl.textContent = '0%';
  const metaEl = document.getElementById('updateProgressMeta');
  if (metaEl) metaEl.textContent = '';
  if (downloadBtn) {
    downloadBtn.classList.remove('hidden');
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <span class="material-symbols-rounded animate-spin text-base">sync</span>
      <span>Mengunduh...</span>
    `;
  }
  if (cancelBtn) cancelBtn.disabled = true;

  // 1. Jalur Utama Native Android APK (v1.1.3+)
  if (window.AndroidBridge && typeof window.AndroidBridge.downloadAndInstallApk === 'function') {
    if (statusText) statusText.textContent = 'Menghubungkan ke server pembaruan...';
    try {
      window.AndroidBridge.downloadAndInstallApk(updateInfo.apkUrl);
    } catch (e) {
      console.error('Failed to call downloadAndInstallApk:', e);
      onUpdateDownloadError(e.message || 'Gagal memulai unduhan native');
    }
  } else if (window.AndroidBridge) {
    // 2. Aplikasi Native Android Lama (v1.1.0) yang belum memiliki modul native installer
    if (statusText) statusText.textContent = 'Membuka tautan paket instalasi...';
    showToast('Aplikasi di HP Anda masih versi dasar. Pasang pembaruan sekali ini untuk mengaktifkan fitur pembaru otomatis selamanya.', 'warning', 7000);
    const a = document.createElement('a');
    a.href = updateInfo.apkUrl;
    a.download = 'Aristotle-POS.apk';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      closeUpdateModal();
    }, 1500);
  } else {
    // 3. Mode Web Browser / Laptop
    if (statusText) statusText.textContent = 'Mengunduh APK pembaruan via browser...';
    const a = document.createElement('a');
    a.href = updateInfo.apkUrl;
    a.download = 'Aristotle-POS.apk';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      closeUpdateModal();
      showToast('File APK sedang diunduh oleh browser Anda.', 'info');
    }, 1000);
  }
}

let lastProgAt = 0;
let lastProgBytes = 0;

const fmtUpdateMB = (b) => `${(Math.max(0, Number(b) || 0) / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

function resetUpdateProgressStats() {
  lastProgAt = 0;
  lastProgBytes = 0;
}

/**
 * Callback dari Java Android saat proses pengunduhan berjalan.
 * Tanda tangan: (persen, byteTerunduh, totalByte). persen = -1 berarti
 * total tak diketahui (indeterminate) — bar tetap beranimasi + hitung MB.
 */
export function onUpdateDownloadProgress(percent = 0, downloaded = 0, total = 0) {
  const progressBar = document.getElementById('updateProgressBar');
  const statusText = document.getElementById('updateProgressStatus');
  const percentEl = document.getElementById('updateProgressPercent');
  const metaEl = document.getElementById('updateProgressMeta');
  const downloadBtn = document.getElementById('updateDownloadBtn');
  const installBtn = document.getElementById('updateInstallBtn');
  const cancelBtn = document.getElementById('updateCancelBtn');

  const p = Math.max(-1, Number(percent) || 0);
  const down = Math.max(0, Number(downloaded) || 0);
  const tot = Math.max(0, Number(total) || 0);

  // Kecepatan unduh sederhana dari 2 laporan terakhir.
  const now = Date.now();
  let speedTxt = '';
  if (lastProgAt > 0 && now > lastProgAt && down >= lastProgBytes) {
    const bps = (down - lastProgBytes) / ((now - lastProgAt) / 1000);
    if (bps > 0) speedTxt = ` • ${fmtUpdateMB(bps)}/dtk`;
  }
  lastProgAt = now;
  lastProgBytes = down;

  if (p >= 100) {
    if (progressBar) {
      progressBar.classList.remove('update-bar-indeterminate');
      progressBar.style.width = '100%';
    }
    if (percentEl) percentEl.textContent = '100%';
    if (metaEl) metaEl.textContent = tot > 0 ? `${fmtUpdateMB(down)} dari ${fmtUpdateMB(tot)}` : `${fmtUpdateMB(down)} terunduh`;
    if (statusText) {
      statusText.innerHTML = `
        <span class="text-emerald-700 font-bold">Memverifikasi keaslian paket...</span>
        <span class="block text-[10px] text-stone-500 font-normal mt-0.5">Jika jendela installer tidak terbuka otomatis, tekan tombol hijau <strong>"Pasang Sekarang"</strong> di bawah.</span>
      `;
    }
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (installBtn) {
      installBtn.classList.remove('hidden');
      installBtn.disabled = false;
    }
    if (cancelBtn) cancelBtn.disabled = false;
    return;
  }

  if (p < 0 || tot <= 0) {
    // Indeterminate: total tak diketahui — animasi + hitung MB jalan terus.
    if (progressBar) {
      progressBar.classList.add('update-bar-indeterminate');
      progressBar.style.width = '';
    }
    if (percentEl) percentEl.textContent = '•••';
    if (metaEl) metaEl.textContent = `${fmtUpdateMB(down)} terkumpul${speedTxt}`;
    if (statusText) statusText.textContent = 'Mengunduh paket pembaruan...';
    return;
  }

  if (progressBar) {
    progressBar.classList.remove('update-bar-indeterminate');
    progressBar.style.width = `${p}%`;
  }
  if (percentEl) percentEl.textContent = `${p}%`;
  if (metaEl) metaEl.textContent = `${fmtUpdateMB(down)} dari ${fmtUpdateMB(tot)}${speedTxt}`;
  if (statusText) statusText.textContent = `Mengunduh paket pembaruan... ${p}%`;
}

/**
 * Callback dari Java Android jika pengunduhan gagal
 */
export function onUpdateDownloadError(msg) {
  const downloadBtn = document.getElementById('updateDownloadBtn');
  const installBtn = document.getElementById('updateInstallBtn');
  const cancelBtn = document.getElementById('updateCancelBtn');
  const progressContainer = document.getElementById('updateProgressContainer');

  if (installBtn) installBtn.classList.add('hidden');
  if (downloadBtn) {
    downloadBtn.classList.remove('hidden');
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <span class="material-symbols-rounded text-base">refresh</span>
      <span>Coba Lagi</span>
    `;
  }
  if (cancelBtn) cancelBtn.disabled = false;
  if (progressContainer) progressContainer.classList.add('hidden');
  showToast(`Gagal mengunduh pembaruan: ${msg}`, 'error');
}
