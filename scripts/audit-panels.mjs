/*
 * PANEL COMBINATION AUDIT
 *
 * Usage:  node scripts/audit-panels.mjs
 * Needs:  the app on http://127.0.0.1:5173 and Chrome on --remote-debugging-port=9222
 * Exits:  0 when every pair of panels is clean, 1 otherwise.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT PART OF THE REACHABILITY AUDIT.
 *
 * Marking and the sky key were both open at once, one bleeding through the
 * other, both scrolling. The reachability audit reported 0 problems with that
 * on screen, and it was right to: every control WAS reachable. It opens one
 * surface, checks it, closes it, opens the next.
 *
 * That is the third check in this repo to be blind to the thing it existed
 * for, and all three failed the same way:
 *
 *   the fixed-position exemption that excused the drawer it was meant to catch
 *   the count subtraction that could say how many lenses were lost, never which
 *   and now a surface audit that cannot see a two-surface bug
 *
 * Every one of them tested ONE THING AT A TIME and the fault lived in the
 * combination. So this audit's unit is the PAIR. It opens every panel against
 * every other panel and asserts two things:
 *
 *   1. They are never both on screen. Not "the second one wins visually", not
 *      "one is on top": the other must not be rendered at all.
 *   2. Whatever IS open does not cover the control row that opened it, and
 *      does not sit over the map controls down the right-hand side.
 *
 * THE SECOND IS NOT A STYLE CHECK. A panel over the button that closes it is a
 * panel you cannot close, and a panel over the zoom controls is a map you
 * cannot drive while reading it.
 */

import { guardAudit, startWatchdog } from './preflight.mjs'

/*
 * ARMED BEFORE ANYTHING ELSE CAN THROW.
 *
 * This audit used to die on a TypeError when the thing it needed was not
 * there, printing a stack trace into a log the commit hook greps for a problem
 * count. It matched nothing, so the hook refused the commit with one red line
 * and no reason. Any throw from here on prints one sentence saying the audit
 * could not LOOK, and exits 2 so that is distinguishable from a problem found.
 */
guardAudit('panel')

import { connect } from './cdp.mjs'

const OUT = process.env.SCOUTNGO_OUT ?? '.'

/**
 * The panels this screen can open, and how to open each one.
 *
 * NAMED BY THE BUTTON THE SHOOTER PRESSES, not by the component, because the
 * question being asked is about what is on the screen rather than about the
 * tree that produced it.
 */
/*
 * EVERY SURFACE THIS SCREEN CAN OPEN GOES IN HERE WHEN IT IS ADDED, not after
 * it has gone wrong. That ordering is the whole difference between this audit
 * and the three checks before it that were blind to what they existed for.
 *
 * ONE KNOWN GAP, STATED RATHER THAN PAPERED OVER: the Airspace view only
 * exists with an air position in the plan, and this probe builds a plan by
 * loading the calibration venue, which has none. So Airspace is not reachable
 * here and is NOT covered below. It shares the sheet with Conditions and Sun
 * when, so the sheet's own geometry is exercised; what is untested is Airspace
 * specifically. Writing it in as if it were covered would be worse than this
 * comment.
 */
const PANELS = [
  { id: 'hazards', button: /^Hazards/, selector: '.hz' },
  { id: 'sky', button: /^Sky/, selector: '.skykey' },
  /*
   * SHEET VIEWS ARE IDENTIFIED BY THEIR OWN CONTENT, not by the sheet.
   *
   * Both of these render inside .sheet--open, so selecting the sheet made the
   * pair test meaningless: it compared one element against itself and reported
   * every combination as two panels open at once. The selector has to name the
   * VIEW for "which one is showing" to be a real question.
   */
  { id: 'conditions', button: /^Conditions/, selector: '.cond' },
  { id: 'sunsearch', button: /^Sun when/, selector: '.sunq' },
]

/**
 * Chrome a panel must never cover.
 *
 * THE FIRST VERSION OF THIS LIST WAS TOO SHORT and missed a real one. It held
 * the control row and the map controls, and the sky key was reported clean
 * while sitting on the time bar and the stage rail: 25,786 square pixels of
 * the sheet and 10,467 of the dock, measured by hand afterwards.
 *
 * Same shape as every blind check before it. The list was written from the
 * panels that had gone wrong so far rather than from what a panel must not
 * cover, so the next kind of wrong was outside it. These four are now the
 * answer to the second question: the row that opened it, the map controls, the
 * sheet, and the dock that carries the time bar and the stage rail.
 */
const PROTECTED = ['.hud', '.map-ctl', '.plat', '.sheet', '.dock']

const press = (re) =>
  `(() => {
     const b = [...document.querySelectorAll('button')].find((x) => ${re}.test(x.textContent.trim()))
     if (b === undefined) return 'no button'
     b.click()
     return 'ok'
   })()`

const visible = (sel) =>
  `(() => {
     const n = document.querySelector('${sel}')
     if (n === null) return null
     const r = n.getBoundingClientRect()
     const cs = getComputedStyle(n)
     if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) {
       return null
     }
     return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) }
   })()`

