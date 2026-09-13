# SIMS V1.1 — Simple PT-First Assessment Flow

## Tujuan
SIMS V1.1 menyederhanakan penggunaan Sustainability Assessment. User tidak perlu upload/import Excel ketika melakukan assessment.

Alur user:

`Pilih PT → pilih standard/tahun → assessment tampil otomatis → isi status & explanation → upload evidence → verifier review → gap masuk Action Plan → Compliance Level terhitung otomatis.`

## Modul
1. Sustainability Assessment
2. Sustainability Action Plan
3. Sustainability Compliance Level

## Sumber master
Master ISPO Permentan 33/2025 berasal dari workbook KPN `SIMS - KPN - NDPE - ISPO Permentan 33 2025.xlsx`, sheet `Draft`.

Master disimpan sekali di Supabase pada tabel:
- `sims_standards`
- `sims_principles`
- `sims_criteria`
- `sims_indicators`

Setelah master terpasang, user tidak perlu mengunggah workbook lagi.

## Instalasi
### 1. Database schema
Pastikan `SUPABASE-SIMS-V1.sql` sudah pernah dijalankan di Supabase SQL Editor.

### 2. Master ISPO
Jalankan file `SUPABASE-SIMS-ISPO-MASTER-V1-1.sql` di Supabase SQL Editor. Script master dibuat dari workbook KPN dan menghasilkan 9 Principles, 50 kelompok Criteria yang memiliki mapped indicators, dan 176 Indicators.

Script master memiliki proteksi: refresh master akan dihentikan apabila sudah terdapat `sims_assessment_items`, agar hasil assessment/evidence tidak terhapus tanpa sengaja.

### 3. Deploy aplikasi
Merge branch `sims-v1-1-simple-flow` ke `main`. Vercel akan melakukan deployment otomatis.

### 4. Test
Buka `Sustainability Assessment` lalu:
- pilih PT;
- pilih `ISPO Permentan 33/2025`;
- pilih tahun assessment;
- assessment dimuat otomatis.

Tidak ada lagi tombol `Import Master Excel` pada flow user.

## Perhitungan Compliance
Compliance dihitung dari indikator yang memenuhi kedua kondisi:
- `self_status = Fulfilled`
- `verifier_status = Verified`

Rumus:

`Verified Fulfilled Indicators / Total Active Indicators × 100%`

## Gap & Action Plan
Saat indicator disimpan dengan status `Not Fulfilled`, sistem otomatis membuat record pada `sims_action_plans`. User kemudian melengkapi action, PIC, priority, deadline, status, completion evidence, dan verification.

## Evidence
Evidence assessment disimpan pada private Supabase Storage bucket `sims-evidence`.

## Catatan
PT dibaca dari Master Company (`companies`) dan site/unit dibaca dari `sites`; tidak dibuat master perusahaan terpisah khusus SIMS.
