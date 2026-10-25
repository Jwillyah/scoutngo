/*
 * THE SCOUTNGO FILE: ONE FORMAT FOR EVERYTHING THAT LEAVES AS A FILE.
 *
 * WHY THIS EXISTS. Clearing Safari's history and website data wipes
 * localStorage, and localStorage was the only place the kit lived. The kit,
 * the spots and the units went with it, regularly. This is the copy you own:
 * one .json, written to Files, read back on any device.
 *
 * ONE FORMAT, NOT TWO. The spots list already exported a file, in its own
 * shape. A backup in a second shape, and a future "plan as a file" in a
 * third, is three readers to keep in step and three ways to lose a field. So
 * there is one: a ScoutNGo file carries whichever parts it was asked to
 * carry. A backup carries all of them; the spots export carries spots; a
 * shared plan will be a file carrying one spot. The reader is the same.
 *
 * NOTHING LEAVES THE DEVICE EITHER WAY. Export hands the browser a file to
 * save; import reads one the shooter picked. No upload, no link, no server.
 *
 * WHAT IS NOT IN IT, on purpose: saved map tiles (megabytes, and re-fetched
 * from the venue in seconds with signal), saved forecasts (stale by the time
 * anyone imports them), the field pack (photos, rebuilt from a plan), and
 * the API key (a secret does not belong in a file that gets emailed).
 */
import { type KitProfile } from '../core/kit.ts'
import {
  reviveKitProfile,
  reviveSelection,
  reviveShelved,
  type KitSelection,
} from './kitSelection.ts'
import { reviveSpot, SPOTS_FORMAT, type Spot } from './spots.ts'
import { reviveUnits, type Units } from './units.ts'

export const SCOUT_FILE_FORMAT = 'scoutngo'
/*
 * 2 added `plan`: one plan on its own, the file "Save plan" writes and a
 * shared plan travels as. A version 1 file has no plan and reads exactly as it
 * always did.
 */
export const SCOUT_FILE_VERSION = 2

/** The kit as a file carries it: what is owned, what is packed, what is shelved. */
export interface FileKit {
  profile: KitProfile
  selection: KitSelection
  shelved: string[]
}

export interface ScoutFile {
  format: typeof SCOUT_FILE_FORMAT
  version: number
  /** ISO instant, so two backups can be told apart without opening them. */
  exportedAt: string
  kit?: FileKit
  units?: Units
  /** Saved spots: a venue, its window, kit and positions, under a name. The plans. */
  spots?: Spot[]
  /** One plan: the venue, window, kit, positions and marks in front of you. Version 2. */
  plan?: Spot
}

export interface ScoutFileParts {
  kit?: FileKit
  units?: Units
  spots?: Spot[]
  plan?: Spot
}

export function buildScoutFile(parts: ScoutFileParts, now: Date = new Date()): ScoutFile {
  return {
    format: SCOUT_FILE_FORMAT,
    version: SCOUT_FILE_VERSION,
    exportedAt: now.toISOString(),
    ...(parts.kit === undefined ? {} : { kit: parts.kit }),
    ...(parts.units === undefined ? {} : { units: parts.units }),
    ...(parts.spots === undefined ? {} : { spots: parts.spots }),
    ...(parts.plan === undefined ? {} : { plan: parts.plan }),
  }
}

/** What a file held, revived, and what had to be left behind. */
export interface ReadFile {
  kit: FileKit | null
  units: Units | null
  spots: Spot[]
  /** The one plan a "Save plan" file carries, or null. */
  plan: Spot | null
  /** Spots in the file that could not be read. */
  skippedSpots: number
  /** "a backup", "spots", "an older spots file": what to call it on screen. */
  kind: 'backup' | 'spots' | 'legacy-spots' | 'plan'
}

