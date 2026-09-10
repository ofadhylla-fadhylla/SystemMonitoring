# V8.12 — AI Recommendation Upgrade

Patch ini hanya mengubah logika AI Insight pada modul Penawaran Harga. Form input vendor tetap seperti versi sebelumnya.

Perubahan utama:
- AI dapat merekomendasikan vendor terbaik tanpa harus memilih vendor terlebih dahulu.
- Analisis membandingkan biaya all-in, travel/lodging/meals, standar pesawat, hotel/penginapan, transport darat, termin pembayaran, validitas penawaran, estimasi sertifikat, kerja Sabtu/Minggu, dan kelengkapan data.
- Ranking menampilkan skor Logistics, Speed, Payment, dan Total Score.
- Insight menjelaskan vendor termurah, vendor tercepat, vendor dengan logistics terbaik, risiko/gap data, dan perbandingan dengan vendor yang dipilih saat ini.
- Tidak ada perubahan database/SQL.

Upload ke GitHub:
- app/quotations/page.js
- app/quotations/page.module.css

Commit suggestion:
`Improve vendor AI recommendation and logistics analysis`
