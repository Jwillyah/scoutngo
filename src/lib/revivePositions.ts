import { clampAltitudeFeet, DEFAULT_ALTITUDE_FEET } from '../core/air.ts'
import { DEFAULT_KIT, type KitProfile } from '../core/kit.ts'
import { platformOptics } from '../core/optics.ts'
import type { Platform } from '../core/platformFilter.ts'
import { DEFAULT_SHOT_TYPE, DEFAULT_YAW_DEGREES, type ShotType } from '../core/shotType.ts'
import type { CameraPosition } from './plan.ts'
import { renumber } from './positions.ts'

/**
 * POSITIONS COMING BACK OFF THE DEVICE, CHECKED AGAINST THE KIT.
 *
 * WHY THIS EXISTS: THE FOURTH REPORT OF ONE SCREEN.
 *
 *   LENS   Sigma 28-75 f2.8
 *   FOCAL  24 mm
 *
 * A position carrying the AIRCRAFT's optic with its platform left on ground.
 * Two earlier fixes held and neither helped, because neither was where it came
 * from. The add path has made correct air positions since the platform filter
 * and the default optic were made to agree; the picker has listed the right
 * optics since. But a position does not only come from the add path. It also
 * comes back out of a SAVED SPOT, as JSON, and that path trusted it:
 * `setPositions(spot.positions)` with nothing in between.
 *
 * So a spot saved while the old bug was live is a fossil of it. Loading that
 * spot restores the contradiction exactly, months later, on a build where the
 * bug that made it has been fixed twice. Measured:
 *
 *   storedPlatform  "ground"      storedLensId  "air-3s-wide"
 *   resolved        "sigma-28-75"  computedFocal 24
 *
 * THE OPTIC IS THE RELIABLE HALF. An optic id belongs to exactly one platform:
 * `air-3s-wide` exists on an aircraft and nowhere else, and `sigma-28-75`
 * cannot be mounted on one. The platform FIELD is the half the old bug failed
 * to write. So a contradiction is resolved towards the optic, the position is
 * repaired rather than dropped, and the repair is REPORTED: silently correcting
 * a shooter's saved work is how a plan changes under them.
 *
 * AN OPTIC THAT RESOLVES TO NEITHER is not repairable. There is no evidence of
 * what the shooter meant, so the position is dropped and named. Keeping it
 * would hand plan.ts an id it must now throw on.
 */

export interface PositionRevival {
  positions: CameraPosition[]
  /** Positions whose platform disagreed with their optic, and was corrected. */
  repaired: { id: string; from: Platform; to: Platform; optic: string }[]
  /** Positions that could not be made sense of at all. */
  dropped: { reason: string }[]
}

const isLatLon = (v: unknown): v is { lat: number; lon: number } => {
  const p = v as { lat?: unknown; lon?: unknown } | null
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof p.lat === 'number' &&
    typeof p.lon === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  )
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** Which platform, if any, can carry this optic. Null when no kit has it. */
export function platformForOptic(kit: KitProfile, opticId: string): Platform | null {
  if (platformOptics('air', kit).some((optic) => optic.id === opticId)) return 'air'
  if (platformOptics('ground', kit).some((optic) => optic.id === opticId)) return 'ground'
  return null
}

