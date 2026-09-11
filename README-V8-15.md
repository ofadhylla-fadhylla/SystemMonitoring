# V8.15 — Monitoring Non Spasial

Menambahkan menu **Monitoring Non Spasial** untuk generate pemberitaan positif/negatif berdasarkan periode dan entity.

## Fitur
- Periode start/end
- Pilih KPN Plantations Group, PT aktif dari Master Company, atau custom entity
- Keyword tambahan
- Bahasa Indonesia / semua bahasa
- Positive & Negative coverage (indikasi GDELT machine tone)
- Executive Insight dan headline themes
- Open article, Print/Save PDF, Download CSV

## Data source
GDELT DOC 2.0 via Next.js server route. Tidak memerlukan API key.

Catatan: article-list otomatis ditujukan untuk rentang sekitar 3 bulan terakhir. Tone adalah indikasi otomatis dan tetap membutuhkan human review.

## Install
Upload ke GitHub:
- app/non-spatial-monitoring
- app/api/non-spatial-monitoring
- components/Sidebar.js

Tidak ada SQL baru dan tidak ada environment variable baru.
