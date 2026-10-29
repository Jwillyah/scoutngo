/*
 * CAN I EVEN LOOK? ASKED BEFORE EVERY BROWSER AUDIT.
 *
 * WHY THIS EXISTS. The reachability audit refused a commit and printed nothing
 * at all: no problem count, no reason, one red line. The code was fine. What
 * had happened was that the thing it needed was not there, so it threw on a
 * property of undefined and died, and a gate that cannot tell "the code is
 * broken" from "I could not look" is worse than no gate, because the only way
 * to make it pass is to run it again until it does.
 *
 * That is the same bug four times this week in different clothes:
 *
 *   the fixed-position exemption that excused the drawer it was meant to catch
 *   the count subtraction that said how many lenses were lost, never which
 *   a surface audit that could not see a two-surface bug
 *   a selector that matched the sheet, so two sheet views read as one
 *
 * Every one of them answered confidently about something it had not actually
 * examined. So:
 *
 *   1. NOTHING HERE SILENTLY DEPENDS ON A PROCESS SOMEBODY ELSE STARTED. An
 *      audit that needs the app will use one that is already running and will
 *      START ITS OWN if there is not one, and stop it again on the way out. It
 *      cannot be defeated by a pkill in another terminal.
 *
 *   2. EVERY FAILURE EXITS NON-ZERO WITH A SENTENCE. Could not reach the app,
 *      something else is on the port, the browser would not launch, no page
 *      target appeared. The reason is printed where the problem count would
 *      have been, so a red line always says which kind of red it is.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const APP_ORIGIN = 'http://127.0.0.1:5173'
export const CDP_ORIGIN = 'http://127.0.0.1:9222'

/** The app's own root element, so "something answers on 5173" is not enough. */
const APP_MARKER = 'id="root"'

/**
 * A failure to LOOK, as opposed to something found by looking.
 *
 * A separate type because the two deserve different exit lines: one means fix
 * the code, the other means fix the harness, and conflating them is what sent
 * a clean commit back with no explanation.
 */
export class PreflightError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PreflightError'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, ms = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return { ok: response.ok, status: response.status, body: await response.text() }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Serving the app shell, not merely listening. */
async function appIsServing() {
  const response = await get(`${APP_ORIGIN}/`, 6000)
  if (response === null) return { up: false, reason: 'nothing answered' }
  if (!response.ok) return { up: false, reason: `answered HTTP ${response.status}` }
  if (!response.body.includes(APP_MARKER)) {
    /*
     * SOMETHING IS ON THE PORT AND IT IS NOT US. Worth its own sentence: a
     * stale dev server for another project will answer 200 all day and every
     * selector in every audit will come back empty, which reads exactly like
     * a broken app.
     */
    return { up: false, reason: `something else is serving ${APP_ORIGIN} (no ${APP_MARKER})` }
  }
  return { up: true }
}

async function browserIsUp() {
  const version = await get(`${CDP_ORIGIN}/json/version`, 3000)
  if (version === null) return { up: false, reason: 'nothing answered' }
  if (!version.ok) return { up: false, reason: `answered HTTP ${version.status}` }
  const list = await get(`${CDP_ORIGIN}/json/list`, 3000)
  if (list === null || !list.ok) return { up: false, reason: 'the target list did not answer' }
  try {
    const targets = JSON.parse(list.body)
    if (!targets.some((t) => t.type === 'page')) {
      /* connect() takes the first page target. Without one it threw. */
      return { up: false, reason: 'the browser is running but has no page target' }
    }
  } catch {
    return { up: false, reason: 'the target list was not JSON' }
  }
  return { up: true }
}

