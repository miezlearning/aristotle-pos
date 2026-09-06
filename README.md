<p align="center">
  <img src="icon.png" alt="Aristotle POS Logo" width="110" height="110">
</p>

<h1 align="center"><a href="https://miezlearning.github.io/aristotle-pos/">Aristotle POS</a></h1>

<p align="center">
  <strong>Sistem Kasir Pintar, Modern, dan Skalabel untuk UMKM & Retail F&B</strong><br>
  <em>Dirancang dengan filosofi Effortless UI: Sangat mudah digunakan, ramah lansia, 100% offline-first, dan siap terhubung ke cloud.</em>
</p>

<p align="center">
  <a href="https://github.com/miezlearning/aristotle-pos/releases"><img src="https://img.shields.io/badge/Release-v1.2.24-10b981?style=for-the-badge&logo=android&logoColor=white" alt="Release Version"></a>
  <a href="https://miezlearning.github.io/aristotle-pos/"><img src="https://img.shields.io/badge/Live_Demo-PWA_Ready-0284c7?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo"></a>
  <a href="Aristotle-POS.apk"><img src="https://img.shields.io/badge/Android_APK-Unduh_Aplikasi-f59e0b?style=for-the-badge&logo=android&logoColor=white" alt="Android APK"></a>
  <a href="js/firebase.js"><img src="https://img.shields.io/badge/Cloud_Sync-Firebase_Firestore-ffca28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase Firestore"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://miezlearning.github.io/aristotle-pos/">🚀 <b>Buka Web App (Live Demo)</b></a> &nbsp;•&nbsp;
  <a href="Aristotle-POS.apk">📱 <b>Unduh APK Android</b></a> &nbsp;•&nbsp;
  <a href="PANDUAN_EDUKASI_LANSIA.md">📖 <b>Panduan Ramah Lansia</b></a> &nbsp;•&nbsp;
  <a href="CHANGELOG.md">📜 <b>Riwayat Pembaruan</b></a>
</p>

---

## 💡 Tentang Aristotle POS

**Aristotle POS** adalah aplikasi kasir (*Point of Sale*) generasi baru yang dirancang khusus untuk memecahkan kendala digitalisasi UMKM di Indonesia — seperti warung makan, kedai kopi, kedai cemilan, hingga toko kelontong. 

Dibangun dengan arsitektur **Hybrid Modern** (Progressive Web App + Native Android WebView), Aristotle POS memadukan kesederhanaan antarmuka tingkat tinggi (*low cognitive load*) dengan keandalan operasional kelas industri: **bekerja 100% saat tidak ada internet**, serta otomatis menyinkronkan data keuangan antarperangkat ketika online.

---

## 📸 Antarmuka Aplikasi (Showcase)

| Layar Utama Kasir (POS) | Kalkulator Pembayaran & Kembalian Cepat |
| :---: | :---: |
| ![Layar Utama Kasir](docs/images/screenshot-pos.png) | ![Pembayaran Kasir](docs/images/screenshot-checkout.png) |
| *Katalog grid responsif, multi-antrian, dan ringkasan keranjang live.* | *Pilihan nominal uang pas, kalkulasi kembalian otomatis, & QRIS.* |

<br>

<p align="center">
  <b>🧾 Pengaturan Hardware Printer Thermal & Pratinjau Struk Nyata (Sticky Live Preview)</b><br>
  <em>Mendukung pencetakan Bluetooth SPP / USB ESC/POS 58mm & 80mm, tiket dapur 🍳, dan buka laci kasir otomatis.</em>
</p>

<p align="center">
  <img src="docs/images/screenshot-printer.png" alt="Pengaturan Printer dan Pratinjau Struk" width="88%">
</p>

---

## ✨ Fitur Unggulan

- ⚡ **100% Offline-First**: Seluruh transaksi, katalog produk, dan laporan tetap berjalan normal tanpa koneksi internet. Data tersimpan aman di perangkat lokal dan otomatis disinkronkan ke cloud saat jaringan tersedia.
- 👵 **Effortless UI (Ramah Lansia)**: Mengadopsi prinsip Google Material Design 3 dengan ukuran tombol sentuh besar (min 48dp), kontras warna tinggi, konfirmasi audio haptik, serta panduan sorot interaktif (*Tour Guide*).
- 📑 **Multi-Antrian Pesanan (*Order Queues*)**: Melayani banyak pelanggan atau nomor meja secara simultan tanpa khawatir pesanan tertukar atau terhapus.
- 🍳 **Add-On Menu & Tiket Dapur (Kitchen Checkpoint)**: Mendukung kustomisasi topping tambahan, catatan pesanan tanpa batas karakter, pemisahan porsi (*item splitting*), dan format cetak khusus koki/barista dengan kotak centang `[  ]`.
- 🖨️ **Integrasi Printer Thermal & Laci Kasir**: Kompatibel dengan printer Bluetooth ESC/POS (58mm/80mm), cetak struk berlogo, kustomisasi spasi hemat kertas, dan perintah buka laci uang kasir otomatis (*cash drawer kick*).
- 💳 **QRIS Dinamis EMVCo & Kalkulator Kembalian**: Mengubah QRIS statis toko menjadi QRIS dinamis ber-nominal pas secara instan, dilengkapi kalkulator uang kembalian cepat dan fitur bagi rata (*split bill*).
- 🕒 **Manajemen Shift Kasir & Laporan Z**: Pencatatan modal laci awal (*cash float*), audit rekonsiliasi fisik uang kasir (Pas / Kurang / Lebih), serta cetak rekap Laporan Z resmi tutup toko.
- 👥 **Multi-Perangkat & Multi-Tenant**: Sambungkan HP staf ke kasir utama via Wi-Fi/Hotspot lokal tanpa kuota internet, serta kelola banyak cabang usaha dalam satu aplikasi dengan proteksi 6-digit PIN.
- 📊 **Laporan Finansial & Margin Laba**: Rekap otomatis omzet harian, pencatatan biaya operasional, estimasi laba bersih, serta ekspor pembukuan ke format CSV/Excel.