export function revivePositions(raw: unknown, kit: KitProfile = DEFAULT_KIT): PositionRevival {
  const repaired: PositionRevival['repaired'] = []
  const dropped: PositionRevival['dropped'] = []
  if (!Array.isArray(raw)) return { positions: [], repaired, dropped }

  const positions: CameraPosition[] = []
  for (const entry of raw) {
    const p = entry as Partial<Record<keyof CameraPosition, unknown>> | null
    if (p === null || typeof p !== 'object') {
      dropped.push({ reason: 'an entry that was not a position' })
      continue
    }
    if (typeof p.id !== 'string' || p.id === '' || !isLatLon(p.at)) {
      dropped.push({ reason: 'a position with no id or no coordinate' })
      continue
    }

    const opticId = str(p.lensId)
    const belongs = platformForOptic(kit, opticId)
    if (belongs === null) {
      dropped.push({
        reason: `a position using "${opticId === '' ? 'no optic' : opticId}", which is not in the kit`,
      })
      continue
    }

    const stored: Platform = p.platform === 'air' ? 'air' : 'ground'
    if (stored !== belongs) {
      repaired.push({ id: p.id, from: stored, to: belongs, optic: opticId })
    }

    /*
     * THE FOCAL LENGTH COMES FROM THE OPTIC when the optic is a prime, which
     * every drone camera is. A repaired air position whose stored focal was a
     * ground lens's is corrected by the same logic that made it air.
     */
    const optic = platformOptics(belongs, kit).find((o) => o.id === opticId)!
    const storedFocal = typeof p.focalLength === 'number' && Number.isFinite(p.focalLength)
      ? p.focalLength
      : optic.minFocalLength
    const focalLength = Math.round(
      Math.min(optic.maxFocalLength, Math.max(optic.minFocalLength, storedFocal)),
    )

    const shotType: ShotType =
      p.shotType === 'top-down' || p.shotType === 'orbit' || p.shotType === 'framed'
        ? p.shotType
        : DEFAULT_SHOT_TYPE

    /*
     * A REPAIRED AIR POSITION NEEDS A HEIGHT. One restored at ground level
     * would draw its geometry from zero, which is the slant-range bug again.
     */
    const storedFeet =
      typeof p.altitudeFeet === 'number' && Number.isFinite(p.altitudeFeet) ? p.altitudeFeet : 0
    const altitudeFeet =
      belongs === 'air' && storedFeet <= 0
        ? DEFAULT_ALTITUDE_FEET
        : clampAltitudeFeet(storedFeet)

    positions.push({
      id: p.id,
      number: typeof p.number === 'number' ? p.number : positions.length + 1,
      at: { lat: p.at.lat, lon: p.at.lon },
      lensId: opticId,
      focalLength,
      shot: str(p.shot),
      risk: str(p.risk),
      angleRationale: str(p.angleRationale),
      coversShot: typeof p.coversShot === 'number' ? p.coversShot : null,
      platform: belongs,
      altitudeFeet,
      shotType,
      yawDegrees:
        typeof p.yawDegrees === 'number' && Number.isFinite(p.yawDegrees)
          ? p.yawDegrees
          : DEFAULT_YAW_DEGREES,
      moved: p.moved === true,
      origin: p.origin === 'suggested' ? 'suggested' : 'manual',
    })
  }

  return { positions: renumber(positions), repaired, dropped }
}

/**
 * What to tell the shooter, or null when nothing was changed.
 *
 * Never silent, and never reassuring: there is no line saying the plan loaded
 * cleanly, because that is the absence of a line.
 */
export function revivalNote(revival: PositionRevival): string | null {
  const parts: string[] = []

  if (revival.repaired.length > 0) {
    const air = revival.repaired.filter((r) => r.to === 'air').length
    const ground = revival.repaired.length - air
    const bits = [
      air > 0 ? `${air} to air` : '',
      ground > 0 ? `${ground} to ground` : '',
    ].filter((bit) => bit !== '')
    parts.push(
      `${revival.repaired.length} saved ${
        revival.repaired.length === 1 ? 'position carried an optic' : 'positions carried optics'
      } that did not match ${revival.repaired.length === 1 ? 'its' : 'their'} platform, and ${
        revival.repaired.length === 1 ? 'was' : 'were'
      } corrected from the optic: ${bits.join(', ')}. Check the altitude before you fly.`,
    )
  }

  for (const drop of revival.dropped) {
    parts.push(`Dropped ${drop.reason}.`)
  }

  return parts.length === 0 ? null : parts.join(' ')
}