const CHROME_CANDIDATES = [
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findChrome() {
  for (const path of CHROME_CANDIDATES) if (existsSync(path)) return path
  return null
}

/*
 * IS THE APP ON THE PORT THE APP IN THE EDITOR?
 *
 * WHAT HAPPENED, AND IT WASTED A WHOLE DIAGNOSIS. The commit hook builds, then
 * serves, then runs four audits against the port. A refused commit left that
 * server up. The projection audit was then run by hand against it, a fix was
 * written, it was run again, and it reported the SAME numbers to three decimal
 * places -- because the port was serving dist/assets/index-CKnsJGVQ.js, a
 * bundle built before the fix existed. The fix was never measured. Worse, a
 * stash was taken to compare two commits and BOTH runs measured the same stale
 * bundle, so the identical numbers were read as evidence that the older commit
 * was already broken. That conclusion was manufactured entirely by this bug.
 *
 * This is the same shape as every other blind check here: a run that cannot
 * tell "the code is broken" from "I could not look" at the code. It is worse
 * than the usual case, because it does not merely fail to look -- it looks at
 * something else and reports with full confidence.
 *
 * SO THE SOURCE IS COMPARED TO THE BUNDLE, by modification time, and an audit
 * refuses to measure a bundle older than the code it is supposed to be
 * measuring. An app served from live source has nothing to go stale and passes
 * straight through.
 */
const FRESHNESS_WATCHED = ['src', 'index.html', 'vite.config.ts', 'api', 'netlify']

/** The newest modification time under a path, and which file carried it. */
function newestMtime(path, best = { ms: 0, path: null }) {
  if (!existsSync(path)) return best
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      best = newestMtime(join(path, entry), best)
    }
    return best
  }
  return stat.mtimeMs > best.ms ? { ms: stat.mtimeMs, path } : best
}

