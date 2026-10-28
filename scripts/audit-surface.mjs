/*
 * THE ONE SURFACE AUDIT
 *
 * Usage:  node scripts/audit-surface.mjs
 * Exits:  0 when one surface covers the map and every section is reachable.
 *
 * WHAT THIS REPLACED, AND WHY IT IS A DIFFERENT CHECK RATHER THAN A PORT.
 *
 * audit-panels.mjs asserted that no two of a NAMED LIST of panels were open at
 * once, and that an open panel did not cover a HAND-WRITTEN LIST of elements it
 * must not overlap. Both lists were assembled from whichever bugs had already
 * happened:
 *
 *   PANELS grew hazards, then sky, then conditions, then sunsearch, then
 *   layers, each added the pass after it broke something
 *
 *   PROTECTED grew .hud, .map-ctl, .plat, then .sheet and .dock, the last two
 *   only after the sky key was measured sitting on 25,786 square pixels of
 *   the sheet
 *
 * Every pair had to be enumerated, and the one that mattered was always the
 * pair nobody had thought of. That is the shape of every blind check in this
 * repo, and no amount of adding entries fixes it, because the list is the bug.
 *
 * THERE IS NOTHING TO ENUMERATE NOW. One surface may cover the map, so the
 * assertion is a COUNT taken from the DOM rather than a list taken from
 * memory: find every absolutely-positioned element over the map and require
 * that there is exactly one, whatever it is called. A sixth panel added in six
 * months fails this without anybody remembering to add it anywhere.
 *
 * WHICH CHECKS WERE DELETED WITH audit-panels.mjs:
 *
 *   1. the pair matrix: every panel against every other panel, 20 pairs by the
 *      end, asserting both were never visible at once. Dead because the state
 *      that allowed two panels no longer exists: sections are children of one
 *      sheet and cannot be siblings of it.
 *
 *   2. the PROTECTED overlap check: an open panel must not cover .hud,
 *      .map-ctl, .plat, .sheet or .dock. Dead three ways: .hud and .plat are
 *      gone entirely, .map-ctl was replaced by the rail which is asserted
 *      below by position rather than by exception, and a section cannot cover
 *      the sheet it is inside.
 *
 *   3. the self-overlap exclusion (c === p || c.contains(p) || p.contains(c))
 *      and the clipped-rect measurement that followed it. Both existed only to
 *      stop the overlap check reporting a panel against its own container.
 *      With no overlap check there is nothing to exclude.
 *
 *   4. the `via` parent-opening logic, added so the audit could reach hazards
 *      and sky once they moved inside the layers list, and then fixed again
 *      when pressing the parent toggled it shut. Dead: sections are reached by
 *      opening the sheet, which is one action with no nesting.
 */
import { readFileSync } from 'node:fs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('surface')

import { connect } from './cdp.mjs'
import { describeDrag, DRAGS, runSheetGestures } from './sheetGestures.mjs'

const OUT = process.env.SCOUTNGO_OUT ?? '.'
const VIEWPORT = { width: 390, height: 844 }

const watchdog = startWatchdog('surface')
const { ev, wait, shot, send, load, errs, dispose } = await connect()

let problems = 0
const fail = (line) => {
  console.log('      PROBLEM: ' + line)
  problems += 1
}

await send('Emulation.setDeviceMetricsOverride', {
  ...VIEWPORT,
  deviceScaleFactor: 3,
  mobile: true,
})
await ev(`localStorage.clear()`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
await wait(6000)
await goToStage(ev, wait, 'plan')
await wait(4500)

/*
 * EVERY ELEMENT THAT COVERS THE MAP, FOUND BY POSITION AND NOT BY NAME.
 *
 * Walks the whole tree, keeps anything fixed or absolute that actually covers
 * a meaningful piece of the map canvas, and drops anything that is inside
 * something already counted so one surface is not reported as five.
 */
const SURFACES = `(() => {
  const canvas = document.querySelector('.map__canvas')
  if (canvas === null) return { error: 'no map canvas' }
  const map = canvas.getBoundingClientRect()
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height)
  const over = (r) => {
    const w = Math.min(r.right, map.right) - Math.max(r.left, map.left)
    const h = Math.min(r.bottom, map.bottom) - Math.max(r.top, map.top)
    return w > 0 && h > 0 ? w * h : 0
  }

  const found = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (Number(cs.opacity) === 0) continue
    /*
     * DECORATION IS NOT A SURFACE: something that cannot take a tap AND is
     * hidden from a screen reader holds nothing and blocks nothing. The sun-side
     * tint is the case; it is excluded by those two properties, not by name.
     */
    if (cs.pointerEvents === 'none' && el.getAttribute('aria-hidden') === 'true') continue
    /*
     * THE MAP IS NOT OVER ITSELF. MapLibre's own canvas is absolutely
     * positioned and full bleed, and its attribution controls sit inside the
     * same container. The first run reported maplibregl-canvas as a surface
     * covering 100% of the map, which is true and meaningless.
     */
    if (canvas.contains(el) || el === canvas) continue
    const r = el.getBoundingClientRect()
    if (area(r) < 400) continue
    /* Covering less than 1% of the map is a badge, not a surface. */
    if (over(r) / area(map) < 0.01) continue
    found.push({ el, r })
  }

  /*
   * A CONTAINER THE MAP SITS INSIDE IS NOT A SURFACE OVER IT.
   *
   * The first version of this reported shell--plan as a surface covering
   * 100% of the map at every detent, and the map as 0% visible. It is the root
   * element: absolutely positioned, full bleed, and the thing the canvas lives
   * INSIDE. Dropping "anything nested inside another hit" kept the ancestor
   * and discarded the real surfaces, which is the filter exactly backwards.
   *
   * So ancestors of the canvas go first, and only then is nesting collapsed.
   */
  const outer = found.filter((a) => !a.el.contains(canvas))
  const tops = outer.filter((a) => !outer.some((b) => b.el !== a.el && b.el.contains(a.el)))

  return {
    mapArea: Math.round(area(map)),
    surfaces: tops.map((t) => ({
      tag: t.el.tagName.toLowerCase(),
      cls: String(t.el.className).slice(0, 40),
      label: t.el.getAttribute('aria-label') ?? null,
      coversPct: +((over(t.r) / area(map)) * 100).toFixed(1),
      /*
       * DOES IT HOLD A SCROLL? The property that separates a panel from a
       * piece of chrome, measured rather than inferred from its name.
       */
      scrolls: [t.el, ...t.el.querySelectorAll('*')].some((n) => {
        const o = getComputedStyle(n).overflowY
        return (o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 4
      }),
      rect: { left: t.r.left, top: t.r.top, right: t.r.right, bottom: t.r.bottom },
    })),
  }
})()`

/** How much of the map a shooter can actually see. */
const MAP_VISIBLE = `(() => {
  const vw = ${VIEWPORT.width}, vh = ${VIEWPORT.height}, total = vw * vh
  const canvas = document.querySelector('.map__canvas')
  const boxes = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    /* Decoration that takes no tap and no reader: see SURFACES. */
    if (cs.pointerEvents === 'none' && el.getAttribute('aria-hidden') === 'true') continue
    /*
     * Containers the map lives inside cover nothing, and neither does the map
     * itself or its own attribution chrome.
     */
    if (canvas !== null && (el.contains(canvas) || canvas.contains(el) || el === canvas)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    boxes.push([Math.max(0, r.left), Math.max(0, r.top), Math.min(vw, r.right), Math.min(vh, r.bottom)])
  }
  let covered = 0
  for (let y = 0; y < vh; y += 2) {
    const spans = boxes.filter((b) => y >= b[1] && y < b[3]).map((b) => [b[0], b[2]]).sort((a, b) => a[0] - b[0])
    let end = -1
    for (const [s, e] of spans) { const a = Math.max(s, end); if (e > a) { covered += (e - a) * 2; end = e } }
  }
  return +(100 * (1 - covered / total)).toFixed(1)
})()`

const detentOf = () => ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)
const setDetent = async (want) => {
  for (let i = 0; i < 4; i += 1) {
    if ((await detentOf()) === want) return true
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(600)
  }
  return (await detentOf()) === want
}

