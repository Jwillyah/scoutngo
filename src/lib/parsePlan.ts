/**
 * Parses the model's response into camera positions.
 *
 * docs/brief.md records the prototype failure this exists to prevent: output
 * truncated at the token cap, an unparseable response, and a dead end error
 * message. So every field is capped here as well as in the prompt, and a parse
 * failure returns the raw text for display rather than throwing.
 *
 * Nothing here reads a lighting or geometry claim. If the model sends one, it is
 * simply not in the shape being parsed, so it is dropped on the floor.
 */

export interface LensSpec {
  id: string
  name: string
  min: number
  max: number
}

export interface RawPosition {
  x: number
  y: number
  lensId: string
  focalLength: number
  shot: string
  risk: string
}

export type ParseResult =
  | { ok: true; positions: RawPosition[]; dropped: number }
  | { ok: false; reason: string; raw: string }

export const MAX_POSITIONS = 6
export const SHOT_WORD_CAP = 25
export const RISK_WORD_CAP = 15

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

export function parsePlanResponse(raw: string, lenses: LensSpec[]): ParseResult {
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
  const kept: RawPosition[] = []
  let dropped = 0

  for (const entry of positions.slice(0, MAX_POSITIONS)) {
    const item = entry as Record<string, unknown>
    const lens = typeof item.lensId === 'string' ? byId.get(item.lensId) : undefined

    // A lens the shooter does not have is not a position they can take.
    if (lens === undefined) {
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
      typeof item.focalLength === 'number' && Number.isFinite(item.focalLength)
        ? Math.round(clamp(item.focalLength, lens.min, lens.max))
        : lens.min

    kept.push({
      x: clamp(item.x, 0, 1),
      y: clamp(item.y, 0, 1),
      lensId: lens.id,
      focalLength: focal,
      shot: capWords(typeof item.shot === 'string' ? item.shot : '', SHOT_WORD_CAP),
      risk: capWords(typeof item.risk === 'string' ? item.risk : '', RISK_WORD_CAP),
    })
  }

  if (kept.length === 0) {
    return { ok: false, reason: 'No usable positions in the response.', raw }
  }

  return { ok: true, positions: kept, dropped }
}
