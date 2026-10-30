/*
 * HOW BIG IS A VENUE SAVED FOR OFFLINE? Downloads, from the real services,
 * every tile a pack holds (src/lib/venuePack.ts packParts) and runs the
 * pack's own data half (savePackData) against the real forecasts and NOAA,
 * with a phone-like store in memory, and writes the bytes to
 * measurements/<date>-venue-pack.md with the parameters of the run.
 *
 * Usage:  node scripts/measure-venue-pack.mjs
 */
import { writeFileSync } from 'node:fs'
import { allUrls } from '../src/lib/offlineCache.ts'
import { packParts, savePackData, PACK_NEAR_RADIUS_M, PACK_FAR_RADIUS_M, PACK_NEAR_IMAGERY, PACK_NEAR_TERRAIN, PACK_FAR_ZOOMS } from '../src/lib/venuePack.ts'

const VENUES = [
  { name: 'Virginia Beach Fishing Pier', at: { lat: 36.8435575, lon: -75.9713104 }, timeZone: 'America/New_York' },
  { name: 'Big Meadow, Shenandoah', at: { lat: 38.5195, lon: -78.444 }, timeZone: 'America/New_York' },
]

const store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  clear: () => store.clear(),
  getItem: (k) => store.get(k) ?? null,
  key: (i) => [...store.keys()][i] ?? null,
  removeItem: (k) => void store.delete(k),
  setItem: (k, v) => void store.set(k, String(v)),
}

const kindOf = (u) => (/World_Imagery/.test(u) ? 'imagery' : /terrarium/.test(u) ? 'terrain' : /openfreemap/.test(u) ? 'vector' : 'other')

async function getAll(urls) {
  const out = { imagery: { n: 0, bytes: 0, missing: 0 }, terrain: { n: 0, bytes: 0, missing: 0 }, vector: { n: 0, bytes: 0, missing: 0 }, failed: 0 }
  const queue = [...urls]
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (queue.length > 0) {
      const url = queue.shift()
      const k = kindOf(url)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
          out[k].n += 1
          if (r.ok) out[k].bytes += (await r.arrayBuffer()).byteLength
          else out[k].missing += 1
          break
        } catch {
          if (attempt === 2) out.failed += 1
        }
      }
    }
  }))
  return out
}

const shootAt = new Date('2026-10-30T13:00:00Z')
const rows = []
for (const v of VENUES) {
  const [near, far] = packParts(v.at)
  const urls = allUrls({ ...near, extra: [far] })
  const t0 = Date.now()
  const tiles = await getAll(urls)
  store.clear()
  const data = await savePackData({ centre: v.at, name: v.name, shootAt, timeZone: v.timeZone })
  const dataBytes = (store.get('scoutngo.forecast.v1') ?? '').length
  const tileBytes = tiles.imagery.bytes + tiles.terrain.bytes + tiles.vector.bytes
  rows.push({ v, urls: urls.length, tiles, data, dataBytes, tileBytes, seconds: Math.round((Date.now() - t0) / 1000) })
  console.log(v.name, JSON.stringify({ urls: urls.length, tiles, dataBytes, data: data.data, mb: ((tileBytes + dataBytes) / 1e6).toFixed(1) }))
}

const mb = (b) => (b / 1e6).toFixed(1)
const today = new Date().toISOString().slice(0, 10)
const md = `# A venue saved for offline: its size

Run ${new Date().toISOString()} by scripts/measure-venue-pack.mjs, from a desktop on a home connection.

Parameters (src/lib/venuePack.ts): near ring ${PACK_NEAR_RADIUS_M} m, imagery z${PACK_NEAR_IMAGERY[0]}-${PACK_NEAR_IMAGERY[1]}, elevation z${PACK_NEAR_TERRAIN[0]}-${PACK_NEAR_TERRAIN[1]}, map tiles z12-14; wide ring ${PACK_FAR_RADIUS_M} m, imagery and elevation z${PACK_FAR_ZOOMS[0]}-${PACK_FAR_ZOOMS[1]}. Forecast data for a shoot at ${shootAt.toISOString()}, tides for 7 days from it. Imagery from Esri World Imagery, elevation from AWS terrarium, map tiles from OpenFreeMap: every tile GET, bytes as received.

| venue | tiles | imagery | elevation | map tiles | forecast and tides | total |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.v.name} | ${r.urls} | ${mb(r.tiles.imagery.bytes)} MB (${r.tiles.imagery.n} tiles, ${r.tiles.imagery.missing} not served) | ${mb(r.tiles.terrain.bytes)} MB (${r.tiles.terrain.n}) | ${mb(r.tiles.vector.bytes)} MB (${r.tiles.vector.n}) | ${mb(r.dataBytes)} MB (${r.data.data.tideDays} tide days, station ${r.data.data.tideStation ?? 'none'}) | ${mb(r.tileBytes + r.dataBytes)} MB |`).join('\n')}

Tiles that never answered after three tries: ${rows.map((r) => `${r.v.name} ${r.tiles.failed}`).join(', ')}.
Time to fetch on this connection: ${rows.map((r) => `${r.v.name} ${r.seconds} s`).join(', ')}.
`
writeFileSync(`measurements/${today}-venue-pack.md`, md)
console.log(`wrote measurements/${today}-venue-pack.md`)