/* ------------------------------------------------- one surface, three detents */

console.log('### exactly one surface may cover the map')
for (const detent of ['peek', 'half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach the ${detent} detent`)
    continue
  }
  const found = await ev(SURFACES)
  if (found?.error) {
    fail(found.error)
    continue
  }
  const visible = await ev(MAP_VISIBLE)
  const names = found.surfaces
    .map((s) => `${s.cls || s.tag}(${s.coversPct}%${s.scrolls ? ', scrolls' : ''})`)
    .join(' ')

  /*
   * ONE SURFACE, ASSERTED AS TWO PROPERTIES INSTEAD OF AN EXCLUSION LIST.
   *
   * WHAT THIS REPLACED, AND WHY IT HAD TO GO. The filter here was
   *
   *   !/\bsheet\b/.test(cls) && !/\brail2\b/.test(cls) && !/\bdock\b/.test(cls)
   *
   * with a comment above it insisting this was "not the old allowlist". It
   * was. It named three elements and failed everything else by count, so the
   * day the shell gained a venue bar and a chip row over the map -- both of
   * them deliberate, both of them in the brief -- the audit reported two
   * problems at all three detents and the only available fix was to add two
   * more names to the list. That is shape C in docs/failure-modes.md, and the
   * guard rule there is the answer: ASSERT A POSITIVE PROPERTY, NOT A NAME
   * YOU DO NOT WANT.
   *
   * SO WHAT IS ACTUALLY TRUE OF A SURFACE, AS OPPOSED TO CHROME?
   *
   *   IT HIDES THE MAP. The sheet at full covers 85% of it. The venue bar
   *   covers 4.9%, the chip row 4.1%, the rail 3%, the dock 7.6%. A fifth of
   *   the map is the line: nothing that is merely furniture comes near it.
   *
   *   IT HOLDS A SCROLL. Content you read, which is the thing two of cannot
   *   be read at once -- and the original failure this audit was written for
   *   was two readable panels over one map. Chrome never scrolls.
   *
   * Both are measured off the live element. A seventh panel in six months is
   * caught because it covers the map and scrolls, whatever it is called, and
   * a ninth piece of chrome is not reported as a problem because it is not
   * one.
   */
  const BIG_SHARE = 20
  const big = found.surfaces.filter((s) => s.coversPct >= BIG_SHARE)
  const scrolling = found.surfaces.filter((s) => s.scrolls)

  /*
   * THE CHROME'S HEIGHT AND THE SHEET'S TOP EDGE, PRINTED. The sheet reserves
   * the space above it (reservedTop in BottomSheet.tsx) so it cannot grow up
   * behind the venue bar and the chips; the two numbers side by side are what
   * shows that it worked, and the gap between them is the margin.
   */
  const geometry = await ev(`(() => {
    const chips = document.querySelector('.chips2')
    const sheet = document.querySelector('.sheet')
    return {
      chromeBottom: chips === null ? null : Math.round(chips.getBoundingClientRect().bottom),
      sheetTop: sheet === null ? null : Math.round(sheet.getBoundingClientRect().top),
    }
  })()`)

  console.log(
    `  ${detent.padEnd(5)} map visible ${String(visible).padStart(5)}%  ` +
      `chrome ends ${geometry.chromeBottom}px, sheet starts ${geometry.sheetTop}px  surfaces: ${names}`,
  )
  if (geometry.chromeBottom !== null && geometry.sheetTop !== null && geometry.sheetTop < geometry.chromeBottom) {
    fail(
      `the sheet starts at ${geometry.sheetTop}px, above the chrome that ends at ${geometry.chromeBottom}px, at ${detent}`,
    )
  }
  /*
   * THE FRAME IS KEPT WHETHER OR NOT IT FAILED. It used to be written only on
   * a failure, which meant a passing run left nothing to look at -- and the
   * rail sitting on top of the sheet at full was a PASSING run. Three frames
   * per run is cheap and it is the only part of this audit a person can check
   * with their own eyes.
   */
  await shot(OUT, `surface-${detent}`)

  if (big.length > 1) {
    fail(
      `${big.length} surfaces each cover ${BIG_SHARE}%+ of the map at ${detent}: ` +
        big.map((s) => `${s.cls || s.tag} (${s.coversPct}%)`).join(', '),
    )
  }
  if (scrolling.length > 1) {
    fail(
      `${scrolling.length} scrolling surfaces over the map at ${detent}: ` +
        scrolling.map((s) => s.cls || s.tag).join(', ') +
        '. Only one thing on screen may be read at a time.',
    )
  }
}

/*
 * AND THE RULE IS PROVEN TO FAIL, by growing a piece of chrome until it is a
 * surface. Without this, "at most one covers a fifth of the map" is a
 * threshold nobody has ever seen trip -- shape B, a check that cannot fail.
 */
console.log('\n### and the one-surface rule is proven to fail')
if (await setDetent('half')) {
  const grew = await ev(`(() => {
    const row = document.querySelector('.chips2')
    if (!row) return 'no chrome to grow'
    row.dataset.auditGrown = '1'
    row.style.height = '500px'
    return 'grown'
  })()`)
  if (grew !== 'grown') {
    fail(`could not grow a piece of chrome to prove the rule fails: ${grew}`)
  } else {
    await wait(200)
    const after = await ev(SURFACES)
    const bigNow = (after.surfaces ?? []).filter((x) => x.coversPct >= 20)
    await ev(`(() => {
      const row = document.querySelector('[data-audit-grown]')
      if (row) { row.style.height = ''; delete row.dataset.auditGrown }
      return 'restored'
    })()`)
    await wait(200)
    if (bigNow.length > 1) {
      console.log(
        `  a 500px chip row was caught as a second surface: ` +
          bigNow.map((x) => `${x.cls || x.tag} (${x.coversPct}%)`).join(', '),
      )
    } else {
      fail('a 500px chip row covered the map and the one-surface rule passed anyway')
    }
    const restored = (await ev(SURFACES)).surfaces ?? []
    if (restored.filter((x) => x.coversPct >= 20).length > 1) {
      fail('the chip row did not shrink back after the injection')
    }
  }
}

/* --------------------------------------- every detent reaches every other */

