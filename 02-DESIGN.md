# Design Document — Inland Expense Tracker (IET)
**Versi:** 1.0 | **Tanggal:** 1 September 2026

Dokumen ini menjabarkan desain pengalaman pengguna (UX flow di WhatsApp), struktur spreadsheet, dan tampilan pendukung (jika ada) untuk IET. Karena antarmuka utama adalah **percakapan WhatsApp**, "desain" di sini lebih ke desain *flow* dan *copy* percakapan, bukan wireframe visual klasik.

---

## 1. Prinsip Desain

1. **Zero extra app** — staf tidak perlu install/buka aplikasi baru. Semua interaksi lewat WhatsApp yang sudah mereka pakai.
2. **Minim friksi** — cukup kirim foto, tidak perlu ketik format tertentu untuk kasus normal.
3. **Konfirmasi jelas & cepat** — staf harus tahu dalam hitungan detik apakah datanya berhasil tercatat.
4. **Koreksi mudah** — kalau bot salah baca, staf cukup balas chat singkat, bukan mengulang dari awal.
5. **Transparan** — selalu tunjukkan apa yang "dibaca" bot dari struk, jangan diam-diam menyimpan data tanpa konfirmasi.

## 2. Alur Percakapan Utama (Happy Path)

```
[Staf] → kirim foto struk ke nomor bot WA
[Bot]  → "📸 Struk diterima, sedang diproses..."
       (proses OCR + klasifikasi, ~5-15 detik)
[Bot]  → ✅ Pengeluaran tercatat!
         🏪 Merchant: Indomaret Cipayung
         📅 Tanggal : 1 Sep 2026
         💰 Nominal : Rp 145.000
         🏷️ Kategori: ATK & Perlengkapan
         👤 Dicatat oleh: Gilang

         Kalau ada yang salah, balas dengan format:
         "kategori: transport" atau "nominal: 150000"
[Staf] → (tidak membalas apa-apa → data dianggap final setelah X menit)
```

## 3. Alur Koreksi Data

```
[Bot]  → ✅ Pengeluaran tercatat! ... 🏷️ Kategori: Lain-lain
[Staf] → "kategori: konsumsi klien"
[Bot]  → ✅ Kategori diperbarui jadi "Konsumsi & Entertain Klien"
         Data di spreadsheet sudah disesuaikan.
```

Format koreksi didesain simpel — kata kunci di depan (`kategori:`, `nominal:`, `catatan:`) diikuti nilai baru. Tidak perlu menyebut ulang transaksi mana, karena bot mengasumsikan koreksi merujuk ke transaksi terakhir dari nomor tersebut (dengan window waktu, misal 15 menit, untuk menghindari salah kaitkan ke transaksi lama).

## 4. Alur Struk Tidak Terbaca / Buram

```
[Staf] → kirim foto struk buram
[Bot]  → ⚠️ Maaf, struk sulit terbaca dengan jelas.
         Bisa kirim ulang foto yang lebih terang/tidak blur?

         Atau ketik manual dengan format:
         "manual: [merchant] | [nominal] | [kategori]"
         Contoh: manual: Indomaret | 145000 | ATK
[Staf] → "manual: Indomaret | 145000 | ATK"
[Bot]  → ✅ Pengeluaran tercatat secara manual!
         🏪 Indomaret · 💰 Rp 145.000 · 🏷️ ATK
```

## 5. Alur Nomor Tidak Terdaftar (Whitelist)

```
[Orang tak dikenal] → kirim foto ke bot
[Bot] → "Maaf, nomor Anda belum terdaftar sebagai staf Inland Property.
         Hubungi admin untuk pendaftaran."
```
Tidak ada data yang diproses/disimpan dari nomor di luar whitelist (lihat dokumen Security untuk detail).

## 6. Alur Duplikat Terdeteksi

```
[Staf] → kirim ulang foto struk yang sama (tidak sengaja)
[Bot] → "⚠️ Struk ini kelihatannya sudah pernah dicatat 3 menit lalu
         (Indomaret, Rp 145.000). Tetap ingin dicatat sebagai
         transaksi baru? Balas 'ya, catat lagi' untuk lanjut."
```

## 7. Pesan Bantuan / Onboarding

Ketika staf baru pertama kali chat bot (atau kirim teks "help"/"bantuan"):

```
👋 Halo! Saya bot pencatat pengeluaran kantor Inland Property.

Cara pakai:
1. Foto struk pengeluaran kantor
2. Kirim ke chat ini
3. Saya akan baca & catat otomatis ke spreadsheet finance

Kalau ada koreksi, tinggal balas chat setelah konfirmasi muncul.
Ketik "riwayat" untuk lihat 5 pengeluaran terakhir yang kamu catat.
```

## 8. Perintah Tambahan (Nice-to-have, Fase 2)

| Perintah | Fungsi |
|---|---|
| `riwayat` | Menampilkan 5 pengeluaran terakhir yang dicatat staf tsb |
| `total bulan ini` | Total pengeluaran yang sudah dicatat staf tsb bulan berjalan |
| `bantuan` / `help` | Menampilkan panduan pemakaian |

## 9. Struktur Spreadsheet (Google Sheets)

Sheet utama **"Pengeluaran"** dengan kolom:

| Kolom | Deskripsi |
|---|---|
| ID Transaksi | ID unik (auto) |
| Tanggal Transaksi | Tanggal di struk (bukan tanggal input) |
| Tanggal Input | Timestamp saat foto diterima bot |
| Nama Merchant | Hasil ekstraksi OCR |
| Nominal (Rp) | Nominal total |
| Kategori | Kategori pengeluaran |
| Dicatat Oleh | Nama staf (dari mapping nomor WA) |
| Status | "Auto" / "Dikoreksi Manual" / "Input Manual" / "Perlu Review" |
| Link Foto Struk | Link ke file gambar (Supabase Storage/Google Drive) |
| Catatan | Catatan tambahan opsional |

Sheet kedua **"Kategori Master"** — daftar kategori resmi (dropdown data validation di kolom Kategori pada sheet utama), sekaligus jadi referensi klasifikasi otomatis oleh sistem.

Sheet ketiga (opsional, Fase 2) **"Ringkasan Bulanan"** — pivot table otomatis (total per kategori per bulan) untuk kebutuhan owner.

## 10. Desain Notifikasi Ringkasan (Fase 2, opsional)

Setiap Senin pagi, bot mengirim ke grup WA finance/owner:

```
📊 Ringkasan Pengeluaran Minggu Lalu (25–31 Agu 2026)
Total: Rp 3.240.000 (12 transaksi)

Breakdown:
🏷️ ATK & Perlengkapan   : Rp 850.000
🏷️ Transport            : Rp 620.000
🏷️ Konsumsi & Entertain : Rp 1.100.000
🏷️ Lain-lain            : Rp 670.000

Lihat detail lengkap: [link spreadsheet]
```

## 11. Prinsip Copywriting Bot

- Gunakan emoji secukupnya sebagai penanda visual cepat (📸💰🏷️✅⚠️), tidak berlebihan.
- Bahasa Indonesia santai-profesional, bukan kaku formal.
- Selalu beri tahu langkah selanjutnya jika ada aksi yang dibutuhkan dari staf.
- Pesan error selalu disertai solusi konkret (bukan sekadar "gagal").
