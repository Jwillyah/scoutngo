# White glyph against each tile's middle stop

Run: 2026-10-27T14:01:16.252Z · node scripts/measure-icon-contrast.mjs
Source: src/lib/iconPalette.ts (stops from design/icons-golden-bubble.html and design/home-golden.html)
Rule: white #ffffff on the middle stop, WCAG ratio, floor 3:1. A tile under it is walked toward its own dark stop in 1% steps until it passes.

| tile | design middle | ratio | ships | ratio | deepened |
|---|---|---|---|---|---|
| plan | #f5b021 | 1.89 | #c88711 | 3.03 | yes |
| sky | #f68b2e | 2.43 | #e27925 | 3.00 | yes |
| exposure | #f0a020 | 2.15 | #ce8416 | 3.03 | yes |
| kit | #ee6b43 | 3.08 | #ee6b43 | 3.08 | no |
| saved | #e5559a | 3.44 | #e5559a | 3.44 | no |
| viewfinder | #b952d2 | 4.04 | #b952d2 | 4.04 | no |
| callsheet | #8063ee | 4.25 | #8063ee | 4.25 | no |
| settings | #5270df | 4.43 | #5270df | 4.43 | no |
| about | #2f86d6 | 3.82 | #2f86d6 | 3.82 | no |
| sunmoon | #22aacb | 2.73 | #20a1c1 | 3.03 | yes |
| calendar | #17b59c | 2.58 | #14a790 | 3.02 | yes |
| lens | #198cba | 3.82 | #198cba | 3.82 | no |
| layers | #4473db | 4.45 | #4473db | 4.45 | no |
| now | #5e51dc | 5.70 | #5e51dc | 5.70 | no |
| app | #f68b2e | 2.43 | #e27636 | 3.05 | yes |
| offline | #5270df | 4.43 | #5270df | 4.43 | no |
| satellite | #2f86d6 | 3.82 | #2f86d6 | 3.82 | no |
| terrain | #17b59c | 2.58 | #14a790 | 3.02 | yes |
| sunArc | #f5b021 | 1.89 | #c88711 | 3.03 | yes |
| shadows | #5270df | 4.43 | #5270df | 4.43 | no |
| cloud | #6f86a6 | 3.73 | #6f86a6 | 3.73 | no |
| hazards | #f68b2e | 2.43 | #e27925 | 3.00 | yes |
| buildings | #8063ee | 4.25 | #8063ee | 4.25 | no |
| labels | #e5559a | 3.44 | #e5559a | 3.44 | no |
| airspace | #b952d2 | 4.04 | #b952d2 | 4.04 | no |
| measure | #22aacb | 2.73 | #20a1c1 | 3.03 | yes |

Deepened: plan, sky, exposure, sunmoon, calendar, app, terrain, sunArc, hazards, measure.
Under 3:1 after deepening: none.
