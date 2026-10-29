/*
 * TWENTY DRAGS ON THE PLAN SHEET, AS A THUMB MAKES THEM.
 *
 * Shared by scripts/measure-sheet-gestures.mjs (which records the count) and
 * scripts/audit-surface.mjs (which fails the gate on any wrong one).
 *
 * Each drag is real touch input through the browser's own pipeline
 * (Input.dispatchTouchEvent under touch emulation), so touch-action, pointer
 * capture and the page's scrolling all take part, the way they do on a
 * phone. After each one the sheet's detent (its data-detent) and the time
 * bar's moment (the strip's aria-valuenow) are read back and compared with
 * what that drag should have moved:
 *
 *   the chart (the time bar's strip)   sideways moves the time, never the sheet;
 *                                       up or down moves the sheet, never the time
 *                                       (29 Oct: decided on the first 8 px, a
 *                                       thumb's upward pivot still sideways)
 *   the grab handle and the date row    up or down moves the sheet, never the time
 *   the card's body                     up or down moves the sheet (its empty
 *                                       space drags it, 29 Oct)
 *   the tool dock                       never the sheet
 *
 * A drag that moved the wrong thing, or failed to move the right one, is
 * counted wrong. The target is none.
 */

/** Where things are, read fresh before each drag. */
const GEOMETRY = `(() => {
  /* Clipped to the screen, and to the sheet's open body for what scrolls inside it: a touch lands only on what is shown. */
  const body = document.querySelector('.sheet__body:not([hidden])')?.getBoundingClientRect()
  const r = (s) => {
    const e = document.querySelector(s); if (!e) return null
    const b = e.getBoundingClientRect()
    let top = Math.max(0, b.top), bottom = Math.min(window.innerHeight, b.bottom)
    if (body && e.closest('.sheet__body')) { top = Math.max(top, body.top); bottom = Math.min(bottom, body.bottom) }
    if (bottom - top < 8) return null
    return { left: b.left, top, right: b.right, bottom, width: b.width, height: bottom - top }
  }
  return {
    strip: r('.tbar__strip'),
    day: r('.tbar__day'),
    grab: r('.sheet__grab'),
    sheet: r('.sheet'),
    dock: r('.tooldock'),
    card: r('.sheet__card'),
    vh: window.innerHeight,
  }
})()`

const STATE = `(() => ({
  detent: document.querySelector('.sheet')?.dataset.detent ?? null,
  at: Number(document.querySelector('.tbar__strip')?.getAttribute('aria-valuenow') ?? NaN),
}))()`

/** Put the time bar at a venue clock time on its own day, through its own jump field. */
const setClock = (hhmm) => `(() => {
  const inp = document.querySelector('.tbar__jump')
  if (!inp) return 'no jump field'
  const day = String(inp.value).slice(0, 10)
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(inp, day + 'T${hhmm}')
  inp.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`

/*
 * THE TWENTY. `at` is the venue clock time set first, `from` the detent the
 * sheet is put at by tapping its handle, `on` where the thumb lands, `dx`/`dy`
 * how far it travels (up is negative), and `want` what must have changed.
 * `to` is the detent a sheet drag must land on. `hook` starts the drag the
 * way a thumb starts a sideways swipe: the first 12 px mostly upward, as the
 * thumb's arc pivots from the wrist, then sideways.
 */
export const DRAGS = [
  { at: '07:00', from: 'peek', on: 'strip', dx: -90, dy: 0, hook: true, want: { time: true, sheet: 'peek' } },
  { at: '12:30', from: 'peek', on: 'strip', dx: 110, dy: 6, want: { time: true, sheet: 'peek' } },
  { at: '17:45', from: 'peek', on: 'strip', dx: -70, dy: -10, hook: true, want: { time: true, sheet: 'peek' } },
  { at: '07:00', from: 'peek', on: 'strip', dx: 0, dy: -160, want: { time: false, sheet: 'half' } },
  { at: '17:45', from: 'peek', on: 'strip', dx: 4, dy: 60, want: { time: false, sheet: 'peek' } },
  { at: '12:30', from: 'peek', on: 'strip', dx: 80, dy: -45, want: { time: true, sheet: 'peek' } },
  { at: '07:00', from: 'half', on: 'strip', dx: 100, dy: 0, hook: true, want: { time: true, sheet: 'half' } },
  { at: '12:30', from: 'half', on: 'strip', dx: 6, dy: -150, want: { time: false, sheet: 'full' } },
  { at: '17:45', from: 'half', on: 'strip', dx: -5, dy: 150, want: { time: false, sheet: 'peek' } },
  { at: '17:45', from: 'full', on: 'strip', dx: -100, dy: 8, hook: true, want: { time: true, sheet: 'full' } },
  { at: '07:00', from: 'full', on: 'strip', dx: 0, dy: 200, want: { time: false, sheet: 'half' } },
  { at: '12:30', from: 'peek', on: 'grab', to: 'half', want: { time: false, sheet: 'half' } },
  { at: '17:45', from: 'half', on: 'grab', to: 'full', want: { time: false, sheet: 'full' } },
  { at: '07:00', from: 'full', on: 'grab', to: 'half', want: { time: false, sheet: 'half' } },
  { at: '12:30', from: 'half', on: 'grab', to: 'peek', want: { time: false, sheet: 'peek' } },
  { at: '17:45', from: 'peek', on: 'day', to: 'half', want: { time: false, sheet: 'half' } },
  { at: '07:00', from: 'half', on: 'day', to: 'peek', want: { time: false, sheet: 'peek' } },
  { at: '12:30', from: 'full', on: 'grab', to: 'peek', want: { time: false, sheet: 'peek' } },
  { at: '17:45', from: 'half', on: 'dock', dx: 0, dy: 120, want: { time: false, sheet: 'half' } },
  { at: '12:30', from: 'half', on: 'card', dx: 0, dy: 140, want: { time: false, sheet: 'peek' } },
]

