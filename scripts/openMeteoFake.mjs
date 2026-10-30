/*
 * A STAND-IN FOR OPEN-METEO that answers any request the app makes with the
 * shape it asked for: one object per point, every variable for every model,
 * for the days asked. The numbers are plain and fixed (cloud 40/20/10 %, wind
 * 4 m/s from 20°, sea 1 m at 8 s): this is for counting and for checks that
 * look at the app's words, never for weather.
 *
 * `weight` is what Open-Meteo would bill the request as, by its own rule
 * (open-meteo.com/en/pricing, read 30 Oct 2026): over 10 variables or over
 * 14 days counts as more than one call, and here every point counts as one
 * (the multi-point form is one request per point to the service) and every
 * model multiplies the variables.
 */
export const OPEN_METEO = /^https:\/\/(api|marine-api|air-quality-api)\.open-meteo\.com\//

export function requestShape(href) {
  const u = new URL(href)
  const points = (u.searchParams.get('latitude') ?? '').split(',').filter(Boolean).length || 1
  const vars = (u.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const models = (u.searchParams.get('models') ?? '').split(',').filter(Boolean)
  const start = u.searchParams.get('start_date')
  const end = u.searchParams.get('end_date')
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : Number(u.searchParams.get('forecast_days') ?? 7)
  const weight = points * Math.max(1, (vars.length * Math.max(1, models.length)) / 10) * Math.max(1, days / 14)
  return { host: u.host, points, vars, models, days, start, weight }
}

const value = (v) =>
  /cloud_cover_low/.test(v) ? 40 : /cloud_cover_mid/.test(v) ? 20 : /cloud_cover_high/.test(v) ? 10 : /cloud_cover/.test(v) ? 50
  : /direction/.test(v) ? 20 : /gust/.test(v) ? 6 : /wind_speed/.test(v) ? 4 : /visibility/.test(v) ? 16000
  : /temperature|dew/.test(v) ? 15 : /wave_height/.test(v) ? 1 : /period/.test(v) ? 8 : /aerosol/.test(v) ? 0.1 : 0

export function fakeAnswer(href, now = new Date()) {
  const s = requestShape(href)
  const first = s.start ?? now.toISOString().slice(0, 10)
  const t0 = Date.parse(`${first}T00:00:00Z`)
  const time = Array.from({ length: s.days * 24 }, (_, i) => new Date(t0 + i * 3_600_000).toISOString().slice(0, 16))
  const names = s.models.length === 0 ? s.vars : s.vars.flatMap((v) => s.models.map((m) => `${v}_${m}`))
  const one = { hourly: Object.fromEntries([['time', time], ...names.map((n) => [n, time.map(() => value(n))])]) }
  return s.points === 1 ? one : Array.from({ length: s.points }, () => one)
}
