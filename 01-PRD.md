# PRD — Aplikasi Pencatatan Pengeluaran Kantor Inland Property
**Nama Produk:** Inland Expense Tracker (IET)
**Versi Dokumen:** 1.0
**Tanggal:** 1 September 2026
**Pemilik Produk:** Gilang — Inland Property
**Status:** Draft untuk review

---

## 1. Latar Belakang & Masalah

Saat ini pencatatan pengeluaran kantor Inland Property (operasional, ATK, transport, entertain klien, dll) kemungkinan besar masih dilakukan secara manual — struk difoto lalu diketik ulang ke Excel/Spreadsheet, atau dicatat belakangan dari ingatan. Proses ini punya beberapa masalah umum:

- **Friksi tinggi**: staf harus buka aplikasi/spreadsheet terpisah, isi form manual, tiap kali ada pengeluaran.
- **Rawan lupa/telat input**: struk fisik hilang atau baru diinput jauh setelah transaksi terjadi.
- **Rawan human error**: salah ketik nominal, kategori tidak konsisten antar staf.
- **Tidak ada visibilitas real-time**: pemilik/finance tidak tahu status pengeluaran kantor sampai laporan bulanan direkap manual.
- **Tidak ada jejak audit** yang rapi (siapa input, kapan, bukti struk yang mana).

## 2. Tujuan Produk

Membangun aplikasi internal yang memungkinkan staf Inland Property mencatat pengeluaran kantor **hanya dengan mengirim foto struk ke WhatsApp**, di mana bot secara otomatis:

1. Membaca isi struk (merchant, tanggal, nominal, item bila perlu).
2. Mengklasifikasikan pengeluaran ke kategori yang sesuai.
3. Menyimpan data ke database internal.
4. Menyinkronkan data tersebut secara otomatis ke Spreadsheet (Google Sheets) yang bisa diakses tim finance/owner.

## 3. Goals & Success Metrics

| Goal | Metrik Keberhasilan (Target) |
|---|---|
| Mempercepat proses input pengeluaran | Waktu dari "transaksi terjadi" ke "tercatat di sistem" < 2 menit |
| Mengurangi human error | Akurasi ekstraksi OCR untuk nominal & tanggal ≥ 90% pada struk yang jelas/tidak buram |
| Meningkatkan kepatuhan pencatatan | ≥ 80% pengeluaran kantor tercatat lewat bot (bukan input manual) dalam 2 bulan pertama |
| Visibilitas real-time | Data muncul di spreadsheet dalam < 1 menit setelah foto dikirim |
| Adopsi staf | Semua staf yang relevan (target: sebutkan jumlah user) aktif menggunakan bot dalam 2 minggu pertama |

*(Angka target bisa disesuaikan setelah diskusi dengan tim finance Inland Property — ini baseline yang wajar untuk sistem OCR + bot.)*

## 4. User Personas

### 4.1 Staf Input (Requester)
- Karyawan Inland Property (admin, marketing, agent, ops) yang melakukan pengeluaran operasional kecil-menengah.
- Kebutuhan utama: cara tercepat & paling minim effort untuk lapor pengeluaran — tidak perlu buka app baru, cukup WhatsApp yang sudah mereka pakai sehari-hari.
- Teknis: awam, tidak mau ribet, butuh konfirmasi jelas kalau data sudah masuk atau ada error.

### 4.2 Finance/Admin (Reviewer)
- Bertugas memverifikasi & merekap pengeluaran kantor.
- Kebutuhan utama: data yang sudah terstruktur rapi di spreadsheet, bisa filter per kategori/staf/tanggal, ada bukti foto struk yang bisa dicek ulang.

### 4.3 Owner/Manajemen
- Butuh ringkasan cepat (total pengeluaran bulanan, breakdown kategori) tanpa harus buka spreadsheet mentah.
- Nice-to-have: notifikasi ringkasan mingguan/bulanan otomatis.

## 5. Ruang Lingkup (Scope)