export type ReadResult = { ok: true; file: ReadFile } | { ok: false; reason: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Reads a ScoutNGo file, or an older spots-only file, out of untrusted text.
 *
 * EVERY PART IS REVIVED BY THE SAME CODE THAT REVIVES IT FROM STORAGE. A file
 * may have been hand edited or written by a newer build; a lens with a missing
 * focal length is dropped by reviveKitProfile exactly as it would be on
 * reload, rather than by a second, laxer reader here.
 */
export function readScoutFile(text: string): ReadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' }
  }

  /* The older shapes: a bare array of spots, or { format: 'scoutngo.spots' }. */
  if (Array.isArray(parsed) || (isObject(parsed) && parsed.format === SPOTS_FORMAT)) {
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.spots) ? parsed.spots : []
    const spots = list.map(reviveSpot).filter((s): s is Spot => s !== null)
    if (spots.length === 0) return { ok: false, reason: 'No readable spots in that file.' }
    return {
      ok: true,
      file: { kit: null, units: null, spots, plan: null, skippedSpots: list.length - spots.length, kind: 'legacy-spots' },
    }
  }

  if (!isObject(parsed) || parsed.format !== SCOUT_FILE_FORMAT) {
    return { ok: false, reason: 'That is not a ScoutNGo file.' }
  }
  if (typeof parsed.version !== 'number' || parsed.version > SCOUT_FILE_VERSION) {
    return {
      ok: false,
      reason: 'That file was written by a newer ScoutNGo. Update the app and try again.',
    }
  }

  let kit: FileKit | null = null
  if (isObject(parsed.kit) && isObject(parsed.kit.profile)) {
    const profile = reviveKitProfile(parsed.kit.profile)
    const shelved = reviveShelved(parsed.kit.shelved, profile)
    kit = { profile, shelved, selection: reviveSelection(parsed.kit.selection, profile, shelved) }
  }

  const units = isObject(parsed.units) ? reviveUnits(parsed.units) : null
  const list = Array.isArray(parsed.spots) ? parsed.spots : []
  const spots = list.map(reviveSpot).filter((s): s is Spot => s !== null)
  const plan = parsed.plan === undefined ? null : reviveSpot(parsed.plan)

  if (kit === null && units === null && spots.length === 0 && plan === null) {
    return { ok: false, reason: 'That file has nothing in it this app can read.' }
  }
  return {
    ok: true,
    file: {
      kit,
      units,
      spots,
      plan,
      skippedSpots: list.length - spots.length,
      kind: plan !== null && kit === null && units === null && spots.length === 0 ? 'plan' : kit === null && units === null ? 'spots' : 'backup',
    },
  }
}

/** One line for what a file holds, said before anything is replaced. */
export function describeFile(file: ReadFile): string {
  const parts: string[] = []
  if (file.kit !== null) {
    const { profile, shelved } = file.kit
    parts.push(
      `kit: ${profile.bodies.length} bodies, ${profile.lenses.length} lenses, ${profile.drones.length} ${profile.drones.length === 1 ? 'drone' : 'drones'}${shelved.length === 0 ? '' : `, ${shelved.length} shelved`}`,
    )
  }
  if (file.units !== null) parts.push(`units: wind in ${file.units.wind}, distance in ${file.units.distance}`)
  if (file.plan !== null) parts.push(`the plan "${file.plan.name}"`)
  if (file.spots.length > 0) parts.push(`${file.spots.length} ${file.spots.length === 1 ? 'spot' : 'spots'}`)
  const skipped = file.skippedSpots === 0 ? '' : ` (${file.skippedSpots} unreadable, left out)`
  return `${parts.join(' · ')}${skipped}`
}

export function scoutFilename(kind: 'backup' | 'spots' | 'plan', now: Date = new Date()): string {
  return `scoutngo-${kind}-${now.toISOString().slice(0, 10)}.json`
}

/**
 * HANDS THE BROWSER A FILE TO SAVE. On iPhone this is the download sheet,
 * whose "Save to Files" is the export. Nothing is uploaded: the bytes go from
 * this page to the phone's own storage.
 */
export function saveScoutFile(file: ScoutFile, filename: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  /* Revoked on the next turn: Safari reads the URL after click() returns. */
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
