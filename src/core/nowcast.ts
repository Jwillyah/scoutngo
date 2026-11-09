/*
 * THE WIND NOW, NUDGED BY THE STATION (Batch MAP2, Section 2). 9 Nov: we said
 * 10 kt gusting 17 while KNTU read 12, and our afternoon dropped to 5 kt.
 * When an airport station within 15 km reported in the last hour, "now"
 * leans to what it measured, and the lean fades back to the model over
 * three hours:
 *
 *   the miss    the station's wind minus the model's, at the report's time,
 *               as east and north parts (so direction is blended too)
 *   the weight  1 at the report, falling in a straight line to 0 at
 *               FADE_MS after it; nothing before the report
 *   the gust    the model's gust plus the same weight of the station's gust
 *               miss, or of its speed miss when it reported no gust
 *
 * Truth is the station, never another app's forecast. The arithmetic only;
 * src/lib/windNow.ts applies it, measurements/ has the before and after.
 */
import { fromUV, toUV } from './windViewport.ts'

export const FADE_MS = 3 * 3_600_000
export const OBS_MAX_AGE_MS = 3_600_000
export const NOWCAST_STATION_KM = 15

export interface WindAt {
  mps: number
  fromDeg: number | null
  gustMps: number | null
}

export interface StationObs {
  at: Date
  mps: number
  /** Null for variable. */
  fromDeg: number | null
  gustMps: number | null
}

/** How much of the station's miss is still applied at `t`. */
export function nowcastWeight(obsAt: Date, t: Date): number {
  const dt = t.getTime() - obsAt.getTime()
  if (dt < -15 * 60_000) return 0
  return Math.max(0, Math.min(1, 1 - Math.max(0, dt) / FADE_MS))
}

/** Is the report fresh enough to lean on at `now`. */
export const obsFresh = (obs: StationObs | null, now: Date): obs is StationObs => obs !== null && now.getTime() - obs.at.getTime() <= OBS_MAX_AGE_MS && obs.at.getTime() <= now.getTime() + 10 * 60_000

/**
 * The model's wind at `t`, leaned toward the station's. `model(t)` is the
 * model at any time; `obs` the station's report (already checked fresh by
 * the caller, see obsFresh).
 */
export function nowcastAt(model: (t: Date) => WindAt | null, obs: StationObs | null, t: Date): WindAt | null {
  const m = model(t)
  if (m === null || obs === null) return m
  const w = nowcastWeight(obs.at, t)
  if (w === 0) return m
  const base = model(obs.at)
  if (base === null) return m
  const dir = (x: WindAt | StationObs, fallback: number) => x.fromDeg ?? fallback
  const fallbackDir = m.fromDeg ?? base.fromDeg ?? 0
  const mo = toUV(m.mps, dir(m, fallbackDir))
  const bo = toUV(base.mps, dir(base, fallbackDir))
  /* A variable report (no direction) moves the speed only. */
  const so = obs.fromDeg === null ? toUV(obs.mps, dir(base, fallbackDir)) : toUV(obs.mps, obs.fromDeg)
  const u = mo.u + w * (so.u - bo.u)
  const v = mo.v + w * (so.v - bo.v)
  const out = fromUV(u, v)
  const gustMiss = obs.gustMps !== null && base.gustMps !== null ? obs.gustMps - base.gustMps : obs.mps - base.mps
  const gust = m.gustMps === null ? null : Math.max(out.speedMps, m.gustMps + w * gustMiss)
  return { mps: out.speedMps, fromDeg: m.fromDeg === null && obs.fromDeg === null ? null : out.fromDeg, gustMps: gust }
}
