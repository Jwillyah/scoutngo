import { useEffect, useState } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { nextEvents } from '../core/skyFire.ts'
import { fireVerdict } from '../core/fireOutlook.ts'
import { specialNameOf, strong, type Special } from '../core/specialLight.ts'
import { getSunPosition } from '../core/sun.ts'
import { fetchFirePaths, nearestHour, pathsAt } from './skyFireData.ts'
import { fetchSpecialWeek, specialsFrom } from './specialLightData.ts'
import { specialName, type Place } from './placeGroups.ts'

/*
 * NEAR YOU IN THE NEXT 24 HOURS, ON OPENING (field test, 30 Oct).
 *
 * When the app opens, or comes back after more than six hours, and the
 * phone's location is shared or a home spot is set: up to three special-light
 * windows within NEAR_MI of you, at your saved spots and where you are. Tap
 * one to go to that spot and time; "Not now" hides it until tomorrow.
 *
 * Worked out on this phone from the same weather store every screen reads
 * (src/lib/weatherStore.ts): the same Open-Meteo requests the Special tab and
 * Sky fire make, for at most NEAR_PLACES places. Nothing new leaves the
 * phone, and where you are is not kept.
 */
export const NEAR_MI = 25
const NEAR_M = NEAR_MI * 1609.344
export const NEAR_PLACES = 2
export const NEAR_ITEMS = 3
export const RETURN_AFTER_MS = 6 * 3_600_000
const DAY_MS = 86_400_000

export interface NearPlace {
  name: string
  at: LatLon
  /** Metres from you. */
  m: number
}

export interface NearItem {
  /** "Fog possible 6–8 AM · Rudee Inlet" */
  line: string
  place: NearPlace
  at: Date
}

/* ------------------------------------------------------------- the setting */

const KEY = 'scoutngo.nearMe.v1'
const SNOOZE = 'scoutngo.nearMe.snooze.v1'
const SEEN = 'scoutngo.nearMe.seen.v1'
const EVENT = 'scoutngo:nearMe'

export function readNearMe(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function useNearMeSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readNearMe)
  useEffect(() => {
    const f = () => setOn(readNearMe())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  return [
    on,
    (next) => {
      try {
        localStorage.setItem(KEY, next ? 'on' : 'off')
      } catch {
        /* Not kept. */
      }
      window.dispatchEvent(new Event(EVENT))
    },
  ]
}

const dayOf = (t: number) => new Date(t).toDateString() // clock-audit: data, a day key, never shown

/** "Not now": hidden until tomorrow, on this phone's calendar. */
export function snoozeNearMe(now: number = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE, dayOf(now))
  } catch {
    /* Not kept: it shows again next time. */
  }
}

/** Whether to show it now: on, not snoozed today, and a first open or a return after six hours. */
export function nearMeDue(now: number = Date.now(), firstOpen: boolean): boolean {
  try {
    if (!readNearMe()) return false
    if (localStorage.getItem(SNOOZE) === dayOf(now)) return false
    const seen = Number(localStorage.getItem(SEEN) ?? '0')
    return firstOpen || now - seen > RETURN_AFTER_MS
  } catch {
    return false
  }
}

export function markNearMeSeen(now: number = Date.now()): void {
  try {
    localStorage.setItem(SEEN, String(now))
  } catch {
    /* Not kept. */
  }
}

/* ---------------------------------------------------------------- the list */

/** Places within NEAR_MI of `you`, nearest first, at most NEAR_PLACES; where you are counts as one. */
export function placesNear(you: { at: LatLon; name: string }, spots: readonly { name: string; at: LatLon }[]): NearPlace[] {
  const all = [{ ...you, m: 0 }, ...spots.map((s) => ({ ...s, m: distanceMeters(you.at, s.at) }))]
  /* A spot within 1 km of you is where you are: one place, its own name. */
  const merged = all.filter((p, i) => i === 0 || p.m > 1000)
  const named = merged.map((p, i) => (i === 0 ? { ...p, name: all.find((s, j) => j > 0 && s.m <= 1000)?.name ?? p.name } : p))
  return named.filter((p) => p.m <= NEAR_M).sort((a, b) => a.m - b.m).slice(0, NEAR_PLACES)
}

/** The windows that touch the next 24 hours, soonest first, at most NEAR_ITEMS. */
export function pickNear(found: readonly { s: Special; place: NearPlace }[], now: number, clock: (d: Date) => string, place: Place): NearItem[] {
  return found
    .filter(({ s }) => s.to.getTime() > now && s.from.getTime() < now + DAY_MS)
    .sort((a, b) => a.s.from.getTime() - b.s.from.getTime())
    .slice(0, NEAR_ITEMS)
    .map(({ s, place: p }) => {
      const from = new Date(Math.max(s.from.getTime(), now))
      const when = s.kind === 'fire' ? clock(new Date((s.from.getTime() + s.to.getTime()) / 2)) : `${clock(from)}–${clock(s.to)}`
      return { line: `${s.kind === 'fire' ? specialNameOf(s) : specialName(s.kind, place)} ${s.word} ${when} · ${p.name}`, place: p, at: from }
    })
}

/** Asks the shared store for each place's week, and Sky fire's next event at the nearest. */
export async function nearMeItems(places: readonly NearPlace[], now: number, clock: (d: Date) => string, place: Place): Promise<NearItem[]> {
  const found: { s: Special; place: NearPlace }[] = []
  for (const p of places) {
    const week = await fetchSpecialWeek(p.at)
    if (week !== null) for (const s of specialsFrom(week.week, p.at, place === 'inland' ? () => null : week.seaCAt)) if (strong(s)) found.push({ s, place: p })
  }
  const nearest = places[0]
  if (nearest !== undefined) {
    const events = nextEvents(new Date(now), nearest.at)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const event = events[kind]
      if (event === null || event.getTime() < now || event.getTime() > now + DAY_MS) continue
      const data = await fetchFirePaths(nearest.at, getSunPosition(event, nearest.at.lat, nearest.at.lon).azimuth, event.toISOString().slice(0, 10))
      const paths = data === null ? [] : pathsAt(data, nearestHour(event))
      const v = paths.length === 0 ? null : fireVerdict(paths, { event, kind, venue: nearest.at })
      if (v !== null && v.word !== 'unlikely') found.push({ s: { kind: 'fire', event: kind, from: event, to: event, agree: v.agree, of: v.of, word: v.word, why: '' }, place: nearest })
    }
  }
  return pickNear(found, now, clock, place)
}
