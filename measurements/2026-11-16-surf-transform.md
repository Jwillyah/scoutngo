# The surf transform, 12-16 Nov: before → after (Batch DRONE, Section 1)

Run: node scripts/measure-surf-transform.mjs, 2026-11-16T22:04:33.580Z. Buoys 20 min late; 44099 leans, 44014 and 44100 check it; no per-spot history or field reports; VB at 36.83,-75.97 facing 100°, Croatan and 1st Street Jetty at their listed points and facings; region factor 0.833; jetty factors from src/core/jettyFactor.ts.

Before: measurements/2026-11-16-surf-transform-before.md (the same script on the code before the change).

Truth: 12 and 13 Nov Flat; 14 Nov 1-4 PM VB 1-2, Croatan 1-2, 1st St Jetty 2-3 (Surfline cams 3:13 PM); 16 Nov 10:50 knee to thigh everywhere, Croatan the only one okay, wind-chopped (N 10-14 kt).

## Nov 12

| hour | place | before | after |
|---|---|---|---|
| Nov 12, 8:30 AM | VB | 1–2 ft Small · clean, cross-offshore · clean band (model 0.72, leaned 1.06 ft) | 1–2 ft Small · clean, cross-offshore · clean band (model 0.54, leaned 1.14 ft) |
| Nov 12, 8:30 AM | Croatan | 1–2 ft Small · clean, cross-offshore · clean band (model 0.72, leaned 1.06 ft) | 1–2 ft Small · clean, cross-offshore · clean band (model 0.54, leaned 1.14 ft) |
| Nov 12, 8:30 AM | 1st Street Jetty | 1–2 ft Small · clean, cross-offshore · clean band (model 0.72, leaned 1.06 ft) | 1–2 ft Small · clean, cross-offshore · clean band (model 0.73, leaned 1.41 ft) |
| Nov 12, 10:30 AM | VB | 0–1 ft Small · clean, offshore · clean band (model 0.69, leaned 0.69 ft) | 0–1 ft Flat · clean, offshore · clean band (model 0.45, leaned 0.52 ft) |
| Nov 12, 10:30 AM | Croatan | 0–1 ft Small · clean, offshore · clean band (model 0.69, leaned 0.69 ft) | 0–1 ft Flat · clean, offshore · clean band (model 0.45, leaned 0.52 ft) |
| Nov 12, 10:30 AM | 1st Street Jetty | 0–1 ft Small · clean, offshore · clean band (model 0.69, leaned 0.69 ft) | 0–1 ft Flat · clean, offshore · clean band (model 0.58, leaned 0.57 ft) |
| Nov 12, 12:30 PM | VB | 0–1 ft Small · clean, offshore · clean band (model 0.68, leaned 0.68 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.42, leaned 1.04 ft) |
| Nov 12, 12:30 PM | Croatan | 0–1 ft Small · clean, offshore · clean band (model 0.68, leaned 0.68 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.42, leaned 1.04 ft) |
| Nov 12, 12:30 PM | 1st Street Jetty | 0–1 ft Small · clean, offshore · clean band (model 0.68, leaned 0.68 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.55, leaned 1.38 ft) |

## Nov 13

