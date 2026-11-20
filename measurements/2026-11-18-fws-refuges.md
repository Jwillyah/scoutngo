# FWS refuge boundaries, baked (Batch SIMPLE-1, Section 3)

Run: node scripts/bake-refuges.mjs, 2026-11-18T18:20:42.666Z.

| fact | value |
|---|---|
| source | https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/National_Wildlife_Refuge_System_Boundaries/FeatureServer/0 |
| publisher | U.S. Fish and Wildlife Service, National Wildlife Refuge System, Division of Realty |
| licence | US government work, public domain; no key |
| filter | `RSL_TYPE = 'NWR'` (no geometry, no place in any request) |
| FWS stations in the layer | 1085 |
| refuges asked for | 550 |
| refuges kept (with geometry) | 550 |
| refuges with no geometry | 0 |
| points kept | 301327 |
| outside Alaska | 534 refuges, `RSL_TYPE = 'NWR' AND FWSREGION <> '7'`, maxAllowableOffset 0.00025° server-side, 164383 points |
| Alaska (FWS region 7) | 16 refuges, `RSL_TYPE = 'NWR' AND FWSREGION = '7'`, maxAllowableOffset 0.002° server-side, 136944 points |
| rings left out, each under 1000 m² | 36719 rings, 5226164 m² in all |
| coordinates | outSR 4326, integers at 1/100000° |
| src/data/refuges.ts | 2281076 bytes, 1107271 gzipped |
