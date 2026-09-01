# Architecture Document — Inland Expense Tracker (IET)
**Versi:** 1.0 | **Tanggal:** 1 September 2026

---

## 1. Prinsip Arsitektur

- **Konsisten dengan stack Inland Property yang sudah ada** (PLMS): Next.js + Supabase + Vercel, supaya bisa direplikasi/dirawat oleh tim yang sama tanpa belajar stack baru.
- **Serverless-first** — volume transaksi kecil-menengah (puluhan/hari), tidak perlu infrastruktur berat (K8s, VM dedicated, dsb).
- **Async untuk pekerjaan berat** — webhook WhatsApp harus merespons cepat (Meta mensyaratkan respons < beberapa detik), sedangkan OCR/klasifikasi butuh waktu; maka proses berat dipisah dari respons webhook.
- **Database sebagai source of truth**, spreadsheet sebagai "tampilan/turunan" — bukan sebaliknya. Ini penting supaya tidak ada konflik data kalau spreadsheet diedit manual sembarangan.

## 2. Komponen Utama

| Komponen | Teknologi | Peran |
|---|---|---|
| WhatsApp Gateway | **Fonnte** (WA gateway unofficial, konek ke nomor WA biasa via scan QR) | Terima pesan masuk (webhook), kirim balasan, akses media foto |
| Webhook Handler | **Next.js API Route** (Vercel) | Endpoint yang menerima webhook dari Meta, validasi cepat, ack, lalu dispatch job |
| Job Queue (async) | **Upstash QStash** (sudah dipakai untuk Redis di PLMS — satu ekosistem) | Menjalankan proses OCR/klasifikasi secara async agar webhook tidak timeout |
| Ekstraksi Data Struk | **Gemini API atau Groq API (model vision)** | Membaca gambar struk → output JSON terstruktur (merchant, tanggal, nominal, kategori) |
| Database | **Supabase (Postgres)** | Source of truth: data staf, transaksi, kategori, log audit |
| Storage | **Supabase Storage** (bucket privat) | Simpan foto struk asli |
| Sinkronisasi Spreadsheet | **Google Sheets API v4** (service account) | Tulis/update baris di Google Sheets tim finance |
| Scheduler | **Vercel Cron** | Retry sync yang gagal, kirim ringkasan mingguan (Fase 2) |
| Hosting | **Vercel** | Deploy webhook & API routes |

## 3. Alur Data (Data Flow)

### 3.1 Alur Utama: Foto Struk → Tercatat

```
1. Staf kirim foto struk ke nomor WhatsApp Bisnis Inland Property
2. Fonnte (terhubung ke nomor WA biasa via scan QR) → POST webhook ke Next.js API route
3. Webhook handler:
   a. Verifikasi token/secret webhook sesuai mekanisme Fonnte (bandingkan
      token pada payload/header dengan secret yang disimpan di server)
   b. Cek nomor pengirim ada di whitelist staf (query Supabase, cached)
   c. Jika tidak terdaftar → balas pesan "belum terdaftar", STOP
   d. Jika terdaftar → simpan job ke QStash, langsung balas 200 OK ke Meta
      (dan kirim "📸 Struk diterima, sedang diproses..." ke staf)
4. QStash memanggil endpoint worker (Next.js API route terpisah):
   a. Download media (foto) dari URL yang disertakan Fonnte di payload
      webhook (cek dokumentasi Fonnte terkini untuk field/endpoint pastinya)
   b. Upload foto ke Supabase Storage (bucket 'receipts', path per staf/tanggal)
   c. Kirim gambar ke Gemini API atau Groq API (model vision) dengan
      structured output/JSON mode:
      "Ekstrak data dari struk ini, output HANYA JSON: {merchant, tanggal,
      nominal, kategori_estimasi, confidence}"
   d. Parse JSON response
   e. Jalankan pengecekan duplikat sederhana (merchant+nominal+tanggal
      dalam 30 menit terakhir dari staf yang sama)
   f. Insert ke tabel `expenses` (status = 'auto' atau 'perlu_review'
      jika confidence rendah / gambar buram)
   g. Insert ke `audit_log`
   h. Kirim balasan konfirmasi ke staf via Fonnte Send Message API
   i. Panggil Google Sheets API → append row baru
      - Jika gagal (rate limit/network) → catat ke tabel `sync_failures`
        untuk di-retry oleh Vercel Cron
5. Selesai. Data staf bisa dilihat real-time di Google Sheets.
```

### 3.2 Alur Koreksi Data

```
1. Staf balas chat teks (misal "kategori: transport")
2. Webhook handler mendeteksi ini pesan teks, bukan gambar
3. Cari transaksi terakhir dari nomor tsb dalam window waktu (misal 30 menit)
4. Parse instruksi koreksi (regex/keyword: "kategori:", "nominal:", "catatan:")
5. Update baris di tabel `expenses`, set status = 'dikoreksi_manual'
6. Insert ke `audit_log` (mencatat nilai lama & baru)
7. Update baris terkait di Google Sheets (bukan append baru — pakai
   ID transaksi yang disimpan sebagai referensi row)
8. Balas konfirmasi ke staf
```

