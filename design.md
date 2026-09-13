# DESIGN SYSTEM — Aristotle POS (Kasir Mami)

> **ATURAN WAJIB UNTUK AGENT / AI:**
> 1. Baca file ini SEBELUM membuat atau mengedit UI apapun (fitur baru, modal baru, tombol baru, halaman baru).
> 2. Jangan membuat gaya baru. Pakai ulang token & pola di bawah. Konsistensi > kreativitas.
> 3. Jika desain di Figma/mockup berbeda dari file ini, ikuti file ini dan adaptasikan warnanya.
> 4. Setiap PR / fitur baru WAJIB lolos checklist di bagian 10.

Filosofi: **Effortless UI — Ramah Lansia**. Target: pemilik UMKM 50th+. Konsekuensi: tombol besar, kontras tinggi, teks tidak kepotong, tidak ada istilah teknis.

Stack aktual: Tailwind CDN + Vanilla JS + Plus Jakarta Sans + Material Symbols Rounded. Primary brand: **Emerald-700 `#047857`**. Netral: Stone. Jangan pakai Teal `#006A67` dari PRD lama — itu sudah diganti Emerald.

---

## 1. Token Warna (Jangan tambah warna baru)

| Peran | Token Tailwind | Hex | Pakai untuk |
|---|---|---|---|
| Primary / Aksi utama | `bg-emerald-700` `text-emerald-700` `border-emerald-200` | `#047857` | Tombol Bayar, Simpan, Aktif, ikon utama |
| Primary hover | `bg-emerald-800` | — | Hover semua tombol primary |
| Background primary muda | `bg-emerald-50` | — | Container ikon primary, banner total |
| Surface | `bg-white` | — | Card, modal, list |
| Surface alt | `bg-stone-50` / `bg-stone-100` | — | Body modal, input idle, tombol sekunder |
| Border standar | `border-stone-200/90` atau `border-stone-200` | `#E7E5E4` | Semua card & list |
| Teks utama | `text-stone-900` | — | Judul |
| Teks sekunder | `text-stone-500` | — | Subtitle / deskripsi |
| Teks label grup | `text-stone-400` | — | Judul seksi huruf kapital |
| Warning / Demo | `bg-amber-100 text-amber-900 border-amber-200` | — | Lisensi demo, stok menipis |
| Danger | `text-rose-600 bg-rose-50 border-rose-200` | — | Hapus, Keluar, Batal transaksi |
| Success solid | `bg-emerald-600 text-white` | — | Hanya untuk badge status ON yang kecil |

**Larangan:**
- Jangan pakai `bg-blue-*`, `bg-purple-*`, `bg-sky-*`, `bg-indigo-*` untuk ikon setting baru. Lihat peta ikon di bagian 5.
- Jangan pakai gradasi (`from-emerald-* to-teal-*`) kecuali tombol `PROSES BAYAR` yang sudah ada. Semua tombol baru = warna solid.
- Jangan pakai checkbox biru bawaan Android. Semua on/off = Switch (bagian 6).

## 2. Tipografi (Plus Jakarta Sans saja)

| Elemen | Kelas baku | Ukuran |
|---|---|---|
| Judul modal | `text-sm sm:text-base font-black text-stone-900 leading-tight` | 14–16px |
| Subtitle modal / deskripsi | `text-[11px] sm:text-xs text-stone-500 font-medium` | 11–12px |
| Judul baris setting | `font-bold text-stone-800 text-xs` | 12px, jangan `font-black` |
| Subtitle baris setting | `text-[10.5px] text-stone-400 truncate` | 10.5px, **wajib `truncate`** |
| Judul seksi grup | `text-[10px] font-extrabold uppercase tracking-wider text-stone-400` | 10px kapital |
| Total / harga besar | `font-black text-emerald-700` + `text-xl` s/d `text-4xl` | Sesuai konteks |
| Badge / pill | `text-[10px] atau text-[11px] font-black` | Maks 2 kata |