---

## 🔄 Alur Operasional Kasir

```mermaid
graph LR
    A[Buka Shift Kasir<br><i>Opsional</i>] --> B[Pilih Menu & Add-on]
    B --> C[Kelola Antrian Meja]
    C --> D{Diskon Transaksi?}
    D -->|Ya| E[Diskon % atau Rp]
    D -->|Tidak| F[Proses Pembayaran]
    E --> F
    F --> G{Metode Bayar}
    G -->|Tunai| H[Hitung Kembalian & Laci Buka]
    G -->|QRIS Dinamis| I[Scan QRIS Sesuai Tagihan]
    H --> J[Cetak Struk & Tiket Dapur]
    I --> J
    J --> K[Simpan Offline + Sync Cloud]
    K --> L[Tutup Shift & Laporan Z]
```

---

## 🛠️ Arsitektur & Teknologi

Aristotle POS dibangun dengan prinsip *zero-overhead dependency* agar ringan, cepat, dan mudah di-maintain:

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Frontend Core** | HTML5, Vanilla JavaScript (ES Modules) | Tanpa build step yang rumit, eksekusi browser instan |
| **Styling & UI** | Tailwind CSS (CDN) + Material Design 3 | Desain modern, responsif untuk layar HP, tablet, & PC |
| **Tipografi & Ikon** | Plus Jakarta Sans & Material Symbols | Tingkat keterbacaan tinggi dan ikonik |
| **Offline Engine** | Service Worker & LocalStorage / IndexedDB | Cache-first architecture untuk keandalan 100% offline |
| **Cloud Realtime** | Firebase Firestore | Sinkronisasi multi-perangkat antar kasir dan owner |
| **Hardware Driver** | Native Android SPP Bluetooth Bridge & Web Serial | Komunikasi direct serial ESC/POS untuk thermal printer |
| **Native Wrapper** | Android Studio (Java 17, SDK 34) | WebView berkecepatan tinggi dengan navigasi tombol Back fisik |

---

## 🚀 Cara Menjalankan & Memasang

### 1. Buka Langsung di Browser (Web PWA)
Akses aplikasi melalui browser di ponsel, tablet, atau komputer:
```text
https://miezlearning.github.io/aristotle-pos/
```
> **Tip:** Tekan tombol **"Install App"** atau menu browser **"Tambahkan ke Layar Utama"** untuk menjadikannya aplikasi mandiri tanpa address bar.

### 2. Pasang di Smartphone Android (APK Native)
1. Unduh paket installer resmi: **[Aristotle-POS.apk](Aristotle-POS.apk)**.
2. Buka file APK yang telah diunduh di perangkat Android Anda.
3. Berikan izin instalasi dari sumber tidak dikenal jika diminta sistem.
4. Buka aplikasi **Aristotle POS** langsung dari homescreen.

### 3. Menjalankan di Komputer Lokal (Pengembangan)
Clone repositori ini dan jalankan web server lokal sederhana:
```bash
# Clone repositori
git clone https://github.com/miezlearning/aristotle-pos.git
cd aristotle-pos

# Jalankan web server lokal (menggunakan Python)
python -m http.server 8000
```
Buka browser di `http://localhost:8000`.

---

## ⚡ Portal Super Admin (Monitoring Multi-Cabang)

Bagi pemilik bisnis atau franchise yang memiliki banyak cabang UMKM mitra:
* **Akses Portal:** [`https://miezlearning.github.io/aristotle-pos/?view=superadmin`](https://miezlearning.github.io/aristotle-pos/?view=superadmin)
* **Fungsi Utama:**
  * Memantau akumulasi omzet harian & volume transaksi seluruh cabang secara terpusat.
  * Masuk ke antarmuka kasir toko mitra manapun tanpa input PIN (*One-Click Impersonate*).
  * Bantuan darurat reset 6-digit PIN keamanan bagi mitra toko yang lupa kata sandi.

---

## ⌨️ Pintasan Keyboard (Mode Desktop / PC Kasir)

| Tombol | Tindakan Kasir |
| :---: | :--- |
| <kbd>F2</kbd> | Buka antrian / meja pesanan baru |
| <kbd>F4</kbd> | Buka modal checkout & pembayaran |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | Cetak ulang struk transaksi terakhir |
| <kbd>Esc</kbd> | Menutup modal dialog / batalkan jendela aktif |

---

## 📚 Tautan Dokumentasi Terkait

* [📘 Panduan Edukasi Ramah Lansia](PANDUAN_EDUKASI_LANSIA.md) — Panduan visual dan langkah operasional kasir untuk pemilik usaha lansia.
* [📜 Riwayat Pembaruan (Changelog Lengkap)](CHANGELOG.md) — Rincian teknis setiap rilis versi dari v1.0 hingga rilis terbaru.
* [📋 Dokumen Kebutuhan Produk (PRD)](PRD.MD) — Spesifikasi dasar, filosofi desain M3, dan arsitektur produk.

---

## 📄 Lisensi

Hak Cipta © 2026 **Aristotle POS Team**.  
Proyek ini didistribusikan di bawah lisensi resmi [MIT License](LICENSE). Bebas digunakan, disesuaikan, dan dikembangkan untuk memajukan ekosistem UMKM Indonesia.
