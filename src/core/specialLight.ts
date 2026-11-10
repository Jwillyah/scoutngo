/*
 * SPECIAL LIGHT: fog, rainbows, god rays, from forecast numbers by rules
 * written down here. Each finding carries when, how many models agree, and
 * one line of why. Never a promise: "possible" or "likely", nothing more.
 *
 *   FOG / MARINE LAYER  the dew point within FOG_SPREAD_F of the air, wind
 *                       under FOG_WIND_KT, and the sea colder than the air
 *                       where there is a sea (advection fog). Inland the sea
 *                       term is left out and the line says radiation fog.
 *   RAINBOW             showers within ~30 km and the sun up but under
 *                       RAINBOW_DEG: the bow is a circle RAINBOW_DEG round the
 *                       point opposite the sun, so with the sun higher the
 *                       whole bow is below the horizon.
 *   GOD RAYS            scattered to broken low cloud, GOD_RAYS_LOW cover,
 *                       with the sun low (up to GOD_RAYS_SUN_MAX) behind it.
 *                       The why line gives the cover of the models that said
 *                       yes, worded by cloudWord: on 1 Nov it printed the
 *                       median of all five, "Low cloud 0%, broken", for a
 *                       window one model gave.
 *   IRIDESCENCE         thin mid or high cloud (altocumulus, cirrocumulus),
 *                       IRID_THIN cover, the low cloud under IRID_LOW_MAX so
 *                       the sun shows, and the sun up IRID_SUN_MIN or more.
 *                       The rainbow edges are within about 10° of the sun;
 *                       the forecast cannot place a cloud that close, so the
 *                       line says where to look rather than promising it.
 *
 * WHAT INTERRUPTS. A map chip only when at least MAP_SHARE of the models
 * agree; the rest stay in the list, greyed, under Long shots.
 *
 * ONLY SHOOTABLE WINDOWS (Batch G, Section 5: on the 2 Nov forecast an
 * eleven-hour rainbow and fog "7 PM–9 AM"). A window is at most
 * MAX_WINDOW_H, tied hour by hour to its cause (shootable): fog where it
 * forms or lifts in the light, not the night it sits through; the rest the
 * best two hours of their run, the low sun first. A rainbow needs the
 * showers on the side opposite the sun, where the bow stands, and the sun
 * not hidden by low cloud at the venue (src/lib/specialLightData.ts).
 */
import { normalizeBearing } from './sun.ts'

export const FOG_SPREAD_F = 2
export const FOG_WIND_KT = 6
export const RAINBOW_DEG = 42
export const SHOWERS_MM = 0.1
export const GOD_RAYS_LOW: readonly [number, number] = [30, 80]
export const GOD_RAYS_SUN_MAX = 25
export const IRID_THIN: readonly [number, number] = [10, 60]
export const IRID_LOW_MAX = 50
export const IRID_SUN_MIN = 5
/** Share of the models that must agree before special light interrupts on the map. */
export const MAP_SHARE = 0.5
/** At most this many a day in the list, the most likely first. */
export const PER_DAY = 3
/** Share of the models that must agree for "likely". */
export const LIKELY_SHARE = 0.6
/** The longest window said, hours: one you can stand and shoot through. */
export const MAX_WINDOW_H = 2
/** Light enough to see fog: the sun above civil twilight's end. */
export const FOG_LIGHT_DEG = -6
/** A rainbow's showers count within this of the bearing opposite the sun. */
export const RAINBOW_SIDE_DEG = 67.5
/** Low cloud at the venue at or over this hides the sun: no bow. */
export const RAINBOW_SUN_HIDDEN = 80

const DEG = Math.PI / 180

/* ------------------------------------------------------------------ fog */

export interface FogInput {
  tempF: number | null
  dewF: number | null
  windKt: number | null
  /** The sea's surface temperature, °C, or null inland. */
  seaC: number | null
}

export const fToC = (f: number): number => ((f - 32) * 5) / 9

/** Null when a number the rule needs is missing: not "no fog", "could not say". */
export function fogRule(h: FogInput): boolean | null {
  if (h.tempF === null || h.dewF === null || h.windKt === null) return null
  const close = h.tempF - h.dewF <= FOG_SPREAD_F
  const calm = h.windKt < FOG_WIND_KT
  const sea = h.seaC === null ? true : h.seaC < fToC(h.tempF)
  return close && calm && sea
}

