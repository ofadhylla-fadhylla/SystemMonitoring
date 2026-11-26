# GeoWatch iteration 1
- Import WGS84 GeoJSON, KML Point/Polygon and CSV point alerts; enforce geometry type, coordinate ranges, closed rings, input/output size and vertex limits.
- Require company for concession layer and supplier for supplier boundary.
- Alert Register screens imported point observations against registered concession polygons (including holes and boundary points), date filters, source labels, CSV export. Polygon alerts explicitly require overlap review; no inference of zero risk from missing coverage.
- Map layer selector and differentiated layer colors. Existing supplier screening remains available and preliminary.
- Source: NASA FIRMS active-fire downloads https://firms.modaps.eosdis.nasa.gov/active_fire/ . Live area API requires MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/area/ . Not configured; no scheduled feed.
- SHP ZIP, polygon intersection area, continuous satellite deforestation monitoring and alerts are pending. Convert SHP to WGS84 GeoJSON in QGIS for now. No new external dependencies or database schema modifications.
- UAT: import sample GeoJSON polygon with hole, KML point, FIRMS CSV; verify invalid coordinates rejected, map tabs, point inside/outside/hole and no-boundary cases, CSV export and scoped access. Do not upload test records into the shared operational database.