/*
 * WHAT IS ACTUALLY ON SCREEN, not what the layout box says.
 *
 * A view inside the bottom sheet is a tall element in a SCROLLING parent: its
 * own rect runs to 2,335px while only the 260px inside the sheet is visible.
 * Measuring the raw rect reported the sheet views as covering the dock by
 * 65,000 square pixels, which is not something a shooter could ever see.
 *
 * So a panel's rect is intersected with every ancestor that clips. That is the
 * region a person can actually see, which is the only region that can actually
 * cover a control.
 */
const CLIPPED_RECT = `
  (node) => {
    let r = node.getBoundingClientRect()
    let top = r.top, left = r.left, right = r.right, bottom = r.bottom
    for (let p = node.parentElement; p !== null; p = p.parentElement) {
      const cs = getComputedStyle(p)
      const clips = /auto|hidden|scroll|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)
      if (!clips) continue
      const q = p.getBoundingClientRect()
      top = Math.max(top, q.top); left = Math.max(left, q.left)
      right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom)
    }
    return { top, left, right, bottom }
  }
`

const overlaps = (sel) =>
  `(() => {
     const clipped = ${CLIPPED_RECT}
     const p = document.querySelector('${sel}')
     if (p === null) return []
     const r = clipped(p)
     if (r.right <= r.left || r.bottom <= r.top) return []
     const hits = []
     for (const key of ${JSON.stringify(PROTECTED)}) {
       for (const c of document.querySelectorAll(key)) {
         /*
          * A PANEL CANNOT COVER ITSELF. The conditions view lives inside the
          * sheet, so without this it reported its own container as covered.
          * Skipping the panel, anything inside it and anything it sits inside
          * is the rule; two separate things overlapping is not.
          */
         if (c === p || c.contains(p) || p.contains(c)) continue
         const q = clipped(c)
         if (q.right <= q.left || q.bottom <= q.top) continue
         const w = Math.min(r.right, q.right) - Math.max(r.left, q.left)
         const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)
         /* A hairline touch is not a cover. 120 square pixels is a thumb. */
         if (w > 0 && h > 0 && w * h > 120) {
           hits.push(key + ' by ' + Math.round(w * h) + 'px')
         }
       }
     }
     return hits
   })()`

const watchdog = startWatchdog('panel')
const { ev, wait, shot, send, load, errs, dispose } = await connect()

let problems = 0
const fail = (line) => {
  console.log('      PROBLEM: ' + line)
  problems += 1
}

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
})
await ev(`localStorage.clear()`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
/* The landing page is shown once and is not one of the panels under test. */
await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
await wait(6000)
await ev(`[...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()`)
await wait(4000)

/** Shuts everything, so each case starts from a known screen. */
async function closeAll() {
  for (const panel of PANELS) {
    const open = await ev(visible(panel.selector))
    if (open !== null) {
      await ev(press(panel.button))
      await wait(500)
    }
  }
  /* The sheet closes by its grip rather than by the button that opened it. */
  await ev(`document.querySelector('.sheet--open .sheet__grip')?.click()`)
  await wait(400)
}

watchdog.note('starting the pair tests')
console.log('### one panel at a time')

for (const first of PANELS) {
  for (const second of PANELS) {
    if (first.id === second.id) continue

    await closeAll()
    await ev(press(first.button))
    await wait(900)
    const firstOpen = await ev(visible(first.selector))
    if (firstOpen === null) {
      console.log(`  ${first.id} did not open, skipping its pairs`)
      break
    }

    await ev(press(second.button))
    await wait(900)

    const a = await ev(visible(first.selector))
    const b = await ev(visible(second.selector))
    const both = a !== null && b !== null

    console.log(
      `  open ${first.id.padEnd(11)} then ${second.id.padEnd(11)} ` +
        `${first.id}=${a === null ? 'closed' : 'OPEN'} ${second.id}=${b === null ? 'closed' : 'OPEN'} ` +
        `${both ? 'FAIL' : 'ok'}`,
    )

    if (both) {
      fail(`${first.id} and ${second.id} are both on screen at once`)
      await shot(OUT, `panels-${first.id}-${second.id}`)
    }
  }
}

watchdog.note('starting the cover tests')
console.log('\n### an open panel covers no control')

for (const panel of PANELS) {
  await closeAll()
  await ev(press(panel.button))
  await wait(900)
  const open = await ev(visible(panel.selector))
  if (open === null) {
    console.log(`  ${panel.id.padEnd(11)} did not open`)
    continue
  }
  const hits = await ev(overlaps(panel.selector))
  console.log(
    `  ${panel.id.padEnd(11)} ${JSON.stringify(open).padEnd(52)} ${hits.length === 0 ? 'ok' : 'FAIL'}`,
  )
  for (const hit of hits) fail(`${panel.id} covers ${hit}`)
}

const noise = errs.filter((e) => !/arcgis|AJAXError|Failed to fetch/.test(e))
if (noise.length > 0) console.log('\nconsole errors: ' + JSON.stringify(noise.slice(0, 3)))

console.log('\n=== PANEL PROBLEMS: ' + problems + ' ===')
watchdog.stop()
await dispose()
process.exit(problems === 0 ? 0 : 1)
