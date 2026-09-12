# Changelog - Aristotle POS

Semua perubahan besar dan pembaruan fitur pada **Aristotle POS** (Multi-Tenant SaaS POS System) didokumentasikan dalam file ini.

## [v1.2.64] - 2026-09-12

### 🖨️ Dukungan Cetak USB Hub / OTG di Android & Indikator Status Real-Time
- **Cetak Printer Thermal USB Hub di Android APK:** Menambahkan implementasi Android Native USB Host (`UsbManager`) dan komunikasi `bulkTransfer` untuk printer ESC/POS. Pengguna kini dapat mencetak struk kasir secara langsung dan cepat lewat kabel USB yang terhubung ke USB Hub / adapter OTG di HP/tablet Android tanpa perlu Bluetooth.
- **Hierarki Jalur Cetak Otomatis:** Sistem Android mendeteksi koneksi printer secara cerdas: mencetak via kabel USB Hub sebagai prioritas utama jika terhubung, dan otomatis beralih ke Bluetooth jika kabel tidak terpasang.
- **Indikator Status Hardware Nyata:** Memperbaiki indikator status printer agar memverifikasi radio Bluetooth dan izin USB secara real-time. Jika Bluetooth di HP dimatikan, status secara jujur menampilkan label `Bluetooth HP Mati` (oranye/merah) alih-alih menampilkan MAC address cache sebelumnya.
- **Panduan Pemecahan Masalah Konflik Port USB di PC:** Menambahkan modal troubleshooting interaktif (`#usbTroubleshootModal`) untuk memandu penanganan penguncian port COM/Serial saat ada aplikasi POS lain di PC yang sedang mengunci port printer.

---

## [v1.2.63] - 2026-09-12

### 🎨 Desain Bersih Super Admin & Sistem Custom Scrollbar Modern
- **Penyederhanaan UI/UX Super Admin & Lisensi:** Menghapus banner gradien promosi, badge marketing yang tidak perlu ("Lifetime" emas, "Tanpa Biaya Bulanan", "Anti-Duplikasi Cloud"), emoji, serta teks bantuan bertele-tele. Mengubah kartu generator lisensi dan kotak hasil terbit menjadi desain bersih, tenang, solid, dan profesional.
- **Sistem Custom Scrollbar Modern Global:** Mengimplementasikan custom scrollbar ramping 6px (WebKit) dan `thin` (Firefox) dengan track transparan dan thumb kapsul berwarna netral stone di seluruh halaman aplikasi, menggantikan scrollbar bawaan sistem operasi yang kaku dan tebal.
- **Penyempurnaan Modal Batas Kuota Demo:** Menghapus animasi memantul (`animate-bounce`) pada ikon gembok serta menyederhanakan poin keterangan kuota agar lugas dan ramah.
- **Sinkronisasi Android Assets:** Sinkronisasi penuh seluruh pembaruan ke direktori aset Android.

---

## [v1.2.48] - 2026-09-11

### 📱 Tata Letak Responsif Laporan Usaha di Layar HP (Mobile-First Layout)
- **Kartu Metrik Keuangan 2-Kolom di Ponsel:** Mengoptimalkan tata letak kartu metrik finansial pada tampilan ponsel (`grid-cols-2 lg:grid-cols-3`). Kartu **Omset** dan **Total Pengeluaran** kini bersanding rapi dalam 2 kolom, sedangkan kartu **Laba Bersih** membentang penuh (*col-span-2*) sebagai *hero card* di bagian bawah dengan padding yang lebih ergonomis.
- **Segmented Toggle Adaptif Layar Kecil:** Pada layar ponsel, kontrol alih *Ringkasan Data* vs *Grafik Usaha* diposisikan membentang penuh di bagian atas (`w-full order-1 lg:order-2`), memberikan area ketuk (*touch target*) yang sangat nyaman bagi ibu jari tanpa terdesak oleh bilah filter periode tanggal di bawahnya.
- **Tipografi Angka Monospasi Tabular (`tabular-nums`):** Menyelaraskan tipografi angka nominal rupiah dengan kelas `tabular-nums` dan ukuran font responsif (`text-xl sm:text-2xl lg:text-3xl`) agar angka tidak bergeser atau berantakan saat terjadi pembaruan live transaksi.

---

## [v1.2.47] - 2026-09-11

### 🗑️ Pembersihan Menyeluruh Antrian Pesanan & UI Kasir Bersih (Anti-Glassmorphism)
- **Hapus Bersih Pesanan Antrian:** Memperbaiki logika penghapusan antrian (`deleteOrderQueue`). Saat antrian pesanan dihapus, seluruh isi pesanan (`items`), keranjang (`cart`), dan catatan (`notes`) kini dibersihkan tuntas dari memori, mencegah data pesanan lama tertinggal atau muncul kembali.
- **UI Kartu Menu Bersih & Kontras Tinggi:** Mengeliminasi efek *glassmorphism* / blur transparan berlebih pada kartu menu dan lencana (*badge*) kategori/stok, beralih ke warna solid berdesain bersih (*clean modern*) yang ramah mata dan mudah dibaca di segala kondisi pencahayaan.
- **Indikator Pencarian & Tombol Reset:** Menambahkan counter jumlah menu ditemukan (`#posSearchResultCount`) dan tombol reset pencarian & kategori otomatis saat menu tidak ditemukan.

### 📋 Editor Input Menu Massal (Bulk Table Editor) & Sticky Search
- **Spreadsheet-Style Bulk Table:** Merombak modal tambah menu massal (`#bulkImportModal`) dengan tabel input cepat baris per baris. Pengguna dapat mengisi Nama, Kategori (dropdown cepat), dan Harga secara instan layaknya spreadsheet, dilengkapi penghitung otomatis menu valid per kategori.
- **Konverter Teks Cerdas ke Tabel:** Menyediakan tab konverter otomatis dari format teks biasa/salinan chat ke tabel siap simpan.
- **Sticky Search Bar & Pintasan Cepat (`/`):** Bilah pencarian dan filter di Kelola Menu (`#adminSearchFilterStickyBar`) kini terkunci rapi di atas saat digulir, serta mendukung shortcut global `/` untuk fokus cepat ke pencarian dan `Esc` untuk membatalkan.

