# STRATEGI EKSEKUSI ARISTOTLE POS — 90 HARI PERTAMA
**Dokumen turunan yang actionable dari `STRATEGI_BISNIS_POS.md`. Dibuat berdasarkan riset pasar & regulasi, September 2026.**

> Cara pakai: baca bagian 1–2 untuk pola pikir, lalu kerjakan bagian 4 minggu per minggu. Setiap fase punya angka target dan aturan lanjut/berhenti. Tidak ada langkah yang berbunyi "bangun fitur X" tanpa pemicu permintaan bayar.

---

## 1. CARA BERPIKIR PEBISNIS (hasil riset — bukan opini)

Delapan prinsip yang terbukti dari data dan praktik founder, dan semuanya berlaku untuk kasusmu:

1. **Validasi = orang menyerahkan uang, bukan orang memuji demo.** Founder yang gagal rata-rata salah urutan: membangun dulu, mencari pembeli kemudian. Aturan praktisnya: 10 percakapan nyata dengan calon pembeli sebelum menulis satu baris kode fitur baru. Landing page + janji bukan validasi.
2. **Distribusi mengalahkan produk.** Produk yang tidak pernah sampai ke 10 orang pertama = tidak ada. Founder tanpa audiens harus menjual lewat kanal hangat (kenalan, komunitas, reseller), bukan berharap viral organik.
3. **Hitung biaya support sebagai COGS.** Untuk solo developer, jam melayani komplain ADALAH biaya pokok — bukan "gratis karena dikerjakan sendiri". Model bisnis yang menghabiskan 10 jam/bulan demi Rp50rb adalah model yang bangkrut secara diam-diam.
4. **Harga adalah positioning, bukan sekadar angka.** Riset indie SaaS konsisten: harga terlalu murah menarik pelanggan paling rewel (paling banyak komplain, paling cepat churn, paling cepat kasih review buruk) dan memberi sinyal "produk ini tidak serius". Naikkan harga sampai sedikit tidak nyaman.
5. **Lifetime deal hanya sehat jika 3 syarat terpenuhi:** (a) biaya marginal per user ≈ nol, (b) harga ≥ nilai wajar langganan tahunan yang digantikan, (c) jumlah lisensi dibatasi. Kalau satu saja jebol, lifetime deal berubah jadi utang support abadi.
6. **Jangan memungut di aliran uang yang bukan milikmu.** Biaya hanya bisa dipotong otomatis kalau kamu berada di rantai settlement. Kalau uang masuk ke rekening merchant, kamu tetap harus menagih — tidak ada jalan pintas "pasif".
7. **Onboarding 30 hari pertama menentukan hidup-matinya pelanggan.** Data SaaS berulang: churn paling besar terjadi di bulan pertama karena user tidak mencapai "kemenangan pertama". Uang paling murah adalah menolong user sukses di minggu pertama, bukan diskon.
8. **Satu metrik utara dalam satu waktu.** Fase validasi = konversi bayar. Fase skala = jam support per toko. Jangan kejar 5 metrik sekaligus.

---

## 2. PETA PASAR (fakta riset, bukan asumsi)

### 2.1 Harga kompetitor — posisimu ada di celah yang nyata

| Pemain | Harga | Model |
|---|---|---|
| Moka | Rp299–799rb/outlet/bulan | Langganan + add-on (Dine-in Rp99rb/bln, payment fee 1,5%/transaksi) |
| Majoo | Rp249rb–999rb/outlet/bulan | Langganan tiered; punya White Label Solution + aplikasi waiter/table order |
| Olsera | Rp1,288–2,688jt/tahun | Langganan tahunan; tier Pro ada Self Order + Dashboard Franchise |
| Kasir Pintar | mulai Rp55,5rb/bulan (ada gratis) | Langganan murah + freemium |
| Qasir | Rp699rb/tahun | Langganan tahunan murah |

