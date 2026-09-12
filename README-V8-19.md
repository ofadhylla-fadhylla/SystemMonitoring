# V8.19 — Local Kawasan Hutan Master

Kawasan Hutan no longer depends on the Kementerian Kehutanan web service.
It uses the user-uploaded SHP converted to a bundled GeoJSON master and performs point-in-polygon screening server-side.

## Uploaded SHP inventory
- Geometry: Polygon
- CRS: WGS 84 / EPSG:4326
- Feature count: 5
- HUTAN classes: {'HP': 1, 'HPK': 4}
- Coverage bbox: [103.19898513263252, -2.106853845260084, 103.31923252147352, -1.9999190588726687]

## Important coverage rule
If a supplier coordinate lies outside the dataset bbox, the result is **NOT_COVERED / Assessment Incomplete**, not "outside forest area".
If it lies within coverage but does not intersect any uploaded polygon, the result is "no overlap in uploaded master" and the AI explanation explicitly limits the conclusion to this dataset.

## Files to upload/replace in GitHub
- app/api/spatial-screening/route.js
- app/api/spatial-screening/kawasan-hutan-master.json
- app/spatial-monitoring/page.js

No SQL is required for this patch.
