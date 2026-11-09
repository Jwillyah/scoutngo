# The tide at Virginia Beach: ours against NOAA's published turns

Batch MAP2, Section 2. Run 2026-11-09T19:32:40.027Z by scripts/measure-tide-vs-noaa.mjs.

Parameters: the Virginia Beach Fishing Pier (36.8436, -75.9713); 20261109 to
20261111; NOAA's tide predictions, MLLW, feet; NOAA's own times in local time
(lst_ldt); ours read in GMT and printed in America/New_York by the app's
clock.

The app's station: 8639168 Virginia Beach, 0.04 km.
The nearest six, nearest first: 8639168 Virginia Beach (0.0 km); 8639207 Rudee Inlet, interior channel (1.3 km); 8639208 Rudee Inlet entrance (1.3 km); 8639214 Rudee Heights, Lake Wesley (2.1 km); 8639219 Lake Rudee, south end (2.3 km); 8638922 Brown Cove (8.8 km).
In the app's order (open coast first): 8639168, 8639208, 8639207, 8639214, 8639219, 8638922.

| Date | Turn | NOAA 8639168 time | NOAA ft | Ours time | Ours ft | Rudee Inlet interior 8639207 time | its ft |
|---|---|---|---|---|---|---|---|
| 11-09 | Low | 00:54 | 0.32 | 12:54 AM | 0.32 | 12:51 AM | 0.15 |
| 11-09 | High | 07:20 | 4.47 | 7:20 AM | 4.47 | 7:15 AM | 4.14 |
| 11-09 | Low | 13:47 | 0.39 | 1:47 PM | 0.39 | 1:41 PM | 0.24 |
| 11-09 | High | 19:35 | 3.39 | 7:35 PM | 3.39 | 7:31 PM | 3.14 |
| 11-10 | Low | 01:28 | 0.39 | 1:28 AM | 0.39 | 1:30 AM | 0.23 |
| 11-10 | High | 07:55 | 4.39 | 7:55 AM | 4.39 | 7:55 AM | 4.06 |
| 11-10 | Low | 14:21 | 0.45 | 2:21 PM | 0.45 | 2:19 PM | 0.31 |
| 11-10 | High | 20:12 | 3.30 | 8:12 PM | 3.30 | 8:11 PM | 3.06 |
| 11-11 | Low | 02:03 | 0.50 | 2:03 AM | 0.50 | 2:07 AM | 0.34 |
| 11-11 | High | 08:31 | 4.25 | 8:31 AM | 4.25 | 8:34 AM | 3.92 |
| 11-11 | Low | 14:57 | 0.55 | 2:57 PM | 0.55 | 2:56 PM | 0.42 |
| 11-11 | High | 20:50 | 3.20 | — | — | — | — |

Ours matches NOAA's published turns for 8639168 to the minute and the
hundredth of a foot (the last row is past the window asked here in GMT).
The station was already the right one: 8639168 is the nearest and on the
open coast, and the old rule took it too. The field check's 6 to 9 minutes
late and 0.3 ft high is not in these turns. Rudee Inlet's interior channel,
1.3 km off, runs up to 6 minutes early and 0.1 to 0.3 ft low; the open-coast
rule keeps it from ever being chosen ahead of the coast station. Where the
field numbers came from is open: the app's height "now" between turns is
drawn from the turns (a subordinate station publishes no curve), so a
reading taken between turns can differ from a curve elsewhere.
