/*
 * THE SURF AND FISH TAP-IN PAGES (Batch SIMPLE-2, Section 4), checked inside
 * scripts/audit-tapin.mjs's look loop (one browser context per size, the
 * Tide page already open there). Not run alone.
 *
 * Surf, at each size: the page, its title and "<spot> · now", the four tabs
 * in order with Now on, "NOW · <word>" and a range in feet, the 24 hourly
 * bars and the thin tide curve under them, rows Best · Tide · Swell · Water
 * then More details, the foot, nothing covered, every button 44 px, the last
 * row reachable. At 390 x 844 also: each tab opens its content (Week's seven
 * days, Cams' big cam and list, Buoys' body), picking a cam is remembered on
 * the phone and by nothing else, "More details ›" opens the old page and Back
 * returns.
 *
 * Fish, when the home routes to it (a tile that is not there yet is said, not
 * failed): title, Today · Week, the tide curve (chart) , rows Moon · Pressure
 * · Water · Wind, and Week's seven days.
 *
 * It counts what it looked at, and the caller fails when it found no page.
 */
import { join } from 'node:path'
import { goHome } from './preflight.mjs'

const lookFor = (root) => `(() => {
  const root = document.querySelector(${JSON.stringify(root)})
  if (!root) return null
  const onTop = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const t = document.elementFromPoint(x, y)
    return t !== null && (el.contains(t) || t.contains(el))
  }
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null }
  const body = root.querySelector('.ppage__body')
  const foot = root.querySelector('.dpage__foot')
  const small = [...root.querySelectorAll('button, a')].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 43.5 && !b.closest('svg') }).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height))
  const rows = [...root.querySelectorAll('.tipage__row')]
  const tabs = [...root.querySelectorAll('[role="tab"]')]
  return {
    title: root.querySelector('.ppage__title')?.textContent ?? null,
    sub: root.querySelector('.ppage__sub')?.textContent ?? null,
    tabs: tabs.map((t) => t.textContent),
    on: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent),
    eyebrow: root.querySelector('.tipage__eyebrow')?.textContent ?? null,
    value: root.querySelector('.tipage__value')?.textContent ?? null,
    line: root.querySelector('.tipage__sub')?.textContent ?? null,
    bars: root.querySelectorAll('[data-surf-bars] .sbars__bar').length,
    strip: !!root.querySelector('.tcurve--strip .tcurve__line'),
    chartCurve: !!root.querySelector('.tcurve--chart .tcurve__line'),
    labels: rows.map((r) => r.querySelector('.tipage__label')?.textContent ?? r.querySelector('.tipage__morelabel')?.textContent),
    more: !!root.querySelector('.tipage__more'),
    how: foot?.querySelector('.dpage__link')?.textContent ?? null,
    safety: foot?.querySelector('.dpage__safety')?.textContent ?? null,
    top: { back: onTop(root.querySelector('.ppage__back')), title: onTop(root.querySelector('.ppage__title')), foot: onTop(foot?.querySelector('.dpage__link')) },
    boxes: { body: box(body), foot: box(foot) },
    small,
    vh: innerHeight,
    docScrolls: document.documentElement.scrollWidth > innerWidth + 1,
  }
})()`

