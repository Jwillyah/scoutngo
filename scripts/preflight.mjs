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
import { existsSync } from 'node:fs'

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
  if (first.up) return { started: false, stop: async () => {} }

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
