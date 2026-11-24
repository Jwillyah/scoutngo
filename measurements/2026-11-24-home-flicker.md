# Home flicker, 23 Nov 5:10 PM: the racing sources (Batch SIMPLE-3, Section 0)

Run 24 Nov 2026 by the S0 agent. Diagnosis scripts lived in the run's scratchpad
(`s0/diag-sky.ts`, `s0/diag-home.mjs`); parameters below. No live host: the
sky replay reads tests/data/sunset-2026-11-15-vb-inland; the home runs are the
built app behind the gate's fixture proxy (scripts/gate/fixtures.mjs), WebKit
390 x 844, spot Atlantic Park Surf (36.851, -75.980), persona Surf, page clock
2 Nov 2026 22:10Z (5:10 PM EST, five minutes after the fixture's sunset).

## Source 1: the satellite read, held by one mount and not another (sky call)

`useBriefing` kept what it fetched in each screen's own state. The GOES read is
asked only from 3 h to 30 min before the event (`inNowcast`). A home mounted
at 4:20 PM still held it at 5:10 and called the sunset a Go; a home mounted
again at 5:10 (Back from the Surf, Tide or Wind page, or the spot search
closed: each unmounts the home), Sky Tonight and the Sky color page had none.

```
sunset 4:55 PM, now 5:10 PM; station KNTU 152156Z 33010KT 10SM FEW045 BKN065 11/00 A3026 RMK AO2  at 4:56 PM
satDue at 4:20 PM: true; at 5:10 PM: false

BEFORE: each reader from its own instance's inputs, same event, same minute:
  home mounted 4:20 PM (sat kept from T-30)    call Go    tile "color likely"  moment "Color on now"
  home mounted 5:10 PM (no sat after T-30)     call Maybe tile "color possible"  moment (none)
  Sky Tonight (own instance, mounted 5:10)     call Maybe tile "color possible"  moment (none)
  Sky color page (SkyFire: no sat, obs null)   call Maybe tile "color possible"  moment (none)
```

That is state B (Likely, "Color on now") against state A (Possible, no card).

## Source 2: every part drawn as its own input lands (surf, tide), and again on each mount

Before (dist built from the tree at 9:37 AM), each distinct state of the tiles from the first frame:

```
first load  +88 ms   surf=…  tide=…
            +897 ms  surf=4–6 ft [Fun]       tide=—            (marine + wind in; facing, buoy not)
            +1661 ms surf=3–4 ft [Rideable]  tide=—            (/api/buoy, facing in)
            +2371 ms surf=3–4 ft [Rideable]  tide=Low 7:09p    (CO-OPS datagetter in)
Surf tile, then Back (home mounted again):
            +2035 ms tide=— pic:none
            +2738 ms tide=Low 7:09p
spot search opened and closed: the same two states
```

The size was called with no facing and no buoy for a moment (one size), then
with them (another); the tide table came last, a dash until then. In the
field the same walk gave 1–2 ft then 2–3 ft, and Tide "—" then "High 8:58p".

## Source 3: the moment card took the pictures away

The tiles drop their picture under a 9rem container height. With the card on
screen the 390 x 844 home-screen tiles are 144 px: pictures HIDDEN; without it,
168 px: pictures on. State B "no pictures" is state B's card.

## After

```
first load  +125 ms  every part a skeleton
            +1639 ms weather, sky (Possible), fish, drone in
            +2386 ms wind in
            +3060 ms surf=3–4 ft [Rideable], tide=Low 7:09p
reload 1-3  one state from the first frame: the kept snapshot
Surf tile, then Back: one state;  spot search opened and closed: one state
```

Pictures at 390 x 664 tab with the card: 26 px (were hidden); 390 x 844
home screen with the card: 51 px (were hidden).
