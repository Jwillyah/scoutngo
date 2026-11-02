/*
 * COMPARE A PHOTO, ON REAL FILES: WHAT EACH ONE HOLDS, AND HOW THE 3D VIEW SCORED.
 *
 * Usage:  node scripts/measure-compare.mjs <photo.jpg> [more.jpg ...]
 * Writes: measurements/<today>-compare.md, and each photo beside its 3D view
 *         in measurements/<today>-compare/ (the photo scaled to 720 px wide)
 * Exits:  0 every file was read and either scored, or said why not; 2 could
 *         not look.
 *
 * Each file goes through the app's own Compare screen in the browser (the
 * file input is given the path, exactly as a phone's picker would hand it
 * over), so the numbers are the screen's numbers, not a second copy of its
 * arithmetic. The original files are not copied into the repository: the
 * side-by-side is drawn on a canvas at 720 px, so it carries no EXIF and no
 * GPS (Batch D, Section 8 asked for the pictures in measurements/);
 * positions are written to four decimals (about 10 m).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit } from './preflight.mjs'

guardAudit('compare')
const files = process.argv.slice(2).map((f) => resolve(f))
if (files.length === 0) {
  console.error('could not look: name at least one photo')
  process.exit(2)
}

const c = await connect()
const { send, ev, wait, dispose } = c
try {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1' })
  await wait(2500)
  await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&compare=1' })
  await wait(6000)
  await goToStage(ev, wait, 'plan')
  await wait(2000)
  if (!(await ev(`!!document.querySelector('.cmp')`))) throw new Error('the Compare screen did not open (?compare=1)')
  await send('DOM.enable', {})
  const rows = []
  const pairDir = `measurements/${new Date().toISOString().slice(0, 10)}-compare`
  for (const file of files) {
    const { root } = await send('DOM.getDocument', { depth: -1 }).then((r) => r.result)
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.cmp input[type=file]' }).then((r) => r.result)
    if (!nodeId) throw new Error('no file input on the Compare screen')
    await send('DOM.setFileInputFiles', { nodeId, files: [file] })
    let state = null
    for (let i = 0; i < 120; i += 1) {
      await wait(1000)
      state = JSON.parse(await ev(`JSON.stringify(window.__compare ?? null)`))
      if (state !== null && state.name === basename(file) && ['done', 'missing', 'failed'].includes(state.phase)) break
    }
    /* The photo and the 3D view side by side, each 720 px wide, for the eye (Batch D, Section 8). */
    if (state?.phase === 'done') {
      const pair = await ev(`(async () => {
        const photo = document.querySelector('.cmp__photo')
        const render = [...document.querySelectorAll('.cmp__render')].find((i) => !i.classList.contains('cmp__render--swipe')) ?? document.querySelector('.cmp__render')
        if (!photo || !render) return null
        await Promise.all([photo, render].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r)))))
        const W = 720
        const h = Math.round((W * photo.naturalHeight) / photo.naturalWidth)
        const c = document.createElement('canvas')
        c.width = W * 2 + 12
        c.height = h
        const g = c.getContext('2d')
        g.fillStyle = '#fff'
        g.fillRect(0, 0, c.width, h)
        g.drawImage(photo, 0, 0, W, h)
        g.drawImage(render, W + 12, 0, W, h)
        return c.toDataURL('image/jpeg', 0.85).split(',')[1]
      })()`)
      if (pair) {
        mkdirSync(pairDir, { recursive: true })
        writeFileSync(join(pairDir, basename(file).replace(/\.jpe?g$/i, '-pair.jpg')), Buffer.from(pair, 'base64'))
      }
    }
    rows.push({ file: basename(file), state })
    const s = state?.score
    console.log(`  ${basename(file)}: ${state?.phase}${state?.stitched ? ', a stitch' : ''}${s ? `, horizon ${s.horizon.predicted >= 0 && s.horizon.predicted <= s.height ? `${s.horizon.predicted.toFixed(0)}/${s.horizon.photo ?? '-'}/${s.horizon.render ?? '-'}` : 'out of frame'}, ${s.sunNote}` : ''}`)
  }

  const f4 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(4))
  const f1 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(1))
  const lines = [
    '# Compare a photo, on real files',
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-compare.mjs ${rows.map((r) => r.file).join(' ')} · Chrome headless (SwiftShader WebGL), 390 x 844, the app's Compare screen, ${process.env.SCOUTNGO_COMMIT ?? 'working tree'}`,
    '',
    '## What each file holds',
    '',
    '| file | camera | edited by | position | above takeoff m | yaw | pitch | 35 mm | taken | zone | stitch |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(({ file, state }) => {
      const m = state?.meta ?? {}
      return `| ${file} | ${m.model ?? '—'} | ${m.software ?? '—'} | ${m.lat == null ? 'none' : `${f4(m.lat)}, ${f4(m.lon)}`} | ${f1(m.aboveTakeoffM)} | ${f1(m.gimbalYaw)} | ${f1(m.gimbalPitch)} | ${m.focal35 ?? '—'} | ${m.takenLocal ?? '—'} | ${m.offset ?? 'not said'} | ${state?.stitched ? 'yes' : 'no'} |`
    }),
    '',
    '## How the 3D view scored',
    '',
    'Scored at 360 px wide. Horizon rows: predicted from the height and tilt / found in the photo / found in the render. Edges: median px from the render\'s strong edges to the photo\'s, and the share within 4 px.',
    '',
    '| file | outcome | horizon predicted / photo / 3D | sun | edges |',
    '|---|---|---|---|---|',
    ...rows.map(({ file, state }) => {
      const s = state?.score
      const outcome = state === null ? 'did not finish' : state.phase === 'done' ? (state.stitched ? 'shown, not scored (a stitch)' : 'scored') : state.phase
      const inFrame = s && s.horizon.predicted >= 0 && s.horizon.predicted <= s.height
      const horizon = !s ? '—' : inFrame ? `${s.horizon.predicted.toFixed(0)} / ${s.horizon.photo ?? '—'} / ${s.horizon.render ?? '—'} of ${s.height}` : 'out of frame at this tilt'
      return `| ${file} | ${outcome} | ${horizon} | ${s ? s.sunNote : '—'} | ${s?.edges ? `${s.edges.medianPx.toFixed(1)} px, ${Math.round(s.edges.within * 100)}%` : '—'} |`
    }),
    '',
    `Side by side (the photo left, the 3D view right): ${pairDir}/<file>-pair.jpg.`,
    '',
  ]
  const file = `measurements/${new Date().toISOString().slice(0, 10)}-compare.md`
  writeFileSync(file, lines.join('\n'))
  console.log(`wrote ${file}`)
  await dispose()
  process.exit(rows.every((r) => r.state !== null && ['done', 'missing', 'failed'].includes(r.state.phase)) ? 0 : 2)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