### 5.1 In Scope (MVP)
- Bot WhatsApp yang menerima foto struk dari nomor staf yang terdaftar (whitelist).
- Ekstraksi otomatis: nama merchant, tanggal transaksi, nominal total, kategori pengeluaran (deteksi otomatis + bisa dikoreksi manual via chat).
- Konfirmasi balik ke staf via WhatsApp (ringkasan data yang berhasil dibaca, dengan opsi koreksi).
- Penyimpanan data ke database (Supabase) sebagai source of truth.
- Sinkronisasi otomatis ke Google Sheets (1 baris per transaksi).
- Penyimpanan foto struk asli (untuk audit trail), tertaut ke baris data terkait.
- Kategori pengeluaran standar (bisa dikustomisasi): Operasional, ATK, Transport, Konsumsi/Entertain, Marketing, Maintenance, Lain-lain.
- Identifikasi otomatis siapa pengirim (dikaitkan ke nama staf berdasarkan nomor WA).

### 5.2 Out of Scope (MVP) — kandidat Fase 2/3
- Approval workflow berjenjang (misal butuh approve atasan sebelum tercatat final).
- Reimbursement / penggantian dana ke staf (hanya pencatatan, bukan proses pembayaran).
- Dashboard web internal dengan grafik (fase awal cukup Google Sheets + Sheets native chart).
- Multi-cabang/multi-entitas (jika Inland Property punya beberapa kantor/badan usaha terpisah).
- Deteksi duplikat struk yang canggih (fase awal cukup pengecekan sederhana).
- Integrasi akuntansi (Accurate, Jurnal, dll).
- OCR untuk struk berbahasa asing / mata uang selain IDR.

## 6. User Stories

1. **Sebagai staf**, saya ingin memfoto struk dan mengirimkannya ke WhatsApp bot, supaya saya tidak perlu isi form manual.
2. **Sebagai staf**, saya ingin menerima konfirmasi singkat dari bot berisi ringkasan data yang terbaca (merchant, nominal, kategori), supaya saya bisa memastikan datanya benar.
3. **Sebagai staf**, saya ingin bisa mengoreksi kategori atau nominal lewat chat balasan singkat jika bot salah baca, tanpa harus kirim ulang foto.
4. **Sebagai finance**, saya ingin semua pengeluaran otomatis masuk ke satu spreadsheet terpusat, supaya saya tidak perlu rekap manual dari WhatsApp.
5. **Sebagai finance**, saya ingin setiap baris data di spreadsheet punya link ke foto struk asli, supaya saya bisa verifikasi kapan saja.
6. **Sebagai owner**, saya ingin melihat total pengeluaran per kategori per bulan, supaya saya bisa memantau cash flow operasional.
7. **Sebagai admin sistem**, saya ingin bisa menambah/menghapus nomor WA yang berhak menggunakan bot, supaya hanya staf resmi yang bisa input.

## 7. Functional Requirements

