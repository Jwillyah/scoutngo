/*
 * THE TRUTH LOOP: after a shoot, your photos against what the app said.
 *
 * Photos are read on the phone (src/lib/compare/photoMeta.ts, the same reader
 * as Compare a photo): when, where, which way, the lens, how high. Nothing is
 * uploaded; only these numbers are kept, never the picture. Each one is set
 * against what the app works out for that minute and place, which needs no
 * network: where the sun was, the light on the subject from the camera's
 * heading (src/core/lighting.ts), whether it was golden hour, and the next
 * sunrise or sunset's Sky fire forecast if this phone showed one
 * (src/lib/fireLog.ts). Then one tap: It fired, Meh, Nothing.
 *
 * Kept in localStorage, exportable as a file and deletable. Nothing else.
 */
import { getTimes } from 'suncalc'
import type { PhotoMeta } from './compare/photoMeta.ts'
import { photoInstant } from './compare/pose.ts'
import { classifyLighting, type Classification } from '../core/lighting.ts'
import { getSunPosition } from '../core/sun.ts'
import { band } from '../core/sunPath.ts'
import type { FireEntry, FireOutcome } from './fireLog.ts'

export const TRUTH_KEY = 'scoutngo.truthLog.v1'

export interface TruthEntry {
  id: string
  /** ISO instant the photo was taken. */
  at: string
  lat: number
  lon: number
  /** Camera heading, degrees from true north, when the file says. */
  heading: number | null
  focal35: number | null
  /** Metres above takeoff (a drone), when the file says. */
  aboveTakeoffM: number | null
  camera: string | null
  /** What the app works out for that minute, kept with the entry. */
  said: {
    sunAltitude: number
    sunAzimuth: number
    light: Classification | null
    golden: boolean
    /** The nearest sunrise or sunset, and the minutes from it (negative before). */
    event: 'sunrise' | 'sunset'
    minutesFromEvent: number
    /** Sky fire for that event, as this phone showed it beforehand, or null. */
    fire: string | null
  }
  outcome: FireOutcome | null
}

const iso = (d: Date) => d.toISOString()

/** The nearest sunrise or sunset to a moment, on its day. */
function nearestEvent(at: Date, lat: number, lon: number): { event: 'sunrise' | 'sunset'; when: Date } {
  const t = getTimes(new Date(at.getTime()), lat, lon)
  const ok = (d: Date | null | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
  const pick: { event: 'sunrise' | 'sunset'; when: Date }[] = []
  if (ok(t.sunrise)) pick.push({ event: 'sunrise', when: t.sunrise })
  if (ok(t.sunset)) pick.push({ event: 'sunset', when: t.sunset })
  pick.sort((a, b) => Math.abs(a.when.getTime() - at.getTime()) - Math.abs(b.when.getTime() - at.getTime()))
  return pick[0] ?? { event: 'sunrise', when: at }
}

/**
 * One photo's entry, or the reason it cannot be one. `zone` is the place's
 * time zone, used when the file gives no offset.
 */
export function entryFromPhoto(meta: PhotoMeta, zone: string, fireLog: readonly FireEntry[], name = ''): TruthEntry | { missing: string } {
  if (meta.lat === null || meta.lon === null) return { missing: 'where it was taken (no GPS in the file)' }
  const at = photoInstant(meta, zone)
  if (at === null) return { missing: 'when it was taken (no date in the file)' }
  const sun = getSunPosition(at, meta.lat, meta.lon)
  const heading = meta.gimbalYaw === null ? null : ((meta.gimbalYaw % 360) + 360) % 360
  const light =
    heading === null || sun.altitude <= 0
      ? null
      : classifyLighting({ shotType: 'framed', cameraBearing: heading, positionBearing: (heading + 180) % 360 }, sun)
  const ev = nearestEvent(at, meta.lat, meta.lon)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ev.when)
  const shown = fireLog.find((f) => f.date === day && f.event === ev.event && f.forecast !== null)
  return {
    id: `${iso(at)}-${meta.lat.toFixed(4)},${meta.lon.toFixed(4)}${name === '' ? '' : `-${name}`}`,
    at: iso(at),
    lat: meta.lat,
    lon: meta.lon,
    heading,
    focal35: meta.focal35,
    aboveTakeoffM: meta.aboveTakeoffM,
    camera: [meta.make, meta.model].filter((x) => x !== null).join(' ') || null,
    said: {
      sunAltitude: sun.altitude,
      sunAzimuth: sun.azimuth,
      light: light !== null && light.shotType === 'framed' ? light.lighting.classification : null,
      golden: band(sun.altitude) === 'golden',
      event: ev.event,
      minutesFromEvent: Math.round((at.getTime() - ev.when.getTime()) / 60_000),
      fire: shown?.forecast ?? null,
    },
    outcome: null,
  }
}