Aturan: judul tidak boleh mengandung versi/nomor di dalamnya. Contoh SALAH: `Aplikasi v1.2.66 (Android APK)`. Contoh BENAR: judul `Aplikasi`, subtitle `v1.2.66 • Android APK`.

## 3. Spacing, Radius, Border, Shadow

- Radius baku: card/modal besar `rounded-2xl`, modal di mobile `rounded-t-3xl sm:rounded-3xl`, ikon kotak `rounded-xl` (32–40px), tombol aksi kecil `rounded-xl`, badge status `rounded-full`, tombol close `rounded-full`.
- Jangan campur `rounded-full` dan `rounded-xl` untuk fungsi yang sama dalam satu daftar. Trailing aksi = `rounded-xl`. Status info = `rounded-full`.
- Border card/list: `border border-stone-200/90 shadow-2xs`. Jangan pakai `shadow-md/lg` kecuali tombol Bayar.
- Padding baris setting: `p-3`. Gap antar elemen dalam baris: `gap-3`. Gap antar grup: `gap-3.5` di body modal (`p-4 flex flex-col gap-3.5`).
- Touch target minimum: **44px** (`min-h-[44px]`, class `touch-target-large`). Tombol tidak boleh lebih kecil dari `px-2.5 py-1.5`.

## 4. Struktur Modal Baku (Wajib sama semua modal)

Semua modal baru WAJIB meniru struktur ini (contoh referensi: `#productModal`, `#printerConfigModal`):

```html
<div id="namaModal" class="fixed inset-0 z-50 bg-black/50 hidden flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
  <div class="bg-white w-full sm:max-w-[430px] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200/90 overflow-hidden flex flex-col my-auto max-h-[92vh] sm:max-h-[88vh] animate-in zoom-in-95">
    <!-- HEADER: sama persis setiap modal -->
    <div class="p-4 flex items-center gap-3 border-b border-stone-200 shrink-0 bg-white">
      <div class="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
        <span class="material-symbols-rounded text-2xl">icon_name</span>
      </div>
      <div class="min-w-0 flex-1">
        <h4 class="font-extrabold text-stone-900 text-base leading-tight truncate">Judul Modal</h4>
        <p class="text-xs text-stone-500 truncate mt-0.5">Satu baris penjelasan • status</p>
      </div>
      <button type="button" onclick="closeXyzModal()" class="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition shrink-0" title="Tutup">
        <span class="material-symbols-rounded text-lg">close</span>
      </button>
    </div>
    <!-- BODY -->
    <div class="p-4 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar">
      <!-- grup-grup setting di sini -->
    </div>
  </div>
</div>
```

Aturan header:
- Ikon header SELALU `w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border-emerald-200`, kecuali modal danger (`bg-rose-50 text-rose-600 border-rose-200`) atau warning (`bg-amber-50 text-amber-800 border-amber-200`). Jangan pakai `bg-stone-900 text-white` untuk modal baru (itu warisan lama `#cloudModal`, jangan ditiru).
- Tombol close SELALU `w-8 h-8 rounded-full bg-stone-100`, ikon `close`, di kanan atas. Jangan pakai `rounded-xl` atau `p-1.5` tanpa ukuran tetap.

## 5. Pola Daftar Setting (SettingRow — seperti di screenshot)

Gunakan pola ini untuk SEMUA baris di modal pengaturan (referensi benar: grup Manajemen Toko di `#cloudModal`):