### 📊 Redesain Laporan Usaha: Animated Sliding Toggle & Live Reactive Update
- **Toggle Pojok Animasi Slide (Data vs Grafik Usaha):** Menghilangkan redundansi tombol ganda dan menyatukannya ke dalam satu *segmented sliding toggle* modern di pojok kanan atas kartu laporan. Perpindahan antara Data Statistik dan Grafik Visual kini memiliki transisi animasi slide yang halus (`report-slide-right` & `report-slide-left`).
- **Live Reactive Update Transaksi:** Laporan keuangan dan grafik usaha kini langsung diperbarui secara otomatis seketika saat pembayaran berhasil diselesaikan di kasir tanpa perlu memuat ulang (*reload*) halaman.

### 📅 Kalender Rentang Tanggal M3 & Analisis Rekap Laba Bulanan
- **Kalender Rentang Tanggal Interaktif (M3 Date Range Picker):** Menggantikan pemilih bulan kaku dengan kalender pemilih rentang tanggal dari-ke interaktif, dilengkapi tombol preset cepat (Hari Ini, Kemarin, 7 Hari Terakhir, Bulan Ini, 30 Hari Terakhir, dan Kustom).
- **Rekap Laba Rugi Bulanan:** Tabel performa performa finansial per bulan yang merinci total omset, HPP, laba kotor, biaya operasional, dan laba bersih, lengkap dengan fitur Ekspor CSV Rekap Bulanan.
- **Analisis Pola Hari Penjualan:** Visualisasi distribusi transaksi mingguan (Senin–Minggu) dengan persentase bar interaktif dan sorotan jam-jam puncak operasional toko.

### 🤖 Integrasi Asisten AI Analisis Performa Usaha (GPT-5-4-Nano)
- **Model AI GPT-5-4-Nano (FikriDev API):** Menghubungkan modul insight bisnis dengan endpoint model AI `https://api.fikridev.me/api/text/gpt-5-4-nano`. Asisten menganalisis data omset, margin keuntungan, efisiensi pengeluaran, menu terlaris, serta pola perputaran stok untuk memberikan rekomendasi strategi bisnis UMKM yang terstruktur dan mudah dipahami.
- **Smart Cache Signature:** Hasil analisis AI disimpan dalam cache cerdas berbasis ringkasan angka transaksi, mencegah panggilan API berulang yang tidak perlu saat data tidak berubah.

---

## [v1.2.46] - 2026-09-11

### 🍔 Tata Letak Modal Menu Responsif 2-Kolom & Anti-Overflow (Tablet & HP)
- **Desain Bounded Modal & Sticky Footer:** Memperbaiki modal Tambah/Ubah Menu (`#productModal`) dan Catatan/Add-on (`#itemNoteModal`) dengan batas aman tinggi layar (`max-h-[94vh] sm:max-h-[90vh]`) serta sticky action footer. Tombol **Simpan Menu** dan **Batal** selalu terkunci rapi di bagian bawah layar dan tidak akan pernah terdorong keluar layar (*overflow*) pada HP maupun layar kecil.
- **Layout Adaptif 2-Kolom di Tablet/Desktop (`md:grid md:grid-cols-12`):** Memanfaatkan lebar layar tablet secara ergonomis. Kolom kiri memuat Nama Menu, Harga, Kategori/Ikon, dan Upload Foto Menu yang ringkas. Kolom kanan memuat Status Ready, Sisa Stok (preset 10, 25, 50, Bebas), dan Pengaturan Add-on/Topping.
- **Header Kelola Menu & Baris Produk Lebih Kompak:** Kartu navigasi atas `viewAdmin` dibuat ramping horizontal sehingga daftar katalog menu langsung terlihat leluasa. Baris produk di HP dirampingkan dengan tombol aksi touch-friendly yang pas tanpa terpotong.

---

## [v1.2.45] - 2026-09-10

### 📷 Perbaikan Universal QR Pairing & Auto-Login Staf (Zero-PIN Authentication)
- **URL Pairing Kanonik Standar:** Pembuatan QR Pairing di Kasir Utama kini selalu mengacu pada URL kanonik web valid (`https://miezlearning.github.io/aristotle-pos/`) lengkap dengan parameter `store`, `role=pelayan`, `auth=1`, `token`, dan `hostIp`, menggantikan format lokal `file:///android_asset/...` atau `null/...` yang sebelumnya memicu error *"Kode QR tidak valid (Data toko tidak ditemukan)"* pada aplikasi Android APK.
- **Auto-Login Bebas PIN:** Pemindaian QR melalui scanner internal maupun pembukaan tautan QR melalui browser/kamera HP langsung mengotorisasi sesi kasir sebagai HP Staf/Pelayan tanpa memunculkan dialog PIN 6 digit pemilik toko.
- **Parser Cerdas Multi-Format:** Scanner in-app kini mendukung berbagai format data masukan (URL lengkap, parameter query string mentah, maupun format objek JSON) secara toleran.

### 🌐 Standar Komunikasi Hotspot Wi-Fi & Eliminasi Delay Printer HP Staf
- **Binding Eksplisit Jaringan Wi-Fi (Bypass Redirect Data Seluler):** Mengadopsi standar komunikasi IoT/POS internasional pada Android modern (SDK 29–34). Ketika HP Staf terhubung ke hotspot Kasir Utama tanpa internet aktif, permintaan HTTP LAN dan probe TCP socket kini di-binding secara langsung ke antarmuka Wi-Fi (`NetworkCapabilities.TRANSPORT_WIFI`), mencegah Android mengalihkan lalu lintas data ke jaringan seluler 4G/5G.
- **Deteksi Akurat Default Gateway Wi-Fi:** Fungsi `getWifiGatewayIp()` diperbarui menggunakan rute `LinkProperties` IPv4 default (`0.0.0.0/0`) sehingga alamat gateway hotspot (`192.168.43.1`) terbaca andal di seluruh varian Android tanpa ketergantungan izin lokasi runtime.
- **Warmup Printer Standby di Latar Belakang:** Kasir Utama kini secara proaktif membuka socket Bluetooth standby saat aplikasi dibuka (`warmupPrinterConnectionAsync`). Hal ini mengeliminasi jeda *cold connection* (2–4 detik) sehingga perintah tes printer dari HP Staf langsung dicetak dalam hitungan milidetik tanpa harus dipancing atau di-trigger terlebih dahulu dari Kasir Utama.
- **Penyesuaian Batas Waktu Permintaan HTTP:** Meningkatkan timeout permintaan cetak LAN dari 2.5 detik menjadi 6 detik untuk memberikan toleransi yang cukup pada jabat tangan radio Bluetooth pertama kali.

