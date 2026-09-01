# Security Document — Inland Expense Tracker (IET)
**Versi:** 1.0 | **Tanggal:** 1 September 2026

---

## 1. Model Ancaman (Threat Model) Singkat

Sistem ini menangani **data finansial internal** (nominal pengeluaran, foto struk, identitas staf) — bukan data publik. Risiko utama yang perlu diantisipasi:

| Ancaman | Dampak | Prioritas Mitigasi |
|---|---|---|
| Nomor tak dikenal mengirim data palsu ke bot | Data finansial kotor/tidak valid masuk sistem | Tinggi |
| Webhook dipalsukan (bukan dari Meta asli) | Data injeksi tanpa lewat WhatsApp sungguhan | Tinggi |
| Kebocoran foto struk/data transaksi | Informasi finansial internal bocor ke pihak luar | Tinggi |
| Service account Google Sheets bocor | Pihak luar bisa baca/tulis spreadsheet finance | Tinggi |
| Staf resign tapi nomor masih aktif di whitelist | Input tidak sah pasca-resign | Sedang |
| API key (Claude, Meta, Google) bocor di kode/log | Penyalahgunaan kuota/biaya, akses tidak sah | Tinggi |
| Manipulasi/edit manual data di Sheets tanpa jejak | Data source of truth (DB) dan tampilan (Sheets) tidak sinkron | Sedang |

## 2. Autentikasi & Otorisasi

### 2.1 Verifikasi Pengirim WhatsApp (Whitelist)
- Hanya nomor telepon yang terdaftar di tabel `staff` dengan `is_active = true` yang pesannya diproses.
- Nomor di luar whitelist mendapat balasan standar "belum terdaftar" — **tidak ada data yang disimpan** dari nomor tak dikenal.
- Penambahan/penghapusan nomor whitelist hanya bisa dilakukan oleh role `admin`, bukan lewat chat WhatsApp (untuk mencegah social engineering — misal orang berpura-pura jadi admin lewat chat).

### 2.2 Verifikasi Webhook Fonnte
- Setiap request masuk ke webhook **wajib divalidasi** — cocokkan token/secret yang dikirim Fonnte pada payload atau header dengan secret yang disimpan di environment variable server. Request yang token-nya tidak cocok langsung ditolak (403), tanpa diproses lebih lanjut.
- Simpan Token API Fonnte (dipakai untuk kirim pesan balik) sebagai environment variable, bukan hardcoded — lihat detail field/skema autentikasi terkini di dokumentasi Fonnte saat implementasi, karena mekanisme gateway pihak ketiga bisa berubah dari waktu ke waktu.
- Karena Fonnte adalah gateway *unofficial* (bukan dari Meta langsung), tidak ada jaminan SLA resmi — pertimbangkan monitoring status koneksi device (connected/disconnected) dan alert otomatis kalau device ter-logout, supaya admin bisa cepat scan ulang QR.

### 2.3 Role-Based Access
| Role | Akses |
|---|---|
| Staf | Kirim struk, koreksi data milik sendiri, lihat riwayat sendiri |
| Finance | Lihat semua data di Sheets (read), tidak perlu akses sistem backend |
| Admin | Kelola whitelist staf & kategori, akses log audit, akses dashboard admin (jika dibuat di Fase 3) |

## 3. Perlindungan Data

### 3.1 Data in Transit
- Semua komunikasi (webhook Meta ↔ server, server ↔ Claude API, server ↔ Google Sheets API, server ↔ Supabase) wajib HTTPS/TLS — ini default untuk semua layanan yang dipakai (Vercel, Supabase, Google, Meta).

### 3.2 Data at Rest
- Foto struk disimpan di **Supabase Storage bucket privat** (bukan public bucket) — akses hanya lewat signed URL bertenggat waktu (misal berlaku 1 jam) saat dibutuhkan (contoh: link di kolom "Link Foto Struk" di Sheets sebaiknya berupa signed URL yang di-generate ulang, bukan link permanen publik).
- Database Supabase menggunakan enkripsi at-rest bawaan platform.
- Row Level Security (RLS) diaktifkan di semua tabel Supabase:
  - Staf hanya bisa (jika ada akses langsung di fase depan) melihat data miliknya sendiri.
  - Service role key (bypass RLS) hanya dipakai di server-side webhook/worker, **tidak pernah** diekspos ke client mana pun.

### 3.3 Google Sheets sebagai Titik Rawan
- Spreadsheet berisi ringkasan data finansial — **batasi akses share** hanya ke email staf finance/owner yang relevan (bukan "siapa saja dengan link").
- Gunakan Google Sheets sharing permission "Viewer" untuk staf finance biasa, "Editor" hanya untuk yang benar-benar perlu mengedit manual.
- Service account yang dipakai sistem untuk menulis ke Sheets **hanya diberi akses ke 1 spreadsheet spesifik** (bukan akses ke seluruh Google Drive organisasi).

## 4. Manajemen Secrets & API Keys

