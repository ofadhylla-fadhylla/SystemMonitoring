# V8.15.1 — Monitoring Non Spasial Fetch Fix

Fix untuk error `Monitoring gagal: fetch failed` pada Vercel.

Perubahan:
- mencoba GDELT HTTPS
- retry ke GDELT HTTP
- jika GDELT tidak dapat diakses, otomatis fallback ke Google News RSS
- fallback melakukan pencarian umum + positive theme + negative theme
- sentiment fallback diklasifikasikan secara keyword-assisted
- UI menampilkan sumber aktual yang digunakan

Upload ke GitHub:
- `app/api/non-spatial-monitoring/route.js`
- `app/non-spatial-monitoring/page.js`

Tidak ada SQL baru.