const valid = (e: unknown): e is TruthEntry => {
  const x = e as Partial<TruthEntry> | null
  return typeof x?.id === 'string' && typeof x.at === 'string' && typeof x.lat === 'number' && typeof x.lon === 'number' && typeof x.said === 'object' && x.said !== null
}

export function readTruthLog(storage: Pick<Storage, 'getItem'> = localStorage): TruthEntry[] {
  try {
    const raw = storage.getItem(TRUTH_KEY)
    const list = raw === null ? [] : (JSON.parse(raw) as unknown)
    return Array.isArray(list) ? list.filter(valid) : []
  } catch {
    return []
  }
}

export function writeTruthLog(log: readonly TruthEntry[], storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(TRUTH_KEY, JSON.stringify(log))
    return true
  } catch {
    return false
  }
}

/** Adds entries, the same photo once, newest first. */
export function withEntries(log: readonly TruthEntry[], add: readonly TruthEntry[]): TruthEntry[] {
  const ids = new Set(add.map((e) => e.id))
  return [...add, ...log.filter((e) => !ids.has(e.id))].sort((a, b) => b.at.localeCompare(a.at))
}

export interface HitRate {
  /** Shoots (one per place, day and event) with an outcome. */
  shoots: number
  /** Where Sky fire said possible or likely: how many, and how many fired. */
  firesaid: number
  firedWhenSaid: number
  /** Where it said unlikely, how many fired anyway. */
  unlikelySaid: number
  firedWhenUnlikely: number
  /** Photos in golden hour, of all logged. */
  golden: number
  photos: number
}

/** Your hit rate, from this phone's log only. One shoot counts once, by its outcome. */
export function hitRate(log: readonly TruthEntry[]): HitRate {
  const shoots = new Map<string, TruthEntry>()
  for (const e of log) {
    if (e.outcome === null) continue
    const key = `${e.lat.toFixed(2)},${e.lon.toFixed(2)}|${e.at.slice(0, 10)}|${e.said.event}`
    if (!shoots.has(key)) shoots.set(key, e)
  }
  const s = [...shoots.values()]
  const said = s.filter((e) => e.said.fire !== null && /likely|possible/.test(e.said.fire) && !/unlikely/.test(e.said.fire))
  const unlikely = s.filter((e) => e.said.fire !== null && /unlikely/.test(e.said.fire))
  return {
    shoots: s.length,
    firesaid: said.length,
    firedWhenSaid: said.filter((e) => e.outcome === 'fired').length,
    unlikelySaid: unlikely.length,
    firedWhenUnlikely: unlikely.filter((e) => e.outcome === 'fired').length,
    golden: log.filter((e) => e.said.golden).length,
    photos: log.length,
  }
}

/** The log as a file of its own, to keep or move: JSON, nothing added. */
export const truthFile = (log: readonly TruthEntry[]): string => JSON.stringify({ kind: 'scoutngo-truth-log', version: 1, entries: log }, null, 1)