/*
 * A DRAG ON THE HANDLE MUST CHANGE THE DETENT, ALL SIX WAYS; A DRAG ANYWHERE
 * ELSE MUST NOT; AND THE CHART MUST SCRUB.
 *
 * WHY THIS EXISTS. Twice now a sheet gesture has been lost: first the
 * elevation curve's full-width input swallowed every drag at HALF and left no
 * way back, and then (27 Oct, from the phone at the pier) the time bar's
 * chart handed a thumb's sideways swipe to the sheet, because a thumb's swipe
 * starts upward. Since then the sheet moves only from its grab handle and the
 * date row (BottomSheet.tsx).
 *
 * THE CHECK IS THE GESTURE, AS A THUMB MAKES IT: real touch input through the
 * browser (scripts/sheetGestures.mjs), with the detent and the time read back
 * after each drag. The furniture is checked too, because a 20 px handle is a
 * handle a thumb misses: 44 px tall, and the tool dock clear of it.
 */
console.log('\n### the sheet moves from its handle, and only from there and the date row')

const handle = await ev(`(() => {
  const g = document.querySelector('.sheet__grab')?.getBoundingClientRect()
  const s = document.querySelector('.sheet')?.getBoundingClientRect()
  const d = document.querySelector('.tooldock')?.getBoundingClientRect()
  if (!g || !s) return null
  return { h: g.height, w: g.width, sw: s.width, gap: d ? g.top - d.bottom : null }
})()`)
if (handle === null) fail('no grab handle on the sheet')
else {
  console.log(`  handle ${handle.w.toFixed(0)} x ${handle.h.toFixed(0)} px; the tool dock ${handle.gap === null ? 'not on screen' : handle.gap.toFixed(0) + ' px clear of it'}`)
  if (handle.h < 44) fail(`the grab handle is ${handle.h.toFixed(0)} px tall; a thumb needs 44`)
  if (handle.w < handle.sw - 2) fail(`the grab handle is ${handle.w.toFixed(0)} px of the sheet's ${handle.sw.toFixed(0)}`)
  if (handle.gap !== null && handle.gap < 16) fail(`the tool dock is ${handle.gap.toFixed(0)} px from the sheet's handle; a thumb on it would grab the sheet`)
}

const gestures = await runSheetGestures({ send, ev, wait })
for (const r of gestures) {
  if (r.wrong) fail(`drag ${r.n} (${describeDrag(r)}) moved the wrong thing: ${r.got === null ? r.note : `time ${r.got.time ? 'moved' : 'not moved'}, sheet at ${r.got.sheet}`}`)
}
console.log(`  ${gestures.filter((r) => r.wrong).length} of ${gestures.length} thumb drags moved the wrong thing`)

/* ----- and the rule is proven to fail, by making the card a drag region */

/*
 * THE OLD RULE, RECONSTRUCTED: the card's body marked as a place the sheet
 * moves from, which is what "drag from anywhere" was, and its touches kept
 * from the page's scrolling as the handle's are. The body drag in the twenty
 * must then be counted wrong; if it is not, the twenty are not looking.
 */
console.log('\n### and the drag rule is proven to fail')
await ev(`(() => { const c = document.querySelector('.sheet__card'); c?.setAttribute('data-sheet-drag', ''); if (c) c.style.touchAction = 'none'; return 1 })()`)
const bodyDrag = DRAGS.findIndex((d) => d.on === 'card')
const injected = await runSheetGestures({ send, ev, wait }, [bodyDrag])
await ev(`(() => { const c = document.querySelector('.sheet__card'); c?.removeAttribute('data-sheet-drag'); if (c) c.style.touchAction = ''; return 1 })()`)
if (injected[0]?.wrong !== true) fail('the card was made a drag region and the body drag still passed')
else console.log(`  a body that drags the sheet was caught: sheet went to ${injected[0].got?.sheet}`)
await setDetent('half')

/* ----------------------------------- every stage reaches every other stage */

/*
 * THE NAV IS NAVIGATION, NOT A PROGRESS BAR, ASSERTED AS SIX GESTURES.
 *
 * WHY THIS EXISTS, AND IT IS THE THIRD TIME THIS LESSON HAS BEEN LEARNED IN
 * THIS FILE. The stepper was replaced by the bottom nav and the comment above
 * App's goTo was updated to say the nav called setMode "directly rather than
 * through the availability gate". The gate was still in the function:
 *
 *   if (canEnter(next, available) || next === mode) setMode(next)
 *
 * Pressing FIELD with no plan did nothing. No event, no feedback, no disabled
 * attribute to find -- the markup was clean, so the render smoke test passed,
 * and so would any check that looked at the DOM instead of pressing the
 * button. The same shape as the gesture deadlock and as the one-way platform
 * filter: THE CHECK HAS TO BE THE GESTURE.
 *
 * SIX PAIRS, FROM THE NAV'S OWN BUTTONS. Nothing here names a stage, so a
 * fourth one -- which there should never be, see BottomNav.tsx -- would be
 * walked without anybody adding it.
 */
console.log('\n### every stage reaches every other stage, by pressing the nav')

/*
 * THROUGH THE MENU NOW. The tab row is gone: the stages are items in the side
 * menu behind the top bar's menu button, so pressing a stage is two gestures,
 * open and pick, and both are pressed here rather than assumed.
 */
/*
 * SINCE 27 OCT THE MENU HOLDS PLAN, NOT ITS STAGES. Shoot setup lives inside
 * Plan (its venue pill opens it) and Field is reached by its address, /field;
 * the menu offering either is now the defect. Every stage still reaches every
 * other, each by its own gesture (scripts/preflight.mjs goToStage), checked
 * by where the shell lands.
 */
const IN_MENU = ['Plan']
const NOT_IN_MENU = ['Shoot setup', 'Field']
const STAGE_IDS = ['setup', 'plan', 'field']

const openMenu = () =>
  ev(`(() => {
    if (document.querySelector('nav[aria-label="Stage"]')) return 'open'
    const menu = document.querySelector('button[aria-label="Menu"]')
    if (!menu) return 'no menu button'
    if (menu.disabled) return 'menu button disabled'
    menu.click()
    return 'open'
  })()`)

const STAGES = `(() => {
  const labels = [...document.querySelectorAll('nav[aria-label="Stage"] .sidemenu__label')]
  return labels.map((l) => (l.textContent ?? '').trim())
})()`

const stageNow = () =>
  ev(`document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null`)

