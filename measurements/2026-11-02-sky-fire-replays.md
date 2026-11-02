# Sky fire, the four replays

Run: 2026-11-02T12:53:19.192Z · node scripts/measure-fire-replays.mjs · the Virginia Beach Fishing Pier · aerosol 0.1 (2 Nov's Open-Meteo figure for 11:00 GMT was 0.09) · station: KORF's report nearest the sunrise, within 2 h

| sunrise | what happened | station | verdict | per layer | colour clock |
|---|---|---|---|---|---|
| 2026-10-29 7:24 AM | low deck lit from under: it fired | KORF 291151Z 04005KT 10SM OVC034 17/15 | Fire likely (5 of 5) | 5 of 5 see lit low deck | Low deck glows 7:16 AM–7:34 AM · deepest red 7:25 AM · be set up by 7:11 AM |
| 2026-11-02 6:28 AM | high cirrus, clear low horizon: it fired | KORF 021151Z 05004KT 10SM CLR 14/12 | Fire likely (4 of 5) | 4 of 5 see lit high cirrus | High cirrus glows 6:01 AM–6:11 AM · deepest red 6:05 AM · be set up by 5:56 AM |
| 2026-10-30 7:25 AM | clear sky | KORF 301151Z 23004KT 6SM BR CLR | Fire unlikely: no clouds to catch the light (0 of 5) | None of 5 models see a lit layer | — |
| 2026-10-11 7:07 AM | overcast at 800 ft, rain | KORF 111051Z 14013G25KT 9SM OVC008 22/21 | Fire unlikely: a lid of cloud (0 of 5) | None of 5 models see a lit layer | No cloud the forecast has is lit in this hour. |

## 2026-10-29

| model | layer | canvas | gap | not blocked | fires |
|---|---|---|---|---|---|
| mean (the clock) | high cirrus | high cirrus 30% over you, lit edge 25 km toward the sun | open: 100% of the light gets through | hidden by the low deck over you, 100% | no |
| mean (the clock) | low deck | low deck 65% over you, lit edge 100 km toward the sun | open: 74% of the light gets through, low deck 18% where the ray crosses it, 102–156 km | the lowest deck, 65% over you: nothing under it | yes |
| Best match | low deck | low deck 100% over you, lit edge 100 km toward the sun | partial: 57% of the light gets through, low deck 43% where the ray crosses it, 102–156 km | the lowest deck, 100% over you: nothing under it | yes |
| HRRR | low deck | low deck 100% over you, lit edge 100 km toward the sun | partial: 57% of the light gets through, low deck 43% where the ray crosses it, 102–156 km | the lowest deck, 100% over you: nothing under it | yes |
| GFS | low deck | low deck 100% over you, lit edge 100 km toward the sun | partial: 57% of the light gets through, low deck 43% where the ray crosses it, 102–156 km | the lowest deck, 100% over you: nothing under it | yes |
| ECMWF | high cirrus | high cirrus 51% over you, lit edge 100 km toward the sun | open: 100% of the light gets through | hidden by the low deck over you, 100% | no |
| ECMWF | low deck | low deck 52% over you, lit edge 0 km toward the sun | partial: 58% of the light gets through, low deck 41% where the ray crosses it, 2–62 km | the lowest deck, 52% over you: nothing under it | yes |
| ICON | high cirrus | high cirrus 94% over you, lit edge 50 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 100% | no |
| ICON | mid deck | mid deck 96% over you, lit edge 100 km toward the sun | open: 69% of the light gets through, mid deck 31% where the ray crosses it, 102–400 km (past 400 km not asked) | hidden by the low deck over you, 100% | no |
| ICON | low deck | low deck 38% over you, lit edge 0 km toward the sun | partial: 38% of the light gets through, mid deck 50% where the ray crosses it, 64–194 km | the lowest deck, 38% over you: nothing under it | yes |
| GEM | low deck | low deck 33% over you, lit edge 0 km toward the sun | open: 81% of the light gets through, low deck 19% where the ray crosses it, 2–62 km | the lowest deck, 33% over you: nothing under it | yes |

## 2026-11-02

| model | layer | canvas | gap | not blocked | fires |
|---|---|---|---|---|---|
| mean (the clock) | high cirrus | high cirrus 60% over you, lit edge 300 km toward the sun | open: 100% of the light gets through (past 400 km not asked); KORF reports no low cloud: the low gap is open | mid deck 8%, low deck 0% over you, under 70% | yes |
| Best match | high cirrus | high cirrus 48% over you, lit edge 100 km toward the sun | open: 100% of the light gets through, mid deck 0% where the ray crosses it, 208–338 km; KORF reports no low cloud: the low gap is open | mid deck 0%, low deck 0% over you, under 70% | yes |
| HRRR | high cirrus | high cirrus 48% over you, lit edge 100 km toward the sun | open: 100% of the light gets through, mid deck 0% where the ray crosses it, 208–338 km; KORF reports no low cloud: the low gap is open | mid deck 0%, low deck 0% over you, under 70% | yes |
| GFS | high cirrus | high cirrus 48% over you, lit edge 100 km toward the sun | open: 100% of the light gets through, mid deck 0% where the ray crosses it, 208–338 km; KORF reports no low cloud: the low gap is open | mid deck 0%, low deck 0% over you, under 70% | yes |
| ECMWF | high cirrus | high cirrus 99% over you, lit edge 300 km toward the sun | open: 100% of the light gets through (past 400 km not asked); KORF reports no low cloud: the low gap is open | mid deck 10%, low deck 0% over you, under 70% | yes |
| ICON | high cirrus | high cirrus 100% over you, lit edge 300 km toward the sun | open: 100% of the light gets through, mid deck 0% where the ray crosses it, 366–400 km (past 400 km not asked); KORF reports no low cloud: the low gap is open | mid deck 14%, low deck 0% over you, under 70% | yes |

## 2026-10-30

| model | layer | canvas | gap | not blocked | fires |
|---|---|---|---|---|---|

## 2026-10-11

| model | layer | canvas | gap | not blocked | fires |
|---|---|---|---|---|---|
| mean (the clock) | high cirrus | high cirrus 84% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 92% | no |
| mean (the clock) | mid deck | mid deck 94% over you, lit edge 200 km toward the sun | closed: 2% of the light gets through, mid deck 98% where the ray crosses it, 202–316 km | hidden by the low deck over you, 100% | no |
| mean (the clock) | low deck | low deck 93% over you, lit edge 50 km toward the sun | closed: 1% of the light gets through, mid deck 94% where the ray crosses it, 82–140 km | the lowest deck, 93% over you: nothing under it | no |
| Best match | high cirrus | high cirrus 99% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 100% | no |
| Best match | mid deck | mid deck 100% over you, lit edge 200 km toward the sun | closed: 2% of the light gets through, mid deck 98% where the ray crosses it, 202–316 km | hidden by the low deck over you, 100% | no |
| Best match | low deck | low deck 100% over you, lit edge 50 km toward the sun | closed: 0% of the light gets through, low deck 100% where the ray crosses it, 52–110 km | the lowest deck, 100% over you: nothing under it | no |
| HRRR | high cirrus | high cirrus 99% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 100% | no |
| HRRR | mid deck | mid deck 100% over you, lit edge 200 km toward the sun | closed: 2% of the light gets through, mid deck 98% where the ray crosses it, 202–316 km | hidden by the low deck over you, 100% | no |
| HRRR | low deck | low deck 100% over you, lit edge 50 km toward the sun | closed: 0% of the light gets through, low deck 100% where the ray crosses it, 52–110 km | the lowest deck, 100% over you: nothing under it | no |
| GFS | high cirrus | high cirrus 99% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 100% | no |
| GFS | mid deck | mid deck 100% over you, lit edge 200 km toward the sun | closed: 2% of the light gets through, mid deck 98% where the ray crosses it, 202–316 km | hidden by the low deck over you, 100% | no |
| GFS | low deck | low deck 100% over you, lit edge 50 km toward the sun | closed: 0% of the light gets through, low deck 100% where the ray crosses it, 52–110 km | the lowest deck, 100% over you: nothing under it | no |
| ECMWF | high cirrus | high cirrus 100% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 80% | no |
| ECMWF | mid deck | mid deck 77% over you, lit edge 200 km toward the sun | closed: 8% of the light gets through, mid deck 92% where the ray crosses it, 202–352 km | hidden by the low deck over you, 100% | no |
| ECMWF | low deck | low deck 73% over you, lit edge 50 km toward the sun | closed: 10% of the light gets through, mid deck 71% where the ray crosses it, 82–140 km | the lowest deck, 73% over you: nothing under it | no |
| ICON | high cirrus | high cirrus 100% over you, lit edge 300 km toward the sun | open: 100% of the light gets through | hidden by the mid deck over you, 100% | no |
| ICON | mid deck | mid deck 100% over you, lit edge 200 km toward the sun | closed: 0% of the light gets through, mid deck 100% where the ray crosses it, 202–400 km (past 400 km not asked) | hidden by the low deck over you, 100% | no |
| ICON | low deck | low deck 93% over you, lit edge 50 km toward the sun | closed: 0% of the light gets through, mid deck 100% where the ray crosses it, 112–208 km | the lowest deck, 93% over you: nothing under it | no |
| GEM | mid deck | mid deck 93% over you, lit edge 200 km toward the sun | closed: 0% of the light gets through, mid deck 100% where the ray crosses it, 202–400 km (past 400 km not asked) | hidden by the low deck over you, 100% | no |
| GEM | low deck | low deck 100% over you, lit edge 50 km toward the sun | closed: 0% of the light gets through, mid deck 100% where the ray crosses it, 112–208 km | the lowest deck, 100% over you: nothing under it | no |
