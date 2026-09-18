/**
 * Parses the model's response into camera positions.
 *
 * docs/brief.md records the prototype failure this exists to prevent: output
 * truncated at the token cap, an unparseable response, and a dead end error
 * message. So every field is capped here as well as in the prompt, and a parse
 * failure returns the raw text for display rather than throwing.
 *
 * Nothing here reads a lighting or geometry claim. If the model sends one, it is
 * simply not in the shape being parsed, so it is dropped on the floor. The prompt
 * now TELLS the model the sun's azimuth and altitude so it can choose a vantage
 * with the light in mind, but that traffic is one way: there is still no lighting
 * field to parse, and src/core/lighting.ts remains the only thing that decides
 * how a position is lit.
 *
 * `angleRationale` is the model saying WHY a vantage is worth standing in. It is
 * prose, and it is treated as prose. It is never read for a bearing, an angle, or
 * a lighting call, and nothing downstream computes anything from it.
 */

export interface LensSpec {
  id: string
  name: string
  min: number
  max: number
}

export type Platform = 'ground' | 'air'

export interface RawPosition {
  x: number
  y: number
  /** A ground lens id, or a drone camera id when platform is "air". */
  lensId: string
  focalLength: number
  shot: string
  risk: string
  /** Why this vantage is worth standing in. Judgement, never geometry. */
  angleRationale: string
  /**
   * Index into the shooter's pasted shot list that this position covers, or
   * null. Validated against the real list length: a model naming shot 9 of a
   * list of 3 is claiming to cover something that does not exist.
   */
  coversShot: number | null
  platform: Platform
  /** Feet above ground for an air position. Zero for a ground one. */
  altitudeFeet: number
}

/** One fixed drone camera, as the parser needs to see it. */
export interface DroneCameraSpec {
  id: string
  name: string
  /** The single focal length this camera has. Anything else is rejected. */
  equiv35: number
}

export type ParseResult =
  | { ok: true; positions: RawPosition[]; dropped: number }
  | { ok: false; reason: string; raw: string }

export const MAX_POSITIONS = 6
/** FAA ceiling for uncrewed aircraft, feet above ground level. */
export const FAA_CEILING_FEET = 400
export const SHOT_WORD_CAP = 25
export const RISK_WORD_CAP = 15
export const RATIONALE_WORD_CAP = 15

/** Trims to a word count. The prompt asks for this too; this is the enforcement. */
export function capWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter((w) => w !== '')
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Pulls the JSON object out of a response. The prompt forbids prose and fences,
 * but a model that ignores that should still produce a usable plan rather than a
 * dead end, so the outermost braces are located defensively.
 */
export function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, '')
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return withoutFences.slice(start, end + 1)
}

export function parsePlanResponse(
  raw: string,
  lenses: LensSpec[],
  droneAvailable = false,
  droneCameras: DroneCameraSpec[] = [],
  /** How many shots the shooter asked for. Bounds any coversShot claim. */
  requiredShots = 0,
): ParseResult {
  if (lenses.length === 0) {
    return { ok: false, reason: 'No lenses are selected in the kit.', raw }
  }

  const json = extractJsonObject(raw)
  if (json === null) {
    /*
     * An opening brace with no closing one is the token cap, not a model that
     * answered in prose. Those need different things from the reader, so they
     * get different messages.
     */
    return {
      ok: false,
      reason: raw.includes('{')
        ? 'Response was cut off before the JSON finished.'
        : 'No JSON object found in the response.',
      raw,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // The most likely cause is truncation at the token cap.
    return { ok: false, reason: 'Response was not valid JSON, most likely cut off.', raw }
  }

  const positions = (parsed as { positions?: unknown }).positions
  if (!Array.isArray(positions)) {
    return { ok: false, reason: 'Response had no "positions" array.', raw }
  }

  const byId = new Map(lenses.map((lens) => [lens.id, lens]))
  const cameraById = new Map(droneCameras.map((camera) => [camera.id, camera]))
  const kept: RawPosition[] = []
  let dropped = 0

  for (const entry of positions.slice(0, MAX_POSITIONS)) {
    const item = entry as Record<string, unknown>
    const opticId = typeof item.lensId === 'string' ? item.lensId : ''

    // A drone position is only possible if a drone is actually in the kit.
    const platform: Platform =
      droneAvailable && item.platform === 'air' ? 'air' : 'ground'

    const camera = cameraById.get(opticId)
    const lens = byId.get(opticId)

    /*
     * AIR AND GROUND DRAW FROM DIFFERENT OPTICS, and neither may borrow the
     * other's. A drone cannot mount the 200-600, and the shooter is not holding
     * the Air 3S wide camera in their hands.
     */
    if (platform === 'air') {
      /*
       * THE AIR 3S IS NOT A ZOOM. Its two cameras are fixed at 24mm and 70mm
       * equivalent, so a focal length that is not exactly one of those describes
       * a shot the aircraft cannot take. It is REJECTED rather than snapped to
       * the nearest: silently moving 45mm to 24mm would change the framing the
       * shot text was written about, and a dropped position is visible while a
       * quietly rewritten one is not.
       */
      if (camera === undefined) {
        dropped += 1
        continue
      }
      if (
        typeof item.focalLength !== 'number' ||
        Math.round(item.focalLength) !== camera.equiv35
      ) {
        dropped += 1
        continue
      }
    } else if (lens === undefined || camera !== undefined) {
      // A lens the shooter does not have is not a position they can take, and a
      // drone camera is not something they can stand on the ground holding.
      dropped += 1
      continue
    }

    if (typeof item.x !== 'number' || typeof item.y !== 'number') {
      dropped += 1
      continue
    }
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) {
      dropped += 1
      continue
    }

    const focal =
      camera !== undefined
        ? camera.equiv35
        : typeof item.focalLength === 'number' && Number.isFinite(item.focalLength)
          ? Math.round(clamp(item.focalLength, lens!.min, lens!.max))
          : lens!.min

    /*
     * Clamped to the FAA ceiling. The model does not get to propose an illegal
     * altitude, and the card states the rule regardless of what came back.
     */
    const altitudeFeet =
      platform === 'air'
        ? Math.round(
            clamp(
              typeof item.altitudeFeet === 'number' && Number.isFinite(item.altitudeFeet)
                ? item.altitudeFeet
                : 150,
              0,
              FAA_CEILING_FEET,
            ),
          )
        : 0

    kept.push({
      x: clamp(item.x, 0, 1),
      y: clamp(item.y, 0, 1),
      lensId: camera?.id ?? lens!.id,
      focalLength: focal,
      shot: capWords(typeof item.shot === 'string' ? item.shot : '', SHOT_WORD_CAP),
      risk: capWords(typeof item.risk === 'string' ? item.risk : '', RISK_WORD_CAP),
      angleRationale: capWords(
        typeof item.angleRationale === 'string' ? item.angleRationale : '',
        RATIONALE_WORD_CAP,
      ),
      coversShot:
        typeof item.coversShot === 'number' &&
        Number.isInteger(item.coversShot) &&
        item.coversShot >= 0 &&
        item.coversShot < requiredShots
          ? item.coversShot
          : null,
      platform,
      altitudeFeet,
    })
  }

  if (kept.length === 0) {
    return { ok: false, reason: 'No usable positions in the response.', raw }
  }

  return { ok: true, positions: kept, dropped }
}
