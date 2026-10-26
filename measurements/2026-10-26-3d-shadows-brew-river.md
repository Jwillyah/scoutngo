# Brew River at solar noon: 3D shadows against the 2D shadow polygons

Run: 2026-10-26T21:44:34.187Z · node scripts/measure-3d-shadows.mjs · calibration venue 38.364236, -75.605912 · river from https://overpass-api.de/api/interpreter
Solar noon 12:58 PM on 2026-09-12: sun at azimuth 180.0°, altitude 55.6°.
Buildings drawn: 830, of which 821 have no recorded height and cast no shadow in either view. Globe loaded: true.
South bank points: 167 (land, not under a roof, river within 60 m to the north, 12 m grid); 167 on screen and not hidden behind a building (checked against the depth buffer).
3D shadow rule: lit / unshadowed brightness below 0.8, read shadows on, off, on; a point whose two shadowed readings differ by more than 10% (tiles still arriving) is dropped.

Control: 7 points the 2D polygons put in shadow, well inside the noon shadows at least 8 m long; 3 on screen and visible, 3 read as shadow in 3D. The 3D reading does see shadow where there is some.

Transect north from the tallest building with a recorded height (39 m; its noon shadow is 26.7 m long in 2D):

| metres north | 2D | 3D lit / unshadowed | 3D |
|---|---|---|---|
| 2 | shadow | 0.45 | shadow |
| 5 | shadow | 0.45 | shadow |
| 10 | shadow | 0.45 | shadow |
| 15 | shadow | 0.44 | shadow |
| 20 | shadow | 0.47 | shadow |
| 25 | shadow | 0.46 | shadow |
| 30 | sun | 1.00 | sun |
| 35 | sun | 1.00 | sun |
| 40 | sun | 1.00 | sun |

In sun in 3D: 167 of 167 (100.0%).
3D agrees with 2D: 167 of 167 (100.0%).

| 3D | 2D | points |
|---|---|---|
| sun | sun | 167 |
| shadow | shadow | 0 |
| shadow | sun | 0 |
| sun | shadow | 0 |
