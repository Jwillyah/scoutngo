# Where things live

The menu after the field test of 30 Oct: seven items grouped by job
(docs/ux-rules.md rule 24). The look did not change; only where things live.
The list is `src/lib/menu.ts`, and `src/components/icons.test.tsx` holds it.

"Taps from the map" counts from Plan's map with nothing open: the menu button
is one tap, an item or a place under it is the second.

## The tree, after

```
Menu
├── Plan ─────────── the map, positions, light, the chips
│   ├── Shoot now      what the sky is doing where you stand
│   ├── Setup          where, when, how
│   └── Call sheet     run of show and shot list (your own key)
├── Sky ──────────── one page, four tabs
│   ├── Now            Sun · Moon · Night, swipe pages
│   ├── Sky fire       the verdict, the colour clock under it, "How was it?",
│   │                  After the shoot (photos, hit rate)
│   ├── Special        fog, rainbows, god rays, glassy water, sky fire
│   └── Calendar       Open the month; the sun through the year (Seasons)
├── Water ────────── (Land inland: Section 5)
│   ├── Tides
│   ├── Surf           only near surf (Settings › Surf)
│   └── Wind           five models, what is measured now
├── Fly ──────────── Preflight: draw or fly a drone move
│   └── Viewfinder
├── Kit ──────────── what is in the bag
│   └── Exposure
├── Saved ────────── spots, offline packs, past shoots
└── Settings
    └── About
```

Field has no menu place; it is reached by its address, `/field`.

## Every chip opens its page

| chip | opens | before 30 Oct |
|---|---|---|
| Golden | Sky › Now | the golden card in the sheet |
| Wind | Water › Wind (the Wind page) | the wind card; the page was one tap more ("Five models") |
| Cloud | Sky › Sky fire | the cloud card in the sheet |
| Tide | Water › Tides | Tides page (unchanged) |

## Taps from the map, before and after

| feature | before | after |
|---|---|---|
| Sun (rise, set, line it up) | 3: menu, Sky, Sun tab | 1: Golden chip (Now, Sun page) |
| Moon | 3: menu, Sky, Moon tab | 2 + swipe: menu, Sky, swipe to Moon |
| Night / Milky Way | 2: menu, Sky (Night first) | 2 + swipe: menu, Sky, swipe twice |
| Sky fire | 3: menu, Sky, Fire tab | 1: Cloud chip |
| Colour clock (Preview) | 3: menu, Sky, Preview tab | 1: Cloud chip, under the verdict |
| After the shoot, hit rate | 3: menu, Sky, Fire tab | 1: Cloud chip, at the foot of Sky fire |
| Special light | 3: menu, Sky, Special tab; 1 from the status line when on now | 3: menu, Sky, Special; 1 from the status line when on now |
| Calendar, the month | 3: menu, Sky, Calendar tab | 4: menu, Sky, Calendar, Open the month |
| Seasons | 3: menu, Sky, Seasons tab | 3: menu, Sky, Calendar |
| Tides | 1: Tide chip | 1: Tide chip |
| Surf | 2: menu, Surf | 2: menu, Surf (under Water) |
| Wind, five models | 2: Wind chip, Five models | 1: Wind chip |
| Exposure | 2: menu, Exposure | 2: menu, Exposure (under Kit) |
| Kit | 2: menu, Kit | 2: menu, Kit |
| Saved spots | 2: menu, Saved spots | 2: menu, Saved |
| Preflight | 2: menu, Preflight | 2: menu, Fly |
| Viewfinder | 2: menu, Viewfinder | 2: menu, Viewfinder (under Fly) |
| Call sheet | 2: menu, Call sheet | 2: menu, Call sheet (under Plan) |
| Shoot now | 3: menu, Sky, "Now, where I am" | 2: menu, Shoot now (under Plan) |
| Setup | 1: the venue pill | 1: the venue pill; 2: menu, Setup |
| Settings | 2: menu, Settings | 2: menu, Settings |
| About | 2: menu, About | 2: menu, About (under Settings) |
| Field | the address `/field` | the address `/field` |

Every feature is within two taps of the map, but the month calendar (three
taps and a button) and Moon and Night (two taps and a swipe).
