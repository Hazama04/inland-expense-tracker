# Task Breakdown — Inland Expense Tracker (IET)
**Versi:** 1.0 | **Tanggal:** 1 September 2026

Referensi milestone tingkat tinggi ada di dokumen PRD (bagian 10). Dokumen ini merinci task per fase.

---

## Fase 0 — Setup Infrastruktur (~1 minggu)

| # | Task | Detail |
|---|---|---|
| 0.1 | Daftar akun Fonnte & hubungkan nomor WA biasa (scan QR) sebagai device khusus bot | Dedikasikan 1 device khusus, jangan dicampur dengan keperluan blast/marketing lain |
| 0.2 | Setup akses API Fonnte | Ambil Token API dari dashboard device, konfigurasi URL webhook agar pesan masuk diteruskan ke endpoint Next.js |
| 0.3 | Setup project Supabase baru | Disarankan project terpisah dari PLMS untuk isolasi data finansial (lihat Security doc) |
| 0.4 | Buat skema database awal | Tabel `staff`, `expenses`, `categories`, `audit_log`, `sync_failures` sesuai dokumen Architecture |
| 0.5 | Setup Supabase Storage bucket `receipts` (privat) | Konfigurasi RLS policy untuk bucket |
| 0.6 | Setup Google Cloud project + service account | Aktifkan Google Sheets API, buat service account, share target spreadsheet ke email service account |
| 0.7 | Buat template spreadsheet awal | Sheet "Pengeluaran", "Kategori Master" sesuai struktur di dokumen Design |
| 0.8 | Setup project Vercel baru | Deploy skeleton Next.js, hubungkan environment variables |
| 0.9 | Setup Upstash QStash | Untuk job queue async |
| 0.10 | Isi data awal `staff` (whitelist nomor) & `categories` | Koordinasi dengan HR/finance untuk daftar staf yang berhak |

## Fase 1 — MVP Core Flow (~3–4 minggu)

### 1A. Webhook & Ingest
| # | Task |
|---|---|
| 1.1 | Endpoint `POST /api/webhook` untuk menerima callback pesan masuk dari Fonnte |
| 1.2 | Setup konfigurasi URL webhook di dashboard Fonnte agar mengarah ke endpoint di atas |
| 1.3 | Implementasi verifikasi token/secret webhook sesuai mekanisme Fonnte |
| 1.4 | Parsing payload webhook (bedakan pesan gambar vs teks) |
| 1.5 | Cek whitelist nomor pengirim terhadap tabel `staff` |
| 1.6 | Balas "belum terdaftar" untuk nomor di luar whitelist |
| 1.7 | Enqueue job ke QStash untuk pesan gambar yang valid |
| 1.8 | Kirim balasan cepat "sedang diproses..." |

### 1B. Worker: Ekstraksi & Penyimpanan
| # | Task |
|---|---|
| 1.9 | Endpoint worker yang dipanggil QStash |
| 1.10 | Download media dari URL/field yang disediakan payload webhook Fonnte |
| 1.11 | Upload foto ke Supabase Storage, generate path terstruktur (per staf/tahun/bulan) |
| 1.12 | Pilih provider (Gemini atau Groq) & desain prompt/schema untuk ekstraksi JSON terstruktur (merchant, tanggal, nominal, kategori, confidence) |
| 1.13 | Implementasi pemanggilan API vision terpilih (Gemini/Groq) + parsing/validasi JSON output |
| 1.14 | Logika pengecekan duplikat sederhana (merchant + nominal + tanggal dalam window waktu) |
| 1.15 | Insert data ke tabel `expenses` dengan status yang sesuai |
| 1.16 | Insert entry ke `audit_log` |
| 1.17 | Kirim pesan konfirmasi hasil ekstraksi ke staf via WhatsApp |
| 1.18 | Handle kasus gambar buram/gagal ekstraksi → minta kirim ulang / instruksi input manual |

