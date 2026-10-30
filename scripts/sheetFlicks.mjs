/*
 * FLICKS AND SLOW DRAGS ON THE PLAN SHEET, AND WHERE IT LANDED.
 *
 * Shared by scripts/measure-sheet-flicks.mjs (records the count) and the
 * gesture audit (fails the gate on a wrong landing).
 *
 * 29 Oct, from the pier: "Today you have to hold and pull slowly, and it
 * often doesn't move. Must work like Apple Maps: a quick flick moves it.
 * A flick down of any length goes to the next lower snap point, a flick up
 * to the next higher. A slow drag snaps to the nearest point on release."
 *
 * Real touch input (Input.dispatchTouchEvent under touch emulation). Each
 * flick starts from a settled detent, on the grab handle, the date row or
 * the card's empty space, at one of several speeds and lengths. What it
 * should do:
 *
 *   flick up       the next detent above the one it started at (full stays full)
 *   flick down     the next below (peek stays peek)
 *   slow drag      the detent nearest where it was let go
 *
 * JUDGED BY THE SPEED THE PAGE SAW, NOT THE SPEED ASKED. A dispatch is a
 * round trip of about 50 ms, so a short quick flick arrives as one move and
 * reads slower than it was asked: such a drag is judged as the slow drag it
 * was. So that this cannot quietly turn every flick into a slow drag, each
 * detent and direction must have had at least 12 of its 20 arrive faster
 * than the flick speed (src/core/sheetMotion.ts FLICK_PX_PER_MS), or the run
 * says it could not look.
 */
import { FLICK_PX_PER_MS } from '../src/core/sheetMotion.ts'

const ORDER = ['peek', 'half', 'full']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Where a drag can start: the handle, the date row, and blank space in the card, read fresh. */
const STARTS = `JSON.stringify((() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.height < 4 ? null : { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 20) } }
  const sheet = document.querySelector('.sheet')
  const body = document.querySelector('.sheet__body:not([hidden])')
  let blank = null
  if (body) {
    /* A point in the body whose top element is no control: blank card. */
    const b = body.getBoundingClientRect()
    for (let y = b.top + 10; y < Math.min(b.bottom, innerHeight) - 10 && blank === null; y += 14)
      for (let x = b.left + 12; x < b.right - 12; x += 30) {
        const e = document.elementFromPoint(x, y)
        if (e && body.contains(e) && !e.closest('button, a, input, select, textarea, [role=slider], svg')) { blank = { x, y }; break }
      }
  }
  return { handle: r(document.querySelector('.sheet__grab')), date: r(document.querySelector('.tbar__when')), blank, detent: sheet?.dataset.detent ?? null, height: sheet?.getBoundingClientRect().height ?? null }
})())`

const detentNow = (ev) => ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)

/**
 * One vertical drag: `dy` total px (negative is up), at `speed` px/ms, with
 * an optional still hold before release.
 *
 * PACED BY THE CLOCK, NOT BY STEPS. Each dispatch is a round trip to the
 * browser, so "a step every 8 ms" delivered a third of the speed asked for:
 * every flick asked at 1.2 px/ms or less arrived as a slow drag (28 Oct).
 * Each move now goes where the finger would be by now.
 */
export async function verticalDrag(send, at, dy, speed, holdMs = 0) {
  const duration = Math.abs(dy) / speed
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 0 }] })
  const start = performance.now()
  for (;;) {
    await sleep(4)
    const share = Math.min(1, (performance.now() - start) / duration)
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y + dy * share, id: 0 }] })
    if (share >= 1) break
  }
  if (holdMs > 0) await sleep(holdMs)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** The speed the page saw over the last 80 ms before release, px/ms (negative is up). Installed once per page. */
export const SPEED_PROBE = `(() => {
  if (window.__flick) return 'ok'
  const F = (window.__flick = { s: [], last: null })
  addEventListener('touchstart', (e) => { F.s = [[e.timeStamp, e.touches[0].clientY]] }, { capture: true, passive: true })
  addEventListener('touchmove', (e) => { F.s.push([e.timeStamp, e.touches[0].clientY]) }, { capture: true, passive: true })
  addEventListener('touchend', () => {
    const s = F.s, last = s[s.length - 1]
    let first = s[0]
    for (let i = s.length - 1; i >= 0; i--) { if (last[0] - s[i][0] > 80) break; first = s[i] }
    F.last = last[0] === first[0] ? 0 : (last[1] - first[1]) / (last[0] - first[0])
  }, { capture: true, passive: true })
  return 'ok'
})()`

