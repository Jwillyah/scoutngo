# What earns a chip

> **A CHIP EARNS ITS PLACE ONLY IF ITS VALUE COULD MAKE YOU NOT GO.**

Wind grounds the drone. Cloud kills the light. Time-left means you missed it.
Tide means the sandbar is under water.

Moon phase, focal length, airspace class and NPF are looked up **after**
deciding to go. Those are cards, not chips.

**Four is the count. A fifth chip requires removing one.**

---

## The four

| | what it answers | what it could stop |
|---|---|---|
| `GOLDEN · 48 min` | how long the light lasts | leaving too late |
| `WIND · 14 kt` | whether the aircraft flies | a grounded drone |
| `CLOUD · 38%` | whether there is light at all | a flat grey hour |
| `LOW TIDE · 20:14` | whether the ground is there | a sandbar under water |

## Two lines, not one

Each chip is an 8px label over a 14px value **with its unit**.

Single-line chips do not fit a readable label and a unit in seven characters,
which is why the previous ones were unreadable: `GOLD 48`, `W 14`. The label
has to say what the number is *of*, and the value has to carry its unit, or
the number is a riddle. Two lines is the fix, and it costs eleven pixels.

## The count is enforced

`scripts/audit-surface.mjs` asserts the row holds exactly four chips and does
not scroll horizontally. A fifth fails the commit.

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