```html
<p class="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 px-1 flex items-center gap-1.5">
  <span class="material-symbols-rounded text-xs">group_icon</span><span>NAMA GRUP</span>
</p>
<div class="bg-white rounded-2xl border border-stone-200/90 divide-y divide-stone-100 shadow-2xs overflow-hidden">
  <!-- Tipe A: Navigasi (pindah halaman/modal) -->
  <button type="button" class="w-full flex items-center gap-3 p-3 hover:bg-stone-50 transition text-left active:bg-stone-100">
    <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center justify-center shrink-0">
      <span class="material-symbols-rounded text-lg">chevron_icon</span>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-bold text-stone-800 text-xs">Judul Aksi</p>
      <p class="text-[10.5px] text-stone-400 truncate">Penjelasan satu baris</p>
    </div>
    <span class="material-symbols-rounded text-base text-stone-400 shrink-0">chevron_right</span>
  </button>
  <!-- Tipe B: Aksi langsung (tombol di kanan, TANPA chevron) -->
  <div class="flex items-center gap-3 p-3">
    <div class="w-8 h-8 rounded-xl bg-stone-100 text-stone-600 border border-stone-200/60 flex items-center justify-center shrink-0">
      <span class="material-symbols-rounded text-lg">lock</span>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-bold text-stone-800 text-xs">Judul Setting</p>
      <p class="text-[10.5px] text-stone-400 truncate">Penjelasan satu baris</p>
    </div>
    <!-- trailing: SATU dari tiga ini, jangan digabung -->
  </div>
</div>
```

Peta warna ikon (jangan acak):
- Keamanan/PIN/Role → `bg-stone-100 text-stone-600` atau `bg-emerald-50 text-emerald-800` (khusus role aktif).
- Toko/cabang/switch akun → `bg-blue-50 text-blue-700 border-blue-200/60`.
- Notifikasi/perangkat → `bg-emerald-50 text-emerald-800 border-emerald-200/70`.
- Sistem/update/printer → `bg-stone-100 text-stone-600`.
- Staf/kasir → `bg-amber-50 text-amber-800 border-amber-200/70`.
- Danger/keluar/hapus → `text-rose-500`, tanpa kotak ikon bila di tombol danger full-width.

## 6. Trailing Kanan: Pilih SATU (ini sumber inkonsistensi di screenshot)

| Kebutuhan | Komponen baku | Kelas | Contoh |
|---|---|---|---|
| Navigasi ke halaman lain | Chevron | `material-symbols-rounded text-base text-stone-400` isi `chevron_right` | Ganti Toko, Buat Toko Baru |
| Aksi sekali klik (Ubah, Cek, Aktifkan) | Tombol sekunder | `px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 font-bold text-[11px] active:scale-95` | Ubah PIN, Cek Update |
| Status ON/OFF boolean | Switch, BUKAN pill | `<button role="switch" aria-checked="..." class="w-11 h-6 rounded-full p-1 bg-emerald-600 / bg-stone-300">` + knob putih | Kunci Menu & Laporan |
| Info status saja (bukan tombol) | Badge | `px-2 py-0.5 rounded-full font-black text-[10px] max-w-[110px] truncate` + warna `bg-emerald-100 text-emerald-900` / `bg-amber-100 text-amber-900` / `bg-stone-100 text-stone-500` | Online, Lifetime, Demo |

**Larangan keras (pelajaran dari screenshot):**
1. Jangan pakai pill hijau `Aktif` yang bisa diklik sebagai pengganti switch. Pill = info. Switch/tombol = aksi. Di screenshot `Kunci Menu & Laporan` pakai pill `Aktif` yang terlihat seperti badge tapi sebenarnya tombol — ini membingungkan. Ganti ke Switch.
2. Jangan tulis kalimat panjang di badge. Badge di screenshot `Aktif (Diizinkan...` kepotong karena terlalu panjang. Badge maksimal 2 kata (`Aktif`, `Mati`, `Izin OK`, `Belum Izin`). Penjelasan panjang taruh di subtitle (`text-[10.5px] text-stone-400`).
3. Jangan sejajarkan `Aktif` (pill) dengan `Ubah PIN` (kotak) dalam satu grup seolah setara. Bedakan visual: status = pill, aksi = kotak `rounded-xl`.
4. Jangan pakai `<input type="checkbox" class="w-4 h-4">` untuk setting notifikasi. Di Android itu jadi biru bawaan dan tidak konsisten (lihat 4 checkbox biru di screenshot). Ganti ke pola Switch-row: label kiri + switch kanan, satu baris `min-h-[44px]`.
5. Jangan tampilkan material key / kode lisensi di dashboard, kartu status, atau subtitle — bahkan terpotong sebagian. Kartu hanya boleh menunjukkan status (`Aktif • verifikasi otomatis`, `Sisa: X/25 transaksi`). Detail key hanya boleh dibuka di modal khusus (aktivasi/kelola) dalam keadaan tersembunyi (`••••`), dengan reveal-on-tap + tombol salin + peringatan "Hanya bagikan ke support resmi". Ini standar industri (Play Store/App Store tidak pernah memajang key) dan melindungi user lansia dari penipuan berbasis screenshot.

