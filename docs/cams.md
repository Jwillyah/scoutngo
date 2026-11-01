# Coast cams on the Surf page

The Surf page lists the three public cams nearest the pin, within 30 mi, with
distance, direction and the way each looks. If there are none it says "No
public cams within 30 mi". Every cam is a link out: nothing is fetched,
framed or embedded from these pages (`tests/camsLinkOnly.test.ts`,
`tests/coastCams.test.ts`).

The data is `data/coast-cams.json`. `src/data/coastCams.ts` is generated from
it by `node scripts/build-coast-cams.mjs`.

## What is in it (30 Oct 2026)

279 cams. Per state:

| state | cams | state | cams |
|---|---|---|---|
| CA | 76 | OR | 6 |
| FL | 62 | MA | 6 |
| NC | 43 | AL | 4 |
| NJ | 15 | RI | 3 |
| HI | 15 | WA | 3 |
| TX | 13 | MD | 2 |
| SC | 7 | ME | 2 |
| NY | 7 | NH | 1 |
| DE | 7 | GA | 1 |
| VA | 6 | MS, LA | 0 |

By operator: Surfline 127, SkylineWebcams 62, Surfchex 34, HDOnTap 31,
EarthCam 10. The other 15 are towns, tourism boards and hotels.

## How it was gathered, and what that means

- **Surfchex.** From fetching surfchex.com and its llms.txt. Inland and
  soundside cams (the Intracoastal, downtown Wilmington, Southport) are left
  out: they do not show the surf.
- **Surfline.** surfline.com refuses automated requests (403), so every
  Surfline link is exactly as a search result gave it. Only spots whose
  result title said "Surf Cam" were kept. That a cam is live there rests on
  the title, not on loading the page. All are marked paid.
- **Everyone else.** From fetched index pages (SkylineWebcams state pages,
  HDOnTap, the NPS Olympic webcams page, the Delaware list) or search
  results. Each was checked with a request. Redirects were followed to where
  they land, and dead links (two EarthCam pages and five old Maine pages)
  were dropped.
- **Coordinates** are the pier's or beach's known position, approximate,
  not read from the cam page.
- **Facing** is the sea's direction from that beach. No page said which way
  its lens points.
- **Not covered.** Mississippi and Louisiana have no operator-run surf cams
  that could be found; Tybee Island likewise. WebCOOS, the federal coastal
  camera network, needs a login for its data.

## Refreshing it

1. Edit `data/coast-cams.json`: add, remove or correct entries. Keep the
   https URL exactly as the operator's page has it, and never guess a
   Surfline spot id.
2. Run `node scripts/build-coast-cams.mjs`. It rewrites
   `src/data/coastCams.ts` and prints the count per state; put the new counts
   in the table above.
3. `npx vitest run tests/coastCams.test.ts` checks every entry's fields,
   that the ids are unique, and that Wrightsville Beach still gets its own
   cams.

A cam page that has moved shows up as a dead link on the phone, not as an
error in the app: re-check the list every few months.