/** Puts the sheet at a detent by its own handle's tap (which steps peek, half, full, peek). */
async function settleAt(ev, wait, want) {
  for (let i = 0; i < 4; i += 1) {
    if ((await detentNow(ev)) === want) return true
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(500)
  }
  return (await detentNow(ev)) === want
}

const FLICKS = [
  /* [length px, speed px/ms]: a thumb's flicks, short to long. */
  [24, 1.2], [40, 0.9], [60, 1.6], [90, 2.4], [120, 1.8],
  [30, 2], [48, 1], [70, 0.8], [100, 1.4], [16, 1.5],
]
export const MIN_REAL_FLICKS = 12

/**
 * Runs the flicks and slow drags; returns one row per drag with what it should
 * have done and what it did. `perDirection` flicks each way from each detent.
 */
export async function runSheetFlicks({ send, ev, wait }, perDirection = 20) {
  const rows = []
  /* The detents' heights first: a drag that arrived slow is judged against them. */
  const heights = {}
  for (const d of ORDER) {
    if (await settleAt(ev, wait, d)) {
      await wait(400)
      heights[d] = JSON.parse(await ev(STARTS)).height
    }
  }
  const nearest = (h) => ORDER.reduce((best, d) => (Math.abs(heights[d] - h) < Math.abs(heights[best] - h) ? d : best))
  rows.realFlicks = {}
  for (const from of ORDER) {
    for (const dir of ['up', 'down']) {
      rows.realFlicks[`${from} ${dir}`] = 0
      for (let k = 0; k < perDirection; k += 1) {
        if (!(await settleAt(ev, wait, from))) {
          rows.push({ from, kind: `flick ${dir}`, want: null, got: null, note: `could not settle at ${from}` })
          continue
        }
        /*
         * THE CONTENT AT ITS TOP, as docs/gestures.md has it: at full a pull
         * down in scrolled content scrolls the content, by design. Once the
         * shoot card grew taller than full (Save for offline, 29 Oct), the
         * flicks up on blank card scrolled it, and every flick down after them
         * was the content's, correctly, and read here as the sheet failing.
         */
        await ev(`(() => { const b = document.querySelector('.sheet__body:not([hidden])'); if (b) b.scrollTop = 0; return 1 })()`)
        await wait(350)
        const s = JSON.parse(await ev(STARTS))
        const where = ['handle', 'date', 'blank'][k % 3]
        const at = s[where] ?? s.handle
        const [len, speed] = FLICKS[k % FLICKS.length]
        await ev(SPEED_PROBE)
        await verticalDrag(send, at, dir === 'up' ? -len : len, speed)
        await wait(650)
        const got = await detentNow(ev)
        const seen = await ev(`window.__flick?.last ?? null`)
        const i = ORDER.indexOf(from)
        const fast = typeof seen === 'number' && Math.abs(seen) >= FLICK_PX_PER_MS
        if (fast) rows.realFlicks[`${from} ${dir}`] += 1
        const released = Math.max(heights.peek, Math.min(heights.full, heights[from] + (dir === 'up' ? len : -len)))
        const want = !fast ? nearest(released) : dir === 'up' ? ORDER[Math.min(2, i + 1)] : ORDER[Math.max(0, i - 1)]
        rows.push({ from, kind: fast ? `flick ${dir}` : `flick ${dir}, arrived slow`, on: s[where] ? where : 'handle', len, speed, seen, want, got, wrong: got !== want })
      }
    }
  }
  /* Slow drags, held still before release: they settle on the detent nearest where they were let go. */
  /* For each detent, drags that end a little past it, and two-thirds of the way to each neighbour. */
  const slow = []
  for (const from of ORDER) {
    const i = ORDER.indexOf(from)
    for (const to of [ORDER[i - 1], ORDER[i + 1]].filter(Boolean)) {
      const gap = heights[to] - heights[from]
      slow.push([from, Math.round(gap * 0.3)], [from, Math.round(gap * 0.7)])
    }
  }
  for (const [from, grow] of slow) {
    if (!(await settleAt(ev, wait, from))) {
      rows.push({ from, kind: 'slow drag', want: null, got: null, note: `could not settle at ${from}` })
      continue
    }
    await wait(350)
    const s0 = JSON.parse(await ev(STARTS))
    await verticalDrag(send, s0.handle, -grow, 0.25, 160)
    await wait(650)
    const got = await detentNow(ev)
    const want = nearest(heights[from] + grow)
    rows.push({ from, kind: 'slow drag', on: 'handle', len: Math.abs(grow), speed: 0.25, want, got, wrong: got !== want })
  }
  rows.heights = heights
  return rows
}