**Implikasi untukmu:**
- Semua pemain besar = langganan. UMKM yang trauma langganan adalah segmen yang *sengaja tidak dilayani* mereka. Lisensi lifetime + offline-first adalah wedge (celah masuk) yang sah — bukan sekadar preferensi, tapi positioning melawan seluruh pasar.
- Harga lifetime yang sehat berkisar **Rp1,9–2,9jt sekali bayar** (setara ±1,5–2x paket tahunan Olsera Basic). Di bawah Rp1,5jt kamu memberi sinyal "murahan" sekaligus tidak menutup biaya support tahunanmu. Di atas Rp3jt kamu masuk ring tinju Moka/Majoo tanpa brand.
- Fakta bahwa **Majoo menjual White Label** dan Olsera Pro punya **Dashboard Franchise** = validasi bahwa Alternatif A (B2B franchise) adalah permintaan pasar yang riil, bukan teori. Dan kamu sudah punya dashboard-nya.

### 2.2 Aturan main QRIS & payment (fakta regulasi BI)

- MDR QRIS: usaha mikro ≤Rp500rb = **0%**; >Rp500rb = 0,3%; reguler 0,7%. Mulai 1 Okt 2026, 0% diperluas ke transaksi ≤Rp100rb untuk semua merchant. **MDR ditanggung merchant dan dilarang dibebankan ke pembeli.** Jadi "biaya layanan Rp1.000 ke pembeli" di atas QRIS = melanggar aturan.
- BI tidak mengambil sepeser pun dari MDR — uang mengalir ke industri (issuer/acquirer/switching). Untuk ikut mencicipi aliran transaksi, kamu harus jadi **PJP berlisensi BI**: badan hukum PT, modal disetor **Rp5–15 MILIAR**, fit & proper test, audit dan rencana bisnis tahunan ke BI. Bukan dunia solo developer.
- **Jalur realistis satu-satunya:** kemitraan referral/platform dengan agregator berlisensi (contoh pola: Xendit menyediakan referral agreement + API onboarding sub-merchant/KYC). Komisi ada, tapi dibayar triwulanan, umumnya dibatasi ±12 bulan, dan butuh volume. Ini mesin tahap 2 — bukan fondasi tahap 1.
- Konteks pasar: QRIS sudah dipakai 65,77 juta pengguna dan 44,86 juta merchant (96,68% UMKM), 12,55 miliar transaksi per semester. Adopsinya bukan masalah — monetisasinya yang butuh izin.

### 2.3 Pelajaran dari model lifetime deal global

- Lifetime deal adalah mesin akselerasi tahap awal yang sah (kas di depan + momentum + data perilaku user), dengan syarat 3 aturan di bagian 1 no. 5.
- Arsitekturmu (offline-first, biaya server nyaris nol per user) memenuhi syarat (a) — ini keuntungan struktural yang tidak dimiliki SaaS cloud murni. Musuhmu bukan biaya server, melainkan **jam support**. Jadi semua strategi harga harus dirancang untuk menekan jam support, bukan menekan biaya server.

---

## 3. KEPUTUSAN STRATEGI (rekomendasi final)

**Tesis satu kalimat:** Menangkan 90 hari ke depan dengan *satu* mesin kas (lisensi lifetime direct), *satu* tiket besar (pilot white-label franchise), dan *satu* eksperimen murah (jual source code) — sambil memarkir Table QR sampai ada merchant yang membayar setup-nya dan ada partner payment yang jelas.

| Mesin | Peran | Target 90 hari | Syarat lanjut |
|---|---|---|---|
| **1. Lifetime direct ke UMKM** | Kas utama, validasi pasar | 10 lisensi × ±Rp2,5jt = ±Rp25jt | Konversi demo→bayar ≥10% |
| **2. Pilot white-label 1 franchise** | Tiket besar, leverage dashboard yang sudah jadi | 1 LOI/pilot 2–3 gerai | Ada 1 pemilik franchise yang mau bayar setup |
| **3. Listing source code** | Eksperimen dev-market, nol support lapangan | 3–5 penjualan pertama | Ada yang bertanya harga dalam 30 hari |
| ~~Table QR + fee transaksi~~ | **DIPARKIR.** Butuh lisensi PJP (Rp5–15M modal) atau partner agregator + modul self-order yang belum ada. Dibangun hanya jika mesin 1/2 membiayai dan ada merchant yang DP setup. | — | Ada DP setup + MoU agregator |

