# The drone view over a long flight, before and after

Batch Flow, Section 1. Written 2026-11-10T02:04:05.480Z by scripts/measure-drone-flight.mjs from the run logs named below.

Parameters: WebKit (Playwright), 390 x 844, the gate's fixture proxy (fixture imagery), Sandbridge 36.7213, -75.9257, 02:00 UTC on 10 Nov (night), the Real look, about 190 ft; straight runs at full forward stick in Normal mode (12 m/s, about 7 km in 10 minutes), circling runs at 0.7 forward with the yaw stick reversed every 10 s. Two straight runs (before and after) ran at the same time, so their frame rates share one machine.

## Before the fix: 10 minutes straight out

Log: /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/leak-before.log

| seconds | sample | fps | textures | geometries | ground pieces | ground canvas MB | distance |
|---|---|---|---|---|---|---|---|
| 51 | t+20s | 60 | 45 | 51 | 152 | 190 | 707 ft |
| 71 | t+40s | 61 | 45 | 51 | 152 | 190 | 1487 ft |
| 91 | t+60s | 60 | 45 | 51 | 153 | 257 | 2267 ft |
| 111 | t+80s | 62 | 45 | 51 | 153 | 257 | 3068 ft |
| 131 | t+100s | 59 | 45 | 51 | 154 | 324 | 3834 ft |
| 151 | t+120s | 61 | 45 | 51 | 154 | 324 | 4615 ft |
| 171 | t+140s | 60 | 45 | 51 | 155 | 391 | 5401 ft |
| 191 | t+160s | 62 | 45 | 51 | 155 | 391 | 6181 ft |
| 211 | t+180s | 60 | 45 | 51 | 156 | 458 | 6965 ft |
| 231 | t+200s | 62 | 45 | 51 | 156 | 458 | 7746 ft |
| 251 | t+220s | 59 | 44 | 50 | 157 | 526 | 8530 ft |
| 271 | t+240s | 62 | 45 | 51 | 157 | 526 | 9310 ft |
| 291 | t+260s | 60 | 45 | 51 | 158 | 593 | 10092 ft |
| 311 | t+280s | 61 | 45 | 51 | 158 | 593 | 10873 ft |
| 331 | t+300s | 58 | 45 | 51 | 159 | 660 | 11658 ft |
| 351 | t+320s | 62 | 45 | 51 | 159 | 660 | 12439 ft |
| 371 | t+340s | 59 | 45 | 51 | 160 | 727 | 13221 ft |
| 391 | t+360s | 62 | 45 | 51 | 160 | 727 | 14002 ft |
| 411 | t+380s | 59 | 45 | 51 | 161 | 794 | 14783 ft |
| 431 | t+400s | 59 | 45 | 51 | 162 | 861 | 15566 ft |
| 451 | t+420s | 60 | 45 | 51 | 162 | 861 | 16349 ft |
| 471 | t+440s | 60 | 45 | 51 | 163 | 928 | 17130 ft |
| 491 | t+460s | 62 | 45 | 51 | 163 | 928 | 17911 ft |
| 511 | t+480s | 58 | 45 | 51 | 164 | 995 | 18695 ft |
| 531 | t+500s | 62 | 45 | 51 | 164 | 995 | 19475 ft |
| 551 | t+520s | 60 | 45 | 51 | 165 | 1062 | 20259 ft |
| 579 | t+540s |  |  |  |  |  |  | Error: page not answering
| 607 | t+560s |  |  |  |  |  |  | Error: page not answering
| 635 | t+580s |  |  |  |  |  |  | Error: page not answering
| 663 | t+600s |  |  |  |  |  |  | Error: page not answering

## After the fix: 10 minutes straight out

Log: /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/leak-after.log