---

## [v1.2.24] - 2026-09-05

### 🧾 Tata Letak 2 Kolom Modal Pengaturan Printer & Struk (Live Sticky Receipt Preview)
- **Pratinjau Struk di Sisi Kanan (Side-by-Side Layout):**
  - Mengubah struktur modal Pengaturan Printer & Struk dari sebelumnya 1 kolom memanjang vertikal menjadi 2 kolom berdampingan (`md:grid-cols-12`).
  - **Kolom Kiri (`md:col-span-7`):** Seluruh formulir pengaturan (koneksi Bluetooth/USB, mode cetak, ukuran kertas, spasi section & divider, toggle otomatisasi, upload logo, serta identitas struk & footer).
  - **Kolom Kanan (`md:col-span-5`):** Pratinjau struk kertas thermal nyata (`#liveReceiptPaper`) dengan posisi `sticky top-0` yang tetap melayang di sisi atas saat formulir kiri digulir (*scroll*).
  - Perubahan identitas toko, logo, format spasi, nomor antrian, maupun ukuran kertas (58mm/80mm) langsung terpantau secara instan di sisi kanan tanpa perlu menggulir layar ke paling bawah.
- **Responsif & Mode Adaptif:**
  - Menyesuaikan lebar modal dialog hingga `max-w-5xl` untuk tampilan tablet dan desktop/PC kasir yang lapang.
  - Pada layar ponsel (*mobile*), tata letak otomatis kembali 1 kolom dan dilengkapi tautan cepat `Lihat Struk ↓`.
  - Pada mode **HP Staf**, pratinjau struk dan pengaturan hardware otomatis disembunyikan dan antarmuka beralih ke kartu sambungan kasir host yang ringkas dan terpusat.

---

## [v1.2.17] - 2026-09-04

### 🍳 Add-On per Menu, Catatan Pemesanan Bebas, & Pemisahan Porsi (Item Splitting) Sesuai Standar Industri
- **Konfigurasi Add-On / Topping per Menu:**
  - Pemilik toko dapat menambahkan daftar Add-On / Topping ekstra (nama dan nominal harga tambahan) pada setiap menu melalui form Tambah/Edit Produk.
  - Saat kasir memesan menu, sistem menyediakan checklist pilihan Add-On yang terintegrasi langsung di modal catatan pesanan.
  - Subtotal harga otomatis memperhitungkan `(harga dasar menu + total add-on) × kuantitas porsi` secara presisi dan aman dari manipulasi data.
- **Catatan Pemesanan Bebas Tanpa Batas Karakter:**
  - Menghapus pembatasan karakter `maxlength="50"` dan menggantinya dengan `textarea` elastis agar kasir dapat menuliskan catatan pesanan sedetail dan sepanjang mungkin (misal: "tanpa bawang, kuah banyak dipisah, sambal cabai rawit ekstra pedas").
- **Pemisahan Porsi Pesanan (Item Splitting Sesuai Standar Industri POS):**
  - Mengatasi skenario umum di restoran/kafe ketika pelanggan memesan menu yang sama dengan preferensi berbeda (contoh: 2 porsi Nasi Goreng, 1 porsi pedas dan 1 porsi tidak pedas).
  - Kasir dapat memilih opsi **"Semua Porsi"** atau **"Pisah 1 Porsi Ini"** langsung dari dialog catatan & topping. Jika dipilih *"Pisah 1 Porsi Ini"*, porsi tersebut otomatis dipisahkan menjadi baris mandiri di keranjang belanja.
  - Baris yang dipisah memiliki catatan dan topping tersendiri, terakumulasi rapi di struk kasir, dan dicetak dengan kotak checklist terpisah `[  ]` pada tiket dapur (kitchen checkpoint) sehingga koki dapur tidak bingung atau salah menyajikan makanan.
- **Pencetakan Add-On & Catatan Lengkap:**
  - Struk belanja kasir (ESC/POS 58/80mm maupun tampilan layar) mencetak rincian Add-On terpilih (`+ Telur (+3.000)`) dan catatan khusus di bawah baris menu.
  - Tiket dapur / bar checkpoint mencetak rincian Add-On dan catatan per baris porsi yang siap diceklis oleh koki dapur.

---

## [v1.2.16] - 2026-09-04

### 📱 Penutupan Backdrop Modal & Navigasi Tombol Back Android Sesuai Standar Industri
- **Penutupan Modal Cepat via Area Blur / Backdrop:** Pengguna kini dapat menutup modal/popup apapun (pembayaran, catatan item, kupon diskon, pengaturan printer, laporan, edit produk, drawer keranjang, dll) dengan menyentuh atau mengklik area blur/gelap di luar kotak dialog, tidak lagi terbatas hanya pada tombol "X".
- **Intersepsi Tombol Back Android:** Mengganti perilaku bawaan tombol Back fisik/gesture di Android (`MainActivity.java`). Saat tombol Back ditekan:
  1. Jika ada modal / popup / drawer yang sedang aktif: modal teratas akan ditutup secara halus tanpa menutup aplikasi.
  2. Jika sedang di sub-menu (Kelola Menu / Laporan Keuangan): aplikasi akan mengembalikan pengguna ke layar utama Kasir.
  3. Jika sudah berada di Kasir utama: sistem menampilkan pesan *"Tekan sekali lagi untuk keluar dari aplikasi"* (Double-back debounce 2 detik) agar kasir tidak keluar tanpa sengaja saat melayani pelanggan.
