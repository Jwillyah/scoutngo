# The shell rebuild, measured

**Run:** `node scripts/audit-surface.mjs`, 2026-10-19
**Viewport:** 390 x 844, deviceScaleFactor 3, mobile
**Venue:** the calibration venue (`?calibration=1&probe=1`)
**Build measured:** the served bundle, confirmed newer than every watched
source file by `servedAppFreshness()` — the check that exists because a
projection run once measured a nine-minute-old bundle twice and I drew a
conclusion from it.

Everything below is the audit's own stdout, pasted. Nothing here is retyped
and nothing is rounded by hand.

---

## The chrome over the map, and where the sheet starts

The venue bar and the chip row float over the map. The sheet reserves the
space they occupy (`reservedTop` in `src/components/BottomSheet.tsx`) so it
cannot grow up behind them at FULL, which it previously did — the pairwise
surface check measured the chip row sitting on 366 x 34 px of the sheet.

```
### exactly one surface may cover the map
  peek  map visible  70.5%  chrome ends 97px, sheet starts 692px  surfaces: vbar(4.9%) chips2(4.1%) rail2(2.3%) sheet sheet--peek(10.4%) dock(7.6%)
  half  map visible  45.2%  chrome ends 97px, sheet starts 476px  surfaces: vbar(4.9%) chips2(4.1%) rail2(2.3%) sheet sheet--half(36%, scrolls) dock(7.6%)
  full  map visible   9.8%  chrome ends 97px, sheet starts 159px  surfaces: vbar(4.9%) chips2(4.1%) sheet sheet--full(73.6%) dock(7.6%)

```

The chrome ends at **97 px** at every detent. The sheet's top edge at FULL is
**159 px**, which is 62 px of clearance; before `reservedTop` it was 72 px,
i.e. 25 px *above* the chrome's bottom edge.

Map still visible at FULL: **9.8%** (it was 2.2% when the sheet grew behind
the chrome).

## The rule is proven to fail

```
### and the one-surface rule is proven to fail
  a 500px chip row was caught as a second surface: chips2 (55.6%), sheet sheet--half (36%)

```

## The chip row

```
### the chip row: exactly four chips, two lines, no horizontal scroll
  GOLDEN   120 min
  WIND     9 kt
  CLOUD    —
  LOW TIDE —
  4 chips, 1 row, content 366px in 366px, overflow-x: visible
  a fifth chip was injected and the check caught it: 5 chips, not 4

```

Four chips, one row, 366 px of content in 366 px of width — no horizontal
scroll. Every chip carries its unit. The injected fifth chip was caught, so
the count is a check rather than a comment.

## Every card against the two-viewport limit

**The limit is 2 x 844 = 1688 px of content**, measured as the scroll height
of `.sheet__card` from the live DOM, per card, at both readable detents.

```
### no card exceeds two viewport heights at any detent
  the limit is 2 x 844 = 1688px of content
  card          half     full     worst   of limit
  about           894     894     894     53%  ok
  airspace        637     637     637     38%  ok
  cloud           238     238     238     14%  ok
  golden          557     557     557     33%  ok
  hazards         459     459     459     27%  ok
  layers          608     608     608     36%  ok
  shoot           628     628     628     37%  ok
  sky            1589    1589    1589     94%  ok
  suncurve        264     264     264     16%  ok
  tide            192     192     192     11%  ok
  wind            325     325     325     19%  ok
  11 cards measured; tallest is sky at 1589px

```

Half and full report the same figure for every card, which is correct and
worth saying: the card's content does not change with the detent, only how
much of it is on screen. The detent changes the window, not the document.

**The tallest card is `sky` at 1589 px — 94% of the limit.** It passes and it
is the next one to break: it carries the sky panel, the sun-search panel and
the camera list. The camera list is already capped at six nearest within
200 km (`src/components/CamList.tsx`), which is what keeps it under; anything
further added to that card takes it over.

Second tallest is `about` at 894 px (53%). Every other card is under 40%.

## What this run also found

Four faults, each fixed and each with a structural guard rather than a patch:

1. **Nine browser scripts navigated by `.rail__btn`**, the deleted stepper's
   class, via `?.click()` — so every one of them silently ran its assertions
   against the SETUP screen. The surface audit reported 22 problems, none of
   them the fault. Fixed by `goToStage()` in `scripts/preflight.mjs`, which
   throws when the button is absent and verifies arrival from the shell's own
   stage class.

2. **The nav still gated.** `goTo` was
   `if (canEnter(next, available) || next === mode) setMode(next)` with a
   comment above it saying the nav bypassed the gate. Pressing FIELD with no
   plan did nothing — no disabled attribute, so no DOM check could have found
   it. Found by the reachability audit pressing the button and reading the
   stage back. `canEnter` is deleted; FIELD's empty screen now offers a
   control back to PLAN.

3. **The one-surface rule was an exclusion list** — `sheet`, `rail2`, `dock`
   by name — under a comment insisting it was not one. Replaced with two
   positive properties measured off the live element: at most one surface may
   cover 20% of the map, and at most one may hold a scroll.

4. **The chip row was `role="group"`**, so the segment-reachability walk read
   it as a segmented control; clicking a chip replaces the sheet's content,
   which unmounted the platform filter mid-walk and produced six "group gone"
   failures for a control that worked. The chips are `role="toolbar"`, which
   is what they are.