export async function surfAndFish({ page, ev, wait, look, fail, OUT, count }) {
  const tap = (sel, ms = 4000) => page.locator(sel).first().tap({ timeout: ms }).then(() => true, () => false)
  /* Batch SIMPLE-2, Section 2: back to the home (the page's Back, then the map's "Back to the home" if the page was the map's), where the tiles are. */
  const toHome = async () => {
    await tap('.tipage .ppage__back', 1500)
    await wait(800)
    await goHome(ev, wait)
    await wait(2500)
  }
  const waitFor = async (root, ready, tries = 40) => {
    let l = null
    for (let i = 0; i < tries; i += 1) {
      await wait(500)
      l = await ev(lookFor(root))
      if (l !== null && ready(l)) break
    }
    return l
  }
  const base = (key, name, l) => {
    if (l.title !== name) fail(`${key} ${name}: the title reads ${JSON.stringify(l.title)}`)
    if (!/ · now$/.test(l.sub ?? '')) fail(`${key} ${name}: the line under the title reads ${JSON.stringify(l.sub)}, not "<spot> · now"`)
    if (l.how !== 'How we got this ›') fail(`${key} ${name}: the foot's left reads ${JSON.stringify(l.how)}`)
    if (l.safety !== 'Forecasts can be wrong · look first') fail(`${key} ${name}: the foot's right reads ${JSON.stringify(l.safety)}`)
    for (const [k, v] of Object.entries(l.top)) if (!v) fail(`${key} ${name}: the ${k} is covered`)
    for (const s of l.small) fail(`${key} ${name}: a button or link under 44 px: ${s}`)
    if (l.docScrolls) fail(`${key} ${name}: the page scrolls sideways`)
    const b = l.boxes
    if (b.foot !== null && b.foot.bottom > l.vh - look.bottom + 1) fail(`${key} ${name}: the foot ends at ${b.foot.bottom}, under the home bar (${l.vh - look.bottom})`)
    if (b.body !== null && b.foot !== null && b.body.bottom > b.foot.top + 1) fail(`${key} ${name}: the body (to ${b.body.bottom}) runs under the foot (from ${b.foot.top})`)
  }
  const reach = async (key, name, cls) => {
    const r = await ev(`(() => { const m = document.querySelector('.${cls} .tipage__more') ?? [...document.querySelectorAll('.${cls} .tipage__row')].at(-1); if (!m) return null; m.scrollIntoView({ block: 'nearest' }); const r = m.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { on: t !== null && m.contains(t), bottom: Math.round(r.bottom), foot: Math.round(document.querySelector('.${cls} .dpage__foot').getBoundingClientRect().top) } })()`)
    if (r === null || !r.on) fail(`${key} ${name}: the last row cannot be brought onto the glass`)
    else if (r.bottom > r.foot + 1) fail(`${key} ${name}: the last row ends at ${r.bottom}, under the foot (${r.foot})`)
  }
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}-${look.key}.png`) })
  const key = look.key

  /* ------------------------------------------------------------ Surf */
  await toHome()
  await tap('.home [data-tile="surf"]')
  const s = await waitFor('.tipage--surf', (l) => l.value !== null && l.value !== '—' && l.bars > 0)
  if (s === null) fail(`${key}: the Surf page (.tipage--surf) is not on screen from the home's Surf tile, so it was not looked at`)
  else {
    count()
    console.log(`  surf: ${JSON.stringify({ title: s.title, sub: s.sub, tabs: s.tabs, on: s.on, eyebrow: s.eyebrow, value: s.value, line: s.line, bars: s.bars, strip: s.strip, rows: s.labels })}`)
    await shot('surf-now')
    base(key, 'Surf', s)
    if (JSON.stringify(s.tabs) !== JSON.stringify(['Now', 'Week', 'Cams', 'Buoys'])) fail(`${key}: the Surf tabs read ${JSON.stringify(s.tabs)}`)
    if (JSON.stringify(s.on) !== JSON.stringify(['Now'])) fail(`${key}: the Surf page opened on ${JSON.stringify(s.on)}, not Now`)
    if (!/^NOW · [A-Z]/.test(s.eyebrow ?? '')) fail(`${key}: the Surf eyebrow reads ${JSON.stringify(s.eyebrow)}, not "NOW · <word>"`)
    if (!/\d.*ft$/.test(s.value ?? '')) fail(`${key}: the Surf value reads ${JSON.stringify(s.value)}, not a range in feet`)
    if ((s.line ?? '') === '') fail(`${key}: the Surf page has no line under the value`)
    if (s.bars !== 24) fail(`${key}: ${s.bars} hourly bars, not 24`)
    if (!s.strip) fail(`${key}: no thin tide curve under the bars`)
    if (JSON.stringify(s.labels) !== JSON.stringify(['Best', 'Tide', 'Swell', 'Water', 'More details'])) fail(`${key}: the Surf rows read ${JSON.stringify(s.labels)}`)
    await reach(key, 'Surf', 'tipage--surf')
    if (key === '390x844') {
      /* Week */
      await tap('.tipage--surf button[role="tab"]:has-text("Week")')
      await wait(800)
      const w = await ev(`({ days: document.querySelectorAll('.tipage--surf .dsurf__day').length, on: document.querySelector('.tipage--surf [role="tab"][aria-selected="true"]')?.textContent, eyebrow: document.querySelector('.tipage--surf .tipage__eyebrow')?.textContent })`)
      if (w.days !== 7 || w.on !== 'Week') fail(`Week tab: ${JSON.stringify(w)}, not seven days on the Week tab`)
      await shot('surf-week')
      /* Cams */
      await tap('.tipage--surf button[role="tab"]:has-text("Cams")')
      let c = null
      for (let i = 0; i < 20; i += 1) {
        await wait(400)
        c = await ev(`({ big: document.querySelector('.tipage--surf [data-cam-big]')?.getAttribute('data-cam-big') ?? null, items: document.querySelectorAll('.tipage--surf .scams__item').length, text: document.querySelector('.tipage--surf [data-cam-list]')?.textContent ?? '', eyebrow: document.querySelector('.tipage--surf .tipage__eyebrow')?.textContent, frames: document.querySelectorAll('.tipage--surf iframe').length, links: [...document.querySelectorAll('.tipage--surf a.scams__big')].map((a) => a.href) })`)
        if (c.items > 0) break
      }
      console.log(`  cams: ${JSON.stringify({ big: c.big, items: c.items, eyebrow: c.eyebrow })}`)
      if (c.items < 2) fail(`Cams tab: ${c.items} cams listed near the spot; two are needed to check picking`)
      else {
        if (c.big === null) fail('Cams tab: no big cam')
        if (!/NEAR YOU · \d+ CAMS?/.test(c.eyebrow ?? '')) fail(`Cams tab: the eyebrow reads ${JSON.stringify(c.eyebrow)}`)
        if (!/(plays here|link out ↗)/.test(c.text)) fail(`Cams tab: the list says neither "plays here" nor "link out ↗": ${c.text.slice(0, 80)}`)
        const srcs = await ev(`[...document.querySelectorAll('.tipage--surf iframe, .tipage--surf img')].map((n) => n.src)`)
        if (srcs.some((u) => /surfline|surfchex/i.test(u))) fail('Cams tab: a Surfline or Surfchex embed or image is on the page')
        /* Pick the second cam: the big one follows, and only the id is kept on the phone. */
        await page.locator('.tipage--surf .scams__item').nth(1).tap()
        await wait(600)
        const after = await ev(`({ big: document.querySelector('.tipage--surf [data-cam-big]')?.getAttribute('data-cam-big') ?? null, kept: localStorage.getItem('scoutngo.surfCam.v1'), pressed: document.querySelectorAll('.tipage--surf .scams__item[aria-pressed="true"]').length })`)
        if (after.big === null || after.big === c.big || after.kept !== after.big) fail(`Cams tab: picking the second cam did not show and keep it: ${JSON.stringify({ was: c.big, ...after })}`)
        if (after.pressed !== 1) fail(`Cams tab: ${after.pressed} cams marked as the shown one`)
        for (const link of c.links) if (!link.startsWith('https://')) fail(`Cams tab: a link out is not https: ${link}`)
      }
      await shot('surf-cams')
      /* Buoys */
      await tap('.tipage--surf button[role="tab"]:has-text("Buoys")')
      await wait(2500)
      const bu = await ev(`({ body: !!document.querySelector('.tipage--surf [data-surf-buoys] .dbuoy__head'), eyebrow: document.querySelector('.tipage--surf .tipage__eyebrow')?.textContent })`)
      if (!bu.body || !/^BUOYS/.test(bu.eyebrow ?? '')) fail(`Buoys tab: ${JSON.stringify(bu)}`)
      await shot('surf-buoys')
      /* Swiping is the tab change too: back to Now, then More details. */
      await tap('.tipage--surf button[role="tab"]:has-text("Now")')
      await wait(500)
      await tap('.tipage--surf .tipage__more')
      await wait(1500)
      const old = await ev(`({ detail: !!document.querySelector('.dpage--surf .dsurf__head'), tipage: !!document.querySelector('.tipage--surf') })`)
      if (!old.detail || old.tipage) fail(`More details did not open the existing Surf page: ${JSON.stringify(old)}`)
      await shot('surf-more')
      await tap('.dpage--surf .dpage__back')
      await wait(800)
      if (!(await ev(`!!document.querySelector('.tipage--surf')`))) fail('Back from the old Surf page did not return to the Surf page')
    }
  }

  /* ------------------------------------------------------------ Fish */
  await toHome()
  if (!(await tap('.home [data-tile="fish"]', 2500))) {
    console.log(`  fish: the home has no Fish tile yet (the Home section routes it): not looked at`)
    return
  }
  /*
   * Wait for the tide curve, not only a value: until the station's tide arrives the page honestly leads with the moon
   * (eyebrow MOON), and a busy gate read it in that moment once (390x844, 20 Nov) and called the curve missing. If the
   * curve never comes, waitFor hands back its last read and the check below still fails (docs/failure-modes.md, C).
   */
  const f = await waitFor('.tipage--fish', (l) => l.value !== null && l.value !== '—' && l.chartCurve === true, 30)
  if (f === null) {
    console.log(`  fish: the Fish tile did not open the Fish page (.tipage--fish) yet: not looked at`)
    return
  }
  count()
  console.log(`  fish: ${JSON.stringify({ title: f.title, sub: f.sub, tabs: f.tabs, eyebrow: f.eyebrow, value: f.value, line: f.line, curve: f.chartCurve, rows: f.labels })}`)
  await shot('fish-today')
  base(key, 'Fish', f)
  if (JSON.stringify(f.tabs) !== JSON.stringify(['Today', 'Week'])) fail(`${key}: the Fish tabs read ${JSON.stringify(f.tabs)}`)
  if (JSON.stringify(f.on) !== JSON.stringify(['Today'])) fail(`${key}: the Fish page opened on ${JSON.stringify(f.on)}`)
  if (!f.chartCurve) fail(`${key}: the Fish page has no tide curve`)
  if (!/^(NEXT TIDE TURN|MOON)$/.test(f.eyebrow ?? '')) fail(`${key}: the Fish eyebrow reads ${JSON.stringify(f.eyebrow)}`)
  if (JSON.stringify(f.labels.slice(0, 4)) !== JSON.stringify(['Moon', 'Pressure', 'Water', 'Wind'])) fail(`${key}: the Fish rows read ${JSON.stringify(f.labels)}`)
  if (key === '390x844') {
    await tap('.tipage--fish button[role="tab"]:has-text("Week")')
    await wait(800)
    const w = await ev(`({ days: document.querySelectorAll('.tipage--fish [data-fish-week] li').length })`)
    if (w.days !== 7) fail(`Fish Week tab: ${w.days} days, not seven`)
    await shot('fish-week')
  }
}
