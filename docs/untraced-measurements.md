# Untraced measured claims

**None.** All 22 have been resolved. The audit reads the generated block at the
foot of this file as a ratchet: a new untraced claim fails the commit gate, and
a baseline entry matching nothing in the tree also fails, so the list cannot
rot into an allowlist.

Kept as the record of what each one became.

---

## Deleted

- **`MapView.tsx` — the fps table.** 17.2 / 3.2 fps and 42 / 78 MB, gone. The
  harness was abandoned as unreliable and the figures came off a throttled
  desktop profile standing in for a phone. A number from a proxy for the
  device, taken with a harness nobody trusts, reads like evidence and is not.
  The note that terrain performance is unmeasured on real hardware stays, and
  the design now rests on the mechanism — rotation is continuous re-tiling —
  rather than on a figure.

## Re-measured, with an artefact

| claim | file | what the re-run found |
|---|---|---|
| Lynnhaven wind profile | `2026-10-18-lynnhaven-wind-profile.md` | **Did not reproduce.** Seven mornings gave 1.2×–2.3×, turns 0–49°. The 3.5× / 22° case did not appear — and is not refuted: shear is largest when the surface is calm, and the calmest morning sampled gave the largest ratio. The fixture is now labelled a shear case, not an observation. |
| GOES legibility | `2026-10-18-derivations.md` | **Reproduced exactly.** 2 / 8 / 131 / 1046 px at zooms 7 / 9 / 13 / 16. |
| Lesner sunrise | `2026-10-18-derivations.md` | 07:16:40, not 07:15. A minute and a half out. |
| meridian convergence | `2026-10-18-derivations.md` | **Wrong by 45×.** 2.7e-3°, not 6e-5°. Checked by hand as well: Δλ·sin(φ) = 0.004494 × 0.6004. Nothing behaved differently because of it — the point was only that it is not zero — but it was an uncheckable number and it was wrong. |
| capture drift with terrain | `2026-10-18-terrain-capture-drift.md` | **Sound, and incomplete.** Settled, the round trip is 0.0 px at every camera. The drift appears only when `project` is asked about a camera no frame has been drawn for — 54.4 px at 45° of pitch, 324.5 at 60, 381 at 75. The old figure of 57 was right for the middle of the range and said nothing about the top of it. |

A first run of the drift measurement sampled only settled cameras, got 0.0 px
everywhere, and would have read as refuting the claim. It was measuring the
wrong thing. The script now runs both arms and says so.

## Marked historical

- **`capture.ts` — the 2532 vs 1568 A/B, 2026-09-17.** Labelled with its date
  and marked as predating the measurement rule. The run cannot be reproduced —
  it was a different model — so the figures are kept because the decision they
  produced is still in force, explicitly flagged as not citable evidence.

## Reworded

The word was doing prose duty for something else in sixteen places. It now
says what is true: **computed** where a value comes out of arithmetic
(`MapView`, `PositionCard`, `planChrome`, `groundViewAim`, `plan.test`,
`audit-projection`), **read at runtime** where it comes off the DOM
(`PlanMode`, twice), **surveyed** where it means an OSM-tagged height
(`MapView` twice, `buildings`), **established** for a convention rather than a
number (`sunSky`, `captureTerrain`), **checked** for a test fixture
(`audit-labels`), and **not derived** in `exposure.ts`, which exists to deny
that the table is measured and was being flagged for containing the word.

Not special-casing negations was the right call: a matcher with a quiet
exception is one more invisible rule.

---

The block below is generated and is what the audit matches on. Keyed on the
claim's own words rather than its line number, so an edit elsewhere in the
file does not make a claim look new. Regenerate with
`SCOUTNGO_RATCHET=1 node scripts/audit-measurements.mjs`.

<!-- ratchet
-->
