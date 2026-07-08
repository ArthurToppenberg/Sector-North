# Country boundaries

Boundary geometry for the mapped countries, one GeoJSON file per country. Currently
bundled: **belgium, czechia, denmark, france, germany, latvia, lithuania, netherlands,
norway, poland, russia, slovakia, sweden, united-kingdom**.

- **Source:** https://www.geoboundaries.org/countryDownloads.html
- **Coordinates:** lon/lat degrees (WGS84 / CRS84). Prefer simplified geometry — fewer
  points draw faster.
- **Loading:** each file is imported via Vite `?url`, so it is emitted to `dist/` and
  fetched at runtime rather than inlined into the JS bundle. `../../map/geojson.ts` parses
  and strictly validates every file (throws on any structural surprise; range-checks every
  coordinate against WGS84 bounds).
- **Geometry quirk:** geoBoundaries splits some countries (e.g. Norway, with its many
  islands) into multiple polygons, so `geojson.ts` accepts both `Polygon` and
  `MultiPolygon`.

See `apps/game/CLAUDE.md` (§ Module layout) for how this data fits into the app.
