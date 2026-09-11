# V8.15.4 — Legal PT Name + Area Filter

Monitoring Non Spasial sekarang memfilter berita dengan:

1. Nama legal PT (tanpa singkatan perusahaan)
2. Area operasional dari Master Company & Site (province, region, site location)
3. Area tambahan opsional dari user

Jika area master tersedia, query menjadi konsep: "Nama Legal PT" AND ("Area 1" OR "Area 2" ...).
Ini mengurangi false positive untuk nama PT yang kebetulan sama/serupa di lokasi lain.

Tidak ada SQL baru. Upload:
- app/api/non-spatial-monitoring/route.js
- app/non-spatial-monitoring/page.js