const DETENT_SHARE = { peek: null, half: 0.45, full: 0.92 }

async function touchDrag(send, wait, x0, y0, x1, y1, hook = false) {
  const STEPS = 12
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) })
  if (hook) {
    /* Up 12 px and across 3, over three moves, then on from there. */
    const sx = Math.sign(x1 - x0)
    for (let i = 1; i <= 3; i += 1) {
      await wait(16)
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + sx * i, y0 - 4 * i) })
    }
    y0 -= 12
    y1 -= 12
    x0 += sx * 3
  }
  for (let i = 1; i <= STEPS; i += 1) {
    await wait(16)
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + ((x1 - x0) * i) / STEPS, y0 + ((y1 - y0) * i) / STEPS) })
  }
  await wait(16)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function setDetent(ev, wait, want) {
  for (let i = 0; i < 4; i += 1) {
    if ((await ev(STATE)).detent === want) return true
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(650)
  }
  return (await ev(STATE)).detent === want
}

/** Runs the twenty, or those at `only` (indexes); returns one row per drag. */
export async function runSheetGestures({ send, ev, wait }, only = null) {
  const rows = []
  for (const [i, d] of DRAGS.entries()) {
    if (only !== null && !only.includes(i)) continue
    const row = { n: i + 1, ...d, got: null, wrong: true, note: '' }
    if (!(await setDetent(ev, wait, d.from))) {
      row.note = `could not put the sheet at ${d.from}`
      rows.push(row)
      continue
    }
    const set = await ev(setClock(d.at))
    if (set !== 'ok') {
      row.note = set
      rows.push(row)
      continue
    }
    await wait(350)
    const g = await ev(GEOMETRY)
    const before = await ev(STATE)
    const box = g[d.on]
    if (box === null || box === undefined) {
      row.note = `no ${d.on} on screen`
      rows.push(row)
      continue
    }
    const x0 = box.left + box.width / 2 + (d.on === 'strip' ? -box.width / 6 : 0)
    /* The dock: its lower edge, where a thumb reaching for it overhangs toward the sheet. */
    const y0 = d.on === 'dock' ? box.bottom - 3 : box.top + box.height / 2
    let x1 = x0 + (d.dx ?? 0)
    let y1 = y0 + (d.dy ?? 0)
    if (d.to !== undefined) {
      /* Where the sheet's top must land for that detent, measured from the sheet's own bottom. */
      /* The room the sheet has: from the dock up to the chrome at the top (about 110 px). */
      const avail = g.sheet.bottom - 110
      const height = d.to === 'peek' ? Number(process.env.PEEK ?? 187) : d.to === 'half' ? Math.max(avail * DETENT_SHARE.half, 364) : avail * DETENT_SHARE.full
      const top = g.sheet.bottom - height
      x1 = x0
      y1 = y0 + (top - g.sheet.top)
    }
    await touchDrag(send, wait, x0, y0, x1, y1, d.hook === true)
    await wait(750)
    const after = await ev(STATE)
    const timeMoved = Number.isFinite(after.at) && Number.isFinite(before.at) && after.at !== before.at
    row.got = { time: timeMoved, sheet: after.detent }
    row.wrong = timeMoved !== d.want.time || after.detent !== d.want.sheet
    row.note = `${Math.round(x0)},${Math.round(y0)} -> ${Math.round(x1)},${Math.round(y1)}`
    rows.push(row)
  }
  return rows
}

export function describeDrag(r) {
  const what = r.on === 'strip' ? 'the chart' : r.on === 'grab' ? 'the grab handle' : r.on === 'day' ? 'the date row' : r.on === 'dock' ? "the tool dock's lower edge" : "the card's body"
  const move = r.to !== undefined ? `to ${r.to}` : `${r.dx ?? 0}, ${r.dy ?? 0} px${r.hook ? ', thumb hook first' : ''}`
  return `${r.at}, sheet at ${r.from}, ${what}, ${move}`
}