- **Penyelarasan Navigasi Browser (PWA/Chrome):** Menambahkan proteksi `popstate` agar gestur navigasi kembali di browser Google Chrome mobile tidak menyebabkan halaman web berpindah atau tertutup tiba-tiba.

---

## [v1.2.15] - 2026-09-04

### 🧾 Kustomisasi Tampilan Struk & Optimasi Tata Letak Thermal
- **Pengaturan Spasi Antar Section:** Ditambahkan kontrol pilihan spasi vertikal struk (Sangat Rapat / ESC 3 24 untuk hemat kertas, Standar Seimbang / ESC 2, dan Longgar / ESC 3 34) yang tersinkronisasi di direct ESC/POS, layout browser, dan preview.
- **Penghematan Karakter (`pcs` -> `x`):** Mengganti format kuantitas item dari `2 pcs` menjadi `2x` untuk menghemat karakter sehingga teks menu tidak cepat terpotong / turun baris pada printer thermal 58mm (32 kolom) maupun 80mm.
- **Pilihan Gaya Garis Pembatas:** Mendukung kustomisasi pembatas struk dengan model putus-putus (`-`), titik-titik (`.`), ganda (`=`), bintang (`*`), atau garis bawah solid (`_`).
- **Pilihan Format Rincian Harga:** Pengguna dapat memilih mode ringkas 1 baris (`compact`) atau mode rincian 2 baris (`detailed`) yang menampilkan harga satuan `@ ...` per porsi.
- **Live Preview Interaktif:** Pratinjau struk di jendela pengaturan otomatis bereaksi secara instan ketika konfigurasi spasi atau gaya diubah.

---

## [v1.2.14] - 2026-09-04

### 🖨️ Kestabilan Sinkronisasi Wi-Fi & Buka Laci Kasir (Cash Drawer) Otomatis
- **Deteksi Akurat IP Wi-Fi Lokal:** Memperbarui fungsi `getLocalIpAddress()` di Android native (`MainActivity.java`) menggunakan `ConnectivityManager` dan `WifiManager` agar mendeteksi alamat IP router Wi-Fi lokal sesungguhnya secara andal, dan hanya menggunakan fallback `192.168.43.1` saat HP Kasir benar-benar mengaktifkan hotspot/tethering.
- **Pairing QR & Cloud Presence Wi-Fi Instan:** QR Pairing dan data presence Firestore kini otomatis menyiarkan alamat IP Wi-Fi lokal yang akurat, sehingga HP Pelayan langsung terhubung tanpa perlu "memancing" lewat hotspot.
- **Otomatisasi Laci Kasir Pembelian Tunai:** Memperbaiki aliran checkout di `payment.js` agar perintah buka laci kasir (`shouldKickDrawer`) selalu terkirim pada pencetakan struk dan tiket dapur saat metode bayar TUNAI, atau memicu pembukaan laci mandiri jika cetak otomatis dinonaktifkan.
- **Dukungan Buka Laci pada Tes Struk & Tes Dapur:** Tombol Tes Struk dan Tes Dapur di menu pengaturan printer kini merespons toggle "Buka Laci Otomatis" secara real-time.
- **Universal ESC/POS Solenoid Kick Pulse:** Memperluas byte sequence pembuka laci di `printer.js` dan `MainActivity.java` dengan pulsa multi-standar (ESC p Pin 2 & Pin 5, varian ASCII '0' & '1', DLE DC4 real-time pulses, dan BEL) serta menempatkannya di awal cetak struk agar laci kasir langsung menyentak terbuka seketika.

---

## [v1.1.39] - 2026-09-04

### 🛡️ Pengamanan Menyeluruh Sistem (Security Hardening)
- **Autentikasi Port 8088 (`X-POS-Token`):** Endpoint kontrol hardware lokal (`/drawer` dan `/print`) kini mewajibkan token autentikasi POS yang valid. Permintaan liar tanpa token (seperti `curl` atau web pihak ketiga di Wi-Fi) otomatis ditolak dengan `401 Unauthorized`.
- **Pengerasan WebView Android:** Menonaktifkan `AllowUniversalAccessFromFileURLs` dan `AllowFileAccessFromFileURLs` di `MainActivity.java` untuk mencegah pembacaan file privat aplikasi secara ilegal.
- **Hashing SHA-256 Master Dev Key & PIN Toko:** Menghapus string plaintext `MASTER_DEV_KEY` dari kode sumber publik dan menggantinya dengan hash SHA-256 yang tidak dapat dibalik. PIN toko kini disimpan dan divalidasi dalam format hash SHA-256 (`pinHash`).
- **Integritas Harga & Transaksi:** Menambahkan verifikasi ulang harga produk terhadap katalog master database saat checkout (`completeTransaction`) untuk mencegah manipulasi harga di sisi klien.
- **Aturan Keamanan Firebase (`firestore.rules`):** Menambahkan konfigurasi isolasi multi-tenant antar-toko, pembatasan modifikasi riwayat transaksi, dan validasi skema data produk.

---

## [v1.1.38] - 2026-09-04

### 🔄 Live Update Realtime Status Kasir Utama & Pemangkasan Total Menu Pelayan
- **Live Update Realtime Kasir di HP Pelayan:** Saat Kasir Utama (Device 2 / siapapun yang menjadi Host) terhubung ke printer fisik/Bluetooth, status printer beserta alamat IP-nya otomatis dipublikasikan dan diterima realtime (`onSnapshot`) oleh HP Pelayan. Pelayan langsung melihat status *"Kasir Utama Terhubung (Printer: [Nama])"* dengan lampu hijau aktif.
- **Pemangkasan Menu Hardware pada HP Pelayan:** Seluruh konfigurasi teknis hardware printer (metode printer Bluetooth/USB/RawBT, lebar kertas 58/80mm, upload logo struk, tombol simpan) otomatis disembunyikan saat dalam mode Pelayan agar menu tidak penuh sesak/boros.
- **Sinkronisasi IP Otomatis:** HP Pelayan otomatis menerima alamat IP Kasir Utama secara realtime dari Cloud Firestore tanpa perlu input atau scan manual.

