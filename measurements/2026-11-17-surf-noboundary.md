# The surf call, 12-17 Nov: the boundary rule dropped (Batch 3D, Section 3.1)

Run: node scripts/measure-surf-fix.mjs label=noboundary, 2026-11-18T01:36:16.331Z. The app's path (src/lib/useSurfNow.ts surfNowFrom) at the look, the hour read at its half past; buoys 20 min late, 44099 the nearest, 44014 and 44100 its check; Cape Henry (CO-OPS 8638999) 6 min late, carried to 10 m; no per-spot history or field reports; VB at 36.83,-75.97 facing 100°, Croatan and 1st Street Jetty at their listed points and facings; region factor 0.833.

With the rule: measurements/2026-11-17-surf-fix.md (Batch FIX, Section 3.2's callBand, the same script and data).

Truth: 12 and 13 Nov Flat; 14 Nov 1-4 PM VB 1-2, Croatan 1-2, 1st St Jetty 2-3 (Surfline cams 3:13 PM); 16 Nov 10:50 knee to thigh everywhere, Croatan the only one okay, wind-chopped (N 10-14 kt); 17 Nov 7:05 1st St 0-1 shin to knee, N 13 g15.

## Nov 12

| hour | place | with the rule, station | without, model wind | without, with the station | wind sea dominates |
|---|---|---|---|---|---|
| Nov 12, 8:30 AM | VB | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 5.9 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 7.3 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 5.9 kt) | no |
| Nov 12, 8:30 AM | Croatan | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 5.9 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 7.3 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 5.9 kt) | no |
| Nov 12, 8:30 AM | 1st Street Jetty | 1–2 ft Small · clean, offshore · clean (centre 1.41, top 2.41 ft, wind 5.9 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.41, top 2.41 ft, wind 7.3 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.41, top 2.41 ft, wind 5.9 kt) | no |
| Nov 12, 10:30 AM | VB | 0–1 ft Flat · clean, cross-offshore · clean (centre 0.52, top 1.52 ft, wind 4.3 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.52, top 1.52 ft, wind 6.6 kt) | 0–1 ft Flat · clean, cross-offshore · clean (centre 0.52, top 1.52 ft, wind 4.3 kt) | yes |
| Nov 12, 10:30 AM | Croatan | 0–1 ft Flat · clean, cross-offshore · clean (centre 0.52, top 1.52 ft, wind 4.3 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.52, top 1.52 ft, wind 6.6 kt) | 0–1 ft Flat · clean, cross-offshore · clean (centre 0.52, top 1.52 ft, wind 4.3 kt) | yes |
| Nov 12, 10:30 AM | 1st Street Jetty | 0–1 ft Flat · clean, offshore · clean (centre 0.57, top 1.57 ft, wind 4.3 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.57, top 1.57 ft, wind 6.6 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.57, top 1.57 ft, wind 4.3 kt) | no |
| Nov 12, 12:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 5.4 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 8.7 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 5.4 kt) | yes |
| Nov 12, 12:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 5.4 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 8.7 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 5.4 kt) | yes |
| Nov 12, 12:30 PM | 1st Street Jetty | 1–2 ft Small · clean, offshore · clean (centre 1.38, top 2.38 ft, wind 5.4 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.38, top 2.38 ft, wind 8.7 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.38, top 2.38 ft, wind 5.4 kt) | no |

## Nov 13

