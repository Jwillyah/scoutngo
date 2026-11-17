# The service-worker audit's first-run failures (Batch DRONE, Section 6.2)

**What CORE saw.** In CORE's last two gates (Sections 7 and 8, 16 Nov afternoon) `scripts/audit-sw-update.mjs` failed its first run and passed the gate's automatic re-run. The first run said: "W2 browser: no pill within 20 s of the signal coming back", then, as a consequence, "W4: the slow launch did not open the saved build B" and "no pill after a late answer" (W3, the Reload onto B, is skipped when W2 has no pill, so W4 starts from A).

**What W2 waits on.** The app's build check (src/lib/useNewBuild.ts) asks `/` with `cache: 'no-store'` on every return to the front; a check that could not ask is asked again after 3, 10 and 30 s (BUILD_RETRY_MS). The audit takes the server down, fires `visibilitychange`, waits 1.5 s, brings the server back and gives the pill 20 s. The retry at 3 s is the one that should find build B, so the step passes only when that retry lands inside the window.

**What this batch found.** It does not reproduce:
- run alone three times on the Section 6 tree, 9:35 PM: 3 of 3 passed, 85 s each;
- in every full gate of this batch (14 runs, 4:32 PM to 9:23 PM) it passed on its first run.

**So:** no change made. The likeliest cause is the gate's load: on a loaded machine (this batch's gates ran at loads between about 12 and 25) the down-mode check and its 3 s retry can both fall while the server is still answering slowly, which leaves the next retry at 13 s plus the time to fail, near the 20 s limit. Not proved; if it comes back, the first thing to read is the audit's W2 line, which prints the pill it found (or null) and the build the page was on; adding the time the pill appeared to that line would settle it.

## Batch FIX, Section 5.3 (17 Nov): the second failure, "B was never cached with A dropped"

**What the failing run printed.** DRONE Section 6's gate failed step 6 twice (first run and re-run), and the next gate failed it once. Its diagnostic line read `"active": true, "waiting": true, "installing": false`: worker B had installed (its document and assets were in the cache) and had called `skipWaiting()` at the end of its install, and was still held **waiting**; the old worker A was still active, so A's entries were still there.

**Why a skipWaiting worker waits.** A browser activates a waiting worker that asked to skip waiting only once the active worker has no event in flight. Since DRONE 6.1 the app asks for every page's code 3 s after it opens (`src/lib/lazyPage.ts`, `preloadPages`): about twenty requests, each through worker A's fetch handler. On a gate at load 12 to 25 those fetches can outlast the 10 s step 6 gave the swap. That fits every observation: the failure first showed in DRONE 6's gates (the preload's section), it does not reproduce alone on an idle machine, and B was waiting rather than missing.

**What changed.** Step 6 now waits up to 30 s, and prints how long the swap took and whether B was seen waiting on the way (`shell cache: {..., "ms": …, "sawWaiting": …}`). The audit still fails if B never takes over with A dropped. It stays in its own lane (`alone`) with the gate's one re-run for timing audits. If it fails again with `waiting: true` after 30 s, the preload should wait for the worker (skip it while `registration.waiting` is set).
