/*
 * A FLIGHT LOG, READ ON THE PHONE (Batch DRONE, Section 2.4; board Drone_P4,
 * "Your last flight here"). Never uploaded: the file is read in the browser
 * and only this summary is kept, in localStorage.
 *
 * WHICH FILES. DJI's own flight records (the app's .txt files) are encrypted
 * since the version 13 format (2021): reading them needs a key from DJI's
 * servers, which would mean sending the file away. So the app reads the CSV
 * that Airdata UAV or PhantomHelp's log viewer exports from that record. The
 * columns are found by name, not by position, with the unit read from the
 * name ("height_above_takeoff(feet)", "OSD.height [ft]"):
 *
 *   time       a seconds or milliseconds column (Airdata "time(millisecond)",
 *              PhantomHelp "OSD.flyTime [s]"), else the datetime column
 *   height     above takeoff (Airdata "height_above_takeoff", PhantomHelp
 *              "OSD.height")
 *   wind       a wind speed column, when the export has one (PhantomHelp
 *              "WEATHER.windSpeed"); Airdata's CSV has none
 *   when       the first datetime or date column (UTC when the name says so)
 *   where      latitude and longitude, the takeoff point
 *
 * A file that is not text, or has none of these columns, is said to be so in
 * words; nothing is guessed.
 */

export interface FlightSummary {
  /** The first row's time, or null when the log carries no date. */
  at: Date | null
  durationS: number
  maxHeightFt: number
  /** The wind the aircraft reported, mean over the flight, m/s; null when the log has no wind column. */
  windMps: number | null
  takeoff: { lat: number; lon: number } | null
}

export type FlightRead = { ok: true; summary: FlightSummary } | { ok: false; why: string }

const MPH = 0.44704
const KMH = 1 / 3.6
const KT = 0.514444

/** Split one CSV line, quotes respected. */
export function csvCells(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const find = (head: readonly string[], re: RegExp) => head.findIndex((h) => re.test(h))

/** Feet per unit, from a column's name: metres unless it says feet. */
const lengthFactor = (name: string) => (/\b(feet|ft)\b|\[ft\]|\(ft\)/i.test(name) ? 1 : 3.28084)

function speedFactor(name: string): number {
  if (/mph/i.test(name)) return MPH
  if (/km\/?h|kph/i.test(name)) return KMH
  if (/\bkt\b|knot/i.test(name)) return KT
  return 1
}

function dateOf(raw: string, utc: boolean): Date | null {
  const s = raw.trim()
  if (s === '') return null
  /* "2026-09-10 16:02:11", "2026-09-10T16:02:11Z", "9/10/2026 4:02:11 PM". */
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(s) ? `${s.replace(' ', 'T').replace(/(\.\d+)?Z?$/, '')}${utc ? 'Z' : ''}` : s
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Reads an exported flight CSV. */
export function readFlightCsv(text: string): FlightRead {
  if (text.slice(0, 2000).split('').some((c) => c.charCodeAt(0) === 0)) {
    return { ok: false, why: 'This is not a text file. DJI’s own .txt flight records are encrypted; export a CSV from Airdata or PhantomHelp and import that.' }
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  /* Some exports put a title line or "sep=," first: the header is the first line naming a height or time column. */
  const headAt = lines.findIndex((l) => /height|time/i.test(l) && l.includes(','))
  if (headAt === -1 || lines.length - headAt < 2) return { ok: false, why: 'No flight columns in this file (a height and a time). Export a CSV from Airdata or PhantomHelp.' }
  const head = csvCells(lines[headAt])
  const rows = lines.slice(headAt + 1).map(csvCells)

  const hCol = (() => {
    const above = find(head, /height_above_takeoff|OSD\.height\b|height.*takeoff|^height\b/i)
    return above !== -1 ? above : find(head, /height|altitude/i)
  })()
  const msCol = find(head, /time\s*\(\s*millisecond|time_ms|\bmillisecond/i)
  const sCol = find(head, /flyTime|flight.?time|time\s*\(\s*s(ec(ond)?s?)?\s*\)|\[s\]/i)
  const dtCol = find(head, /datetime|date.?time|updateTime|^date\b/i)
  const windCol = find(head, /wind.?speed/i)
  const latCol = find(head, /^(OSD\.)?latitude\b|^lat\b/i)
  const lonCol = find(head, /^(OSD\.)?longitude\b|^lon(g)?\b/i)
  if (hCol === -1) return { ok: false, why: 'No height column in this file. Export a CSV from Airdata or PhantomHelp.' }

  const num = (row: readonly string[], col: number) => (col === -1 ? NaN : Number(row[col]))
  const utc = dtCol !== -1 && /utc|gmt|\bz\b/i.test(head[dtCol])
  const firstDate = dtCol === -1 ? null : rows.map((r) => dateOf(r[dtCol] ?? '', utc)).find((d) => d !== null) ?? null

  /* Duration: the time column's span, else the datetime column's. */
  let durationS: number | null = null
  const span = (col: number, per: number) => {
    const v = rows.map((r) => num(r, col)).filter(Number.isFinite)
    return v.length < 2 ? null : (Math.max(...v) - Math.min(...v)) / per
  }
  if (msCol !== -1) durationS = span(msCol, 1000)
  if (durationS === null && sCol !== -1) durationS = span(sCol, 1)
  if (durationS === null && dtCol !== -1) {
    const ds = rows.map((r) => dateOf(r[dtCol] ?? '', utc)).filter((d): d is Date => d !== null)
    if (ds.length >= 2) durationS = (ds[ds.length - 1].getTime() - ds[0].getTime()) / 1000
  }
  if (durationS === null) return { ok: false, why: 'No time column in this file, so the flight’s length cannot be read.' }

  const hf = lengthFactor(head[hCol])
  const heights = rows.map((r) => num(r, hCol) * hf).filter(Number.isFinite)
  if (heights.length === 0) return { ok: false, why: 'The height column is empty.' }
  const winds = windCol === -1 ? [] : rows.map((r) => num(r, windCol) * speedFactor(head[windCol])).filter((v) => Number.isFinite(v) && v >= 0)
  const coords = latCol === -1 || lonCol === -1 ? null : rows.map((r) => ({ lat: num(r, latCol), lon: num(r, lonCol) })).find((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && !(c.lat === 0 && c.lon === 0) && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180) ?? null

  return {
    ok: true,
    summary: {
      at: firstDate,
      durationS: Math.max(0, durationS),
      maxHeightFt: Math.max(...heights),
      windMps: winds.length === 0 ? null : winds.reduce((a, b) => a + b, 0) / winds.length,
      takeoff: coords,
    },
  }
}