await openMenu()
await wait(300)
const offered = await ev(STAGES)
await ev(`document.querySelector('.sidemenu__scrim')?.click()`)
await wait(300)
if (!Array.isArray(offered) || offered.length === 0) {
  fail('no stage nav on screen: the menu opened nothing')
} else {
  console.log(`  the menu offers: ${offered.join(' | ')}`)
  for (const label of IN_MENU) if (!offered.includes(label)) fail(`the menu has no ${label}`)
  for (const label of NOT_IN_MENU) if (offered.includes(label)) fail(`the menu still offers ${label}, which lives inside Plan now`)

  for (const from of STAGE_IDS) {
    for (const to of STAGE_IDS) {
      if (from === to) continue
      try {
        await goToStage(ev, wait, from)
        const start = await stageNow()
        await goToStage(ev, wait, to)
        const landed = await stageNow()
        console.log(`  ${from.padEnd(5)} -> ${to.padEnd(5)} ${landed === to ? 'ok' : 'FAILED'} (${start} -> ${landed})`)
        if (landed !== to) fail(`went for ${to} from ${from} and the shell is on "${landed}"`)
      } catch (error) {
        fail(`from ${from} to ${to}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  /* Back to PLAN, which is what the rest of this audit is about. */
  await goToStage(ev, wait, 'plan')
  await wait(2500)
}

/* ------------------------------- every segment reaches every other segment */

/*
 * A SEGMENTED CONTROL MUST BE A CONTROL, NOT A TRAPDOOR.
 *
 * WHY THIS EXISTS. The platform filter was one-way. Selecting GROUND rewrote
 * the kit selection to drop the aircraft; the AIR segment then asked the
 * SELECTION whether a drone was available, got no, and disabled itself --
 * with the drone still in the bag and every kit chip still ticked. The only
 * way back to AIR was reloading the app.
 *
 * Same shape as the detent assertion above, and the same lesson: the check
 * has to be the GESTURE. "The segment exists" and "the segment is enabled
 * right now" both pass a control you can enter and not leave.
 *
 * GENERIC, BY CONSTRUCTION. Every group of aria-pressed buttons is tested,
 * so a segmented control added in six months is covered without anybody
 * remembering to list it here.
 */
console.log('\n### every segment of every segmented control reaches every other')

if (await setDetent('full')) {
  const groups = await ev(`(() => {
    const out = []
    for (const group of document.querySelectorAll('[role="group"]')) {
      const buttons = [...group.querySelectorAll('button[aria-pressed]')]
        .filter((b) => b.getBoundingClientRect().width > 0)
      if (buttons.length < 2) continue
      out.push({
        label: group.getAttribute('aria-label') ?? '(unlabelled group)',
        segments: buttons.map((b) => (b.textContent ?? '').trim().slice(0, 24)),
      })
    }
    return JSON.stringify(out)
  })()`)

  const parsed = JSON.parse(groups)
  if (parsed.length === 0) console.log('  no segmented control on screen')

  for (const group of parsed) {
    console.log(`  ${group.label}: ${group.segments.join(' | ')}`)
    for (const from of group.segments) {
      for (const to of group.segments) {
        if (from === to) continue
        const result = await ev(`(() => {
          const group = [...document.querySelectorAll('[role="group"]')]
            .find((g) => (g.getAttribute('aria-label') ?? '(unlabelled group)') === ${JSON.stringify(group.label)})
          if (!group) return 'group gone'
          const find = (text) => [...group.querySelectorAll('button[aria-pressed]')]
            .find((b) => (b.textContent ?? '').trim().slice(0, 24) === text)
          const a = find(${JSON.stringify(from)})
          const b = find(${JSON.stringify(to)})
          if (!a || !b) return 'segment gone'
          if (a.disabled) return 'cannot start: ' + ${JSON.stringify(from)} + ' is disabled'
          a.click()
          return 'moved to start'
        })()`)
        /*
         * A GROUP CAN BE UNMOUNTED BY SOMETHING ELSE ON SCREEN, so getting
         * back to it is part of the check rather than a reason to fail.
         *
         * The chip row used to be role="group" and clicking a chip replaces
         * the sheet's content, which unmounted the platform filter mid-walk:
         * six "group gone" problems for a control that worked. The chips are
         * role="toolbar" now, which is what they are -- but a group living
         * inside a card is always one tap away from being replaced, so the
         * walk re-establishes the screen and tries once more before failing.
         */
        if (result === 'group gone') {
          await ev(`document.querySelector('.card2__x')?.click()`)
          await wait(400)
          await setDetent('full')
          const again = await ev(`(() => {
            const group = [...document.querySelectorAll('[role="group"]')]
              .find((g) => (g.getAttribute('aria-label') ?? '(unlabelled group)') === ${JSON.stringify(group.label)})
            return group ? 'back' : 'still gone'
          })()`)
          if (again !== 'back') {
            fail(`${group.label}: the group is gone and returning to the shoot card did not bring it back`)
            continue
          }
          console.log(`    (${group.label} was replaced and came back)`)
        } else if (result !== 'moved to start') {
          fail(`${group.label}: ${result}`)
          continue
        }
        await wait(350)
        const landed = await ev(`(() => {
          const group = [...document.querySelectorAll('[role="group"]')]
            .find((g) => (g.getAttribute('aria-label') ?? '(unlabelled group)') === ${JSON.stringify(group.label)})
          const b = [...group.querySelectorAll('button[aria-pressed]')]
            .find((x) => (x.textContent ?? '').trim().slice(0, 24) === ${JSON.stringify(to)})
          if (!b) return 'gone'
          if (b.disabled) return 'DISABLED: ' + (b.title || 'no reason given')
          b.click()
          return 'clicked'
        })()`)
        await wait(350)
        if (landed !== 'clicked') {
          fail(`${group.label}: from "${from}" the segment "${to}" is unreachable (${landed})`)
        }
      }
    }
  }
}

/* ------------------------------------ a named missing capability is fixable */

/*
 * NO FEATURE MAY HIDE THE CONTROL IT DEPENDS ON.
 *
 * A message that names something missing -- "no elevation data", "no drone in
 * the kit" -- is only useful if the thing that supplies it can be reached
 * from where the message is. The elevation curve said "no elevation data
 * here" while covering the Layers section that turns the DEM on.
 *
 * The check is deliberately shallow and mechanical: find the messages, and
 * require a control next to each. It cannot prove the control works; it can
 * prove the shooter is not told about a missing thing with no way to supply
 * it, which is the dead end that happened.
 */
console.log('\n### a message that names a missing capability offers the control')

if (await setDetent('full')) {
  const dead = await ev(`(() => {
    const WANTED = [/no elevation data/i, /turn terrain on/i]
    const out = []
    for (const node of document.querySelectorAll('p, span, button')) {
      const text = (node.textContent ?? '').trim()
      if (text === '' || text.length > 200) continue
      if (!WANTED.some((re) => re.test(text))) continue
      if (node.getBoundingClientRect().width === 0) continue
      /* The control is the node itself, or one inside the same block. */
      const isControl = node.tagName === 'BUTTON' || node.closest('button') !== null
      const nearControl = node.parentElement?.querySelector('button') !== null
      out.push({ text: text.slice(0, 70), fixable: isControl || nearControl })
    }
    return JSON.stringify(out)
  })()`)
  const rows = JSON.parse(dead)
  if (rows.length === 0) {
    console.log('  no missing-capability message on screen')
  }
  for (const row of rows) {
    console.log(`  ${row.fixable ? 'ok    ' : 'DEAD  '} ${row.text}`)
    if (!row.fixable) {
      fail(`"${row.text}" names a missing capability with no control to supply it`)
    }
  }
}

/* ------------------------------------------------- and not over each other */

/*
 * A SURFACE MAY NOT COVER ANOTHER SURFACE.
 *
 * WHY THIS IS HERE AT ALL. The check above asks what covers the MAP, and the
 * rail is allowed, so the rail floating on top of the SHEET passed it clean.
 * It was caught in a screenshot: at full the sheet is 92% of the screen and
 * four map controls sat on roughly 40x130px of the shoot line and the
 * scrubber. A check that passes a surface sitting on text is not measuring
 * the thing it was written for.
 *
 * AND IT IS NOT THE PROTECTED LIST COMING BACK. That list named elements a
 * panel must not cover and grew an entry per bug; what it was reaching for
 * was this, which needs no names: the surfaces are already enumerated by
 * POSITION above, so checking them against each other is three comparisons
 * and nothing to maintain. A seventh surface is included the day it appears.
 */
console.log('\n### no surface may cover another surface')
for (const detent of ['peek', 'half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach the ${detent} detent`)
    continue
  }
  const found = await ev(SURFACES)
  if (found?.error) {
    fail(found.error)
    continue
  }
  const list = found.surfaces
  const hits = []
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i].rect
      const b = list[j].rect
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 1 && h > 1) {
        hits.push(
          `${list[i].cls || list[i].tag} over ${list[j].cls || list[j].tag}` +
            ` by ${Math.round(w)}x${Math.round(h)}px`,
        )
      }
    }
  }
  console.log(`  ${detent.padEnd(5)} ${list.length} surfaces, ${hits.length} overlapping`)
  for (const hit of hits) fail(hit)
  if (hits.length > 0) await shot(OUT, `overlap-${detent}`)
}