---

## [v1.1.37] - 2026-09-04

### 🧼 Pembersihan UI/UX Mode Pelayan (Ponytail Simplification)
- **Hapus Label Jaringan Membingungkan:** Menghapus seluruh badge status teknis ("Online Cloud", "Hotspot", scan gimmick) yang tidak perlu dan membingungkan pengguna.
- **Kartu Pelayan Bersih & Fungsional:** Menampilkan status bersih *"Mode HP Pelayan | Siap"* dengan dua tombol aksi langsung: `[ Tes Struk ]` dan `[ Buka Laci ]`.
- **Rute Otomatis di Belakang Layar:** Sistem di balik layar otomatis mencoba Hotspot kasir lokal terlebih dahulu untuk kecepatan maksimal (offline zero-delay), dan otomatis beralih ke Cloud jika berada di jaringan internet/Wi-Fi biasa tanpa menuntut konfigurasi pengguna.

---

## [v1.1.36] - 2026-09-04

### 🐛 Perbaikan SyntaxError Modul Printer & Inisialisasi Database
- **Resolusi SyntaxError Evaluasi Modul:** Memperbaiki duplikasi blok `if (isReady)` yang tidak tertutup di `js/modules/printer.js` dan mendeklarasikan variabel `btnTestRelay`. Galat ini sebelumnya menggagalkan pemuatan modul ES (`import * as printer`), yang mengakibatkan fungsi inisialisasi aplikasi (`init`) dan sinkronisasi database tidak tereksekusi.

---

## [v1.1.35] - 2026-09-04

### ⚡ Layar Mesin Kasir Standby Otomatis Menyala
- **FLAG_KEEP_SCREEN_ON:** Mengaktifkan flag sistem Android agar layar perangkat Kasir Utama tidak redup atau mati otomatis saat standby menunggu pesanan.

---

## [v1.1.34] - 2026-09-04

### 🏷️ Pembeda Visual Status Hotspot Lokal vs Cloud Internet
- **Deteksi Otomatis Media Koneksi:** Sistem mengenali secara otomatis apakah perangkat sedang terhubung ke Hotspot HP Kasir (`192.168.43.x`) atau Wi-Fi/Internet reguler.
- **Indikator Visual Jelas:**
  - **Hotspot Kasir (Lokal):** Label kuning kecokelatan *"Hotspot (Offline)"* dan keterangan *"Tersambung langsung ke hotspot kasir (192.168.43.1). Pesanan dicetak tanpa kuota internet."*
  - **Cloud Realtime (Internet):** Label biru *"Online Cloud"* dan keterangan *"Tersambung ke kasir via cloud. Pesanan otomatis dicetak di kasir utama."*

---

## [v1.1.33] - 2026-09-04

### 🚀 Eliminasi Total Masalah "Server Lokal" & Full Cloud Relay (Ponytail Fix)
- **Hapus Notifikasi & Polling "Server Lokal":** Menghapus seluruh rutinitas polling IP lokal port 8088 yang memicu peringatan berulang *"Server lokal tidak merespons"*.
- **Pencetakan Multi-Device 100% Cloud Relay:** Pesanan dari HP Pelayan kini dikirim langsung ke antrean Cloud Firestore tanpa melewati socket Wi-Fi lokal router yang sering diblokir firewall/AP isolation. Kasir utama langsung mencetak setiap pesanan yang masuk.
- **Penyederhanaan Kartu Pelayan:** Menghapus input IP dan pencarian subnet. Hanya menyisakan tombol Scan QR, status kesiapan cloud, dan tombol uji cetak.

---

## [v1.1.32] - 2026-09-04

### ⚡ Pairing QR Instan Tanpa Reload Halaman & Otorisasi Otomatis
- **Eliminasi Reload Halaman:** Mengganti mekanisme perpindahan URL (`window.location.href`) dengan transisi langsung di memori (`quickSelectStore`). Aplikasi tidak lagi me-reload halaman webview yang memicu layar ter-reset.
- **Otorisasi Sesi Otomatis:** Saat memindai QR kasir, perangkat pelayan otomatis diberikan hak otorisasi sesi toko (`auth_store_session`) secara permanen, sehingga tidak terlempar kembali ke layar login atau status keluar.

---

## [v1.1.31] - 2026-09-04

### 🧼 Penyederhanaan Teks & Pembersihan Emoji
- **Label Tombol Bersih dan Langsung:** Menyederhanakan seluruh label tombol aksi menjadi ringkas dan profesional (`Scan QR Kasir`, `Sambungkan HP Pelayan`, `Cari Kasir Otomatis`, `Tes Cetak ke Kasir`, `Kirim Link via WhatsApp`, `Pilih dari Galeri`).
- **Penghapusan Emoji dan Kata Berbunga-bunga:** Menghapus emoji dekoratif yang berlebihan pada badge status dan tombol. Menghilangkan penjelasan teknis yang bertele-tele dan tanda kurung yang tidak perlu agar antarmuka rapi dan mudah dibaca kasir.

---

## [v1.1.30] - 2026-09-04

### 📷 Sistem Pairing QR Code Instan (Zero-Config Kasir ➔ Pelayan)
- **Tampilan QR Sambungan di Kasir Utama:** Tombol baru *"📱 QR Sambungkan HP Pelayan"* di profil toko dan pengaturan printer. Menghasilkan kode QR presisi tinggi yang memuat kredensial toko, role client, dan konfigurasi IP kasir dalam satu sentuhan.
- **Live Camera Scanner di HP Pelayan:** Fitur pemindai kamera langsung terintegrasi (*jsQR*) lengkap dengan bidik beranimasi (*laser glow effect*) dan fallback unggah gambar dari galeri. Pelayan cukup mengarahkan kamera ke layar Kasir Utama untuk otomatis login, mengatur peran ke pelayan, dan langsung terhubung.
- **Pairing 1-Sentuh di Layar Masuk:** Tombol scan QR juga disematkan di halaman login toko, sehingga karyawan/pelayan baru tidak perlu mengetik nama toko, ID toko, atau alamat IP sama sekali.