### 3.3 Diagram Komponen (ringkas)

```
 [WhatsApp Staf]
        │  foto/teks
        ▼
 [Fonnte (WA Gateway)]
        │  webhook (POST)
        ▼
 [Next.js Webhook Handler] ──ack cepat──► [Fonnte] (balas 200 OK secepatnya)
        │  enqueue job
        ▼
 [Upstash QStash]
        │  invoke
        ▼
 [Next.js Worker Endpoint]
        │
        ├──► [Fonnte Media]             (download foto)
        ├──► [Supabase Storage]         (simpan foto)
        ├──► [Gemini/Groq API - Vision] (ekstraksi data → JSON)
        ├──► [Supabase Postgres]        (simpan data + audit log)
        ├──► [Google Sheets API]        (sync baris)
        └──► [Fonnte Send Message API]  (kirim balasan konfirmasi)
```

## 4. Skema Database (Supabase / Postgres)

### Tabel `staff`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| name | text | Nama staf |
| phone_number | text (unique) | Format E.164, mis. +62812xxxx |
| role | text | staf / finance / admin |
| is_active | boolean | Whitelist aktif/nonaktif |
| created_at | timestamptz | |

### Tabel `expenses`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| staff_id | uuid (FK → staff) | |
| merchant | text | Hasil ekstraksi |
| transaction_date | date | Tanggal di struk |
| amount | numeric | Nominal (Rupiah) |
| category | text (FK → categories.name) | |
| status | text | auto / dikoreksi_manual / input_manual / perlu_review |
| receipt_image_path | text | Path di Supabase Storage |
| raw_ocr_response | jsonb | Simpan mentah respons Claude API (untuk debug/audit) |
| confidence_score | numeric | Nilai keyakinan ekstraksi (jika tersedia) |
| notes | text | Catatan tambahan |
| sheet_row_id | text | Referensi row di Google Sheets untuk update |
| synced_to_sheet | boolean | Status sinkronisasi |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Tabel `categories`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| name | text | Nama kategori |
| keywords | text[] | Kata kunci bantu klasifikasi otomatis |
| is_active | boolean | |

### Tabel `audit_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| expense_id | uuid (FK) | |
| action | text | created / corrected / manual_input / duplicate_flagged |
| actor_phone | text | Nomor yang melakukan aksi |
| old_value | jsonb | (untuk koreksi) |
| new_value | jsonb | |
| created_at | timestamptz | |

### Tabel `sync_failures`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| expense_id | uuid (FK) | |
| attempt_count | int | |
| last_error | text | |
| resolved | boolean | |
| created_at | timestamptz | |

## 5. Integrasi WhatsApp — Fonnte

Sesuai keputusan, IET memakai **nomor WhatsApp biasa** (bukan WhatsApp Business API resmi dari Meta) yang dihubungkan lewat **Fonnte** — WA gateway unofficial berbasis WhatsApp Web (scan QR) yang populer dipakai developer Indonesia untuk kebutuhan seperti ini.

| Aspek | Catatan |
|---|---|
| Cara kerja | Device (nomor WA) dihubungkan ke dashboard Fonnte lewat scan QR, mirip WhatsApp Web biasa |
| Setup | Cepat — tidak perlu verifikasi bisnis ke Meta, tinggal daftar akun Fonnte + scan QR |
| Biaya | Umumnya flat per bulan, jauh lebih murah dibanding WA Business API resmi yang bayar per percakapan |
| Webhook & API | Tersedia REST API untuk kirim pesan + webhook untuk terima pesan masuk, termasuk media/gambar |
| Rate limit | Fonnte membatasi kecepatan pengiriman (kisaran ~10 pesan/detik) — lebih dari cukup untuk skala kantor kecil-menengah |
| **Risiko** | Karena unofficial (berbasis WhatsApp Web, bukan API resmi Meta), **nomor berisiko diblokir WhatsApp** jika pola pengiriman terdeteksi mencurigakan (terlalu cepat, ke banyak nomor asing, dll). Untuk penggunaan internal (WA-ke-bot dari staf sendiri, bukan broadcast massal), risiko ini relatif lebih rendah dibanding kasus broadcast/blast, tapi tetap ada |

**Mitigasi risiko yang disarankan** (karena arsitektur ini memilih Fonnte, bukan Cloud API resmi):
- Jangan gunakan device yang sama untuk keperluan broadcast/blast pesan lain — dedikasikan satu device khusus untuk bot pengeluaran ini.
- Siapkan proses gampang untuk reconnect (scan ulang QR) kalau device ter-disconnect/logout.
- Pertimbangkan siapkan device/nomor cadangan yang bisa cepat diaktifkan kalau nomor utama kena kendala, supaya pencatatan tidak terhenti total.
- Karena traffic-nya internal (staf ke bot, bukan bot ke banyak orang asing), pola pemakaian ini relatif lebih aman dibanding kasus umum WA gateway yang dipakai untuk marketing/blast.