/* ------------------------------------------------ the detent survives a render */

console.log('\n### the detent the shooter set survives a re-render')
for (const detent of ['half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach ${detent}`)
    continue
  }
  /*
   * FORCE RENDERS WITHOUT TOUCHING THE SHEET: scrub the time bar, which
   * re-renders the whole plan tree every input, and move the map. If the
   * detent were derived from anything but its own state this is where it
   * would snap back.
   */
  await ev(`(() => {
    const r = document.querySelector('.scrub__range')
    if (r === null) return 'no scrubber'
    for (const v of [200, 600, 900]) {
      r.value = v
      r.dispatchEvent(new Event('input', { bubbles: true }))
    }
    window.__probe?.map?.setBearing((window.__probe.map.getBearing() + 40) % 360)
    return 'ok'
  })()`)
  await wait(1200)
  const after = await detentOf()
  console.log(`  set ${detent.padEnd(5)} then re-rendered  ->  ${after}`)
  if (after !== detent) fail(`the sheet moved itself from ${detent} to ${after}`)
}

/* -------------------------------------------- tapping a position never lowers */

/*
 * A POSITION TO TAP, MADE FIRST.
 *
 * The first run reported "no position row" at all three detents and counted
 * that as a pass. A check that succeeds because it did nothing is the exact
 * failure this whole audit replaced, so if a position cannot be created the
 * check FAILS rather than skipping.
 */
console.log('\n### tapping a position never lowers the sheet')
await setDetent('half')
/*
 * ARM THE MAP, AND FAIL IF THE CONTROL IS NOT THERE. This was
 * `.plist__add` -- the add button on the old positions SECTION -- and the
 * optional chain meant the audit happily carried on against a map that was
 * never armed, then reported "could not create a position". Same silent-miss
 * shape as the nine copies of the stage-rail selector; see goToStage.
 */
const found = await ev(`(() => {
  const add = document.querySelector('.shootc__add')
  if (!add) return 'no add-position control on the shoot card'
  add.click()
  return 'clicked'
})()`)
if (found !== 'clicked') {
  fail(`could not arm the map to place a position: ${found}`)
}
/*
 * READ THE ARMED STATE AFTER A RENDER, NOT IN THE SAME EVALUATION.
 *
 * The first version of this clicked and read aria-pressed in one expression
 * and reported "clicked but not armed" on a run that went on to place a
 * position successfully. React had not re-rendered yet: the assertion was
 * about the DOM one microtask too early, which is a false alarm rather than a
 * finding, and a false alarm in a gate costs the same attention as a real one.
 */
await wait(400)
const armed = await ev(`document.querySelector('.shootc__add')?.getAttribute('aria-pressed') ?? 'gone'`)
if (armed !== 'true') fail(`clicked add-position and it did not arm (aria-pressed: ${armed})`)
await wait(500)
/*
 * THE MAP'S OWN CLICK HANDLER, FIRED DIRECTLY.
 *
 * CDP's synthesised mouse events do not reach MapLibre's canvas listener, so
 * dispatching one at the map added nothing and the whole tap rule went
 * untested. Firing the map's own 'click' with the shape its handler reads
 * exercises the app's real path from a tap to a position, which is the part
 * that matters here; the gesture plumbing is MapLibre's and is not what this
 * audit is about.
 */
await ev(`(() => {
  const map = window.__probe?.map
  if (!map) return 'no probe'
  const c = map.getCanvas()
  const point = { x: c.clientWidth / 2, y: c.clientHeight / 3 }
  map.fire('click', {
    lngLat: map.unproject([point.x, point.y]),
    point,
    originalEvent: { target: c },
  })
  return 'fired'
})()`)
await wait(2500)
/*
 * DESELECT AFTER CREATING, or the card is what the sheet is showing and the
 * list is not in the DOM to tap. Adding a position selects it, which is
 * correct behaviour and is exactly what the first version of this check
 * tripped over: it counted list rows while the card was open and reported
 * "no position row".
 */
await ev(`document.querySelector('.card__close')?.click()`)
await wait(700)
const rows = await ev(`document.querySelectorAll('.shots button').length`)
console.log(`  positions available to tap: ${rows}`)
if (rows === 0) fail('could not create a position, so the tap rule was never tested')
for (const detent of ['peek', 'half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach ${detent}`)
    continue
  }
  const before = await detentOf()
  const tapped = await ev(`(() => {
    /* The real markup: ShotList renders an <ol class="shots"> of buttons. */
    const row = document.querySelector('.shots button, .shot__row, .shot')
    if (row === null) return 'no position row'
    row.click()
    return 'ok'
  })()`)
  await wait(900)
  const after = await detentOf()
  const RANK = { peek: 0, half: 1, full: 2 }
  console.log(`  ${before.padEnd(5)} -> tap a position -> ${String(after).padEnd(5)}  (${tapped})`)
  if (tapped !== 'ok') {
    fail(`no position row at ${before}, so the tap rule was not tested there`)
    continue
  }
  if (RANK[after] < RANK[before]) fail(`a tap LOWERED the sheet from ${before} to ${after}`)
  if (before === 'peek' && after !== 'half') {
    fail(`a tap at peek should raise to half, got ${after}`)
  }
  /* Back to the list, so the next detent has a row to tap. */
  await ev(`document.querySelector('.card__close')?.click()`)
  await wait(600)
}

/* ------------------------------------------------------ the chip row is four */

/*
 * EXACTLY FOUR CHIPS, TWO LINES EACH, AND THE ROW DOES NOT SCROLL.
 *
 * WHY THIS IS AN AUDIT AND NOT A CODE REVIEW NOTE. The five-section sheet did
 * not arrive as five sections. It arrived as two, and each of the next three
 * was obviously the last one. A row of readings has the same gradient: every
 * future number has a reason, each one costs eight pixels, and the row that
 * scrolls is where they all end up. docs/chips.md carries the rule; this is
 * the thing that enforces it.
 *
 * WITH THE UNIT, because a chip reading "14" means knots to the person who
 * wrote it and miles per hour to somebody who set the app to mph. Asserted as
 * a positive property -- the value line contains a non-numeric character --
 * rather than as a list of unit spellings nobody will keep current.
 *
 * AND THE CHECK IS PROVEN TO FAIL, by injecting a fifth chip and requiring
 * that the same measurement reports it. Shape B in docs/failure-modes.md: a
 * check that cannot fail is not a check, and "exactly four" read off a row
 * that the audit never tried to break is a comment with a line number.
 */
console.log('\n### the chip row: exactly four chips, two lines, no horizontal scroll')

