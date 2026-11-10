/*
 * THE DRONE VIEW OVER A LONG FLIGHT, BEFORE AND AFTER (Batch Flow, Section 1;
 * field 9 Nov at Sandbridge: the 3D view closed itself on a grey screen, and
 * again after a long flight). Reads the logs the flight runs wrote and
 * writes measurements/<date>-drone-flight.md.
 *
 * Usage:  node scripts/measure-drone-flight.mjs <name=log> ...
 *
 * Each log line is "[Ns] label JSON" from a WebKit run (Playwright, iPhone
 * 13 viewport, behind the gate's fixture proxy: the imagery is the fixture's
 * tiles, so texture counts and canvas sizes are real and pictures are not),
 * night at Sandbridge (36.7213, -75.9257, 02:00 UTC 10 Nov), the Real look,
 * climbing to about 190 ft on a stubbed gamepad and then either flying
 * straight out (Normal mode, full stick) or circling. Per sample: the
 * renderer's live textures and geometries, the ground's textured pieces and
 * their canvas memory (4 bytes a pixel), and frames a second.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const runs = process.argv.slice(2).map((a) => {
  const [name, path] = a.split('=')
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => /^\[\d+s\] /.test(l))
  const rows = lines.map((l) => {
    const t = Number(/^\[(\d+)s\]/.exec(l)[1])
    const fps = /fps=(\d+)/.exec(l)?.[1] ?? null
    const json = l.slice(l.indexOf('{'))
    let j = null
    try {
      j = JSON.parse(json)
    } catch {
      /* "page not answering" and the like */
    }
    return { t, label: l.replace(/^\[\d+s\] /, '').split(' ')[0], fps, j, raw: l.slice(0, 160) }
  })
  return { name, path, rows }
})

const date = new Date().toISOString().slice(0, 10)
let md = `# The drone view over a long flight, before and after\n\nBatch Flow, Section 1. Written ${new Date().toISOString()} by scripts/measure-drone-flight.mjs from the run logs named below.\n\nParameters: WebKit (Playwright), 390 x 844, the gate's fixture proxy (fixture imagery), Sandbridge 36.7213, -75.9257, 02:00 UTC on 10 Nov (night), the Real look, about 190 ft; straight runs at full forward stick in Normal mode (12 m/s, about 7 km in 10 minutes), circling runs at 0.7 forward with the yaw stick reversed every 10 s. Two straight runs (before and after) ran at the same time, so their frame rates share one machine.\n`
for (const r of runs) {
  md += `\n## ${r.name}\n\nLog: ${r.path}\n\n| seconds | sample | fps | textures | geometries | ground pieces | ground canvas MB | distance |\n|---|---|---|---|---|---|---|---|\n`
  for (const x of r.rows) {
    const g = x.j?.gpu ?? null
    const d = typeof x.j?.d === 'string' ? (/Home (\d+)/.exec(x.j.d)?.[1] ?? /D (\d+)/.exec(x.j.d)?.[1] ?? '') : ''
    md += `| ${x.t} | ${x.label} | ${x.fps ?? ''} | ${g?.textures ?? ''} | ${g?.geometries ?? ''} | ${g?.groundPieces ?? ''} | ${g?.groundCanvasMB ?? ''} | ${d === '' ? '' : `${d} ft`} |${x.j === null ? ` ${x.raw.replace(/\|/g, '/')}` : x.j.err !== undefined ? ` ${String(x.j.err)}` : ''}\n`
  }
}
const path = `measurements/${date}-drone-flight.md`
writeFileSync(path, md)
console.log(md)
console.log(`wrote ${path}`)
