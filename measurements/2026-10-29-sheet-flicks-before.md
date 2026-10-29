# The plan sheet under a flick

Run: 2026-10-29T00:26:32.998Z · node scripts/measure-sheet-flicks.mjs before · Chrome headless, 390 x 844, touch emulation (Input.dispatchTouchEvent), the calibration venue, 051aa57 (sheet, time bar and css as committed)

Detent heights: peek 187 px, half 387 px, full 682 px.

Landed right: flicks up 23 of 60, flicks down 22 of 60, slow drags 8 of 8; 53 of 128 in all.

Arrived as real flicks (the page saw them faster than the flick speed), of 20 each: peek up 20, peek down 20, half up 19, half down 20, full up 20, full down 20. At least 12 each, or the run did not test flicks.

| from | drag | started on | px | px/ms asked | px/ms the page saw at release | should land | landed |
|---|---|---|---|---|---|---|---|
| peek | flick up | handle | 24 | 1.2 | 0.52 | half | peek **WRONG** |
| peek | flick up | date | 40 | 0.9 | 0.60 | half | peek **WRONG** |
| peek | flick up | handle | 60 | 1.6 | 0.96 | half | peek **WRONG** |
| peek | flick up | handle | 90 | 2.4 | 0.47 | half | peek **WRONG** |
| peek | flick up | date | 120 | 1.8 | 1.45 | half | half |
| peek | flick up | handle | 30 | 2 | 0.95 | half | peek **WRONG** |
| peek | flick up | handle | 48 | 1 | 0.70 | half | peek **WRONG** |
| peek | flick up | date | 70 | 0.8 | 0.60 | half | peek **WRONG** |
| peek | flick up | handle | 100 | 1.4 | 0.46 | half | peek **WRONG** |
| peek | flick up | handle | 16 | 1.5 | 0.48 | half | peek **WRONG** |
| peek | flick up | date | 24 | 1.2 | 0.58 | half | peek **WRONG** |
| peek | flick up | handle | 40 | 0.9 | 0.60 | half | peek **WRONG** |
| peek | flick up | handle | 60 | 1.6 | 0.77 | half | peek **WRONG** |
| peek | flick up | date | 90 | 2.4 | 1.14 | half | peek **WRONG** |
| peek | flick up | handle | 120 | 1.8 | 1.37 | half | half |
| peek | flick up | handle | 30 | 2 | 1.16 | half | peek **WRONG** |
| peek | flick up | date | 48 | 1 | 0.73 | half | peek **WRONG** |
| peek | flick up | handle | 70 | 0.8 | 0.66 | half | peek **WRONG** |
| peek | flick up | handle | 100 | 1.4 | 0.82 | half | peek **WRONG** |
| peek | flick up | date | 16 | 1.5 | 0.48 | half | peek **WRONG** |
| peek | flick down | handle | 24 | 1.2 | 0.59 | peek | peek |
| peek | flick down | date | 40 | 0.9 | 0.63 | peek | peek |
| peek | flick down | handle | 60 | 1.6 | 0.92 | peek | peek |
| peek | flick down | handle | 90 | 2.4 | 0.53 | peek | peek |
| peek | flick down | date | 120 | 1.8 | 0.85 | peek | peek |
| peek | flick down | handle | 30 | 2 | 0.87 | peek | peek |
| peek | flick down | handle | 48 | 1 | 0.77 | peek | peek |
| peek | flick down | date | 70 | 0.8 | 0.77 | peek | peek |
| peek | flick down | handle | 100 | 1.4 | 0.89 | peek | peek |
| peek | flick down | handle | 16 | 1.5 | 0.59 | peek | peek |
| peek | flick down | date | 24 | 1.2 | 0.59 | peek | peek |
| peek | flick down | handle | 40 | 0.9 | 0.55 | peek | peek |
| peek | flick down | handle | 60 | 1.6 | 0.94 | peek | peek |
| peek | flick down | date | 90 | 2.4 | 1.33 | peek | peek |
| peek | flick down | handle | 120 | 1.8 | 1.45 | peek | peek |
| peek | flick down | handle | 30 | 2 | 1.07 | peek | peek |
| peek | flick down | date | 48 | 1 | 0.78 | peek | peek |
| peek | flick down | handle | 70 | 0.8 | 0.66 | peek | peek |
| peek | flick down | handle | 100 | 1.4 | 0.99 | peek | peek |
| peek | flick down | date | 16 | 1.5 | 0.54 | peek | peek |
| half | flick up | handle | 24 | 1.2 | 0.72 | full | half **WRONG** |
| half | flick up | date | 40 | 0.9 | 0.53 | full | half **WRONG** |
| half | flick up | blank | 60 | 1.6 | 0.94 | full | half **WRONG** |
| half | flick up | handle | 90 | 2.4 | 1.13 | full | half **WRONG** |
| half | flick up | date | 120 | 1.8 | 1.26 | full | half **WRONG** |
| half | flick up | blank | 30 | 2 | 0.89 | full | half **WRONG** |
| half | flick up | handle | 48 | 1 | 0.78 | full | half **WRONG** |
| half | flick up | date | 70 | 0.8 | 0.77 | full | half **WRONG** |
| half | flick up | blank | 100 | 1.4 | 1.32 | full | half **WRONG** |
| half | flick up | handle | 16 | 1.5 | 0.60 | full | half **WRONG** |
| half | flick up | date | 24 | 1.2 | 0.60 | full | half **WRONG** |
| half | flick up | blank | 40 | 0.9 | 0.53 | full | half **WRONG** |
| half | flick up | handle | 60 | 1.6 | 0.76 | full | half **WRONG** |
| half | flick up, arrived slow | date | 90 | 2.4 | 0.22 | half | half |
| half | flick up | blank | 120 | 1.8 | 1.06 | full | half **WRONG** |
| half | flick up | handle | 30 | 2 | 1.03 | full | half **WRONG** |
| half | flick up | date | 48 | 1 | 0.68 | full | half **WRONG** |
| half | flick up | blank | 70 | 0.8 | 0.72 | full | half **WRONG** |
| half | flick up | handle | 100 | 1.4 | 0.67 | full | half **WRONG** |
| half | flick up | date | 16 | 1.5 | 0.41 | full | half **WRONG** |
| half | flick down | handle | 24 | 1.2 | 0.73 | peek | half **WRONG** |
| half | flick down | date | 40 | 0.9 | 0.67 | peek | half **WRONG** |
| half | flick down | blank | 60 | 1.6 | 0.93 | peek | half **WRONG** |
| half | flick down | handle | 90 | 2.4 | 0.44 | peek | half **WRONG** |
| half | flick down | date | 120 | 1.8 | 1.34 | peek | peek |
| half | flick down | blank | 30 | 2 | 1.12 | peek | half **WRONG** |
| half | flick down | handle | 48 | 1 | 0.76 | peek | half **WRONG** |
| half | flick down | date | 70 | 0.8 | 0.64 | peek | half **WRONG** |
| half | flick down | blank | 100 | 1.4 | 0.98 | peek | half **WRONG** |
| half | flick down | handle | 16 | 1.5 | 0.58 | peek | half **WRONG** |
| half | flick down | date | 24 | 1.2 | 0.60 | peek | half **WRONG** |
| half | flick down | blank | 40 | 0.9 | 0.61 | peek | half **WRONG** |
| half | flick down | handle | 60 | 1.6 | 0.75 | peek | half **WRONG** |
| half | flick down | date | 90 | 2.4 | 2.22 | peek | half **WRONG** |
| half | flick down | blank | 120 | 1.8 | 1.19 | peek | half **WRONG** |
| half | flick down | handle | 30 | 2 | 0.71 | peek | half **WRONG** |
| half | flick down | date | 48 | 1 | 0.72 | peek | half **WRONG** |
| half | flick down | blank | 70 | 0.8 | 0.77 | peek | half **WRONG** |
| half | flick down | handle | 100 | 1.4 | 0.72 | peek | peek |
| half | flick down | date | 16 | 1.5 | 0.55 | peek | half **WRONG** |
| full | flick up | handle | 24 | 1.2 | 0.67 | full | full |
| full | flick up | date | 40 | 0.9 | 0.61 | full | full |
| full | flick up | blank | 60 | 1.6 | 1.48 | full | full |
| full | flick up | handle | 90 | 2.4 | 1.41 | full | full |
| full | flick up | date | 120 | 1.8 | 1.60 | full | full |
| full | flick up | blank | 30 | 2 | 1.03 | full | full |
| full | flick up | handle | 48 | 1 | 0.77 | full | full |
| full | flick up | date | 70 | 0.8 | 0.67 | full | full |
| full | flick up | blank | 100 | 1.4 | 1.34 | full | full |
| full | flick up | handle | 16 | 1.5 | 0.37 | full | full |
| full | flick up | date | 24 | 1.2 | 0.68 | full | full |
| full | flick up | blank | 40 | 0.9 | 0.58 | full | full |
| full | flick up | handle | 60 | 1.6 | 0.90 | full | full |
| full | flick up | date | 90 | 2.4 | 1.36 | full | full |
| full | flick up | blank | 120 | 1.8 | 1.17 | full | full |
| full | flick up | handle | 30 | 2 | 1.19 | full | full |
| full | flick up | date | 48 | 1 | 0.79 | full | full |
| full | flick up | blank | 70 | 0.8 | 0.59 | full | full |
| full | flick up | handle | 100 | 1.4 | 1.16 | full | full |
| full | flick up | date | 16 | 1.5 | 0.51 | full | full |
| full | flick down | handle | 24 | 1.2 | 0.63 | half | full **WRONG** |
| full | flick down | date | 40 | 0.9 | 0.59 | half | full **WRONG** |
| full | flick down | blank | 60 | 1.6 | 1.00 | half | full **WRONG** |
| full | flick down | handle | 90 | 2.4 | 2.21 | half | full **WRONG** |
| full | flick down | date | 120 | 1.8 | 1.36 | half | full **WRONG** |
| full | flick down | blank | 30 | 2 | 0.87 | half | full **WRONG** |
| full | flick down | handle | 48 | 1 | 0.78 | half | full **WRONG** |
| full | flick down | date | 70 | 0.8 | 0.70 | half | full **WRONG** |
| full | flick down | blank | 100 | 1.4 | 0.96 | half | full **WRONG** |
| full | flick down | handle | 16 | 1.5 | 0.40 | half | full **WRONG** |
| full | flick down | date | 24 | 1.2 | 0.59 | half | full **WRONG** |
| full | flick down | blank | 40 | 0.9 | 0.60 | half | full **WRONG** |
| full | flick down | handle | 60 | 1.6 | 0.94 | half | full **WRONG** |
| full | flick down | date | 90 | 2.4 | 1.33 | half | full **WRONG** |
| full | flick down | blank | 120 | 1.8 | 1.59 | half | full **WRONG** |
| full | flick down | handle | 30 | 2 | 0.76 | half | full **WRONG** |
| full | flick down | date | 48 | 1 | 0.76 | half | full **WRONG** |
| full | flick down | blank | 70 | 0.8 | 0.70 | half | full **WRONG** |
| full | flick down | handle | 100 | 1.4 | 1.28 | half | full **WRONG** |
| full | flick down | date | 16 | 1.5 | 0.59 | half | full **WRONG** |
| peek | slow drag | handle | 60 | 0.25 | — | peek | peek |
| peek | slow drag | handle | 140 | 0.25 | — | half | half |
| half | slow drag | handle | 60 | 0.25 | — | half | half |
| half | slow drag | handle | 140 | 0.25 | — | peek | peek |
| half | slow drag | handle | 88 | 0.25 | — | half | half |
| half | slow drag | handle | 206 | 0.25 | — | full | full |
| full | slow drag | handle | 88 | 0.25 | — | full | full |
| full | slow drag | handle | 206 | 0.25 | — | half | half |