---

## [v1.1.29] - 2026-09-04

### 🐛 Perbaikan Impor `escapeHtml` pada Modul Printer
- **Resolusi ReferenceError `escapeHtml`:** Menambahkan impor fungsi sanitasi HTML `escapeHtml` dari `../utils.js` ke dalam `js/modules/printer.js`. Memperbaiki galat `escapeHtml is not defined` saat mencetak struk tes, preview struk belanja, dan perenderan status badge printer.

---

## [v1.1.28] - 2026-09-03

### ⚡ Eliminasi Status Menguji IP Menggantung & Tombol Tes Cetak Instan
- **Anti-Hang Strict Timeout (Promise.race 1.2s):** Seluruh pengujian ping dan deteksi otomatis IP lokal kini dibungkus dengan `Promise.race` berbatas waktu ketat 1.2 detik. Status tidak akan pernah menggantung pada tulisan "Menguji IP...", dan secara otomatis langsung beralih ke Cloud Relay yang siap pakai.
- **Tombol Tes Cetak Kasir Terbuka (`🖨️ Tes Cetak ke Kasir Sekarang`):** Menampilkan tombol tes cetak yang jelas dan langsung memicu uji cetak struk dari HP Pelayan ke HP Kasir Utama melalui Cloud Relay dalam waktu <1 detik.
- **Panduan Praktis Wi-Fi Router vs Hotspot HP:** Menambahkan edukasi tips bahwa untuk mencetak 100% offline tanpa internet bebas blokir router (AP Isolation), cukup nyalakan Hotspot tethering langsung dari HP Kasir.

---

## [v1.1.27] - 2026-09-03

### 🔧 Perbaikan Input Alamat IP & Kejelasan Mode Cetak
- **Proteksi Ketikan Input IP Manual:** Memperbaiki bug agresif di mana isi kolom input alamat IP kasir terhapus secara otomatis saat pengguna baru mengetik 3 digit pertama (`192`). Sekarang input diproteksi penuh dan langsung disimpan secara realtime ke state/localStorage pada setiap ketikan (`oninput`).
- **Sinkronisasi Host Otomatis via Cloud Presence:** Kasir Utama di APK Android kini otomatis mempublikasikan alamat IP lokalnya ke Cloud Firestore. HP Pelayan yang berada di satu router Wi-Fi langsung mendeteksi dan terhubung ke IP kasir tanpa perlu menebak atau mencari manual.
- **Kejelasan Arsitektur Cetak Web Browser vs Android APK:** Menambahkan deteksi dan keterangan visual yang transparan jika Kasir dibuka di Web Browser (jalur cetak menggunakan Cloud Relay) dibandingkan jika dibuka di Android APK (jalur server offline port 8088).

---

## [v1.1.26] - 2026-09-03

### 🍳 Kategori Topping & Ekstra Ramah Lansia (Senior-Friendly Add-Ons)
- **Kategori Khusus "Topping & Ekstra":** Menyediakan kategori menu mandiri untuk add-on fisik berbayar (Nasi Tambah, Telur Dadar/Ceplok, Ekstra Sambal, Keju Parut, Es Batu Ekstra) tanpa memunculkan modal pop-up bertingkat yang membingungkan kasir lansia atau pemula.
- **Catatan Cepat 1-Sentuh (Quick Note Chips):** Kasir/pelayan dapat menambahkan instruksi khusus pada item keranjang (`🔥 Pedas`, `🌶️ Sedang`, `🍃 Tidak Pedas`, `🧅 Tanpa Bawang`, `🥣 Pisah Sambal`, `🧊 Es Sedikit`, `🧂 Kurang Manis`, `🥡 Bungkus`) hanya dengan sekali sentuh tanpa perlu mengetik di keyboard HP.
- **Pencetakan Otomatis Catatan Pesanan:** Catatan instruksi item otomatis tercetak di bawah nama produk pada struk pembayaran pelanggan maupun tiket pesanan dapur thermal ESC/POS.

### 🌐 Mode Hybrid Cetak Offline LAN/Hotspot (Zero Internet Requirement)
- **Embedded Local HTTP Server (Port 8088):** Host Kasir Utama (Device 1) yang berjalan di APK Android kini otomatis menjalankan server HTTP lokal ringan (`ServerSocket`).
- **Pencetakan Langsung Tanpa Kuota:** HP Pelayan (Device 2) yang berada di satu jaringan Wi-Fi atau Hotspot HP yang sama dapat mencetak tiket struk & dapur langsung dalam ~50ms tanpa memerlukan koneksi internet aktif.
- **Fallback Cerdas Otomatis:** Jika perangkat pelayan berada di luar jangkauan Wi-Fi lokal, sistem secara otomatis dan senyap mengalihkan jalur pencetakan ke Firebase Cloud Relay.

---

## [v1.1.25] - 2026-09-03

### 🛡️ Eliminasi Teks Ikon Mentah & Penghentian Loading Gimmick (Fixed FOUT)
- **Anti-FOUT Strict Containment:** Mengunci dimensi dan membendung teks ligature mentah (`width: 1em; height: 1em; overflow: hidden; flex-shrink: 0;`) sehingga kata panjang seperti `system_update` dan `cloud_download` tidak akan pernah meluap atau menabrak teks tombol saat font sedang dimuat.
- **Pemuatan Aset Riil (No Fake Timeout):** Menghapus batasan timeout 2 detik palsu pada splash screen. Sistem kini benar-benar menunggu konfirmasi `document.fonts.ready` sebelum melepaskan layar loading dan sebelum menampilkan modal update.
- **Prioritas Font Lokal Ringan:** Mengarahkan `@font-face` untuk memuat font core lokal (455 KB) terlebih dahulu dibandingkan font raksasa (5.3 MB), mempercepat render ikon hingga 12x lipat.