| hour | place | before | after |
|---|---|---|---|
| Nov 13, 8:30 AM | VB | 0–1 ft Flat · clean, offshore · clean band (model 0.36, leaned 0.20 ft) | 0–1 ft Flat · clean, offshore · clean band (model 0.28, leaned 0.25 ft) |
| Nov 13, 8:30 AM | Croatan | 0–1 ft Flat · clean, offshore · clean band (model 0.36, leaned 0.20 ft) | 0–1 ft Flat · clean, offshore · clean band (model 0.28, leaned 0.25 ft) |
| Nov 13, 8:30 AM | 1st Street Jetty | 0–1 ft Flat · clean, cross-offshore · clean band (model 0.73, leaned 0.40 ft) | 0–1 ft Flat · bumpy, cross-offshore (model 0.44, leaned 0.43 ft) |
| Nov 13, 10:30 AM | VB | 0–1 ft Flat · bumpy, cross-offshore (model 0.11, leaned 0.11 ft) | 0–1 ft Flat · bumpy, cross-offshore (model 0.22, leaned 0.53 ft) |
| Nov 13, 10:30 AM | Croatan | 0–1 ft Flat · bumpy, cross-offshore (model 0.11, leaned 0.11 ft) | 0–1 ft Flat · bumpy, cross-offshore (model 0.22, leaned 0.53 ft) |
| Nov 13, 10:30 AM | 1st Street Jetty | 0–1 ft Flat · bumpy, cross-offshore (model 0.40, leaned 0.40 ft) | 0–1 ft Small · bumpy, cross-offshore (model 0.37, leaned 0.99 ft) |
| Nov 13, 12:30 PM | VB | 0–1 ft Flat · bumpy, cross-offshore (model 0.49, leaned 0.49 ft) | 0–1 ft Small · bumpy, cross-offshore (model 0.22, leaned 0.92 ft) |
| Nov 13, 12:30 PM | Croatan | 0–1 ft Flat · bumpy, cross-offshore (model 0.49, leaned 0.49 ft) | 0–1 ft Small · bumpy, cross-offshore (model 0.22, leaned 0.92 ft) |
| Nov 13, 12:30 PM | 1st Street Jetty | 0–1 ft Small · bumpy, cross-offshore (model 0.82, leaned 0.82 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.39, leaned 1.30 ft) |

## Nov 14

| hour | place | before | after |
|---|---|---|---|
| Nov 14, 1:30 PM | VB | 1–2 ft Small · clean, offshore · clean band (model 1.42, leaned 1.42 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.61, leaned 1.28 ft) |
| Nov 14, 1:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean band (model 1.42, leaned 1.42 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.61, leaned 1.28 ft) |
| Nov 14, 1:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (model 1.42, leaned 1.42 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.96, leaned 1.87 ft) |
| Nov 14, 2:30 PM | VB | 1–2 ft Small · clean, offshore · clean band (model 1.33, leaned 1.33 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.60, leaned 1.26 ft) |
| Nov 14, 2:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean band (model 1.33, leaned 1.33 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.60, leaned 1.26 ft) |
| Nov 14, 2:30 PM | 1st Street Jetty | 1–2 ft Small · clean, offshore · clean band (model 1.33, leaned 1.33 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.95, leaned 1.85 ft) |
| Nov 14, 3:30 PM | VB | 1–2 ft Small · clean, offshore · clean band (model 1.31, leaned 1.31 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.59, leaned 1.07 ft) |
| Nov 14, 3:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean band (model 1.31, leaned 1.31 ft) | 1–2 ft Small · clean, offshore · clean band (model 0.59, leaned 1.07 ft) |
| Nov 14, 3:30 PM | 1st Street Jetty | 1–2 ft Small · bumpy, cross-offshore (model 1.31, leaned 1.31 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.93, leaned 1.84 ft) |
| Nov 14, 4:30 PM | VB | 1–2 ft Small · clean, offshore · clean band (model 1.22, leaned 1.22 ft) | 0–1 ft Small · clean, offshore · clean band (model 0.58, leaned 0.97 ft) |
| Nov 14, 4:30 PM | Croatan | 1–2 ft Small · clean, offshore · clean band (model 1.22, leaned 1.22 ft) | 0–1 ft Small · clean, offshore · clean band (model 0.58, leaned 0.97 ft) |
| Nov 14, 4:30 PM | 1st Street Jetty | 1–2 ft Small · clean, cross-offshore · clean band (model 1.22, leaned 1.22 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.91, leaned 1.65 ft) |

## Nov 16

| hour | place | before | after |
|---|---|---|---|
| Nov 16, 10:50 AM | VB | 2–3 ft Small · clean, cross-offshore · clean band (model 1.37, leaned 2.31 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.60, leaned 1.27 ft) |
| Nov 16, 10:50 AM | Croatan | 2–3 ft Small · clean, cross-offshore · clean band (model 1.37, leaned 2.31 ft) | 1–2 ft Small · clean, cross-offshore · clean band (model 0.60, leaned 1.27 ft) |
| Nov 16, 10:50 AM | 1st Street Jetty | 2–3 ft Small · clean, cross-offshore · clean band (model 1.45, leaned 2.38 ft) | 1–2 ft Small · bumpy, cross-offshore (model 0.96, leaned 1.89 ft) |