**Yang eksplisit TIDAK dilakukan 90 hari:** langganan bulanan baru, modul self-order pelanggan, integrasi payment gateway, fitur non-konversi, dan menambah channel support baru (cukup 1 nomor WA + panduan).

---

## 4. RENCANA 90 HARI (minggu per minggu)

### FASE 0 — Fondasi ukur (Hari 1–7). Tanpa ini semua angka = tebak-tebakan.
- [ ] Pasang pencatatan minimal: aktivasi demo/minggu, konversi demo→lisensi (%), jam support/minggu, biaya Firebase/bulan. Spreadsheet cukup — jangan bangun dashboard analytics.
- [ ] Tetapkan harga publik: **Lifetime Rp2,5jt** (jangkar: "setara 2 tahun Olsera Basic, bayar sekali, milik selamanya") + **Pro Multi-Kasir Rp3,5jt**. Tulis di satu halaman harga + brosur WA. Harga boleh dinego maksimal 20% untuk 5 pembeli pertama (alasan: "harga perintis", batas jelas).
- [ ] Tulis SLA support 1 paragraf dan tempel di brosur: jam respons, kanal tunggal (1 nomor WA), dan apa yang TIDAK ditanggung (kerusakan hardware, HP hilang). Ini memagar jam support — aset termahalmu.
- [ ] Siapkan 1 unit demo (tablet/HP + printer thermal) + video 60 detik (transaksi offline → cetak struk).

### FASE 1 — Uang pertama (Hari 8–30). Target: 3 lisensi + 10 percakapan.
- [ ] Datangi/Hubungi 10 pemilik usaha (urut: kenalan → kenalan dari kenalan → tetangga usaha). Demo 15 menit, lalu minta keputusan: "Mau mulai demo 25 transaksi gratis hari ini?" Ukur konversi tiap tahap (demo → aktivasi → bayar).
- [ ] Follow-up H+2 dan H+7 ke semua demo yang belum bayar dengan template bagian 6. Setiap penolakan dicatat alasannya — ini riset pasarmu.
- [ ] Tawarkan 2 paket jasa setup (bukan fitur): input 50 menu + cetak stiker QR + training 1 jam (Rp300–500rb). Jasa selalu lebih mudah dijual daripada software.
- [ ] **Aturan berhenti:** jika dari 10 percakapan nol aktivasi demo → masalahnya distribusi/pitch, bukan produk. Ganti kanal (titip brosur + komisi ke toko komputer/printer) sebelum menyentuh kode.

### FASE 2 — Tiket besar + eksperimen (Hari 31–60). Target: 1 pilot franchise + listing source code live.
- [ ] Susun penawaran white-label 1 halaman: ganti branding ("Sistem Kasir Resmi X"), dashboard pusat untuk owner, paket wajib untuk mitra baru. Harga: setup Rp15–25jt + maintenance tahunan Rp5jt. Kirim ke 3 pemilik franchise/kemitraan (es teh, kopi, ayam, laundry — yang cabangnya >10).
- [ ] Listing boilerplate (Gumroad/Codespace sejenis + postingan komunitas developer): "Production-ready offline-first POS starter: ESC-POS Bluetooth/USB driver + Firestore sync + PWA hybrid". Harga awal Rp1,5jt. Syarat: tanpa garansi support 1-on-1 (support via email, respons 2×24 jam) — memagar risiko LTD trap.
- [ ] Lanjutkan penjualan direct (target kumulatif: 7 lisensi).

### FASE 3 — Putuskan pemenang (Hari 61–90). Target kumulatif: 10 lisensi ATAU 1 pilot ATAU 5 penjualan source code.
- [ ] Pilih SATU mesin berdasarkan uang yang benar-benar masuk, lalu gandakan (tambah jam/kanal ke pemenang, bekukan yang kalah).
- [ ] Jika konversi demo→bayar ≥10%: naikkan harga 10–15% dan uji lagi (prinsip no. 4 — kemungkinan kamu underprice).
- [ ] Jika support >8 jam/minggu untuk <5 toko: hentikan penjualan direct sementara, perbaiki panduan + video tutorial dulu. Jangan merekrut CS sebelum unit economics jelas.
- [ ] Table QR tetap diparkir kecuali ada merchant yang membayar DP setup minimal Rp2jt — DP adalah satu-satunya validasi yang sah untuk fitur itu.