---

## [v1.1.24] - 2026-09-03

### 🔄 Fitur Swipe Down to Refresh (Pull-to-Refresh)
- **Native Touch Pull-to-Refresh:** Menambahkan gestur tarik ke bawah (*swipe down*) di bagian atas layar untuk memuat ulang data secara instan di Web, PWA, dan APK Android. Dilengkapi indikator lingkaran Material Design 3 yang berputar mulus, efek haptic vibration saat batas tarikan tercapai, dan proteksi agar tidak terpicu saat modal sedang terbuka.

---

## [v1.1.23] - 2026-09-03

### ⚡ Eliminasi Pergerakan Kertas Saat Buka Laci Kasir (Fixed Logic)
- **Murni Pulsa Elektrik Solenoid RJ11:** Menghapus byte `Line Feed` (`0x0A`) dan `BEL` (`0x07`) dari paket perintah buka laci kasir (`buildOpenDrawerBytes` dan `MainActivity.java`). Perintah buka laci kini murni mengirimkan pulsa solenoid `ESC p` (Pin 2 dan Pin 5) dan `DLE DC4` tanpa memutar motor stepper roller kertas printer thermal sama sekali. Kertas tidak akan bergerak atau keluar sia-sia saat membuka laci kasir.

---

## [v1.1.22] - 2026-09-03

### 🧾 Sinkronisasi Pratinjau Struk Realtime (Fixed & Synced)
- **Live Thermal Receipt Preview:** Merombak pratinjau struk di modal Pengaturan Printer & Struk dari teks mentah `<pre>` monospace menjadi kartu struk kertas thermal nyata yang 100% identik dengan struk transaksi asli (`#printArea`). Menampilkan logo toko riil secara instan saat diunggah, teks header toko, daftar produk contoh, subtotal, catatan kaki, hingga banner nomor antrian besar secara interaktif dan realtime sesuai ketikan pengguna.

---

## [v1.1.21] - 2026-09-03

### 🎨 Pembaruan Desain Material Design 3 (UI/UX Overhaul)
- **Top App Bar Google Material Design 3:** Menghilangkan elemen visual "AI slop" (badge bertumpuk dan rentetan titik pemisah) pada header desktop/tablet. Digantikan dengan hierarki brand yang bersih, **M3 Tonal Filter Chip** (`[ 🟢 Kedai Usaha Mami ▾ ]`) untuk pemilih toko/antrian, dan **M3 Assist Chip** (`[ ☁️ Cloud Relay ]`) untuk status perangkat dan printer.

---

## [v1.1.20] - 2026-09-03

### 🛠️ Perbaikan Sinkronisasi Real-Time (Fixed & Optimized)
- **Single Source of Truth Kartu Menu (`renderCart -> renderProducts`):** Memastikan kartu menu produk dan badge kuantitas (`1x`, `3x`) selalu otomatis tersinkronisasi 100% setiap kali isi keranjang diperbarui dari perangkat kasir manapun.
- **Invalidasi Cache Service Worker & Auto-Refresh:** Memperbarui cache Service Worker (`aristotle-pos-v24`) dan menambahkan auto-reload saat Service Worker baru aktif agar browser pengguna di versi web selalu mengeksekusi kode JavaScript paling mutakhir tanpa perlu membersihkan cache secara manual.

---

## [v1.1.19] - 2026-09-03

### 🛠️ Perbaikan & Peningkatan Laci Kasir (Cash Drawer)
- **Universal Multi-Pin Solenoid Pulse:** Mengirim kombinasi pulsa energi tinggi ESC/POS Pin 2 (`ESC p 0`), Pin 5 (`ESC p 1`), real-time `DLE DC4`, dan karakter LF buffer flush untuk memastikan kompatibilitas 100% dengan berbagai printer thermal (VSC TM-58V, Epson, Xprinter, Kassen, Panda, dll).
- **Pemisahan Pemicu Buka Laci Otomatis:** Memastikan laci kasir selalu otomatis terbuka saat pembayaran tunai selesai meskipun opsi cetak struk otomatis (`autoPrint`) dinonaktifkan.
- **Pencegahan Buffer Reset:** Memindahkan injeksi perintah buka laci pada struk ke bagian paling akhir setelah feed kertas, mencegah pembatalan denyut solenoid akibat perintah inisialisasi logo (`ESC @`).
- **Peningkatan Uji Coba Laci Antar-Perangkat:** Tombol "Buka Laci" pada Pengaturan Printer kini mendukung Cloud Relay jika ditekan dari HP Pelayan / Device 2.

---

## [v1.1.18] - 2026-09-03

### 🚀 Fitur Baru & Peningkatan UI/UX (Added & Improved)
- **Redesain Header Bar Mobile Ramah Layar Sempit:** Identitas toko di layar ponsel (< 640px) diubah menjadi tombol ikon brand/avatar toko yang bersih dengan indikator real-time sinkronisasi cloud hijau berdenyut, mengeliminasi teks bertumpuk/mepet dengan tombol printer dan aksi lainnya.
- **Pop-up Profil Toko Komprehensif:** Seluruh detail toko, status sinkronisasi, link bagi kasir ke HP lain via WhatsApp, konfigurasi PIN owner, versi aplikasi, dan tombol logout dapat diakses secara instan saat tombol ikon toko diklik.

### 🛠️ Perbaikan Bug (Fixed)
- **Sinkronisasi Pesanan Multi-Device Realtime:** Memperbaiki bug pada callback `queues` di mana `pos.renderProducts()` sebelumnya terlewat, sehingga kartu produk di Device 2 kini otomatis memperbarui badge kuantitas dan highlight hijau seketika saat pesanan diubah di Device 1.
- **Pencegahan Pembayaran Ganda:** Otomatis menutup modal pembayaran di perangkat lain dengan notifikasi ramah jika pesanan telah diselesaikan atau dikosongkan secara remote.
- **Konsistensi Navigasi:** Memastikan tab antrian pesanan dirender ulang saat berpindah ke tampilan kasir.

