# What earns a chip

> **A CHIP EARNS ITS PLACE ONLY IF ITS VALUE COULD MAKE YOU NOT GO.**

Wind grounds the drone. Cloud kills the light. Time-left means you missed it.
Tide means the sandbar is under water.

Moon phase, focal length, airspace class and NPF are looked up **after**
deciding to go. Those are cards, not chips.

**Four is the count. A fifth chip requires removing one.**

---

## The four (Batch Polish 2: one strip, one line each)

| cell | reads | what it could stop |
|---|---|---|
| Light | `Sunrise 6:37a` at night, `Golden 4:22p` in the day, `Golden now · 38 m` | leaving too late |
| Wind | `6 kt WSW` and a dot: offshore, cross or onshore at this beach | a grounded drone, blown-out surf |
| Sky | `Clear`, `High cloud`, `Overcast` (the forecast's layers at the bar's time) | a flat grey hour |
| Tide | `Low 1:54a` and an arrow, rising or falling | a sandbar under water |

Every cell reads at the time on the bar, and the strip says which time on its
own second line when it is not now ("at 7:36 AM Wed"). The station's sky is
the Sky page's: it is a reading of now. The strip steps aside while a sheet is
open.

## One line, not two

The old pills were an 8px label over a value, because "48" or "in 6 h" said
nothing alone. Each cell's words now say what the number is of ("Sunrise",
"Low", "kt"), so the label line went (src/core/statStrip.ts).

## The count is enforced

`scripts/audit-surface.mjs` asserts the strip holds exactly four cells, each one
line that fits its cell, and does not scroll horizontally. A fifth fails the commit.

The horizontal scroll matters as much as the count: a scrolling row has no
limit, so it never forces the question "which one comes out". The row is four
equal widths filling the width, and that is the whole argument.

## Why this is a rule and not a preference

The sheet it replaced grew to five sections and 1937 px in one of them,
because nothing in the structure said it could not. A chip row with no stated
limit grows the same way, one useful-looking number at a time, until the row
scrolls and nothing on it is findable.

The test is not "is this number interesting". Every number in this app is
interesting. The test is whether seeing it would make you stay home.
