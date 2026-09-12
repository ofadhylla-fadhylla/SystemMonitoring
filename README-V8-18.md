# System Monitoring V8.18 — Supplier Spatial Screening Reliability + AI Explanation

Perubahan utama:

1. Kawasan Hutan memakai query GET + POST + ArcGIS Identify, retry, dan fallback SIGAP.
2. Gambut memakai Peta Lahan Gambut, Fungsi Ekosistem Gambut, dan KHG dari BIG Satu Peta.
3. BHUMI HGU mencoba beberapa format GetFeatureInfo (WMS 1.1.1 / 1.3.0; JSON/text/html).
4. Bila HGU atau Kawasan Hutan tidak tersedia, hasil utama menjadi `ASSESSMENT INCOMPLETE`, bukan Low 0/100.
5. Ditambahkan penjelasan otomatis bergaya AI yang merangkum Kawasan Hutan, Gambut, status HGU/SHM yang diinput, indikasi HGU BHUMI, risiko, dan rekomendasi.
6. Raw diagnostics tetap tersedia untuk troubleshooting.

## Install

Replace/upload ke GitHub:

- `app/api/spatial-screening/route.js`
- `app/spatial-monitoring/page.js`
- `app/spatial-monitoring/page.module.css` (hanya jika Anda memakai file dari paket ini)

Tidak ada SQL baru.

Commit contoh:
`Improve supplier spatial screening and AI explanation`

Setelah Vercel Ready, hard refresh (Ctrl+F5), lalu tes koordinat yang statusnya sudah diketahui.

Catatan penting: BHUMI adalah peta publik dan respons machine-query dapat berubah/tidak queryable. Sistem tidak akan menyimpulkan "tidak ada HGU" bila sumber otomatis tidak tersedia.
