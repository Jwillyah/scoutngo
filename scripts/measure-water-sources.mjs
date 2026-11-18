/*
 * THE WATER TEMPERATURE'S SOURCE AT FIVE SPOTS, ASKED LIVE (Batch 3D,
 * Section 3.3). Run by hand, never in the gate: it calls NOAA CO-OPS, NDBC,
 * USGS and Open-Meteo Marine for real.
 *
 * It runs the app's own asking (src/lib/waterTemp.ts askWater) with live
 * answers in place of the phone's plumbing:
 *   - CO-OPS and USGS: the URLs askWater builds, fetched as they are;
 *   - NDBC: the buoy's realtime file from ndbc.noaa.gov, read by the buoy
 *     function's own parser (api/buoy.ts parseRealtimeWater), as /api/buoy
 *     hands it to the phone;
 *   - Open-Meteo Marine: the Tide sheet's and the surf's question
 *     (src/lib/tideSheetData.ts MARINE_NAMES), the spot on the 0.05° grid the
 *     forecast cache sends (src/lib/weatherStore.ts), asked directly;
 *   - the sea: OCEAN below, the map tiles' answer recorded on 17 Nov for the
 *     Virginia spots (tests/waterTemp.test.ts), and Wrightsville Beach's
 *     listed spot on the Atlantic sand (src/data/surfSpots.ts).
 *
 * Usage:  node scripts/measure-water-sources.mjs
 * Writes: measurements/<date>-water-sources.md
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { askWater } from '../src/lib/waterTemp.ts'
import { waterHead, waterSource } from '../src/core/waterTemp.ts'
import { MARINE_NAMES, MARINE_URL, parseHourly } from '../src/lib/tideSheetData.ts'
import { parseRealtimeWater } from '../api/buoy.ts'
import { COOPS_WATER_TEMP } from '../src/data/coopsWaterTemp.ts'
import { USGS_WATER_TEMP } from '../src/data/usgsWaterTemp.ts'
import { NDBC_BUOYS } from '../src/data/ndbc.ts'

const SPOTS = [
  ['VB', { lat: 36.8418, lon: -75.9738 }, true],
  ['Croatan', { lat: 36.82, lon: -75.97 }, true],
  ['Sandbridge', { lat: 36.72, lon: -75.93 }, true],
  ['Lynnhaven', { lat: 36.91, lon: -76.09 }, true],
  ['Wrightsville Beach', { lat: 34.2104, lon: -77.7964 }, true],
]
const grid = (v) => (Math.round(v * 20) / 20).toFixed(2)
const now = new Date()
const asked = []

const deps = (ocean) => ({
  fetchImpl: async (input, init) => {
    asked.push(String(input).split('?')[0])
    return fetch(input, init)
  },
  buoy: async (id) => {
    asked.push(`ndbc ${id}`)
    const r = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`)
    const water = r.ok ? parseRealtimeWater(await r.text()) : null
    return new Response(JSON.stringify({ status: 'ok', water }))
  },
  ocean: async () => ocean,
  sst: async (at) => {
    const p = new URLSearchParams({ latitude: grid(at.lat), longitude: grid(at.lon), hourly: MARINE_NAMES.join(','), forecast_days: '7', timezone: 'GMT' })
    asked.push(MARINE_URL)
    const r = await fetch(`${MARINE_URL}?${p}`)
    if (!r.ok) return 'unreachable'
    const h = parseHourly(await r.json(), MARINE_NAMES)
    return h === null ? null : { times: h.times, values: h.values.sea_surface_temperature }
  },
  lists: async () => ({ coops: COOPS_WATER_TEMP, buoys: NDBC_BUOYS, usgs: async () => USGS_WATER_TEMP }),
})

const rows = []
for (const [name, at, ocean] of SPOTS) {
  asked.length = 0
  const got = await askWater(at, now, deps(ocean))
  const r = got.reading
  const line = r === null ? '—' : waterSource(r, now, true)
  rows.push(`| ${name} | ${at.lat}, ${at.lon} | ${r === null ? '—' : r.site.kind} | ${r === null ? '—' : `${r.c.toFixed(1)} °C`} | ${waterHead(r?.c ?? null, 'F')} | ${line} | ${[...new Set(asked)].join(', ') || 'nothing'} |`)
}

const out = [
  '# The water temperature, its source at five spots (Batch 3D, Section 3.3)',
  '',
  `Run: node scripts/measure-water-sources.mjs, ${now.toISOString()}. askWater (src/lib/waterTemp.ts) with live CO-OPS, NDBC (realtime2, parsed by api/buoy.ts), USGS and Open-Meteo Marine (the spot on the 0.05° grid). Stations within 15 km first, then Open-Meteo's sea_surface_temperature for this hour, then USGS within 5 km, else "No water temp here". The sea at each spot: the map tiles' answer recorded 17 Nov for the Virginia spots, Wrightsville Beach's listed spot on the Atlantic.`,
  '',
  '| spot | at | source | reading | head (°F) | source line | asked |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
]
mkdirSync('measurements', { recursive: true })
const file = `measurements/${now.toISOString().slice(0, 10)}-water-sources.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
console.log(`wrote ${file}`)