/** The bundle the served index.html points at, or null when served from source. */
async function servedBundle() {
  try {
    const res = await fetch(APP_ORIGIN, { signal: AbortSignal.timeout(4000) })
    const html = await res.text()
    return /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Whether what is on the port was built from what is on disk.
 *
 * Returns a reason rather than throwing, so the caller decides whether a stale
 * bundle aborts the audit or is rebuilt.
 */
export async function servedAppFreshness() {
  const asset = await servedBundle()
  if (asset === null) return { fresh: true, why: 'served from source, nothing to go stale' }

  const file = join(process.cwd(), 'dist', asset.replace(/^\//, ''))
  if (!existsSync(file)) {
    return { fresh: false, why: `the served bundle ${asset} is not in dist/, so it cannot be dated` }
  }

  const built = statSync(file).mtimeMs
  const newest = FRESHNESS_WATCHED.reduce((best, p) => newestMtime(p, best), { ms: 0, path: null })
  if (newest.path !== null && newest.ms > built) {
    const seconds = Math.round((newest.ms - built) / 1000)
    return {
      fresh: false,
      why:
        `${newest.path} was changed ${seconds}s after ${asset} was built, so the port is ` +
        `serving older code than the editor has. Run npm run build.`,
    }
  }
  return { fresh: true, why: `${asset} is newer than every watched source file` }
}

/**
 * Make sure the app is there, starting one if it is not.
 *
 * Returns what to do about it afterwards. An audit that started the app stops
 * it; an audit that found one leaves it alone, because the hook starts one for
 * the whole run and four audits tearing it down in turn would be four cold
 * starts.
 */
export async function ensureApp({ start = true } = {}) {
  const first = await appIsServing()
  if (first.up) {
    /*
     * Reusing a server is where staleness lives: the hook builds once and
     * leaves the server up, so a hand run after an edit measures the build.
     */
    const fresh = await servedAppFreshness()
    if (!fresh.fresh) throw new PreflightError(fresh.why)
    process.stderr.write(`  ${fresh.why}\n`)
    return { started: false, stop: async () => {} }
  }

  if (first.reason.startsWith('something else')) {
    /* Never try to start a second one on an occupied port. */
    throw new PreflightError(first.reason)
  }
  if (!start) {
    throw new PreflightError(`the app is not running at ${APP_ORIGIN}: ${first.reason}`)
  }

  process.stderr.write(`  no app on ${APP_ORIGIN}, starting one\n`)
  const child = spawn('npx', ['vercel', 'dev', '--listen', '5173'], {
    stdio: 'ignore',
    detached: true,
  })
  child.unref()

  for (let i = 0; i < 120; i += 1) {
    await sleep(1000)
    const now = await appIsServing()
    if (now.up) {
      /* A second fetch, so the audit is not the request that pre-bundles. */
      await get(`${APP_ORIGIN}/`, 20000)
      return {
        started: true,
        stop: async () => {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* Already gone. Nothing to do and nothing worth saying. */
          }
        },
      }
    }
  }
  throw new PreflightError(
    `started a dev server but ${APP_ORIGIN} never served the app shell within 120s`,
  )
}

/** Make sure a debuggable browser is there, launching one if it is not. */
export async function ensureBrowser({ start = true } = {}) {
  const first = await browserIsUp()
  if (first.up) return { started: false, stop: async () => {} }
  if (!start) {
    throw new PreflightError(`no debuggable browser on ${CDP_ORIGIN}: ${first.reason}`)
  }

  const chrome = findChrome()
  if (chrome === null) {
    throw new PreflightError(
      'no Chrome found to launch. Looked for the Playwright build and /Applications/Google Chrome.app',
    )
  }

  process.stderr.write(`  no browser on ${CDP_ORIGIN}, launching one\n`)
  const child = spawn(
    chrome,
    [
      '--remote-debugging-port=9222',
      `--user-data-dir=${process.env.TMPDIR ?? '/tmp'}/scoutngo-audit-chrome`,
      '--headless=new',
      '--no-first-run',
      '--hide-scrollbars',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  )
  child.unref()

  for (let i = 0; i < 40; i += 1) {
    await sleep(1000)
    const now = await browserIsUp()
    if (now.up) {
      return {
        started: true,
        stop: async () => {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* Already gone. */
          }
        },
      }
    }
  }
  throw new PreflightError('launched a browser but it never opened a debuggable page target')
}

/**
 * THE LAST LINE IS ALWAYS A SENTENCE.
 *
 * Installed by every audit as its first statement. Any throw, anywhere,
 * including inside a promise nobody awaited, lands here and leaves one line
 * that says what went wrong and a non-zero exit. Before this, a thrown
 * TypeError printed a stack to a log the hook greps for "PROBLEM|TOTAL",
 * matched nothing, and the commit was refused with no explanation at all.
 */
/**
 * THE WATCHDOG THAT SAYS WHERE IT GOT TO.
 *
 * WHAT THIS REPLACES, AND WHY IT WAS THE WHOLE BUG. Every browser audit
 * carried this line:
 *
 *   setTimeout(() => { console.log('TIMED OUT'); process.exit(2) }, 290000)
 *
 * The commit hook greps each audit's log for a problem count. "TIMED OUT"
 * contains none of the words it looks for, so a slow run exited non-zero and
 * the hook refused the commit having printed one red line and no reason at
 * all. That is exactly the failure mode that cannot be told apart from a real
 * defect, and it cost an evening twice.
 *
 * So the timeout now speaks the same sentence as every other failure to look,
 * and it names the last step that finished, which is the one piece of
 * information that makes a timeout actionable rather than mysterious.
 *
 * THE CAP IS GENEROUS ON PURPOSE. A warm reachability run is 87 seconds; the
 * old cap was 290 and a COLD run exceeded it, because the first navigation to
 * each screen compiles modules that are not in the dev server's cache yet.
 * A watchdog exists to stop a hang, not to enforce a performance budget, and
 * one tight enough to fire on a cold cache is a coin toss wearing a gate's
 * clothing.
 */
export function startWatchdog(name, ms = 900_000) {
  const began = Date.now()
  let lastStep = 'nothing yet'
  const timer = setTimeout(() => {
    const elapsed = Math.round((Date.now() - began) / 1000)
    console.log(
      `\n=== ${name.toUpperCase()} AUDIT ABORTED: timed out after ${elapsed}s. ` +
        `Last step that finished: ${lastStep} ===`,
    )
    console.log('This is a failure to LOOK, not a problem found by looking.')
    process.exit(2)
  }, ms)
  /* Never hold the process open on its own account. */
  timer.unref?.()
  return {
    note(step) {
      lastStep = step
    },
    stop() {
      clearTimeout(timer)
    },
  }
}

export function guardAudit(name) {
  const die = (why) => {
    console.log(`\n=== ${name.toUpperCase()} AUDIT ABORTED: ${why} ===`)
    console.log('This is a failure to LOOK, not a problem found by looking.')
    process.exit(2)
  }
  process.on('unhandledRejection', (error) => {
    die(error instanceof Error ? error.message : String(error))
  })
  process.on('uncaughtException', (error) => {
    die(error instanceof Error ? error.message : String(error))
  })
}

/**
 * GO TO A STAGE, AND FAIL LOUDLY IF YOU CANNOT.
 *
 * WHY THIS IS A SHARED FUNCTION AND NOT A LINE IN EACH SCRIPT.
 *
 * Nine browser scripts each carried their own copy of
 *
 *   [...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()
 *
 * When the three-step progress rail was replaced by the bottom nav, every one
 * of those nine selectors stopped matching anything. The optional chain
 * swallowed it: no error, no warning, nine scripts quietly running every
 * assertion they had against the SETUP screen. The surface audit reported
 * twenty-two problems -- no sheet, no detents, no chips, no cards -- and not
 * one of them was the actual fault.
 *
 * THAT IS SHAPE C IN docs/failure-modes.md: a check pointed at the wrong
 * object. The guard rule there says to assert a positive property rather than
 * trust a name, so this does both things the nine copies did not:
 *
 *   it THROWS when the button is not found, instead of returning undefined
 *   it VERIFIES ARRIVAL by reading the shell's own stage class afterwards
 *
 * A rename now produces one sentence naming the selector, in one file, rather
 * than a page of symptoms in whichever audit ran first.
 *
 * MATCHED ON THE BUTTON'S OWN TEXT, not on a class name, so the nav can be
 * restyled without breaking every script again.
 *
 * TAKES THE MODE ID, NOT THE LABEL ON THE BUTTON. The first stage is `setup`
 * in the code and reads MAP on the screen -- it is the map you set the pin on
 * -- so the caller names the mode and this does the one translation, in one
 * place. A caller passing the label would be a caller guessing.
 */
/*
 * THE MENU, NOT A TAB ROW. The bottom nav is gone: every stage is one item in
 * the side menu, opened by the top bar's menu button. Two steps, both checked.
 * The labels are the menu's own words (src/lib/menu.ts).
 */
const NAV_LABEL = { setup: 'Shoot setup', plan: 'Plan', field: 'Field' }

/*
 * SHOOT SETUP AND FIELD LEFT THE MENU on 27 Oct: Shoot setup lives inside
 * Plan (the venue pill in Plan's top bar opens it), and Field is reached by
 * its own address, /field (src/lib/menu.ts OLD_PATHS), which the app follows
 * on back and forward too. Both checked the same way as a menu pick.
 */
async function arrivedAt(ev, want, how) {
  const arrived = await ev(`document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null`)
  if (arrived !== want) throw new PreflightError(`${how} and the shell is still "${arrived}"`)
  return arrived
}

export async function goToStage(ev, wait, stage) {
  const want = stage.toLowerCase()
  const label = NAV_LABEL[want]
  if (label === undefined) {
    throw new PreflightError(
      `no such stage "${stage}". The three are: ${Object.keys(NAV_LABEL).join(', ')}.`,
    )
  }
  if (want === 'field') {
    await ev(`(() => { history.pushState(null, '', '/field' + location.search + location.hash); dispatchEvent(new PopStateEvent('popstate')); return 1 })()`)
    await wait(600)
    return arrivedAt(ev, want, 'went to /field')
  }
  if (want === 'setup') {
    const now = await ev(`document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null`)
    if (now === 'setup') return now
    if (now !== 'plan') await goToStage(ev, wait, 'plan')
    const tapped = await ev(`(() => { const b = document.querySelector('button.pill-venue'); if (!b) return false; b.click(); return true })()`)
    if (!tapped) throw new PreflightError("no venue pill in Plan's top bar to open Shoot setup from (src/components/PlanMode.tsx)")
    await wait(600)
    return arrivedAt(ev, want, "tapped Plan's venue pill")
  }

  /* A first load on a cold dev server can take a while: wait for the top bar, up to 15 s. */
  for (let i = 0; i < 30; i += 1) {
    if (await ev(`!!document.querySelector('nav[aria-label="Stage"], button[aria-label="Menu"]')`)) break
    await wait(500)
  }
  const opened = await ev(`(() => {
    if (document.querySelector('nav[aria-label="Stage"]')) return 'ok'
    const menu = document.querySelector('button[aria-label="Menu"]')
    if (!menu) return 'no menu button in the top bar'
    menu.click()
    return 'ok'
  })()`)
  if (opened !== 'ok') {
    throw new PreflightError(`could not open the menu: ${opened}. It is the top bar's first button, src/components/TopBar.tsx.`)
  }
  await wait(300)

  const clicked = await ev(`(() => {
    const buttons = [...document.querySelectorAll('nav[aria-label="Stage"] button')]
    if (buttons.length === 0) return 'the menu opened no stage nav'
    const hit = buttons.find((b) => (b.querySelector('.sidemenu__label')?.textContent ?? '').trim() === ${JSON.stringify(label)})
    if (!hit) return 'no ' + ${JSON.stringify(label)} + ' item; the menu offers: ' +
      buttons.map((b) => (b.querySelector('.sidemenu__label')?.textContent ?? '').trim()).join(', ')
    hit.click()
    return 'ok'
  })()`)

  if (clicked !== 'ok') {
    throw new PreflightError(
      `could not navigate to ${label}: ${clicked}. ` +
        'The stage nav is the side menu, src/components/SideMenu.tsx.',
    )
  }

  await wait(600)

  /*
   * AND CONFIRM IT. A click that lands on the right button and changes nothing
   * is the gesture-deadlock shape: the control exists, the control is enabled,
   * and the app is still where it was.
   */
  const arrived = await ev(
    `document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null`,
  )
  if (arrived !== want) {
    throw new PreflightError(
      `clicked ${label} and the shell is still "${arrived}". ` +
        'The menu is navigation, not a progress bar: see SideMenu.tsx.',
    )
  }
  return arrived
}

/*
 * PUT THE SHEET AT A DETENT, AND FAIL LOUDLY IF YOU CANNOT.
 *
 * Three audits opened the sheet by clicking `.peek__summary`, which stopped
 * existing when the peek became the time strip. The optional chain swallowed
 * it and every "sheet open" check ran against a sheet at peek -- shape C, a
 * check pointed at the wrong object. This reads `data-detent` back, which is
 * the sheet's own word for where it is.
 */
export async function setSheet(ev, wait, want) {
  for (let i = 0; i < 4; i += 1) {
    const now = await ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)
    if (now === want) return want
    if (now === null) throw new PreflightError('no sheet on screen to move')
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(600)
  }
  const last = await ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)
  if (last !== want) throw new PreflightError(`could not put the sheet at ${want}; it is at ${last}`)
  return want
}

/*
 * PRESS SUGGEST, AND FAIL LOUDLY IF IT IS NOT THERE.
 *
 * Two audits looked for Suggest as `.act`, which has not been its class for
 * several passes, so neither has run Suggest in that time and both reported
 * on a plan with no suggested positions. The button is `.shootc__gen` on the
 * shoot card; the sheet has to be up for it to be in the DOM.
 */
export async function pressSuggest(ev, wait) {
  await setSheet(ev, wait, 'half')
  const pressed = await ev(`(() => {
    const b = document.querySelector('.shootc__gen')
    if (!b) return 'no Suggest button on the shoot card'
    b.click()
    return 'pressed'
  })()`)
  if (pressed !== 'pressed') throw new PreflightError(pressed)
  /*
   * Suggest is arithmetic plus two Overpass reads; wait for it to say it is
   * done. 75 s, not 40: on 29 Oct with Overpass down (its main server
   * answering 406, both mirrors timing out) Suggest still finished, without
   * the site's map data, in about 45 s, and the audits that press it could
   * not look at all. The wait is how long to look, not what is acceptable.
   */
  for (let i = 0; i < 75; i += 1) {
    await wait(1000)
    const state = await ev(`document.querySelector('.suggested') ? 'done' : document.querySelector('.stages') ? 'working' : 'idle'`)
    if (state === 'done') return
  }
  throw new PreflightError('pressed Suggest and it never reported a result in 75 s')
}
