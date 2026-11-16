# The offline walk (Batch CORE, Section 7A)

Run 16 Nov 2026 with `scripts/walk-offline-steps.mjs` in the shot harness: WebKit (iPhone 13) at 390 x 844, the built app behind the gate's fixture proxy, the service worker allowed, a saved spot ("Fixture Place"), the clock at 16 Nov 5:46 PM. Profiles:

- **offline**: the app opened once with signal, then no network at all.
- **car**: every request 400 ms late and one in ten dropped.
- **switch**: no network as each screen loads, back after 2.5 s.

Each screen is opened from the home and read 10 s later: blank (under 20 characters), NaN, a spinner still up, uncaught errors. Dashes are counted, not failed: a dash is this app's "not known", and the fixtures hold no temperature or surf for these dates, so every profile shows the same dashes with full signal.

Builds: **before** = 581b2a1 (Section 3); **after 7A** = a4f50ec; **after the retry** = a4f50ec + src/lib/lazyPage.ts asking the code again (7A, continued).

| profile | screen | before | after 7A | after the retry |
|---|---|---|---|---|
| offline | home | opened | opened | opened |
| offline | sky | **blank** (Error: Unable to preload CSS for http://127.0.0.1:5196/asset) | opened · chip "Offline · showing 5:46 PM" | opened · chip "Offline · showing 5:46 PM" |
| offline | tide | **blank** (could not open tide (.hcard--tide)) | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| offline | surf | **blank** (could not open surf (.hcard--surf)) | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| offline | weather | **blank** (could not open weather (.hwx__temp)) | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| offline | map | **blank** (could not open map (button[aria-label="Open the map"])) | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| offline | best sky | **blank** (could not open best sky (.hcard--sky)) | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| car | home | opened | opened | opened |
| car | sky | opened | opened | opened |
| car | tide | opened | card: "This page needs a signal" | card: "This page needs a signal" |
| car | surf | opened | card: "This page needs a signal" | opened |
| car | weather | opened | opened | opened |
| car | map | opened | card: "This page needs a signal" | opened |
| car | best sky | opened | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |
| switch | home | opened | opened | opened |
| switch | sky | opened | opened | opened |
| switch | tide | opened | card: "This page needs a signal" | opened |
| switch | surf | opened | card: "This page needs a signal" | opened |
| switch | weather | opened | opened | opened |
| switch | map | opened | card: "This page needs a signal" | opened |
| switch | best sky | opened | did not open (a card or the page before it was in the way) | did not open (a card or the page before it was in the way) |

## What broke, and what changed

1. **Offline, a page whose code was not yet kept turned the whole app blank** (before: "Unable to preload CSS for …SkyPage…", then every screen blank). Now the page says "This page needs a signal · Back / Try again" and the rest of the app stays (src/lib/lazyPage.ts).
2. **After 7A, one dropped request made a page "need a signal" for the session** (car and switch: Tide, Surf, the map). React keeps a lazy page's first answer. The code is now asked again after 0.5, 1.5 and 4 s before the card is shown: switch opens every screen, car all but the Tide page once.
3. **Not settled:** under car, after 7A, the Sky page had not opened 10 s after the tap (the walk reads the home there, not a card or a blank), so Best Sky, reached through it, did not open either; under switch the Sky page opened and Best Sky's button was not found within the walk's 2.5 s. Before 7A both opened. The walk drops every tenth request, and the new build's extra files move which request that is; a dropped Sky chunk now waits up to 6 s for its retries. Not proved either way by this run.
4. **Still open:** WebKit keeps a failed module load for its URL, so a later try at the same chunk can fail until the page reloads ("Try again" reloads). And the harness's WebKit does not run the service worker the way a phone does, so a fully installed offline shell is proved by the service worker audit (Chromium), not here.

The signal chip says "Offline · showing 5:46 PM" whenever the phone is offline (after 7A).