---

## [v1.1.5] - 2026-09-03

### 🚀 Fitur Baru (Added)
- **Multi-Device Cloud Print & Cash Drawer Relay:** Perangkat sekunder (Device 2 / HP Pelayan / Owner) otomatis dapat mencetak struk, tiket dapur, dan membuka laci kasir melalui perangkat utama (Device 1) yang sedang terhubung ke printer thermal fisik.
- **Antrean Tugas Cetak Realtime Firestore (`print_jobs`):** Komunikasi sub-detik antar-perangkat toko UMKM dengan auto-cleanup tugas lama tanpa perlu konfigurasi IP/jaringan manual (Zero Configuration).
- **Self-Hosted Material Symbols Font:** Font icon `Material Symbols Rounded` (.woff2) disimpan lokal di repo dan bundle aset APK Android, memberikan waktu muat 0ms dan 100% tahan offline.
- **Pipeline Splash Screen Riil (Real Asset Readiness):** Splash screen kini memproses tahapan aset sebenarnya (0% - 100%) dan menunggu `document.fonts.ready` sebelum ditutup.
- **Proteksi CSS Anti-FOUT:** Mencegah kedipan teks mentah (*Flash of Unstyled Text*) seperti tulisan `point_of_sale` atau `inventory_2` sebelum font aktif.

### 🛠️ Perbaikan Bug (Fixed)
- **Blind Hardcoded Timer Dihapus:** Mengganti timer buta `setTimeout` di splash screen dengan pengawas jaringan dinamis (*safety watchdog*).
- **Service Worker Font Caching:** Memperbaiki aturan filter `sw.js` agar font Google / lokal dapat tersimpan di Cache Storage PWA.

---

## [v1.1.4] - 2026-09-03

### 🚀 Fitur Baru (Added)
- **Fitur Tiket Dapur / Kitchen Checkpoint Resmi:** Format cetak khusus dapur dan bar pemisahan pos pesanan.
- **Pembaruan Langsung dari Dalam Aplikasi (In-App Auto-Updater):** Notifikasi dan pengunduh file APK langsung dari modal info toko.
- **Perbaikan Mode Teks Printer VSC TM-58V:** Normalisasi ASCII dan mitigasi string encoding thermal printer.

---

## [v1.1.0] - 2026-09-02

### 🚀 Fitur Baru (Added)
- **Native Android Bluetooth SPP Bridge:** Komunikasi langsung via RFCOMM socket (`00001101-0000-1000-8000-00805F9B34FB`) ke printer thermal Bluetooth VSC TM-58V (`RPP02N`) dan sejenisnya.
- **Bypass Total Aplikasi Pihak Ketiga:** Mencetak struk secara instan tanpa memerlukan RawBT atau aplikasi perantara lainnya.
- **0% Watermark:** Struk kasir murni 100% bebas watermark atau teks promosi pihak ketiga.
- **Auto-Kick Cash Drawer:** Pengiriman denyut pulsa listrik solenoid secara native (*dual pulse* Pin 2 & Pin 5) untuk membuka laci kasir secara otomatis saat pembayaran tunai selesai.
- **Pemilih Foto Galeri Native (`WebChromeClient.onShowFileChooser`):** Mendukung unggah logo toko untuk struk langsung dari galeri HP atau kamera.
- **Izin Kamera & Sensor Native:** Integrasi izin kamera sistem Android untuk fitur pemindai QRIS & barcode (*jsQR*).
- **Over-The-Air (OTA) Cloud Live Updates:** Sistem Hybrid WebView yang memuat versi cloud terbaru secara otomatis setiap kali ada `git push`, sehingga mitra UMKM tidak perlu menginstal ulang file APK jika ada update fitur.
- **Penyimpanan Offline Tangguh:** Dukungan Service Worker PWA (`sw.js`) dan Cache Storage internal jika kedai kasir sedang tidak memiliki koneksi internet.
- **GitHub Actions CI/CD Pipeline:** Otomatisasi deploy ke GitHub Pages dan kompilasi build APK cloud setiap kali ada push ke branch `master`.

### 🛠️ Perbaikan Bug (Fixed)
- **Modal Ubah Nama Pesanan / Meja di HP:** Menambahkan antarmuka `#renameQueueModal` yang ramah sentuhan, lengkap dengan tombol cepat (*Quick Presets*: Meja 1-4, Bungkus, GoFood, GrabFood).
- **Tombol Ubah Nama Instan:** Menyematkan ikon pensil (✏️) langsung pada tab antrian aktif di layar katalog kasir HP.
- **Auto-Reset Nama Antrian Tunggal:** Memperbaiki logika pembayaran kasir sehingga jika hanya ada satu antrian tersisa, namanya otomatis kembali ke default `"Pesanan #1"` setelah pembayaran selesai (tidak lagi tertinggal nama pelanggan sebelumnya).
- **Perbaikan CSS Cetak (@media print):** Memperbaiki aturan `@media print` agar struk kasir tidak lagi tercetak sebagai kertas putih kosong pada browser desktop/laptop.
- **Sinkronisasi Multi-Device Cloud Firestore:** Pengaturan printer, logo toko, dan identitas struk kini otomatis tersinkronisasi antar perangkat secara realtime.

---

## [v1.0.0] - 2026-08-15

### 🚀 Peluncuran Awal (Initial Release)
- Sistem Kasir Point-of-Sale (POS) ramah lansia dengan tipografi kontras tinggi (*Forest Emerald & Warm Stone*).
- Multi-antrian pesanan dinamis (*Multi-Order Tabs*).
- Fitur pembayaran Tunai (dengan kalkulator kembalian & quick-cash chips) dan QRIS Dinamis.
- Pembukuan keuangan harian: laporan laba kotor, omset, dan pencatatan pengeluaran harian.
- Cadangkan data (*Backup & Restore*) berbasis file JSON lokal.
- Sinkronisasi Cloud Firestore multi-toko.
