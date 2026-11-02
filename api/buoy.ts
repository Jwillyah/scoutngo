/*
 * ===========================================================================
 * THE NEAREST BUOY'S LATEST WAVES. THIS FUNCTION LOGS NOTHING AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION AT ALL. NOAA NDBC publishes each buoy's latest
 * observations as a public text file, but sends no CORS header, so a browser
 * cannot read it (checked 27 Oct 2026; its ERDDAP mirror sends none either).
 * This fetches that one file, and its spectral summary (.spec, the swell
 * and the wind waves apart), and passes the newest line of each on.
 *
 * WHAT IT RECEIVES: a buoy number, in a POST body ({"station": "44099"}). No
 * coordinate: the phone picks the nearest buoy from the list baked into the
 * app (src/data/ndbc.ts), so the venue never reaches this server.
 * ===========================================================================
 */
const REALTIME = 'https://www.ndbc.noaa.gov/data/realtime2'

const value = (s: string | undefined): number | null => {
  if (s === undefined || s === 'MM') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** The newest line with a wave height, from NDBC's standard meteorological file. */
export function parseRealtime(text: string): { at: string; waveM: number; periodS: number | null; fromDeg: number | null } | null {
  const lines = text.split('\n')
  const head = lines[0]?.replace(/^#/, '').trim().split(/\s+/) ?? []
  const col = (name: string) => head.indexOf(name)
  const iw = col('WVHT')
  if (iw < 0) return null
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue
    const f = line.trim().split(/\s+/)
    const waveM = value(f[iw])
    if (waveM === null) continue
    const [yy, mm, dd, hh, mi] = f
    return { at: `${yy}-${mm}-${dd}T${hh}:${mi}:00Z`, waveM, periodS: value(f[col('DPD')]), fromDeg: value(f[col('MWD')]) }
  }
  return null
}

/** The newest line with a wind speed: m/s, the direction it blows FROM, the gust (Wind page check). */
export function parseRealtimeWind(text: string): { at: string; mps: number; fromDeg: number | null; gustMps: number | null } | null {
  const lines = text.split('\n')
  const head = lines[0]?.replace(/^#/, '').trim().split(/\s+/) ?? []
  const col = (name: string) => head.indexOf(name)
  const iw = col('WSPD')
  if (iw < 0) return null
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue
    const f = line.trim().split(/\s+/)
    const mps = value(f[iw])
    if (mps === null) continue
    const [yy, mm, dd, hh, mi] = f
    return { at: `${yy}-${mm}-${dd}T${hh}:${mi}:00Z`, mps, fromDeg: value(f[col('WDIR')]), gustMps: value(f[col('GST')]) }
  }
  return null
}

/*
 * THE SWELL AND THE WIND WAVES, APART (Batch H). NDBC's spectral summary
 * (<station>.spec) splits the sea into one swell and one wind-wave part:
 * height, period and the direction each comes from, in compass words. That
 * is all the file has; nothing here invents a second swell. "MM" is missing
 * and stays null.
 */
export interface SpecReading {
  at: string
  waveM: number
  swellM: number | null
  swellS: number | null
  swellFrom: string | null
  windWaveM: number | null
  windWaveS: number | null
  windWaveFrom: string | null
  meanFromDeg: number | null
}

export function parseSpec(text: string): SpecReading | null {
  const lines = text.split('\n')
  const head = lines[0]?.replace(/^#/, '').trim().split(/\s+/) ?? []
  const col = (name: string) => head.indexOf(name)
  const iw = col('WVHT')
  if (iw < 0) return null
  const word = (s: string | undefined) => (s === undefined || s === 'MM' || s === 'N/A' || !/^[NESW]{1,3}$/.test(s) ? null : s)
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue
    const f = line.trim().split(/\s+/)
    const waveM = value(f[iw])
    if (waveM === null) continue
    const [yy, mm, dd, hh, mi] = f
    return {
      at: `${yy}-${mm}-${dd}T${hh}:${mi}:00Z`,
      waveM,
      swellM: value(f[col('SwH')]),
      swellS: value(f[col('SwP')]),
      swellFrom: word(f[col('SwD')]),
      windWaveM: value(f[col('WWH')]),
      windWaveS: value(f[col('WWP')]),
      windWaveFrom: word(f[col('WWD')]),
      meanFromDeg: value(f[col('MWD')]),
    }
  }
  return null
}

export async function POST(request: Request): Promise<Response> {
  let body: { station?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ status: 'error', message: 'Expected a JSON body.' }, { status: 400 })
  }
  const station = typeof body.station === 'string' ? body.station.toUpperCase() : ''
  if (!/^[A-Z0-9]{5}$/.test(station)) return Response.json({ status: 'error', message: 'Expected a five-character NDBC station.' }, { status: 400 })
  try {
    const [response, specResponse] = await Promise.all([fetch(`${REALTIME}/${station}.txt`), fetch(`${REALTIME}/${station}.spec`).catch(() => null)])
    if (!response.ok) return Response.json({ status: 'unavailable', message: `NDBC answered HTTP ${response.status}.` })
    const text = await response.text()
    const latest = parseRealtime(text)
    const wind = parseRealtimeWind(text)
    const spec = specResponse !== null && specResponse.ok ? parseSpec(await specResponse.text()) : null
    if (latest === null) return Response.json({ status: 'no-waves', message: 'This buoy reports no wave height lately.', station, wind, spec })
    return Response.json({ status: 'ok', station, ...latest, wind, spec })
  } catch {
    return Response.json({ status: 'unavailable', message: 'Could not reach NDBC.' })
  }
}
