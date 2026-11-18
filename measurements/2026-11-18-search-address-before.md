# The spot search before Batch SIMPLE-1, Section 2: addresses and place names

Run: `node scripts/measure-search-address.mjs --before=/private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/old3db2f29/src`, 2026-11-18T18:35:40.046Z, live against photon.komoot.io and nominatim.openstreetmap.org (User-Agent "scoutngo-search-test/1.0 (fixture recording for tests/searchAddress.test.ts)"). The older tree's own parseQuery, ownSpots, geocodeWords and rankResults, in the spot picker's order, first run (no position); the picker's spots from this tree (the same lists, moved). Queries and truths from tests/fixtures/search-address.json.

| Query | Geocoders | Rows they gave | Results shown | First result | Against the truth | Asked |
|---|---|---|---|---|---|---|
| 2401 Courthouse Dr, Virginia Beach, VA 23456 | ok | 3 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 717 General Booth Blvd, Virginia Beach | ok | 4 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 425 E Pinner St, Suffolk | ok | 3 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| Pub, 425 E Pinner St, Suffolk, VA 23434 | ok | 2 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 442 W Washington St, Suffolk, VA | ok | 3 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| Joe's Pizza, 442 W Washington St, Suffolk | ok | 19 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 810 Union St, Norfolk, VA 23510 | ok | 3 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 245 W Olney Rd, Norfolk | ok | 3 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 102 N 3rd St, Wilmington, NC 28401 | ok | 7 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| Blue Heron Coffee Roasters, 102 N 3rd St, Wilmington, NC | ok | 1 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 310 Chestnut St, Wilmington, NC | ok | 21 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 125 N Division St, Salisbury, MD 21801 | ok | 22 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| 909 S Schumaker Dr, Salisbury, MD | ok | 2 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| Norfolk Botanical Garden | ok | 4 | 0 | nothing ("Nothing found by that name.") | nothing | nominatim, photon |
| Wrightsville Beach | ok | 21 | 10 | Wrightsville Beach [spot] | inside | nominatim, photon |
| Assateague | ok | 30 | 1 | Assateague Island [town] | inside | nominatim, photon |
| Great Dismal Swamp | ok | 7 | 1 | Great Dismal Swamp National Wildlife Refuge [business] | inside | nominatim, photon |
| First Landing State Park | ok | 11 | 3 | First Landing State Park [business] | inside | nominatim, photon |