const CHIPS = `(() => {
  const row = document.querySelector('.chips2')
  if (!row) return { error: 'no chip row on screen' }
  const kids = [...row.children].filter((c) => c.getBoundingClientRect().width > 0)
  const widths = kids.map((k) => Math.round(k.getBoundingClientRect().width))
  return {
    count: kids.length,
    scrollWidth: Math.round(row.scrollWidth),
    clientWidth: Math.round(row.clientWidth),
    overflowX: getComputedStyle(row).overflowX,
    /* Distinct top edges: a chip that wrapped is on a second row. */
    rows: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size,
    chips: kids.map((k) => ({
      label: (k.querySelector('.chip2__label')?.textContent ?? '').trim(),
      value: (k.querySelector('.chip2__value')?.textContent ?? '').trim(),
      lines: k.querySelectorAll('.chip2__label, .chip2__value').length,
    })),
    widthSpread: widths.length === 0 ? 0 : Math.max(...widths) - Math.min(...widths),
  }
})()`

/* The same judgement, applied to a measurement, so the injected fifth chip is
 * judged by the identical rule rather than by a second copy of it. */
const judgeChips = (m) => {
  const bad = []
  if (m.error !== undefined) return [m.error]
  if (m.count !== 4) bad.push(`${m.count} chips, not 4`)
  if (m.rows !== 1) bad.push(`the chips wrap onto ${m.rows} rows`)
  if (m.scrollWidth > m.clientWidth + 1) {
    bad.push(`the row scrolls horizontally (${m.scrollWidth}px of content in ${m.clientWidth}px)`)
  }
  if (m.overflowX === 'auto' || m.overflowX === 'scroll') {
    bad.push(`overflow-x is ${m.overflowX}: the row is allowed to scroll`)
  }
  if (m.widthSpread > 2) bad.push(`chips are not equal width (${m.widthSpread}px spread)`)
  for (const chip of m.chips) {
    if (chip.lines !== 2) bad.push(`chip "${chip.label}" has ${chip.lines} lines, not 2`)
    if (chip.label === '') bad.push('a chip has no label line')
    if (chip.value === '') bad.push(`chip "${chip.label}" has no value line`)
    else if (!/[^0-9.,:\s-]/.test(chip.value)) {
      bad.push(`chip "${chip.label}" reads "${chip.value}" with no unit`)
    }
  }
  return bad
}

const chipMeasure = await ev(CHIPS)
for (const chip of chipMeasure.chips ?? []) {
  console.log(`  ${chip.label.padEnd(8)} ${chip.value}`)
}
console.log(
  `  ${chipMeasure.count} chips, ${chipMeasure.rows} row, content ${chipMeasure.scrollWidth}px in ${chipMeasure.clientWidth}px, overflow-x: ${chipMeasure.overflowX}`,
)
for (const bad of judgeChips(chipMeasure)) fail(`chip row: ${bad}`)

/* ------ and now break it on purpose, because a check that cannot fail is not one */

const fifth = await ev(`(() => {
  const row = document.querySelector('.chips2')
  if (!row || !row.firstElementChild) return 'no row to break'
  const clone = row.firstElementChild.cloneNode(true)
  clone.id = 'audit-fifth-chip'
  row.appendChild(clone)
  return 'added'
})()`)

if (fifth !== 'added') {
  fail(`could not inject a fifth chip to prove the check fails: ${fifth}`)
} else {
  await wait(120)
  const broken = judgeChips(await ev(CHIPS))
  await ev(`document.getElementById('audit-fifth-chip')?.remove()`)
  await wait(120)
  if (broken.length === 0) {
    fail('a fifth chip was added and the chip check passed anyway')
  } else {
    console.log(`  a fifth chip was injected and the check caught it: ${broken[0]}`)
  }
  const after = judgeChips(await ev(CHIPS))
  if (after.length > 0) fail(`the chip row did not recover after the injection: ${after[0]}`)
}

/* -------------------------------------- the venue is named once, not twice */

/*
 * ONE FACT, ONE PLACE ON THE SCREEN.
 *
 * WHY THIS EXISTS. The peek line read "Shoot setup · 11:00-15:00 EDT · Brew
 * River Dock Bar, Salisbury MD" whenever nothing was happening. The venue bar
 * a hundred pixels above it read "Brew River Dock Bar, Salisbury MD · 12 SAT".
 * The same venue name, twice, on one screen -- and because the peek sits at
 * the top of the sheet, every card in the app started fifty pixels lower to
 * make room for the repeat.
 *
 * SHAPE A IN docs/failure-modes.md is two SOURCES for one fact, and the
 * reason it is a shape is that the two drift. This is the visible form of it:
 * if the venue name is rendered from two places, one of them will one day
 * show the cache while the other shows the geocode.
 *
 * MECHANICAL, AND SCOPED TO THE ONE STRING IT CAN CHECK HONESTLY. It takes
 * the venue name from the venue bar -- the element whose job that is -- and
 * requires that no other visible element on the screen contains it. Map
 * labels are excluded: the venue's name printed on the map is the map's own
 * cartography, not the app restating a fact.
 */
console.log('\n### the venue is named once on the screen')

if (await setDetent('half')) {
  const named = await ev(`(() => {
    const bar = document.querySelector('.pill-venue__name')
    if (!bar) return { error: 'no venue name in the venue bar' }
    const name = (bar.textContent ?? '').trim()
    if (name === '' || name === '—') return { error: 'the venue bar names no venue' }
    const canvas = document.querySelector('.map__canvas')
    const others = []
    for (const el of document.querySelectorAll('body *')) {
      if (el === bar || el.contains(bar)) continue
      if (canvas !== null && (canvas.contains(el) || el === canvas)) continue
      if (el.getBoundingClientRect().width === 0) continue
      /* The deepest element holding the text, so one line is not reported ten times. */
      if ([...el.children].some((c) => (c.textContent ?? '').includes(name))) continue
      if ((el.textContent ?? '').includes(name)) {
        others.push(String(el.className || el.tagName).slice(0, 40))
      }
    }
    return { name, others }
  })()`)

  if (named.error !== undefined) {
    fail(named.error)
  } else {
    console.log(`  "${named.name}" appears in the venue bar and ${named.others.length} other place(s)`)
    if (named.others.length > 0) {
      fail(
        `the venue name is on the screen ${named.others.length + 1} times: the venue bar, and ` +
          named.others.join(', ') +
          '. One fact, one place.',
      )
    }
  }
}

/* ------------------------------------------- no card exceeds two viewports */

/*
 * THE SHEET'S CONTENT HEIGHT MAY NOT EXCEED TWO VIEWPORT HEIGHTS, AT ANY
 * DETENT, ON ANY CARD.
 *
 * WHAT THIS REPLACED. "Every section is reachable at FULL", which walked the
 * five `.sect` elements and asserted each had a height over 20px. It was a
 * true check of a shape that no longer exists, and it was also the wrong
 * question: it asked whether you could get to the bottom of the page, and the
 * problem was that there was a page.
 *
 * ONE SUBJECT PER SURFACE IS NOT SELF-ENFORCING. Nothing stops a card
 * growing: a caveat here, a second reading there, and the wind card is the
 * conditions section again under a new name. A ceiling measured from the live
 * DOM is the only thing that makes "too much in it" a fact rather than an
 * opinion, and 2x844 = 1688px is the number: a card you can read in two
 * screens is still one subject, three screens is a document.
 *
 * TAKEN PER CARD AND REPORTED FOR EVERY ONE, passing or failing, because the
 * margin is the useful part. A card at 1650px passes and is the next one to
 * break. The figures this run produced are in
 * measurements/2026-10-19-shell-rebuild.md.
 *
 * THE WALK IS DISCOVERED, NOT LISTED. Every control that changes the card is
 * found by class -- a chip, the rail's layers button, the venue bar's about
 * button, a CardMore row -- so a card added in six months with a door of one
 * of those four kinds is measured without anybody adding it here. The names
 * come from data-card on the sheet's card slot.
 */