- Semua kredensial (Meta App Secret & Access Token, Gemini/Groq API Key, Google Service Account JSON, Supabase Service Role Key) disimpan sebagai **environment variables** di Vercel (encrypted at rest oleh platform), **tidak pernah** di-commit ke repository/git.
- Rotasi berkala direkomendasikan untuk API key yang sensitif (misal tiap 6–12 bulan, atau segera jika ada indikasi kebocoran).
- Log aplikasi **tidak boleh** mencatat isi penuh dari secrets/token (mask/redact jika perlu logging request headers untuk debug).
- Gunakan API key dengan **scope minimal** yang diperlukan (misal Google service account hanya punya scope `spreadsheets`, bukan akses Drive penuh).

## 5. Pencegahan Penyalahgunaan (Abuse Prevention)

- **Rate limiting per nomor WA** (misal maksimal 20 pesan/jam per nomor) untuk mencegah spam/flood — bisa memanfaatkan Upstash Redis yang sudah dipakai di ekosistem PLMS.
- **Validasi ukuran & tipe file** gambar yang diterima (maks. misal 5–10 MB, tipe JPEG/PNG/WebP saja) sebelum diproses lebih lanjut.
- **Deteksi duplikat sederhana** (lihat dokumen Architecture) untuk mencegah pencatatan ganda yang tidak disengaja maupun disengaja.
- Semua percobaan akses dari nomor tak terdaftar tetap **dicatat di log** (tanpa memproses datanya) untuk pemantauan pola percobaan penyalahgunaan.

## 6. Audit Trail

- Setiap transaksi (input awal, koreksi, input manual, penandaan duplikat) tercatat di tabel `audit_log` dengan: siapa (nomor/nama), kapan, aksi apa, nilai lama → nilai baru.
- Log ini **tidak bisa dihapus** oleh siapa pun kecuali lewat akses database langsung (bukan lewat chat/aplikasi) — memberi jejak yang bisa dipercaya untuk keperluan audit finansial internal.
- Respons mentah dari Claude API (`raw_ocr_response`) disimpan untuk keperluan investigasi jika ada perselisihan data ("bot salah baca" vs "memang salah input").

## 7. Kepatuhan & Privasi Data (Konteks Indonesia)

- Data yang diproses termasuk data pribadi terbatas (nama staf, nomor telepon) — perlu diperhatikan prinsip **UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)**:
  - Gunakan data staf hanya untuk keperluan operasional pencatatan pengeluaran (purpose limitation).
  - Informasikan ke staf bahwa nomor WA & aktivitas pencatatan mereka akan disimpan dalam sistem internal (transparansi minimal, bisa lewat pesan onboarding bot).
  - Terapkan retensi data yang wajar — foto struk & data transaksi bisa disimpan sesuai kebutuhan pembukuan perusahaan (umumnya beberapa tahun untuk keperluan pajak/audit), bukan disimpan tanpa batas tanpa alasan.
- Karena ini sistem **internal** (bukan produk yang diakses publik), risiko kepatuhan relatif lebih rendah dibanding aplikasi consumer-facing, tapi praktik dasar di atas tetap disarankan sebagai *good hygiene*.

## 8. Backup & Recovery

- Supabase menyediakan backup otomatis (tergantung plan) — pastikan plan yang dipakai punya **point-in-time recovery** minimal untuk beberapa hari terakhir.
- Google Sheets adalah **turunan**, bukan source of truth — jika Sheets rusak/terhapus tidak sengaja, data asli tetap aman di Supabase dan bisa di-generate ulang ke Sheets baru.
- Foto struk di Supabase Storage sebaiknya di-backup berkala (misal export bulanan) mengingat ini bukti pendukung finansial yang penting.

## 9. Incident Response (Dasar)

| Skenario | Langkah |
|---|---|
| API key bocor | Segera revoke/rotate key terkait di masing-masing platform (Meta, Google/Groq, Supabase); cek log penggunaan abnormal |
| Nomor WA (device Fonnte) diblokir/dibanned WhatsApp | Segera scan ulang QR di device cadangan yang sudah disiapkan; hindari pola pengiriman yang mirip spam (jangan pakai device yang sama untuk broadcast/blast lain); ini risiko bawaan karena memakai gateway unofficial, bukan WA Business API resmi |
| Data mencurigakan (transaksi aneh/fiktif) terdeteksi | Cek `audit_log` untuk jejak lengkap; nonaktifkan sementara nomor staf terkait dari whitelist sambil investigasi |
| Google Sheets ter-share tidak sengaja ke pihak luar | Segera ubah sharing permission; review siapa saja yang sempat punya akses |

## 10. Checklist Keamanan Sebelum Go-Live

- [ ] Webhook signature verification aktif dan teruji
- [ ] RLS aktif di semua tabel Supabase
- [ ] Bucket foto struk bersifat privat (bukan public)
- [ ] Semua secrets di environment variables, bukan hardcoded
- [ ] Google Sheets sharing dibatasi hanya ke email yang relevan
- [ ] Service account Google hanya punya scope minimal (1 spreadsheet)
- [ ] Rate limiting per nomor aktif
- [ ] Whitelist staf sudah final & terverifikasi (tidak ada nomor eks-staf yang masih aktif)
- [ ] Backup/retensi data sudah ditentukan