Pola Switch-row pengganti checkbox (wajib untuk fitur baru):
```html
<button type="button" role="switch" aria-checked="true" class="w-full flex items-center justify-between p-3 min-h-[44px]">
  <span class="flex items-center gap-2 text-xs font-semibold text-stone-700">
    <span class="material-symbols-rounded text-base text-stone-500">volume_up</span>Bunyikan bel
  </span>
  <span class="w-11 h-6 rounded-full bg-emerald-600 p-1 flex transition"><span class="w-4 h-4 rounded-full bg-white shadow ml-auto"></span></span>
</button>
```

## 7. Tombol Baku

- Primary (Bayar/Simpan): `px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm shadow-sm active:scale-95 flex items-center gap-1.5`.
- Sekunder (Batal): `px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm`.
- Danger full-width (Keluar/Hapus): `w-full py-2.5 px-3 rounded-2xl text-rose-600 hover:bg-rose-50 border border-rose-200/90 font-bold text-xs flex items-center justify-center gap-1.5 bg-white active:scale-95`.
- Tombol kecil di baris setting: lihat Tabel bagian 6 (Tombol sekunder kecil).
- Footer modal form: `shrink-0 p-3 bg-stone-50/90 border-t border-stone-200 flex justify-end gap-2.5` berisi `Batal` + `Simpan`.

## 8. Ikon (Material Symbols Rounded saja)

- Selalu class `material-symbols-rounded`. Ukuran: di kotak 32px → `text-lg` (20px), di header 44px → `text-2xl`, di judul seksi → `text-xs`.
- Nama ikon yang disetujui: `storefront print schedule shield_person lock password badge sync_alt qr_code_scanner share notifications_active volume_up vibration restaurant inventory_2 system_update logout close chevron_right edit delete search point_of_sale receipt_long payments qr_code_2`. Jangan pakai emoji sebagai ikon utama.
- Ikon yang tidak ada di daftar harus didiskusikan dulu, jangan asal pilih.

## 9. Contoh Perbaikan Screenshot (cloudModal)

Masalah di screenshot → perbaikan baku:
1. `Kunci Menu & Laporan: [Aktif]` → ganti trailing pill jadi **Switch** (ON = `bg-emerald-600`, OFF = `bg-stone-300`). Judul tetap, subtitle `Wajib PIN untuk akses laporan/menu`.
2. `Ubah PIN Owner: [Ubah PIN]` → pertahankan tombol sekunder kecil `rounded-xl`. Jangan ubah jadi pill.
3. `Notifikasi Sistem HP: [Aktif (Diizinkan...]` → pecah jadi: badge `Izin OK` (`rounded-full bg-emerald-100`, `max-w-[110px] truncate`) + tombol `Aktifkan` hanya muncul bila belum izin. Subtitle menjelaskan `Peringatan pesanan & transaksi di status bar`.
4. 4 checkbox biru → ganti ke 4 Switch-row (bagian 6). Hilangkan `text-emerald-600 rounded` pada checkbox.
5. `Aplikasi v1.2.66 (Android APK)` → judul `Aplikasi`, subtitle `v1.2.66 • Android APK • Pembaruan otomatis`. Tombol kanan tetap `Cek Update` (tombol sekunder kecil).
6. Header toko hitam `bg-stone-900` → ganti ke pola header baku bagian 4 (`bg-emerald-50 text-emerald-700`) saat refactor berikutnya. Jangan tiru gaya lama untuk modal baru.

