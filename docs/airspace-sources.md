# Airspace and park data: where it comes from

Everything here is baked into the app, so a lookup sends no coordinate anywhere
and works with no signal. All of it is United States government data, public
domain, used with no key and no account. Re-bake on the FAA's 56-day chart cycle.

| layer | source | baker | what is kept |
|---|---|---|---|
| Class B, C, D and surface-area E | FAA Class Airspace feature service, `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0` | `scripts/bake-faa.mjs` | surface areas only (`CLASS IN ('B','C','D')` or Class E with a surface floor), nationwide, simplified at 0.00025° |
| Facility map grid ceilings | FAA UAS Facility Map Data, `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0` | `scripts/bake-faa.mjs` | every half arc-minute cell nationwide, its ceiling, classes, facility and LAANC routes |
| Restricted (R) and prohibited (P) areas | FAA Special Use Airspace, `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0` | `scripts/bake-restrictions.mjs` | `TYPE_CODE IN ('R','P')`, nationwide: 568 areas with floor, ceiling, controlling agency and times of use, simplified at 0.00025° |
| National Park Service units | NPS Land Resources Division boundary service, `https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2` | `scripts/bake-restrictions.mjs` | all 437 units nationwide, simplified at 0.00025° |

Restricted, prohibited and park data fetched 2026-10-25. The class airspace and
grid were baked 2026-10-17 against the chart cycle effective 10/1/2026 (the
dates are carried in the generated files).

## What the layers mean on the card

- **Controlled airspace** (B, C, D, surface E) needs authorization under 14 CFR
  107.41. The facility map ceiling is the most LAANC can approve at that grid
  square. A 0 ft square cannot be approved through LAANC.
- **Restricted and prohibited areas** are not something a LAANC request opens.
  An area's floor is kept as charted: from the ground (`SFC`), from sea level
  (`MSL`) or a flight level (`STD`). A sea-level floor is treated as reaching a
  drone wherever the ground under it is not known, because keeping a drone out
  of an area wrongly costs a shot and putting it in one wrongly is a violation.
- **National Park Service units**: launching, landing or operating a drone from
  inside a unit is closed under 36 CFR 1.5 (NPS policy memorandum 14-05, June
  2014). Units overlap: a scenic trail runs through a park, and every unit at a
  point is reported.

## Fetched on the phone (Batch DRONE, Section 2.3: the Drone page's Airspace tab)

Asked whole, nationwide, with no place in the request (`where=1=1` or a type
filter, no geometry), and kept in Cache Storage with the time they arrived
(`src/lib/faaLiveData.ts`; which is near the marker is worked out on the phone,
`src/core/faaLive.ts`). TFRs again after 30 minutes, the rest after a week;
with no signal the kept copy is shown with its date.

| layer | source |
|---|---|
| National Security UAS Flight Restrictions | `services6.arcgis.com/ssFJjBXIUyZDrSYZ/.../DoD_Mar_13/FeatureServer/0` (layer "National_Security_UAS_Flight_Restrictions") and `.../Part_Time_National_Security_UAS_Flight_Restrictions/FeatureServer/0` |
| FAA-Recognized Identification Areas | `.../FAA_Recognized_Identification_Areas/FeatureServer/0` |
| Heliports (NASR) | `.../US_Airport/FeatureServer/0`, `TYPE_CODE='HP'` |
| Warning, alert and military operations areas | `.../Special_Use_Airspace/FeatureServer/0`, `TYPE_CODE IN ('W','A','MOA')` |
| Temporary flight restrictions | the FAA's TFR map service, `tfr.faa.gov/geoserver/TFR/ows` layer `TFR:V_TFR_LOC`, through this app's `/api/tfr` (an empty POST; tfr.faa.gov sends no CORS header). "Today" is read from the dates in each TFR's title. |

## What the app never checks

NOTAMs other than TFRs, and state, county and city park drone rules (no FAA
dataset carries them). The Plan screen's airspace card still ends by pointing
at tfr.faa.gov. An empty card is a statement about this extract, never
permission to fly.

## Size

`src/data/restrictions.ts` is 1,615,430 bytes, 758,690 gzipped, and is imported
lazily (`src/lib/restrictions.ts`) the first time something asks for it, the
same way `src/data/airspace.ts` is.
