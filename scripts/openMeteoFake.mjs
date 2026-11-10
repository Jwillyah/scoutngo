/*
 * A STAND-IN FOR OPEN-METEO that answers any request the app makes with the
 * shape it asked for: one object per point, every variable for every model,
 * for the days asked. The numbers are plain and fixed (cloud 40/20/10 %, wind
 * 4 m/s from 20°, sea 1 m at 8 s): this is for counting and for checks that
 * look at the app's words, never for weather. From the third day of an
 * answer on, the cloud and the wind vary by the day (WEEK below), so a week's
 * list is not one day said seven times (Batch QA, Section 0: four identical
 * "Light rays" rows); the first two days stay as they were.
 *
 * `weight` is what Open-Meteo would bill the request as, by its own rule
 * (open-meteo.com/en/pricing, read 30 Oct 2026): over 10 variables or over
 * 14 days counts as more than one call, and here every point counts as one
 * (the multi-point form is one request per point to the service) and every
 * model multiplies the variables.
 */
export const OPEN_METEO = /^https:\/\/(api|marine-api|air-quality-api)\.open-meteo\.com\/|\/api\/forecast\?om=(api|marine-api|air-quality-api)\.open-meteo\.com\//

/** The Open-Meteo request inside one sent through the app's forecast cache (api/forecast.ts), or the request itself. */
export function unwrapForecast(href) {
  const u = new URL(href)
  const om = u.pathname.endsWith('/api/forecast') ? u.searchParams.get('om') : null
  if (om === null) return href
  const q = new URLSearchParams([...u.searchParams].filter(([k]) => k !== 'om' && k !== 'hr'))
  return `https://${om}?${q.toString()}`
}

export function requestShape(href) {
  const u = new URL(unwrapForecast(href))
  const points = (u.searchParams.get('latitude') ?? '').split(',').filter(Boolean).length || 1
  const vars = (u.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const models = (u.searchParams.get('models') ?? '').split(',').filter(Boolean)
  const start = u.searchParams.get('start_date')
  const end = u.searchParams.get('end_date')
  /* past_days: the series starts that many days back and runs that much longer, as Open-Meteo's does (Batch Pages, Section 2). */
  const past = Number(u.searchParams.get('past_days') ?? 0)
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : Number(u.searchParams.get('forecast_days') ?? 7) + past
  const weight = points * Math.max(1, (vars.length * Math.max(1, models.length)) / 10) * Math.max(1, days / 14)
  return { host: u.host, points, vars, models, days, start, past, weight }
}

const value = (v) =>
  /cloud_cover_low/.test(v) ? 40 : /cloud_cover_mid/.test(v) ? 20 : /cloud_cover_high/.test(v) ? 10 : /cloud_cover/.test(v) ? 50
  : /direction/.test(v) ? 20 : /gust/.test(v) ? 6 : /wind_speed/.test(v) ? 4 : /visibility/.test(v) ? 16000
  : /temperature|dew/.test(v) ? 15 : /pressure_msl/.test(v) ? 1019.8 : /humidity/.test(v) ? 70 : /uv_index/.test(v) ? 3 : /wave_height/.test(v) ? 1 : /period/.test(v) ? 8 : /aerosol/.test(v) ? 0.1 : 0

/* Days 2 to 6 of an answer: [low, mid, high] cloud %, and wind m/s. Days 0 and 1 keep value(). */
const WEEK = [null, null, [65, 35, 20, 7], [15, 10, 45, 3], [75, 40, 10, 9], [25, 55, 30, 5], [50, 15, 60, 2]]
const byDay = (name, d, base) => {
  const w = WEEK[d % 7]
  if (d < 2 || w === null) return base
  if (/cloud_cover_low/.test(name)) return w[0]
  if (/cloud_cover_mid/.test(name)) return w[1]
  if (/cloud_cover_high/.test(name)) return w[2]
  if (/wind_speed/.test(name)) return w[3]
  if (/gust/.test(name)) return w[3] + 2
  return base
}

export function fakeAnswer(href, now = new Date()) {
  const s = requestShape(href)
  const first = s.start ?? now.toISOString().slice(0, 10)
  const t0 = Date.parse(`${first}T00:00:00Z`) - (s.start ? 0 : s.past * 86_400_000)
  const time = Array.from({ length: s.days * 24 }, (_, i) => new Date(t0 + i * 3_600_000).toISOString().slice(0, 16))
  /* One model named: Open-Meteo answers plain names (checked 9 Nov, models=gfs_hrrr); two or more: suffixed by model. */
  const names = s.models.length <= 1 ? s.vars : s.vars.flatMap((v) => s.models.map((m) => `${v}_${m}`))
  const day0 = Date.parse(`${first}T00:00:00Z`)
  const one = { hourly: Object.fromEntries([['time', time], ...names.map((n) => [n, time.map((t) => byDay(n, Math.floor((Date.parse(`${t}:00Z`) - day0) / 86_400_000), value(n)))])]) }
  return s.points === 1 ? one : Array.from({ length: s.points }, () => one)
}