| hour | place | with the rule, station | without, model wind | without, with the station | wind sea dominates |
|---|---|---|---|---|---|
| Nov 13, 8:30 AM | VB | 0–1 ft Flat · bumpy, cross-offshore (centre 0.25, top 1.26 ft, wind 12.2 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.25, top 1.26 ft, wind 10.6 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.25, top 1.26 ft, wind 12.2 kt) | no |
| Nov 13, 8:30 AM | Croatan | 0–1 ft Flat · bumpy, cross-offshore (centre 0.25, top 1.26 ft, wind 8.5 kt) | 0–1 ft Flat · clean, offshore · clean (centre 0.25, top 1.26 ft, wind 7.4 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.25, top 1.26 ft, wind 8.5 kt) | no |
| Nov 13, 8:30 AM | 1st Street Jetty | 0–1 ft Flat · bumpy, cross-offshore (centre 0.43, top 1.44 ft, wind 12.2 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.43, top 1.44 ft, wind 10.6 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.43, top 1.44 ft, wind 12.2 kt) | no |
| Nov 13, 10:30 AM | VB | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 14.6 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 12.1 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 14.6 kt) | no |
| Nov 13, 10:30 AM | Croatan | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 10.2 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 8.5 kt) | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 10.2 kt) | no |
| Nov 13, 10:30 AM | 1st Street Jetty | 1–2 ft Poor · choppy · bumpy, cross-shore (centre 0.99, top 1.99 ft, wind 14.6 kt) | 0–1 ft Small · bumpy, cross-offshore (centre 0.99, top 1.99 ft, wind 12.1 kt) | 0–1 ft Poor · choppy · bumpy, cross-shore (centre 0.99, top 1.99 ft, wind 14.6 kt) | no |
| Nov 13, 12:30 PM | VB | 1–2 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 12.8 kt) | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 13.1 kt) | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 12.8 kt) | no |
| Nov 13, 12:30 PM | Croatan | 1–2 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 8.9 kt) | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 9.1 kt) | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 8.9 kt) | no |
| Nov 13, 12:30 PM | 1st Street Jetty | 1–2 ft Poor · choppy · bumpy, cross-shore (centre 1.30, top 2.30 ft, wind 12.8 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.30, top 2.30 ft, wind 13.1 kt) | 1–2 ft Poor · choppy · bumpy, cross-shore (centre 1.30, top 2.30 ft, wind 12.8 kt) | no |

## Nov 14

| hour | place | with the rule, station | without, model wind | without, with the station | wind sea dominates |
|---|---|---|---|---|---|
| Nov 14, 1:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 15.2 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 14.9 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 15.2 kt) | no |
| Nov 14, 1:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 10.6 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 10.4 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 10.6 kt) | no |
| Nov 14, 1:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.87, top 2.87 ft, wind 15.2 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.87, top 2.87 ft, wind 14.9 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.87, top 2.87 ft, wind 15.2 kt) | no |
| Nov 14, 2:30 PM | VB | 1–2 ft Small · bumpy, cross-offshore (centre 1.26, top 2.27 ft, wind 13.6 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.26, top 2.27 ft, wind 14.5 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.26, top 2.27 ft, wind 13.6 kt) | no |
| Nov 14, 2:30 PM | Croatan | 1–2 ft Small · bumpy, cross-offshore (centre 1.26, top 2.27 ft, wind 9.5 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.26, top 2.27 ft, wind 14.5 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.26, top 2.27 ft, wind 9.5 kt) | no |
| Nov 14, 2:30 PM | 1st Street Jetty | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.85, top 2.86 ft, wind 13.6 kt) | 1–2 ft Poor · choppy · bumpy, offshore (centre 1.85, top 2.86 ft, wind 14.5 kt) | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.85, top 2.86 ft, wind 13.6 kt) | yes |
| Nov 14, 3:30 PM | VB | 1–2 ft Small · bumpy, cross-offshore (centre 1.07, top 2.08 ft, wind 12.6 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.07, top 2.08 ft, wind 13.6 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.07, top 2.08 ft, wind 12.6 kt) | no |
| Nov 14, 3:30 PM | Croatan | 1–2 ft Small · bumpy, cross-offshore (centre 1.07, top 2.08 ft, wind 8.8 kt) | 1–2 ft Small · clean, offshore · clean (centre 1.07, top 2.08 ft, wind 13.6 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.07, top 2.08 ft, wind 8.8 kt) | no |
| Nov 14, 3:30 PM | 1st Street Jetty | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.84, top 2.85 ft, wind 12.6 kt) | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.84, top 2.85 ft, wind 13.6 kt) | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.84, top 2.85 ft, wind 12.6 kt) | yes |
| Nov 14, 4:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 9.3 kt) | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 11.7 kt) | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 9.3 kt) | no |
| Nov 14, 4:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 9.3 kt) | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 11.7 kt) | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 9.3 kt) | no |
| Nov 14, 4:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.65, top 2.66 ft, wind 9.3 kt) | 1–2 ft Poor · choppy · bumpy, cross-offshore (centre 1.65, top 2.66 ft, wind 11.7 kt) | 1–2 ft Small · bumpy, cross-offshore (centre 1.65, top 2.66 ft, wind 9.3 kt) | yes |