## 10. Checklist Wajib Sebelum Selesai (Agent harus cek)

- [ ] Semua teks subtitle pakai `truncate` dan tidak kepotong aneh di layar 360px?
- [ ] Tidak ada badge lebih dari 2 kata? Tidak ada badge yang bisa diklik?
- [ ] Semua on/off pakai Switch, tidak ada checkbox biru `w-4 h-4` tersisa?
- [ ] Radius konsisten: aksi = `rounded-xl`, status = `rounded-full`?
- [ ] Ikon pakai warna sesuai peta bagian 5, tidak tambah warna baru?
- [ ] Modal baru meniru struktur bagian 4 (header 44px + close 32px + body `gap-3.5`)?
- [ ] Touch target ≥44px untuk semua tombol/label yang bisa diklik lansia?
- [ ] Tidak ada judul yang mencampur nama + versi dalam satu baris?
- [ ] Bahasa Indonesia, singkat, tanpa istilah teknis (jangan `APK`, `Toggle`, `Sync` tanpa penjelasan)?

## 11. File Referensi Cepat
- Struktur modal benar: `index.html` → `#productModal` (~baris 2516), `#printerConfigModal` (~3017).
- Pola daftar setting benar: `index.html` → `#cloudModal` (versi compact 2026: header 36px, body `p-3 gap-2.5`, grid `sm:grid-cols-2`).
- CSS global: `css/style.css` (animasi `animate-in`, `animate-bottom-sheet`, `.touch-target-large`, `.custom-scroll`, `.switch-input/.switch-track`).
- Aturan lama yang sudah kedaluwarsa: `PRD.MD` (Teal `#006A67`, split-screen desktop) — jangan ikuti untuk warna & layout baru.

## 12. Aturan Compact + Responsif (hasil refactor cloudModal 2026)
- Modal lebar: `sm:max-w-[560px]` agar di tablet/desktop bisa 2 kolom (`grid sm:grid-cols-2`), di HP tetap 1 kolom. Jangan kunci `max-w-[430px]` untuk modal pengaturan yang panjang.
- Kepadatan: body `p-3 sm:p-4 gap-2.5 sm:gap-3`, baris setting `p-2.5 min-h-[52px]`, ikon baris `w-7 h-7 rounded-lg` (bukan `w-8/w-11`). Header `px-3 py-2.5`, ikon header `w-9 h-9 rounded-xl`.
- Satu konsep satu baris: hapus duplikasi (contoh: kartu Role + baris "Beralih Peran" digabung jadi kartu saja). Teks tombol hemat kata (`Ganti`, bukan `Ganti Role`; `Mode Pemilik`, bukan `Mode Pemilik (Owner)`).
- Badge: selalu `max-w-[90px]~[110px] truncate`, maks 1–2 kata (`Aktif`, `Demo`, `Lifetime`, `Cek Izin`). Jangan tulis kalimat di badge.
- Switch: on/off SELALU switch (`w-11 h-6` untuk tombol, `w-9 h-5` untuk toggle list). Checkbox asli tetap dipakai sebagai `<input type="checkbox" class="switch-input sr-only">` + `<span class="switch-track">` agar JS `.checked` tidak rusak tapi visual konsisten (lihat `css/style.css` bagian 10).
- JS yang me-render ulang class (contoh: `updatePinButtonUI`, `updateStoreLicenseUI`, `updateNotificationUiState`, `updateHeaderRoleBadgeUI`) WAJIB memakai kelas compact yang sama — jangan kembalikan ke `p-3.5`/`w-10` lama.
