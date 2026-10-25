# How a build reaches a phone

Three separate things have to be true, and each used to be able to fail
silently. Written down because the failure looks identical from the outside:
the screen is old, and nothing on it says why.

## 1 · The commit is pushed

`scripts/push-state.mjs`, and the build stamp says so in About: a build from an
unpushed commit says *"Nothing deployed contains this code."*

## 2 · The deploy is that commit

The deployed document carries the id in a meta tag:

```
curl -s https://scoutngo.vercel.app/ | grep scoutngo-build
<meta name="scoutngo-build" content="06206f1" />
```

Checked from inside the app too: `checkOrigin()` asks GitHub for the newest
commit on `main` and the stamp says *"what you are looking at is behind the
repository"* when the deploy lags.

## 3 · The phone is running that deploy

**One service worker, for the app shell only** (`src/sw/sw.ts`, served as
`/sw.js` with `no-cache`). It exists so a cold launch with no signal opens the
app, and it cannot hold an old build:

- the **document is network-first** with a 3 s timeout; the saved copy is used
  only when the network fails or hangs, and a good answer replaces it
- only **`/assets/*` is cache-first**, and those names carry their content hash
- the **build check passes through**: `fetch('/', { cache: 'no-store' })` is not
  a navigation, so the worker never answers it from its cache
- every new deploy writes a byte-different `sw.js` (it names the build and its
  hashed files), so the browser installs the new worker and it drops the old
  build's files

`scripts/audit-sw-update.mjs` proves all of it in the commit gate with two real
builds served under these headers: install A, cold launch offline and with no
bars (A), deploy B, the build check sees B, cold launch with signal (B), the
new worker drops A, cold launch offline (B).

Map tiles are a separate cache (`scoutngo-tiles-v1`, `src/lib/offlineCache.ts`)
that the worker never touches, and field packs are `localStorage`. Both are data.

What holds a stale build is the browser's own document cache, and on iOS a
home-screen app launching its `start_url` is the stubborn case.

**index.html is the whole of it.** It names the hashed bundle URLs, so a stale
document never requests the new bundle at all, and a fresh document brings the
new code with it automatically.

### The caching contract

| what | header | why |
|---|---|---|
| `/` and `/how` | `max-age=0, must-revalidate` | the document must never be served without asking |
| `/assets/*` | `max-age=31536000, immutable` | the filename contains the content hash, so it can never go stale |
| `/sw.js` | `no-cache, no-store, must-revalidate` | the browser must see every new worker; it names the build |

Set in `vercel.json` rather than left to a default, because a default is a
thing that can change without anyone noticing.

### The update path

`useNewBuild` fetches `/` with `cache: 'no-store'` on mount, every fifteen
minutes, and on every return to the foreground, and compares the id in that
document with the id compiled into the running bundle.

- **On a cold load** (within ten seconds of start) it adopts the newer build
  itself: `location.replace` to the same URL with `?b=<id>`, which the stale
  cache entry cannot answer. Nobody presses anything.
- **Later in a session** it only offers, through `NewBuildNotice`. Somebody
  may be standing on a dock halfway through setting up, and a deploy is not a
  reason to throw that away.
- **At most once per deployed id per tab.** If the two ids disagree for a
  reason a reload cannot fix, that goes wrong once and then falls back to the
  notice instead of looping.

**How somebody on an old version gets off it:** they open the app. The stale
bundle runs, its first check fires within a second or two, and it replaces the
document with one the cache cannot answer. The only users who still need to
press the button are those whose running build predates this mechanism —
for them the notice and its button, which does the same cache-busting replace,
is the path.

## The one thing that must never disagree

The id in the **document** and the id in the **bundle**. The whole mechanism is
that comparison, so if a build ever produced two different ids, every copy
would compare itself against itself, conclude it was stale, and now reload in a
loop. They were two separate `buildId()` calls in `vite.config.ts` with nothing
checking them. They are one constant, and
`scripts/audit-build-stamp.mjs` fails the commit if the built `dist/` ever
carries two.