## Nov 16

| hour | place | with the rule, station | without, model wind | without, with the station | wind sea dominates |
|---|---|---|---|---|---|
| Nov 16, 10:50 AM | VB | 1–2 ft Small · bumpy, cross-onshore (centre 1.33, top 2.33 ft, wind 9.8 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.33, top 2.33 ft, wind 7.8 kt) | 1–2 ft Small · bumpy, cross-onshore (centre 1.33, top 2.33 ft, wind 9.8 kt) | yes |
| Nov 16, 10:50 AM | Croatan | 1–2 ft Small · bumpy, cross-onshore (centre 1.33, top 2.33 ft, wind 6.9 kt) | 1–2 ft Small · clean, cross-offshore · clean (centre 1.33, top 2.33 ft, wind 5.5 kt) | 1–2 ft Small · bumpy, cross-onshore (centre 1.33, top 2.33 ft, wind 6.9 kt) | yes |
| Nov 16, 10:50 AM | 1st Street Jetty | 2–3 ft Poor · choppy · bumpy, cross-onshore (centre 1.97, top 2.97 ft, wind 12.4 kt) | 1–2 ft Small · bumpy, cross-shore (centre 1.97, top 2.97 ft, wind 7.8 kt) | 1–2 ft Poor · choppy · bumpy, cross-onshore (centre 1.97, top 2.97 ft, wind 12.4 kt) | yes |

## Nov 17

| hour | place | with the rule, station | without, model wind | without, with the station | wind sea dominates |
|---|---|---|---|---|---|
| Nov 17, 7:05 AM | VB | 0–1 ft Poor · choppy · bumpy, cross-onshore (centre 0.88, top 1.88 ft, wind 11.5 kt) | 0–1 ft Small · bumpy, cross-shore (centre 0.88, top 1.88 ft, wind 7.6 kt) | 0–1 ft Poor · choppy · bumpy, cross-onshore (centre 0.88, top 1.88 ft, wind 11.5 kt) | yes |
| Nov 17, 7:05 AM | Croatan | 0–1 ft Small · bumpy, cross-onshore (centre 0.88, top 1.88 ft, wind 8.1 kt) | 0–1 ft Small · bumpy, cross-shore (centre 0.88, top 1.88 ft, wind 5.3 kt) | 0–1 ft Small · bumpy, cross-onshore (centre 0.88, top 1.88 ft, wind 8.1 kt) | yes |
| Nov 17, 7:05 AM | 1st Street Jetty | 1–2 ft Poor · choppy · messy, onshore (centre 1.42, top 2.42 ft, wind 11.5 kt) | 1–2 ft Small · bumpy, cross-onshore (centre 1.42, top 2.42 ft, wind 7.6 kt) | 1–2 ft Poor · choppy · messy, onshore (centre 1.42, top 2.42 ft, wind 11.5 kt) | yes |

## Week from 17 Nov 7:05 AM, VB (with the station)

- 2026-11-17: 0–1 ft Poor · choppy (firm); readings at the beach, top of the day: part by part 0.53 ft, the whole sea as one 0.56 ft
- 2026-11-18: 0–1 ft Flat (firm); readings at the beach, top of the day: part by part 0.36 ft, the whole sea as one 0.37 ft
- 2026-11-19: 0–1 ft Flat (firm); readings at the beach, top of the day: part by part 0.43 ft, the whole sea as one 0.37 ft
- 2026-11-20: 0–1 ft Flat (guess); readings at the beach, top of the day: part by part 0.52 ft, the whole sea as one 0.56 ft
- 2026-11-21: 0–1 ft Poor · choppy (guess); readings at the beach, top of the day: part by part 0.97 ft, the whole sea as one 1.00 ft
- 2026-11-22: 1–2 ft Small (guess); readings at the beach, top of the day: part by part 1.63 ft, the whole sea as one 1.85 ft
- 2026-11-23: 1–2 ft Small (guess); readings at the beach, top of the day: part by part 1.73 ft, the whole sea as one 1.96 ft

Bigger-swell watch (src/core/swellWatch.ts): no chip (no reading reaches 4 ft at the beach on a day called 2 or under).
