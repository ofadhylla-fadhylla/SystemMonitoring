# V8.16 — Monitoring Spasial + Supplier Risk

Fitur:
- Menu Monitoring Spasial
- Upload GeoJSON polygon / point layers
- Layer types: concession, supplier boundary, HCV/HCS, peat, protected area, deforestation alert, hotspot
- Supplier coordinate input manual
- Batch supplier CSV upload
- HGU / SHM / SHGB / land-document status
- Document verification status
- Interactive Leaflet / OpenStreetMap map
- Supplier spatial overlap screening
- Hotspot distance screening (<= 2 km)
- Supplier risk score: Low / Medium / High / Critical
- Save risk-assessment snapshot to Supabase

Important:
- HGU/SHM values are user-entered / user-verified. This version does not query ATR/BPN automatically.
- Risk score is screening / decision support, not a legal determination.
- V1 polygon upload accepts GeoJSON (.geojson/.json). SHP should be converted to GeoJSON first.

Install:
1. Run SUPABASE-SPATIAL-V8-16.sql in Supabase SQL Editor.
2. Upload app/spatial-monitoring and components/Sidebar.js to GitHub.
3. Wait for Vercel Ready, Ctrl+F5.