| seconds | sample | fps | textures | geometries | ground pieces | ground canvas MB | distance |
|---|---|---|---|---|---|---|---|
| 51 | t+20s | 61 | 46 | 54 | 151 | 123 | 709 ft |
| 71 | t+40s | 61 | 46 | 54 | 151 | 123 | 1492 ft |
| 91 | t+60s | 60 | 46 | 54 | 151 | 123 | 2275 ft |
| 111 | t+80s | 62 | 46 | 54 | 151 | 123 | 3055 ft |
| 131 | t+100s | 59 | 46 | 54 | 151 | 123 | 3838 ft |
| 151 | t+120s | 61 | 46 | 54 | 151 | 123 | 4619 ft |
| 171 | t+140s | 60 | 46 | 54 | 151 | 123 | 5402 ft |
| 191 | t+160s | 62 | 46 | 54 | 151 | 123 | 6183 ft |
| 211 | t+180s | 59 | 46 | 54 | 151 | 123 | 6967 ft |
| 231 | t+200s | 62 | 46 | 54 | 151 | 123 | 7747 ft |
| 251 | t+220s | 59 | 46 | 54 | 151 | 123 | 8528 ft |
| 271 | t+240s | 62 | 46 | 54 | 151 | 123 | 9309 ft |
| 291 | t+260s | 59 | 46 | 54 | 151 | 123 | 10094 ft |
| 311 | t+280s | 61 | 46 | 54 | 151 | 123 | 10874 ft |
| 331 | t+300s | 58 | 46 | 54 | 151 | 123 | 11655 ft |
| 351 | t+320s | 62 | 46 | 54 | 151 | 123 | 12435 ft |
| 371 | t+340s | 58 | 46 | 54 | 151 | 123 | 13219 ft |
| 391 | t+360s | 62 | 46 | 54 | 151 | 123 | 13999 ft |
| 411 | t+380s | 58 | 46 | 54 | 151 | 123 | 14782 ft |
| 431 | t+400s | 59 | 46 | 54 | 151 | 123 | 15568 ft |
| 451 | t+420s | 62 | 46 | 54 | 151 | 123 | 16348 ft |
| 471 | t+440s | 60 | 46 | 54 | 151 | 123 | 17127 ft |
| 491 | t+460s | 61 | 46 | 54 | 151 | 123 | 17927 ft |
| 511 | t+480s | 57 | 46 | 54 | 151 | 123 | 18691 ft |
| 531 | t+500s | 62 | 46 | 54 | 151 | 123 | 19473 ft |
| 551 | t+520s | 59 | 46 | 54 | 151 | 123 | 20253 ft |
| 571 | t+540s | 62 | 46 | 54 | 151 | 123 | 21033 ft |
| 591 | t+560s | 61 | 46 | 54 | 151 | 123 | 21813 ft |
| 611 | t+580s | 62 | 46 | 54 | 151 | 123 | 22594 ft |
| 631 | t+600s | 58 | 46 | 54 | 151 | 123 | 23378 ft |
| 631 | ERRORS |  |  |  |  |  |  | [631s] ERRORS []

## After the fix: 5 minutes circling at 196 ft

Log: /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/crash.log

| seconds | sample | fps | textures | geometries | ground pieces | ground canvas MB | distance |
|---|---|---|---|---|---|---|---|
| 19 | fly |  |  |  |  |  |  | [19s] fly up true
| 30 | climbed |  | 46 | 54 | 151 | 123 |  | null
| 45 | out |  | 46 | 54 | 151 | 123 |  | null
| 55 | t+10s | 57 | 152 | 160 | 151 | 123 |  | null
| 65 | t+20s | 61 | 152 | 160 | 151 | 123 |  | null
| 75 | t+30s | 61 | 152 | 160 | 151 | 123 |  | null
| 85 | t+40s | 61 | 152 | 160 | 151 | 123 |  | null
| 95 | t+50s | 61 | 152 | 160 | 151 | 123 |  | null
| 105 | t+60s | 61 | 152 | 160 | 151 | 123 |  | null
| 115 | t+70s | 62 | 152 | 160 | 151 | 123 |  | null
| 125 | t+80s | 62 | 152 | 160 | 151 | 123 |  | null
| 135 | t+90s | 62 | 152 | 160 | 151 | 123 |  | null
| 145 | t+100s | 61 | 152 | 160 | 151 | 123 |  | null
| 155 | t+110s | 62 | 152 | 160 | 151 | 123 |  | null
| 165 | t+120s | 61 | 152 | 160 | 151 | 123 |  | null
| 175 | t+130s | 62 | 152 | 160 | 151 | 123 |  | null
| 185 | t+140s | 61 | 152 | 160 | 151 | 123 |  | null
| 195 | t+150s | 61 | 152 | 160 | 151 | 123 |  | null
| 205 | t+160s | 61 | 152 | 160 | 151 | 123 |  | null
| 215 | t+170s | 61 | 152 | 160 | 151 | 123 |  | null
| 225 | t+180s | 61 | 152 | 160 | 151 | 123 |  | null
| 235 | t+190s | 60 | 152 | 160 | 151 | 123 |  | null
| 245 | t+200s | 60 | 152 | 160 | 151 | 123 |  | null
| 255 | t+210s | 61 | 152 | 160 | 151 | 123 |  | null
| 265 | t+220s | 62 | 152 | 160 | 151 | 123 |  | null
| 275 | t+230s | 62 | 152 | 160 | 151 | 123 |  | null
| 285 | t+240s | 62 | 152 | 160 | 151 | 123 |  | null
| 295 | t+250s | 62 | 152 | 160 | 151 | 123 |  | null
| 305 | t+260s | 62 | 152 | 160 | 151 | 123 |  | null
| 315 | t+270s | 62 | 152 | 160 | 151 | 123 |  | null
| 325 | t+280s | 61 | 152 | 160 | 151 | 123 |  | null
| 335 | t+290s | 62 | 152 | 160 | 151 | 123 |  | null
| 345 | t+300s | 62 | 152 | 160 | 151 | 123 |  | null
| 345 | ERRORS |  |  |  |  |  |  | [345s] ERRORS []