## 6. Pemilihan Metode Ekstraksi Data Struk

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **Gemini API (Google, vision + structured output)** | Dukungan native JSON schema (`responseSchema`/`responseMimeType`), akurasi vision kuat untuk dokumen/struk, tier *Flash-Lite* sangat murah untuk volume kecil-menengah, satu ekosistem Google dengan Sheets API (bisa share 1 GCP project/service account) | Harga naik kalau pakai varian *Pro*; tier gratis punya rate limit lebih ketat kalau volume naik |
| **Groq API (model vision open, mis. Qwen/Llama)** | Inference sangat cepat (latensi rendah — cocok buat respons bot yang terasa instan), mendukung JSON mode dan kategori "OCR & Image Recognition" secara eksplisit, harga kompetitif | Lineup model vision di Groq cukup sering berubah/dideprecate, jadi perlu pin versi model & pantau halaman model Groq secara berkala; akurasi untuk struk dengan teks kecil/padat perlu diuji dulu dibanding Gemini |
| **Google Cloud Vision OCR + parsing manual/regex** | OCR mentah cukup akurat untuk teks | Perlu logika parsing terpisah untuk struktur data, lebih rapuh terhadap format struk yang bervariasi, tidak otomatis melakukan klasifikasi kategori |

**Rekomendasi:** antara Gemini dan Groq, pilihannya tergantung prioritas:
- Kalau prioritas **akurasi ekstraksi** (struk dengan tulisan kecil/padat, banyak variasi merchant) → **Gemini API** (model *Flash*/*Flash-Lite* cukup untuk tugas seringan ini), plus keuntungan tambahan satu ekosistem kredensial dengan Google Sheets API.
- Kalau prioritas **kecepatan respons** ke staf dan biaya serendah mungkin → **Groq API** layak dicoba, dengan catatan model vision yang dipakai perlu di-pin dan dipantau karena Groq cukup sering memensiunkan model lama.
- Opsi lain: pakai Groq sebagai jalur cepat, dengan fallback ke Gemini kalau `confidence` rendah atau JSON gagal di-parse — tapi ini menambah kompleksitas, jadi untuk MVP lebih baik pilih satu dulu dan evaluasi hasilnya di 2–4 minggu pertama pemakaian nyata.

## 7. Sinkronisasi ke Google Sheets

- Gunakan **service account Google Cloud** dengan akses terbatas hanya ke 1 spreadsheet (share spreadsheet ke email service account).
- Insert baru → `Sheets.spreadsheets.values.append`.
- Update (koreksi) → simpan nomor baris (`sheet_row_id`) saat pertama kali insert, lalu gunakan `Sheets.spreadsheets.values.update` ke range spesifik saat ada koreksi.
- **Retry mechanism**: jika panggilan Sheets API gagal (rate limit Google: 60 write/menit/user — sangat cukup untuk skala ini, tapi tetap perlu penanganan), catat ke `sync_failures`, lalu **Vercel Cron** (jalan tiap 5 menit) mencoba ulang entri yang gagal.

## 8. Keputusan Arsitektur Lain

- **Idempotency**: setiap webhook dari Meta memiliki `message_id` unik — simpan ini untuk mencegah proses ganda jika Meta mengirim webhook duplikat (retry dari sisi Meta).
- **Timeout handling**: webhook handler tidak menunggu hasil OCR selesai — cukup enqueue lalu ack cepat, supaya tidak kena timeout dari Meta maupun Vercel serverless function (default 10–60 detik tergantung plan).
- **Format nomor telepon**: normalisasi semua nomor ke format E.164 (+62...) saat disimpan/dicocokkan, untuk menghindari mismatch whitelist.
- **Domain/Deploy**: bisa di-deploy sebagai project Vercel terpisah, misal `expense.inlandproperty.site`, terpisah dari PLMS agar lebih mudah dikelola izin & environment variable-nya, meski tetap satu akun Supabase org bila diinginkan (disarankan project Supabase terpisah untuk isolasi data finansial — lihat dokumen Security).

## 9. Skalabilitas

- Untuk volume 50–100 transaksi/hari, arsitektur serverless di atas lebih dari cukup tanpa biaya besar.
- Jika ke depan volume naik signifikan (>1000/hari) atau butuh multi-cabang, pertimbangkan:
  - Memindahkan proses OCR ke background worker dedicated (bukan serverless function) untuk kontrol biaya/latensi lebih baik.
  - Menambahkan cache layer (Redis, sudah tersedia via Upstash) untuk whitelist staf & kategori master agar mengurangi round-trip ke Postgres di setiap pesan masuk.