console.log('\n### no card exceeds two viewport heights at any detent')

const LIMIT = VIEWPORT.height * 2

const cardNow = () => ev(`document.querySelector('.sheet__card')?.dataset.card ?? null`)

const OPENERS = `(() => {
  const out = []
  const add = (sel, i, name) => out.push({ sel, i, name })
  document.querySelectorAll('.chip2').forEach((b, i) =>
    add('.chip2', i, (b.querySelector('.chip2__label')?.textContent ?? '').trim()))
  document.querySelectorAll('.rail2__btn').forEach((b, i) => {
    if ((b.getAttribute('aria-label') ?? '').toLowerCase().includes('layer')) add('.rail2__btn', i, 'layers')
  })
  /* The tool dock: Layers moved here from the rail, and the calendar opens the Sky card. */
  document.querySelectorAll('.tooldock__btn').forEach((b, i) => {
    const label = (b.getAttribute('aria-label') ?? '').toLowerCase()
    if (label.includes('layer')) add('.tooldock__btn', i, 'layers')
    if (label.includes('calendar')) add('.tooldock__btn', i, 'sky')
    /* Behind Layers, under Tools: Preflight, the skyline and the light map, doors two taps deep. */
    if (label.includes('layer')) add('layerstool', 'Preflight', 'preflight')
    if (label.includes('layer')) add('layerstool', 'Skyline', 'skyline')
    if (label.includes('layer')) add('layerstool', 'Light map', 'lightmap')
  })
  /*
   * THE MENU'S CARD DOORS. About and Sky open cards from the side menu now, so
   * a door is "open the menu, pick this item"; the item's own words are its
   * index. Found by the menu button being there, not by a list of cards.
   */
  if (document.querySelector('button[aria-label="Menu"]')) {
    add('menu', 'About', 'about')
    add('menu', 'Sky', 'sky')
    add('menu', 'Call sheet', 'callsheet')
    add('menu', 'Settings', 'settings')
    /* Behind the Sky card's Moon page: a door two taps deep, walked the way a person walks it. */
    add('skymoon', 'Plan this moonrise', 'moonrise')
  }
  document.querySelectorAll('.more2__row').forEach((b, i) =>
    add('.more2__row', i, (b.textContent ?? '').trim()))
  return out
})()`

const click = async (sel, i) => {
  if (sel === 'layerstool') {
    await ev(`(() => { const b = document.querySelector('button[aria-label="Map and layers"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); return 1 })()`)
    await wait(600)
    await ev(`[...document.querySelectorAll('button.tile')].find((t) => t.querySelector('.tile__label')?.textContent === ${JSON.stringify(i)})?.click()`)
    await wait(600)
    return
  }
  if (sel === 'skymoon') {
    await click('menu', 'Sky')
    await ev(`[...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Moon')?.click()`)
    await wait(500)
    await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(i)})?.click()`)
    await wait(600)
    return
  }
  if (sel === 'menu') {
    await ev(`document.querySelector('button[aria-label="Menu"]')?.click()`)
    await wait(300)
    await ev(`(() => {
      const hit = [...document.querySelectorAll('nav[aria-label="Stage"] button')]
        .find((b) => (b.querySelector('.sidemenu__label')?.textContent ?? '').trim() === ${JSON.stringify(i)})
      if (hit) hit.click()
      return hit ? 'clicked' : 'gone'
    })()`)
    await wait(600)
    return
  }
  await ev(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${i}]
    if (el) el.click()
    return el ? 'clicked' : 'gone'
  })()`)
  await wait(420)
}

const homeCard = async () => {
  for (let i = 0; i < 4; i += 1) {
    if ((await cardNow()) === 'shoot') return true
    await ev(`document.querySelector('.card2__x')?.click()`)
    await wait(350)
  }
  return (await cardNow()) === 'shoot'
}

/*
 * THE CONTENT height, not the sheet's. The sheet is as tall as the detent
 * says; what matters is how much is in it, which is the scroll height of the
 * slot the card is rendered into.
 */
const CARD_HEIGHT = `(() => {
  const card = document.querySelector('.sheet__card')
  const body = document.querySelector('.sheet__body')
  if (!card) return { error: 'no card slot' }
  const cs = getComputedStyle(card)
  /*
   * THE TIME STRIP IS TAKEN HERE TOO, on the same pass, because its whole
   * reason for existing is that it was 250px of chrome above every card.
   * The heights this run produced are in
   * measurements/2026-10-19-shell-polish.md.
   */
  const strip = document.querySelector('.tstrip, .tbar')
  /* The Tide sheet's curve is its time control (TideSheet.tsx): dragging it moves the same moment as the bar. */
  const curve = document.querySelector('.tides__curve [role="slider"]')
  return {
    slider: curve !== null,
    card: card.dataset.card ?? '(unnamed)',
    content: Math.round(card.scrollHeight + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0')),
    visible: body === null ? null : Math.round(body.clientHeight),
    strip: strip === null ? null : Math.round(strip.getBoundingClientRect().height),
  }
})()`

/* Paths from the shoot card: one hop for the doors on screen at home, two for
 * the doors that only exist inside another card. */
const walked = new Map()
const queue = [[]]
const seen = new Set()

while (queue.length > 0) {
  const path = queue.shift()
  if (!(await homeCard())) {
    fail('could not get back to the shoot card')
    break
  }
  if (!(await setDetent('half'))) {
    fail('could not reach half to walk the cards')
    break
  }
  for (const step of path) await click(step.sel, step.i)

  const here = await cardNow()
  if (here === null) continue
  if (path.length > 0 && walked.has(here)) continue

  if (path.length > 0) {
    /* Measure this card at every detent it can be read at. */
    const heights = {}
    for (const detent of ['half', 'full']) {
      if (!(await setDetent(detent))) continue
      const m = await ev(CARD_HEIGHT)
      if (m.error === undefined) heights[detent] = m
    }
    walked.set(here, heights)
    await setDetent('half')
  }

  /* Two hops is enough: a third would be a navigation hierarchy. */
  if (path.length >= 1) continue

  const openers = await ev(OPENERS)
  for (const opener of openers ?? []) {
    const key = `${path.map((s) => s.sel + s.i).join('>')}|${opener.sel}${opener.i}`
    if (seen.has(key)) continue
    seen.add(key)
    queue.push([...path, opener])
  }
}

/* The shoot card itself, which is where the walk starts and has no door. */
if (await homeCard()) {
  const heights = {}
  for (const detent of ['half', 'full']) {
    if (await setDetent(detent)) {
      const m = await ev(CARD_HEIGHT)
      if (m.error === undefined) heights[detent] = m
    }
  }
  walked.set('shoot', heights)
}

