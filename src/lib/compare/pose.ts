/*
 * THE CAMERA A PHOTO WAS TAKEN FROM, AND THE WORDS FOR WHAT ITS FILE HOLDS.
 * Pure functions for src/components/ComparePhoto.tsx.
 */
import type { LatLon } from '../../core/geo.ts'
import { venueTimeZone, zonedTimeToUtc } from '../../core/timezone.ts'
import { formatDistance, type DistanceUnit } from '../units.ts'
import { cropTurn, photoFov, placeable, takenParts, type PhotoMeta } from './photoMeta.ts'

export interface Pose {
  at: LatLon
  /** Metres above the takeoff point. */
  aboveTakeoffM: number
  yaw: number
  pitch: number
  roll: number
  /** The picture's field of view, degrees. */
  fov: { horizontalDeg: number; verticalDeg: number }
  when: Date
  timeZone: string
}

/** The minute the photo was taken: the file's own zone when it says one, else the zone of the place. */
export function photoInstant(meta: PhotoMeta, timeZone: string): Date | null {
  const parts = takenParts(meta)
  if (parts === null) return null
  if (meta.offset !== null && /^[+-]\d{2}:\d{2}$/.test(meta.offset)) {
    const t = Date.parse(`${parts.date}T${parts.time}${meta.offset}`)
    return Number.isNaN(t) ? null : new Date(t)
  }
  const minute = zonedTimeToUtc(parts.date, parts.time.slice(0, 5), timeZone)
  return minute === null ? null : new Date(minute.getTime() + Number(parts.time.slice(6, 8)) * 1000)
}

/** The camera as the file has it, or null when a part the view needs is missing. */
export function poseFromMeta(meta: PhotoMeta, width: number, height: number, stitchFov: number | null): Pose | null {
  if (!placeable(meta).ok || meta.lat === null || meta.lon === null) return null
  const timeZone = venueTimeZone(meta.lat, meta.lon) ?? 'UTC'
  const when = photoInstant(meta, timeZone)
  const focal35 = meta.focal35 ?? null
  if (when === null || focal35 === null) return null
  /* A stitch: the horizontal angle is set by eye, the vertical follows the picture's shape. */
  const fov =
    stitchFov === null
      ? photoFov(focal35, width, height, meta.crop)
      : {
          horizontalDeg: stitchFov,
          verticalDeg: (2 * Math.atan(Math.tan((stitchFov * Math.PI) / 360) * (height / width)) * 180) / Math.PI,
        }
  return {
    at: { lat: meta.lat, lon: meta.lon },
    aboveTakeoffM: meta.aboveTakeoffM ?? 0,
    /* An off-centre crop turns the picture away from where the gimbal pointed. A stitch has no single frame to crop. */
    yaw: (meta.gimbalYaw ?? 0) + (stitchFov === null ? cropTurn(focal35, width, height, meta.crop).yaw : 0),
    pitch: (meta.gimbalPitch ?? 0) + (stitchFov === null ? cropTurn(focal35, width, height, meta.crop).pitch : 0),
    roll: meta.gimbalRoll ?? 0,
    fov,
    when,
    timeZone,
  }
}

/** What the file actually holds, in words; a dash for each thing it does not. */
export function describeMeta(m: PhotoMeta, stitched: boolean, unit: DistanceUnit): string[] {
  const dash = '—'
  return [
    m.model === null ? (m.make ?? 'camera unknown') : `${m.make ?? ''} ${m.model}`.trim(),
    m.lat === null || m.lon === null ? 'no position' : `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`,
    m.aboveTakeoffM === null ? `height ${dash}` : `${formatDistance(m.aboveTakeoffM, unit)} above takeoff`,
    m.gimbalYaw === null ? `heading ${dash}` : `heading ${m.gimbalYaw.toFixed(1)}°`,
    m.gimbalPitch === null ? `tilt ${dash}` : `tilt ${m.gimbalPitch.toFixed(1)}°`,
    m.focal35 === null ? `lens ${dash}` : `${m.focal35} mm${stitched ? ' (one frame of a stitch)' : ''}`,
    m.takenLocal === null ? `time ${dash}` : m.takenLocal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'),
  ]
}