---

## 5. MATEMATIKA YANG HARUS DIPEGANG

- **Demo 25 transaksi ≈ 1–2 hari warung normal** (20–50 transaksi/hari). Ini forcing function yang bagus: demo habis cepat → keputusan cepat. Jangan perpanjang kuota demo sebelum konversi diukur.
- **Batas sehat support:** total jam support/minggu ÷ jumlah toko bayar ≤ 1 jam. Lewat dari itu, harga atau panduan yang salah — bukan pelanggan yang salah.
- **Harga vs support:** setiap lisensi Rp2,5jt harus menutup estimasi 10 jam support lifetime + akuisisi. Kalau realita 30 jam/toko, harga harus naik atau support harus diproduct-kan (video, grup, FAQ) — tidak ada opsi ketiga.
- **Jangan kejar omset warung Rp50rb/bulan per toko.** Satu lisensi lifetime = 50 bulan langganan Rp50rb di depan, tanpa penagihan, tanpa churn. Itulah keunggulan strukturalmu — jangan dilepas demi meniru Moka.

---

## 6. TEMPLATE SIAP PAKAI

**Follow-up H+2 (WA):** "Halo Pak/Bu [Nama], ini [Namamu] yang kemarin demo kasir. Kuota demo 25 transaksi biasanya habis 1–2 hari — kalau kemarin ada yang kurang pas (menu/printer/struk), saya bantu betulkan hari ini gratis. Cocoknya lanjut lisensi atau masih ada yang mengganjal?"

**Penutup perintis (saat ragu harga):** "Harga normal Rp2,5jt sekali bayar. Karena Bapak/Ibu 5 pembeli pertama di kota ini, Rp2jt termasuk setup 50 menu + training. Setelah 5 kuota habis, kembali normal. Mau saya catat kuotanya?"

**Penolakan → riset (wajib dicatat):** "Siap, tidak apa-apa. Boleh tahu satu hal saja — yang bikin belum jadi ambil: harganya, takut ribet pakainya, atau masih nyaman cara lama? Jawabannya bantu saya perbaiki produk."

---

## 7. SUMBER & DASAR FAKTA

- Harga kompetitor: halaman harga resmi Moka (Rp299–799rb/bln), Majoo (Rp249rb–999rb/bln, White Label Solution), Olsera (Rp1,288–2,688jt/thn), agregator blog harga POS 2026 (Kasir Pintar, Qasir).
- Regulasi QRIS & MDR: publikasi Bank Indonesia (UMI ≤Rp500rb = 0%, >Rp500rb = 0,3%, reguler 0,7%; MDR ditanggung merchant, dilarang ke konsumen; perluasan 0% ≤Rp100rb per 1 Okt 2026). Data adopsi: 65,77 jt pengguna, 44,86 jt merchant.
- Perizinan PJP: PBI 23/6/PBI/2021 + rezim baru PBI 10/2025 (kategori izin, modal disetor Rp5–15 Miliar sesuai bundle aktivitas, fit & proper, pelaporan berkala).
- Kemitraan agregator: pola Xendit Regional Channel Referral (komisi triwulanan ±12 bulan) + XenPlatform untuk onboarding/KYC sub-merchant — bukti jalur partnership ada tapi berbatas dan butuh volume.
- Dinamika lifetime deal & pricing indie SaaS: analisis komunitas founder (syarat LTD sehat, jebakan support-forever, harga sebagai sinyal, aturan validasi "uang di depan").

*Dokumen ini adalah rencana kerja, bukan ramalan. Jika data lapangan (konversi, jam support, jawaban penolakan) bertentangan dengan isi dokumen ini — ikuti data lapangan.*