| ID | Requirement | Prioritas |
|---|---|---|
| FR-1 | Bot menerima gambar (JPEG/PNG) dari WhatsApp | Must |
| FR-2 | Sistem hanya memproses pesan dari nomor WA yang terdaftar di whitelist | Must |
| FR-3 | Sistem melakukan ekstraksi data terstruktur dari gambar struk: merchant, tanggal, nominal total, (opsional) daftar item | Must |
| FR-4 | Sistem melakukan klasifikasi kategori pengeluaran otomatis berdasarkan merchant/konten struk | Must |
| FR-5 | Bot mengirim balasan konfirmasi berisi ringkasan hasil ekstraksi ke pengirim | Must |
| FR-6 | Staf dapat mengoreksi data (kategori/nominal/catatan) melalui balasan chat terstruktur (misal reply dengan format tertentu, atau quick-reply button) | Should |
| FR-7 | Data tersimpan otomatis ke database dengan status (misal: "terverifikasi otomatis", "dikoreksi manual") | Must |
| FR-8 | Data baru otomatis muncul sebagai baris baru di Google Sheets dalam waktu < 1 menit | Must |
| FR-9 | Foto struk asli disimpan di storage dan linknya tercantum di spreadsheet | Must |
| FR-10 | Sistem menangani kasus gambar buram/tidak terbaca dengan meminta staf mengirim ulang atau input manual sederhana | Must |
| FR-11 | Sistem mencegah duplikasi data dasar (misal: foto identik terkirim dua kali dalam rentang waktu singkat) | Should |
| FR-12 | Ada mekanisme admin untuk menambah/menghapus nomor WA yang di-whitelist | Must |
| FR-13 | Bot merespons pesan non-gambar (teks biasa) dengan panduan singkat cara pakai | Could |
| FR-14 | Sistem mencatat log setiap transaksi (siapa, kapan, hasil ekstraksi mentah) untuk keperluan audit | Must |
| FR-15 | Rekap ringkasan otomatis (mingguan/bulanan) dikirim ke grup WA finance/owner | Could (Fase 2) |

## 8. Non-Functional Requirements

- **Reliabilitas**: bot harus tersedia 24/7 dengan uptime target ≥ 99%.
- **Kecepatan respons**: konfirmasi ke staf dikirim dalam < 15 detik setelah foto diterima (tergantung latensi OCR/LLM).
- **Skalabilitas**: mampu menangani minimal 50–100 transaksi/hari tanpa degradasi performa signifikan di tahap awal.
- **Keandalan data**: tidak boleh ada data yang "hilang" antara WhatsApp → database → spreadsheet (perlu retry mechanism, lihat dokumen Architecture).
- **Auditability**: setiap data harus bisa ditelusuri balik ke foto struk asli dan pengirimnya.
- **Bahasa**: antarmuka bot menggunakan Bahasa Indonesia.
- **Biaya operasional**: desain harus mempertimbangkan biaya API (WhatsApp, OCR/LLM) agar proporsional dengan skala penggunaan kantor kecil-menengah.

## 9. Asumsi & Batasan

- Struk yang dikirim dalam kondisi cukup jelas terbaca (tidak 100% buram/rusak).
- Mayoritas struk dalam Bahasa Indonesia dan mata uang Rupiah.
- Staf menggunakan nomor WhatsApp pribadi/kantor yang sudah diketahui dan bisa didaftarkan ke whitelist.
- Fase awal tidak melibatkan proses approval/reimbursement — murni pencatatan.
- Google Sheets dipakai sebagai "tampilan akhir" data karena tim finance sudah familiar dengan spreadsheet; database tetap menjadi source of truth.

## 10. Milestone Tingkat Tinggi

| Fase | Cakupan | Estimasi |
|---|---|---|
| Fase 0 | Setup infrastruktur (WhatsApp API, database, Sheets API) | 1 minggu |
| Fase 1 (MVP) | Bot terima foto → OCR → konfirmasi → simpan ke DB → sync ke Sheets | 3–4 minggu |
| Fase 2 | Koreksi manual via chat, kategori kustom, whitelist admin panel, ringkasan berkala | 2 minggu |
| Fase 3 | Dashboard internal, approval workflow, multi-cabang (jika dibutuhkan) | TBD sesuai kebutuhan |

*(Detail task per fase ada di dokumen Tasks terpisah.)*

## 11. Open Questions

1. Berapa jumlah staf yang akan menggunakan bot ini di tahap awal?
2. Apakah perlu kategori pengeluaran custom sesuai chart of account Inland Property yang sudah ada?
3. Apakah nomor WhatsApp bot pakai nomor bisnis khusus (WhatsApp Business API resmi) atau cukup nomor biasa dengan library unofficial? (Trade-off dibahas di dokumen Architecture)
4. Apakah butuh approval sebelum data dianggap final, atau cukup catat-lalu-review belakangan?
5. Siapa yang akan jadi admin pengelola whitelist nomor WA?