/* Then the doors that only open from inside another card. */
if (await homeCard()) {
  await setDetent('half')
  const inner = await ev(OPENERS)
  for (const first of inner ?? []) {
    if (!(await homeCard())) break
    await setDetent('half')
    await click(first.sel, first.i)
    const doors = await ev(`(() => [...document.querySelectorAll('.more2__row')].map((b, i) => ({ sel: '.more2__row', i, name: (b.textContent ?? '').trim() })))()`)
    for (const door of doors ?? []) {
      if (!(await homeCard())) break
      await setDetent('half')
      await click(first.sel, first.i)
      await click(door.sel, door.i)
      const here = await cardNow()
      if (here === null || walked.has(here)) continue
      const heights = {}
      for (const detent of ['half', 'full']) {
        if (await setDetent(detent)) {
          const m = await ev(CARD_HEIGHT)
          if (m.error === undefined) heights[detent] = m
        }
      }
      walked.set(here, heights)
    }
  }
}

/* ------------------------------------------ the time strip is small, and placed */

/*
 * THE TIME CONTROL IS A STRIP, AND IT IS ONLY WHERE TIME MATTERS.
 *
 * WHAT IT WAS. A ~250px panel above every card, carrying a clock, two
 * receipts in degrees, tide tags, a twilight band, a range input with its own
 * track, and the Part 107 requirements. On the wind card it was taller than
 * the wind. On About it pushed the copy off the bottom of the screen. On the
 * layer tiles it was a time panel above a grid of pictures, which has nothing
 * to do with time at all.
 *
 * TWO PROPERTIES, BOTH READ OFF THE RENDERED STRIP (the figures are in
 * measurements/2026-10-19-shell-polish.md):
 *
 *   IT IS UNDER 48px. A control, not a panel. 48 rather than its nominal 34
 *   so a line-height change is not a failure, and far enough under 250 that
 *   the panel cannot creep back one row at a time.
 *
 *   IT IS ABSENT WHERE TIME CHANGES NOTHING. A tile grid, a settings sheet
 *   and a list of ground marks read the same at 06:00 and at 18:00.
 *
 * THE TABLE BELOW IS THE BRIEF, NOT THE CODE. src/lib/sheetCard.ts holds the
 * same list, and checking the app against its own table would be shape B in
 * docs/failure-modes.md -- a check that cannot fail, because both sides move
 * together. These are written out here so that changing the app's mind about
 * a card fails until somebody changes this too.
 */
console.log('\n### the time strip is a strip, and only where time matters')

const STRIP_BELONGS = ['shoot', 'golden', 'wind', 'cloud', 'tide', 'sky']
/*
 * 'cams' is not in the brief's list because the card did not exist when the
 * brief was written: the sky card was split to get it under the limit. It is
 * forbidden for the same reason as the other three -- a camera feed is
 * whatever the operator is publishing this minute, and a strip that scrubbed
 * every other reading while leaving these alone is a control that appears to
 * work and does not.
 */
const STRIP_FORBIDDEN = ['layers', 'about', 'hazards', 'cams']
/*
 * THE TIME BAR IS 130 PX BY DESIGN. This limit was 48 when the strip was a
 * one-line scrubber and every pixel of it came out of the card. The combined
 * brief of 25 October asked for a docked bar with the sun's height curve,
 * the horizon, a tick ruler and a big date and time, which measured 130 px at
 * 390 wide; it replaces the scrubber, and the sheet's peek grew to hold it
 * rather than the cards shrinking. The limit is that bar plus 10, so a bar
 * that grows past its design still fails here.
 */
const STRIP_MAX = 140

console.log(`  the limit is 2 x ${VIEWPORT.height} = ${LIMIT}px of content`)
console.log(`  card          half     full     worst   of limit   strip`)
let worstCard = null
for (const [name, heights] of [...walked.entries()].sort()) {
  const half = heights.half?.content ?? null
  const full = heights.full?.content ?? null
  const worst = Math.max(half ?? 0, full ?? 0)
  const pct = Math.round((100 * worst) / LIMIT)
  const over = worst > LIMIT
  if (worstCard === null || worst > worstCard[1]) worstCard = [name, worst]

  /* The strip, as the same walk saw it on this card. */
  const strip = heights.half?.strip ?? heights.full?.strip ?? null
  const stripText = strip === null ? 'none' : `${strip}px`

  console.log(
    `  ${name.padEnd(12)} ${String(half ?? '-').padStart(6)}  ${String(full ?? '-').padStart(6)}  ${String(worst).padStart(6)}  ${String(pct).padStart(5)}%  ${over ? 'OVER' : 'ok'}  ${stripText.padStart(6)}`,
  )

  if (strip !== null && strip > STRIP_MAX) {
    fail(`the time strip is ${strip}px on the ${name} card, over the ${STRIP_MAX}px limit`)
  }
  if (STRIP_FORBIDDEN.includes(name) && strip !== null) {
    fail(
      `the ${name} card renders the time strip (${strip}px) and nothing on it changes with time`,
    )
  }
  const slider = heights.half?.slider ?? heights.full?.slider ?? false
  if (STRIP_BELONGS.includes(name) && strip === null && !(name === 'tide' && slider)) {
    fail(`the ${name} card has no time strip, and its reading is for a moment`)
  }
  if (over) {
    fail(`the ${name} card is ${worst}px of content, over the ${LIMIT}px limit: split it or cut it`)
  }
  if (half === null && full === null) fail(`the ${name} card could not be measured at any detent`)
}
if (walked.size < 4) fail(`only ${walked.size} cards were reached: the walk found no doors`)

/*
 * EVERY CARD IN THE UNION HAS A DOOR.
 *
 * WHY THIS EXISTS. Splitting the sky card moved the camera list onto its own
 * card and repointed the cloud card's row at it -- which was the right fix
 * for a mislabelled door and left the SKY card with no entrance at all. The
 * walk above dutifully reported eleven cards and said nothing, because it
 * reports what it can reach and had no idea what it could not.
 *
 * THE FULL SET COMES FROM THE UNION ITSELF, read out of src/lib/sheetCard.ts
 * rather than listed here. A twelfth kind added without a way in fails this
 * without anybody remembering to add it, which is the whole point; a list in
 * this file would be one more thing to keep in step.
 */
const UNION = readFileSync('src/lib/sheetCard.ts', 'utf8')
const declared = [...UNION.matchAll(/\|\s*\{\s*kind:\s*'([a-z]+)'\s*\}/g)].map((m) => m[1])
if (declared.length < 5) {
  fail('could not read the card kinds out of src/lib/sheetCard.ts')
} else {
  const missed = declared.filter((kind) => !walked.has(kind))
  console.log(`  ${declared.length} kinds declared, ${walked.size} reached`)
  if (missed.length > 0) {
    fail(
      `${missed.length} card(s) in the union have no door: ${missed.join(', ')}. ` +
        'A card nothing opens is a card nobody can read.',
    )
  }
}
console.log(`  ${walked.size} cards measured; tallest is ${worstCard?.[0]} at ${worstCard?.[1]}px`)

await homeCard()

const noise = errs.filter((e) => !/arcgis|AJAXError|Failed to fetch|overpass|elevation-tiles/i.test(e))
if (noise.length > 0) console.log('\nconsole errors: ' + JSON.stringify(noise.slice(0, 3)))

console.log('\n=== SURFACE PROBLEMS: ' + problems + ' ===')
watchdog.stop()
await dispose()
process.exit(problems === 0 ? 0 : 1)