/* -------------------------------------------------------------- rainbow */

export interface SkyPoint {
  azimuth: number
  altitude: number
}

const toVec = (p: SkyPoint): [number, number, number] => {
  const a = p.azimuth * DEG
  const e = p.altitude * DEG
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}
const fromVec = (v: readonly number[]): SkyPoint => ({
  azimuth: normalizeBearing(Math.atan2(v[0], v[1]) / DEG),
  altitude: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG,
})

/** The point opposite the sun: the bow's centre. */
export const antisolar = (sun: SkyPoint): SkyPoint => ({ azimuth: normalizeBearing(sun.azimuth + 180), altitude: -sun.altitude })

/** Angular distance between two sky points, degrees. */
export function angleBetween(a: SkyPoint, b: SkyPoint): number {
  const [x, y] = [toVec(a), toVec(b)]
  return Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) / DEG
}

/**
 * The bow above the horizon: points RAINBOW_DEG from the antisolar point,
 * every `stepDeg` round it, kept where they are above the horizon. Empty when
 * the sun is RAINBOW_DEG or more up.
 */
export function rainbowArc(sun: SkyPoint, stepDeg = 2): SkyPoint[] {
  const c = toVec(antisolar(sun))
  /* Two unit vectors at right angles to the centre. */
  const up: [number, number, number] = Math.abs(c[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]
  const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (v: [number, number, number]): [number, number, number] => {
    const n = Math.hypot(...v)
    return [v[0] / n, v[1] / n, v[2] / n]
  }
  const u = norm(cross(c, up))
  const v = cross(c, u)
  const r = RAINBOW_DEG * DEG
  const out: SkyPoint[] = []
  for (let t = 0; t < 360; t += stepDeg) {
    const th = t * DEG
    const p = [0, 1, 2].map((i) => Math.cos(r) * c[i] + Math.sin(r) * (Math.cos(th) * u[i] + Math.sin(th) * v[i]))
    const sp = fromVec(p)
    if (sp.altitude >= 0) out.push(sp)
  }
  /* In order along the bow, from one foot to the other. */
  return out.sort((a, b) => signedFrom(antisolar(sun).azimuth, a.azimuth) - signedFrom(antisolar(sun).azimuth, b.azimuth))
}

const signedFrom = (centre: number, az: number): number => ((az - centre + 540) % 360) - 180

/** How far either side of the antisolar bearing the bow's feet stand on the horizon: cos 42 = cos(sun) cos(half). Null when no bow. */
export function bowHalfWidthDeg(sunAltitude: number): number | null {
  if (sunAltitude <= 0 || sunAltitude >= RAINBOW_DEG) return null
  return Math.acos(Math.cos(RAINBOW_DEG * DEG) / Math.cos(sunAltitude * DEG)) / DEG
}

export const rainbowRule = (sunAltitude: number, showersNearMm: number | null): boolean | null =>
  showersNearMm === null ? null : sunAltitude > 0 && sunAltitude < RAINBOW_DEG && showersNearMm >= SHOWERS_MM

/* ------------------------------------------------------------- god rays */

export const godRaysRule = (sunAltitude: number, lowCover: number | null): boolean | null =>
  lowCover === null ? null : sunAltitude > 0 && sunAltitude <= GOD_RAYS_SUN_MAX && lowCover >= GOD_RAYS_LOW[0] && lowCover <= GOD_RAYS_LOW[1]

/** Cloud cover in a word, by eighths of the sky as observers report it. */
export function cloudWord(pct: number): 'clear' | 'few' | 'scattered' | 'broken' | 'overcast' {
  if (pct < 6) return 'clear'
  if (pct <= 25) return 'few'
  if (pct <= 50) return 'scattered'
  if (pct <= 87) return 'broken'
  return 'overcast'
}

/* ---------------------------------------------------------- iridescence */

export const iridescenceRule = (sunAltitude: number, low: number | null, mid: number | null, high: number | null): boolean | null => {
  if (mid === null && high === null) return null
  const thin = Math.max(mid ?? 0, high ?? 0)
  return sunAltitude >= IRID_SUN_MIN && (low ?? 0) < IRID_LOW_MAX && thin >= IRID_THIN[0] && thin <= IRID_THIN[1]
}

/* ------------------------------------------------------------- the list */

export type SpecialKind = 'fog' | 'rainbow' | 'rays' | 'glass' | 'fire' | 'iridescence'

export interface Special {
  kind: SpecialKind
  from: Date
  to: Date
  /** Models that said yes at the best hour, of those that said anything. */
  agree: number
  of: number
  word: 'possible' | 'likely'
  why: string
  /** A 'fire' window's event, when it is known: it names the window "Sunrise color" or "Sunset color". */
  event?: 'sunrise' | 'sunset'
  /** One short line from the numbers that found it, for the Sky page's rare light (Batch Pages, Section 3): "broken low cloud, sun 8° up". */
  brief?: string
}

/*
 * NAMES. The colour in the clouds at a sunrise or sunset is "Sunrise color" or
 * "Sunset color", and "Sky color" where no one event is meant (Batch M,
 * Section 4: the old name is The Photographer's Ephemeris's trademark).
 */
export const SPECIAL_NAME: Record<SpecialKind, string> = { fog: 'Fog', rainbow: 'Rainbow', rays: 'God rays', glass: 'Glassy water', fire: 'Sky color', iridescence: 'Iridescence' }
export const COLOR_NAME: Record<'sunrise' | 'sunset', string> = { sunrise: 'Sky color at sunrise', sunset: 'Sky color at sunset' }

/** One window's name: a colour window says its event when it knows it. */
export const specialNameOf = (s: Pick<Special, 'kind' | 'event'>): string => (s.kind === 'fire' && s.event !== undefined ? COLOR_NAME[s.event] : SPECIAL_NAME[s.kind])

/**
 * Hours where at least one model says yes, joined into windows. `byModel[m][h]`
 * is model m's answer at hour h (null: it could not say).
 */
export function windows(kind: SpecialKind, hours: readonly Date[], byModel: readonly (readonly (boolean | null)[])[], why: (h: number) => string): Special[] {
  const out: Special[] = []
  let open: { from: number; to: number; agree: number; of: number; best: number } | null = null
  const close = () => {
    if (open === null) return
    const share = open.of === 0 ? 0 : open.agree / open.of
    out.push({ kind, from: hours[open.from], to: new Date(hours[open.to].getTime() + 3_600_000), agree: open.agree, of: open.of, word: share >= LIKELY_SHARE ? 'likely' : 'possible', why: why(open.best) })
    open = null
  }
  for (let h = 0; h < hours.length; h += 1) {
    const said = byModel.map((m) => m[h]).filter((v): v is boolean => v !== null && v !== undefined)
    const yes = said.filter(Boolean).length
    if (yes === 0) {
      close()
      continue
    }
    if (open === null) open = { from: h, to: h, agree: yes, of: said.length, best: h }
    else {
      open.to = h
      if (yes / said.length > open.agree / Math.max(1, open.of)) Object.assign(open, { agree: yes, of: said.length, best: h })
    }
  }
  close()
  return out
}

/**
 * SHOOTABLE WINDOWS, at most MAX_WINDOW_H each. The runs of hours where a
 * model says yes are found as in `windows`; then from each run:
 *
 *   fog     where it FORMS (the run's first hours, if light) and where it
 *           LIFTS (its last hours, if light); never the night between.
 *   others  the best MAX_WINDOW_H of the run: the most models agreeing, and
 *           of those the lowest sun (the long light the eye goes to).
 *
 * `sun` is the sun's altitude at each hour, degrees.
 */
export function shootable(kind: SpecialKind, hours: readonly Date[], byModel: readonly (readonly (boolean | null)[])[], sun: readonly number[], why: (h: number) => string): Special[] {
  const yesAt = (h: number) => byModel.map((m) => m[h]).filter((v) => v === true).length
  const saidAt = (h: number) => byModel.map((m) => m[h]).filter((v): v is boolean => v !== null && v !== undefined).length
  const runs: [number, number][] = []
  for (let h = 0; h < hours.length; h += 1) {
    if (yesAt(h) === 0) continue
    const last = runs[runs.length - 1]
    if (last !== undefined && last[1] === h - 1) last[1] = h
    else runs.push([h, h])
  }
  const make = (a: number, b: number): Special => {
    let best = a
    for (let h = a; h <= b; h += 1) if (yesAt(h) / Math.max(1, saidAt(h)) > yesAt(best) / Math.max(1, saidAt(best))) best = h
    const agree = yesAt(best)
    const of = saidAt(best)
    return { kind, from: hours[a], to: new Date(hours[b].getTime() + 3_600_000), agree, of, word: of > 0 && agree / of >= LIKELY_SHARE ? 'likely' : 'possible', why: why(best) }
  }
  const n = MAX_WINDOW_H
  const out: Special[] = []
  for (const [a, b] of runs) {
    if (kind === 'fog') {
      const light = (h: number) => sun[h] > FOG_LIGHT_DEG
      /* Forms in the light: its first hours, the light ones only. */
      if (light(a)) {
        let to = a
        while (to < Math.min(b, a + n - 1) && light(to + 1)) to += 1
        out.push(make(a, to))
      }
      /* Lifts in the light: its last hours, the light ones only. */
      if (light(b) && b - (n - 1) > a) {
        let from = Math.max(a, b - n + 1)
        while (from < b && !light(from)) from += 1
        out.push(make(from, b))
      } else if (light(b) && !light(a)) {
        let from = a
        while (from < b && !light(from)) from += 1
        out.push(make(from, b))
      }
      continue
    }
    let start = a
    let score = -Infinity
    for (let s = a; s <= Math.max(a, b - n + 1); s += 1) {
      const e = Math.min(b, s + n - 1)
      let agree = 0
      let low = 0
      for (let h = s; h <= e; h += 1) {
        agree += yesAt(h) / Math.max(1, saidAt(h))
        low += sun[h]
      }
      /* Agreement first; a lower sun breaks ties. */
      const sc = agree * 1000 - low / (e - s + 1)
      if (sc > score) {
        score = sc
        start = s
      }
    }
    out.push(make(start, Math.min(b, start + n - 1)))
  }
  return out
}

/** "Fog possible 6–8 AM" from a window, with the span written by the caller's clock. */
export function specialLine(s: Special, span: (from: Date, to: Date) => string): string {
  return `${specialNameOf(s)} ${s.word} ${span(s.from, s.to)}`
}

/** Enough models agree to interrupt: a map chip, a Near you card. */
export const strong = (s: Special): boolean => s.of > 0 && s.agree / s.of >= MAP_SHARE

const share = (s: Special) => (s.of === 0 ? 0 : s.agree / s.of)

/**
 * Windows of the same kind that overlap or touch, joined, the join keeping
 * the better agreement and its why; when the join would run past
 * MAX_WINDOW_H, only the better of the two is kept (Batch G).
 */
export function mergeOverlaps(list: readonly Special[]): Special[] {
  const out: Special[] = []
  for (const s of [...list].sort((a, b) => a.kind.localeCompare(b.kind) || a.from.getTime() - b.from.getTime())) {
    const last = out[out.length - 1]
    if (last !== undefined && last.kind === s.kind && s.from.getTime() <= last.to.getTime()) {
      const best = share(s) > share(last) ? s : last
      const to = new Date(Math.max(last.to.getTime(), s.to.getTime()))
      out[out.length - 1] = to.getTime() - last.from.getTime() <= MAX_WINDOW_H * 3_600_000 ? { ...best, from: last.from, to } : best
    } else out.push(s)
  }
  return out.sort((a, b) => a.from.getTime() - b.from.getTime())
}

export interface SpecialDay {
  /** Venue-local YYYY-MM-DD. */
  day: string
  /** At least MAP_SHARE agree: most likely first, at most PER_DAY. */
  items: Special[]
  /** Fewer agree: greyed under Long shots, most likely first, at most PER_DAY. */
  longShots: Special[]
}

/** The list by venue-local day, overlaps merged, most likely first, PER_DAY a day of each. */
export function byDay(list: readonly Special[], dayOf: (d: Date) => string): SpecialDay[] {
  const days = new Map<string, Special[]>()
  for (const s of mergeOverlaps(list)) {
    const d = dayOf(s.from)
    days.set(d, [...(days.get(d) ?? []), s])
  }
  const rank = (a: Special, b: Special) => share(b) - share(a) || a.from.getTime() - b.from.getTime()
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, xs]) => ({ day, items: xs.filter(strong).sort(rank).slice(0, PER_DAY), longShots: xs.filter((x) => !strong(x)).sort(rank).slice(0, PER_DAY) }))
}
