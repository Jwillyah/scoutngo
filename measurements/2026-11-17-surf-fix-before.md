# The surf call, 12-17 Nov: before (Batch FIX, Section 3)

Run: node scripts/measure-surf-fix.mjs label=before, 2026-11-17T12:35:46.404Z. The app's path (src/lib/useSurfNow.ts surfNowFrom) at the look, the hour read at its half past; buoys 20 min late, 44099 the nearest, 44014 and 44100 its check; Cape Henry (CO-OPS 8638999) 6 min late, carried to 10 m; no per-spot history or field reports; VB at 36.83,-75.97 facing 100°, Croatan and 1st Street Jetty at their listed points and facings; region factor 0.833.

The code before Batch FIX Section 3 takes no station: its model and station columns are the same call.

| hour | place | call |
|---|---|---|
| Nov 12, 8:30 AM | VB | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 7.3 kt) |
| Nov 12, 8:30 AM | Croatan | 1–2 ft Small · clean, cross-offshore · clean (centre 1.14, top 2.14 ft, wind 7.3 kt) |
| Nov 12, 8:30 AM | 1st Street Jetty | 1–2 ft Small · clean, cross-offshore · clean (centre 1.41, top 2.41 ft, wind 7.3 kt) |
| Nov 12, 10:30 AM | VB | 0–1 ft Flat · clean, offshore · clean (centre 0.52, top 1.52 ft, wind 6.6 kt) |
| Nov 12, 10:30 AM | Croatan | 0–1 ft Flat · clean, offshore · clean (centre 0.52, top 1.52 ft, wind 6.6 kt) |
| Nov 12, 10:30 AM | 1st Street Jetty | 0–1 ft Flat · clean, offshore · clean (centre 0.57, top 1.57 ft, wind 6.6 kt) |
| Nov 12, 12:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 8.7 kt) |
| Nov 12, 12:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.04, top 2.04 ft, wind 8.7 kt) |
| Nov 12, 12:30 PM | 1st Street Jetty | 1–2 ft Small · clean, offshore · clean (centre 1.38, top 2.38 ft, wind 8.7 kt) |
| Nov 13, 8:30 AM | VB | 0–1 ft Flat · clean, offshore · clean (centre 0.25, top 1.26 ft, wind 10.6 kt) |
| Nov 13, 8:30 AM | Croatan | 0–1 ft Flat · clean, offshore · clean (centre 0.25, top 1.26 ft, wind 7.4 kt) |
| Nov 13, 8:30 AM | 1st Street Jetty | 0–1 ft Flat · bumpy, cross-offshore (centre 0.43, top 1.44 ft, wind 10.6 kt) |
| Nov 13, 10:30 AM | VB | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 12.1 kt) |
| Nov 13, 10:30 AM | Croatan | 0–1 ft Flat · bumpy, cross-offshore (centre 0.53, top 1.53 ft, wind 8.5 kt) |
| Nov 13, 10:30 AM | 1st Street Jetty | 0–1 ft Small · bumpy, cross-offshore (centre 0.99, top 1.99 ft, wind 12.1 kt) |
| Nov 13, 12:30 PM | VB | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 13.1 kt) |
| Nov 13, 12:30 PM | Croatan | 0–1 ft Small · bumpy, cross-offshore (centre 0.92, top 1.93 ft, wind 9.1 kt) |
| Nov 13, 12:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.30, top 2.30 ft, wind 13.1 kt) |
| Nov 14, 1:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 14.9 kt) |
| Nov 14, 1:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.28, top 2.29 ft, wind 10.4 kt) |
| Nov 14, 1:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.87, top 2.87 ft, wind 14.9 kt) |
| Nov 14, 2:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.26, top 2.27 ft, wind 14.5 kt) |
| Nov 14, 2:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.26, top 2.27 ft, wind 14.5 kt) |
| Nov 14, 2:30 PM | 1st Street Jetty | 1–2 ft Small · clean, offshore · clean (centre 1.85, top 2.86 ft, wind 14.5 kt) |
| Nov 14, 3:30 PM | VB | 1–2 ft Small · clean, offshore · clean (centre 1.07, top 2.08 ft, wind 13.6 kt) |
| Nov 14, 3:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean (centre 1.07, top 2.08 ft, wind 13.6 kt) |
| Nov 14, 3:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.84, top 2.85 ft, wind 13.6 kt) |
| Nov 14, 4:30 PM | VB | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 11.7 kt) |
| Nov 14, 4:30 PM | Croatan | 0–1 ft Small · clean, offshore · clean (centre 0.97, top 1.99 ft, wind 11.7 kt) |
| Nov 14, 4:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (centre 1.65, top 2.66 ft, wind 11.7 kt) |
| Nov 16, 10:50 AM | VB | 1–2 ft Small · clean, cross-offshore · clean (centre 1.33, top 2.33 ft, wind 7.8 kt) |
| Nov 16, 10:50 AM | Croatan | 1–2 ft Small · clean, cross-offshore · clean (centre 1.33, top 2.33 ft, wind 5.5 kt) |
| Nov 16, 10:50 AM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-shore (centre 1.97, top 2.97 ft, wind 7.8 kt) |
| Nov 17, 7:05 AM | VB | 0–1 ft Small · bumpy, cross-shore (centre 0.88, top 1.88 ft, wind 7.6 kt) |
| Nov 17, 7:05 AM | Croatan | 0–1 ft Small · bumpy, cross-shore (centre 0.88, top 1.88 ft, wind 5.3 kt) |
| Nov 17, 7:05 AM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-onshore (centre 1.42, top 2.42 ft, wind 7.6 kt) |

## Week from 17 Nov 7:05 AM, VB

- 2026-11-17: 0–1 ft Small (firm)
- 2026-11-18: 0–1 ft Flat (firm)
- 2026-11-19: 0–1 ft Flat (firm)
- 2026-11-20: 0–1 ft Flat (guess)
- 2026-11-21: 0–1 ft Poor · choppy (guess)
- 2026-11-22: 1–2 ft Small (guess)
- 2026-11-23: 1–2 ft Small (guess)
