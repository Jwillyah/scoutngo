/*
 * BUILDS src/data/cams.json, THE ONE CAM LIST WITH TAGS (Batch SIMPLE-2, Section 6).
 *
 * Usage:  node scripts/build-cams.mjs
 *
 * Every fact has one home, and this file only joins them:
 *   where a beach cam is, its page, its operator, the sea's facing
 *                       data/coast-cams.json (through src/data/coastCams.ts, for its ids)
 *   where a VDOT cam is, its still          src/data/vdotCams.ts (scripts/bake-vdot-cams.mjs)
 *   tags, a facing read from a cam's name, cams in no other list
 *                                           data/cam-tags.json (hand-written)
 *   may we show it in the app (embed)       data/cam-sources.json, per source
 * tests/camsJson.test.ts rebuilds the list in memory and fails when the
 * committed cams.json differs, so an edit to any input without a rebuild
 * cannot ship.
 *
 * DEFAULTS for a cam with no hand tag: a coast cam is ["surf", "sky"] with the
 * sea's facing (facingIs "sea"); a VDOT cam is ["road"] with facing null.
 * VDOT's lane label (NB, WB) is the traffic a cam watches, never where it
 * looks (docs/cams.md, Batch M), so it is never copied into `facing`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { COAST_CAMS } from '../src/data/coastCams.ts'
import { VDOT_CAMS } from '../src/data/vdotCams.ts'
import { bearingBetween } from '../src/core/geo.ts'

export const TAGS = ['sky', 'surf', 'road']
const SOURCE_OF_OPERATOR = { Surfchex: 'surfchex', Surfline: 'surfline', SkylineWebcams: 'skylinewebcams', EarthCam: 'earthcam', HDOnTap: 'hdontap' }

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

export function buildCams() {
  const sources = readJson('data/cam-sources.json')
  const hand = readJson('data/cam-tags.json')
  const embedOf = new Map(sources.map((s) => [s.id, s.embed]))
  const sourceEmbed = (id) => {
    if (!embedOf.has(id)) throw new Error(`no source "${id}" in data/cam-sources.json`)
    return embedOf.get(id)
  }

  const base = [
    ...COAST_CAMS.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.at.lat,
      lon: c.at.lon,
      source: SOURCE_OF_OPERATOR[c.operator] ?? 'other',
      operator: c.operator,
      url: c.url,
      access: c.access,
      tags: ['surf', 'sky'],
      facing: c.facing,
      facingIs: c.facing === null ? null : 'sea',
    })),
    ...VDOT_CAMS.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.at.lat,
      lon: c.at.lon,
      source: 'vdot',
      operator: 'VDOT',
      url: c.url,
      access: c.access,
      tags: ['road'],
      facing: null,
      facingIs: null,
    })),
    ...hand.added.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, source: c.source, operator: c.operator, url: c.url, access: c.access, tags: c.tags, facing: c.facing, facingIs: c.facing === null ? null : 'name' })),
  ]

  const byId = new Map()
  for (const c of base) {
    if (byId.has(c.id)) throw new Error(`duplicate cam id ${c.id}`)
    byId.set(c.id, c)
  }

  for (const [id, t] of Object.entries(hand.tags)) {
    const cam = byId.get(id)
    if (cam === undefined) throw new Error(`data/cam-tags.json tags "${id}", which is in no list`)
    cam.tags = t.tags
    if (t.facingToward !== undefined) {
      const to = byId.get(t.facingToward)
      if (to === undefined) throw new Error(`${id}: facingToward "${t.facingToward}" is in no list`)
      cam.facing = Math.round(bearingBetween({ lat: cam.lat, lon: cam.lon }, { lat: to.lat, lon: to.lon }))
      cam.facingIs = 'name'
    }
  }

  return base.map((c) => {
    if (c.tags.length === 0 || c.tags.some((t) => !TAGS.includes(t))) throw new Error(`${c.id}: tags ${JSON.stringify(c.tags)}`)
    return { ...c, tags: TAGS.filter((t) => c.tags.includes(t)), embed: sourceEmbed(c.source) }
  })
}

export const camsJsonText = (cams) => `[\n${cams.map((c) => `  ${JSON.stringify(c)}`).join(',\n')}\n]\n`

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cams = buildCams()
  writeFileSync(new URL('../src/data/cams.json', import.meta.url), camsJsonText(cams))
  const count = (f) => cams.filter(f).length
  console.log(`src/data/cams.json: ${cams.length} cams; sky ${count((c) => c.tags.includes('sky'))}, surf ${count((c) => c.tags.includes('surf'))}, road ${count((c) => c.tags.includes('road'))}; embed ${count((c) => c.embed)}; facing known ${count((c) => c.facing !== null)}`)
}
