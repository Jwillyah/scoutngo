# Does the app say offline when it is not, or stay offline when it is back?

Run: 2026-10-27T14:37:24.502Z · node scripts/measure-connectivity.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · screen 390 x 844 · nothing saved at the start of each case · watched 60 s from when the fault went on
Faults (Chrome DevTools Protocol): refusing = every request to the host failed at once (ConnectionRefused); hanging = held, never answered; slow 4G = 562.5 ms round trip, 1440 kbps down, 675 kbps up; network gone = Chrome offline, the app's own origin included, put back half way through.
After the fault: the map moved, the time bar moved to 8:30 AM (a new forecast hour), 3D opened. Overpass hosts: overpass-api.de, overpass.kumi.systems, overpass.private.coffee; map tiles tiles.openfreemap.org; photo tiles server.arcgisonline.com.
Pass: with the network up in any form, the top bar never says offline and Wind and Cloud carry a figure at the end. With it gone, the top bar says offline, and says it no longer within 15 s of the network coming back, with no reload.

| case | top bar said offline (s of the watch) | first said it at (s) | network back at (s) | mark gone at (s) | Wind at the end | Cloud at the end | checks of the app origin | page navigation type | pass |
|---|---|---|---|---|---|---|---|---|---|
| network whole (control) | 0.0 | — | — | — | 1 kt | 7% | 0 | navigate | yes |
| slow 4G | 0.0 | — | — | — | 1 kt | 7% | 0 | navigate | yes |
| Overpass refusing | 0.0 | — | — | — | 1 kt | 7% | 0 | navigate | yes |
| map tiles refusing | 0.0 | — | — | — | 1 kt | 7% | 0 | navigate | yes |
| photo tiles hanging | 0.0 | — | — | — | 1 kt | 7% | 3 | navigate | yes |
| slow 4G, Overpass and map tiles refusing | 0.0 | — | — | — | 1 kt | 7% | 0 | navigate | yes |
| network gone, then back | 30.0 | 0.6 | 30.3 | 30.8 | 1 kt | 7% | 6 | navigate | yes |

Pass.
