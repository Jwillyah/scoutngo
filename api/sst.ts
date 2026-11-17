/*
 * ===========================================================================
 * THE SEA'S TEMPERATURE FROM THE SATELLITE, ROUND ONE COARSE CELL. THIS
 * FUNCTION LOGS NOTHING AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION. NASA JPL's MUR sea surface temperature (about
 * 1 km, daily) is served by NOAA CoastWatch's ERDDAP, which sends no CORS
 * header (checked 17 Nov 2026 on coastwatch.pfeg.noaa.gov,
 * coastwatch.noaa.gov and upwell.pfeg.noaa.gov), so a browser cannot read
 * it. This asks for one box of the newest day and passes the numbers on.
 *
 * WHAT IT RECEIVES: a cell, {"lat": 37, "lon": -76}, in a POST body. The
 * phone snaps the spot to a half degree (about 55 km) before sending it
 * (src/core/waterTemp.ts sstCell), and this refuses anything finer, so
 * neither this server nor ERDDAP learns more than that cell. Asked only for
 * a spot on the sea with no station within 15 km.
 *
 * WHAT IT SENDS ON: the box SST_BOX_DEG round the cell, every second MUR
 * cell (0.02°, about 2 km), south to north and west to east; null is land.
 * ===========================================================================
 */
const SOURCE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json'
/* The same numbers as src/core/waterTemp.ts (SST_CELL_DEG, SST_BOX_DEG, SST_STRIDE); api/ does not import the app. */
const CELL_DEG = 0.5
const BOX_DEG = 0.3
const STRIDE = 2
const MUR_STEP = 0.01

/** The cell of a body: both on the half-degree grid and on the Earth; null otherwise. */
export function cellOf(body: unknown): { lat: number; lon: number } | null {
  const b = body as { lat?: unknown; lon?: unknown } | null
  const lat = typeof b?.lat === 'number' ? b.lat : NaN
  const lon = typeof b?.lon === 'number' ? b.lon : NaN
  const onGrid = (v: number) => Number.isFinite(v) && Math.abs(v / CELL_DEG - Math.round(v / CELL_DEG)) < 1e-9
  if (!onGrid(lat) || !onGrid(lon) || Math.abs(lat) > 89.5 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

const fixed = (v: number) => (Math.round(v * 100) / 100).toFixed(2)

/** ERDDAP's query for the box round a cell. */
export function murUrl(cell: { lat: number; lon: number }): string {
  const q = `analysed_sst[(last)][(${fixed(cell.lat - BOX_DEG)}):${STRIDE}:(${fixed(cell.lat + BOX_DEG)})][(${fixed(cell.lon - BOX_DEG)}):${STRIDE}:(${fixed(cell.lon + BOX_DEG)})]`
  return `${SOURCE}?${encodeURIComponent(q).replace(/%3A/g, ':').replace(/%28/g, '(').replace(/%29/g, ')')}`
}

/** ERDDAP's table as a grid: the day, the south-west corner, the step, rows south to north. */
export function gridOf(body: unknown): { day: string; lat0: number; lon0: number; step: number; rows: (number | null)[][] } | null {
  const rows = (body as { table?: { rows?: unknown[] } } | null)?.table?.rows
  if (!Array.isArray(rows) || rows.length === 0) return null
  const cells = rows.flatMap((r) => (Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'number' && typeof r[2] === 'number' ? [{ t: r[0], lat: r[1], lon: r[2], c: typeof r[3] === 'number' && Number.isFinite(r[3]) ? r[3] : null }] : []))
  if (cells.length === 0) return null
  const step = MUR_STEP * STRIDE
  const lat0 = Math.min(...cells.map((c) => c.lat))
  const lon0 = Math.min(...cells.map((c) => c.lon))
  const ni = Math.round((Math.max(...cells.map((c) => c.lat)) - lat0) / step) + 1
  const nj = Math.round((Math.max(...cells.map((c) => c.lon)) - lon0) / step) + 1
  if (ni > 200 || nj > 200) return null
  const grid: (number | null)[][] = Array.from({ length: ni }, () => Array.from({ length: nj }, () => null))
  for (const c of cells) {
    const i = Math.round((c.lat - lat0) / step)
    const j = Math.round((c.lon - lon0) / step)
    if (grid[i] !== undefined && j >= 0 && j < nj) grid[i][j] = c.c === null ? null : Math.round(c.c * 100) / 100
  }
  return { day: cells[0].t.slice(0, 10), lat0, lon0, step, rows: grid }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'error', message: 'Expected a JSON body.' }, { status: 400 })
  }
  const cell = cellOf(body)
  if (cell === null) return Response.json({ status: 'error', message: 'Expected a cell on the half-degree grid.' }, { status: 400 })
  try {
    const r = await fetch(murUrl(cell), { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return Response.json({ status: 'unavailable', message: `ERDDAP answered HTTP ${r.status}.` })
    const grid = gridOf(await r.json())
    if (grid === null) return Response.json({ status: 'unavailable', message: 'ERDDAP sent no cells.' })
    return Response.json({ status: 'ok', ...grid }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'unavailable', message: 'Could not reach ERDDAP.' })
  }
}
