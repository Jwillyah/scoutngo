# Day sheet fixture: Atlantic Park Surf, Sat 21 Nov 2026

Run: 2026-11-24, node scripts/measure-day-sheet-fixture.mjs. Spot 36.851, -75.980, America/New_York. Ours = src/core/daySheet.ts lightEdges (suncalc; the Sky page's marks). Second = src/core/ephemeris2.ts (Meeus, apparent height with refraction; sunrise/sunset at -0.833°). Batch = docs/batches/batch-simple3.md S4.7. Gaps in minutes.

| edge | ours | second ephemeris | batch | ours - second | ours - batch | second - batch |
|---|---|---|---|---|---|---|
| sunrise | 6:48 AM | 6:48 AM | 6:51 AM | +0.0 | -2.6 | -2.6 |
| golden ends (+6° up) | 7:26 AM | 7:26 AM | 7:26 AM | -0.1 | +0.0 | +0.1 |
| golden begins (+6° down) | 4:13 PM | 4:13 PM | 4:12 PM | -0.2 | +1.0 | +1.2 |
| sunset | 4:50 PM | 4:50 PM | 4:47 PM | +0.0 | +3.9 | +3.9 |
| color begins (-4° up; the batch's "blue" 6:31) | 6:29 AM | 6:28 AM | 6:31 AM | +0.4 | -2.0 | -2.4 |
| color ends (-4° down; the batch's "blue" 5:08) | 5:11 PM | 5:10 PM | 5:08 PM | +0.2 | +3.0 | +2.8 |

The batch's S4.7 "blue 4:47-5:08" (and 6:31-6:51) is the afterglow in the app's convention (src/core/skyPage.ts lightMarks: golden +6° to sunset, color sunset to -4°, blue -4° to -6°). The sheet follows the app, so those batch numbers are compared with the color rows above. The app's blue, against the second ephemeris only (tolerance +-2 min):

| edge | ours | second ephemeris | ours - second | within 2 min |
|---|---|---|---|---|
| blue begins (-6° up) | 6:18 AM | 6:17 AM | +0.1 | yes |
| blue ends (-6° down) | 5:21 PM | 5:21 PM | -0.5 | yes |

Solar noon: ours 11:49 AM at 33.2°; second ephemeris 33.1° at the same instant; batch 11:49, 33°.