### 1C. Sinkronisasi Spreadsheet
| # | Task |
|---|---|
| 1.19 | Implementasi client Google Sheets API (autentikasi service account) |
| 1.20 | Fungsi append row baru ke sheet "Pengeluaran" |
| 1.21 | Simpan referensi `sheet_row_id` di tabel `expenses` setelah append berhasil |
| 1.22 | Error handling + pencatatan ke `sync_failures` jika gagal |
| 1.23 | Vercel Cron job untuk retry `sync_failures` (jalan tiap 5 menit) |

### 1D. Alur Koreksi & Input Manual
| # | Task |
|---|---|
| 1.24 | Parsing pesan teks koreksi (`kategori:`, `nominal:`, `catatan:`) |
| 1.25 | Logika mencari transaksi terakhir dari nomor tsb dalam window waktu tertentu |
| 1.26 | Update tabel `expenses` + `audit_log` untuk koreksi |
| 1.27 | Update baris terkait di Google Sheets (bukan append baru) |
| 1.28 | Parsing format input manual (`manual: merchant | nominal | kategori`) untuk kasus struk tidak terbaca |

### 1E. Testing & QA
| # | Task |
|---|---|
| 1.29 | Unit test untuk fungsi parsing (koreksi, input manual, ekstraksi JSON) |
| 1.30 | Testing end-to-end dengan berbagai jenis struk (minimarket, restoran, SPBU, dll) |
| 1.31 | Testing edge case: gambar buram, gambar bukan struk, pesan spam |
| 1.32 | Uji coba terbatas dengan 2–3 staf sebelum rollout penuh |

## Fase 2 — Penyempurnaan (~2 minggu)

| # | Task |
|---|---|
| 2.1 | Perintah `riwayat` — tampilkan 5 transaksi terakhir milik staf |
| 2.2 | Perintah `total bulan ini` per staf |
| 2.3 | Pesan onboarding/`bantuan` otomatis untuk staf baru |
| 2.4 | Rate limiting per nomor (Upstash Redis) |
| 2.5 | Deteksi duplikat yang lebih baik (fuzzy match nominal/merchant) |
| 2.6 | Ringkasan mingguan otomatis ke grup WA finance/owner (Vercel Cron) |
| 2.7 | Sheet "Ringkasan Bulanan" (pivot otomatis) |
| 2.8 | Panel admin sederhana (internal, bisa web sederhana atau lewat Supabase Studio) untuk kelola whitelist staf & kategori |
| 2.9 | Rotasi/refresh signed URL foto struk di Sheets agar tidak kedaluwarsa |

## Fase 3 — Lanjutan (Opsional, sesuai kebutuhan)

| # | Task |
|---|---|
| 3.1 | Dashboard web internal dengan grafik (breakdown kategori, tren bulanan) |
| 3.2 | Approval workflow berjenjang sebelum data final |
| 3.3 | Dukungan multi-cabang/multi-entitas |
| 3.4 | Integrasi ke software akuntansi (jika Inland Property memakai salah satu) |
| 3.5 | Export laporan PDF otomatis per periode |

## Rekomendasi Peran/Tim

| Peran | Kebutuhan |
|---|---|
| Developer (backend/full-stack) | Implementasi webhook, worker, integrasi API — 1 orang cukup untuk MVP mengingat skala aplikasi |
| Finance/Admin Inland Property | Menentukan daftar kategori final, daftar staf whitelist, review struktur spreadsheet |
| Tester internal (2–3 staf) | Uji coba Fase 1E sebelum rollout penuh ke semua staf |

## Dependency Kritis (harus selesai sebelum mulai coding)

1. Nomor WhatsApp Business + verifikasi Meta Business Manager selesai (bisa makan waktu beberapa hari, ajukan di awal).
2. Daftar final kategori pengeluaran dari tim finance.
3. Daftar staf yang berhak + nomor WA mereka.
4. Keputusan: spreadsheet dibuat baru atau meneruskan struktur spreadsheet lama yang sudah ada (jika sudah ada template existing).
