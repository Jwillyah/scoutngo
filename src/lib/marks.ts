import {
  canBeDeciduous,
  DEFAULT_FOLIAGE,
  MARK_KINDS,
  type Foliage,
  type MarkKind,
  type MarkShape,
  type SiteMark,
} from '../core/siteMark.ts'

/**
 * The shooter's own hazards and notes, kept on the device.
 *
 * localStorage ONLY, like everything else here. No account, no server, no
 * sync. The venue coordinate does not leave the phone and neither does the
 * fact that there is a wire across the car park.
 *
 * "The second time I shoot a place the wires are already drawn."
 */
export const MARKS_STORAGE_KEY = 'scoutngo.marks.v1'

let counter = 0

export function newMarkId(): string {
  counter += 1
  return `k${Date.now().toString(36)}${counter.toString(36)}`
}

export function makeMark(kind: MarkKind, shape: MarkShape): SiteMark {
  return {
    id: newMarkId(),
    kind,
    shape,
    heightMeters: null,
    foliage: DEFAULT_FOLIAGE[kind],
    source: 'manual',
    confirmed: true,
    note: '',
  }
}

export function addMark(list: SiteMark[], mark: SiteMark): SiteMark[] {
  return [...list, mark]
}

export function removeMark(list: SiteMark[], id: string): SiteMark[] {
  return list.filter((mark) => mark.id !== id)
}

/**
 * Changes one mark.
 *
 * CHANGING THE KIND RESETS THE LEAF ANSWER, because the question only means
 * something for a tree. A building that used to be a tree would otherwise keep
 * "deciduous" and quietly stop blocking in January.
 */
export function updateMark(
  list: SiteMark[],
  id: string,
  change: Partial<Pick<SiteMark, 'kind' | 'heightMeters' | 'foliage' | 'note'>>,
): SiteMark[] {
  return list.map((mark) => {
    if (mark.id !== id) return mark
    const kind = change.kind ?? mark.kind
    const foliage: Foliage =
      change.kind !== undefined && change.kind !== mark.kind
        ? DEFAULT_FOLIAGE[change.kind]
        : (change.foliage ?? mark.foliage)
    return {
      ...mark,
      kind,
      heightMeters:
        change.heightMeters === undefined ? mark.heightMeters : change.heightMeters,
      foliage: canBeDeciduous(kind) ? foliage : 'solid',
      note: change.note ?? mark.note,
    }
  })
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

function reviveShape(raw: unknown): MarkShape | null {
  const shape = raw as { kind?: unknown; at?: unknown; path?: unknown } | null
  if (shape === null || typeof shape !== 'object') return null
  if (shape.kind === 'point' && isLatLon(shape.at)) {
    return { kind: 'point', at: { lat: shape.at.lat, lon: shape.at.lon } }
  }
  if (shape.kind === 'line' && Array.isArray(shape.path)) {
    const path = shape.path.filter(isLatLon).map((p) => ({ lat: p.lat, lon: p.lon }))
    /* A line needs two points. One point is not a span of anything. */
    if (path.length >= 2) return { kind: 'line', path }
  }
  return null
}

/**
 * Brings stored marks back, dropping anything malformed.
 *
 * ANYTHING THAT DOES NOT REVIVE IS DROPPED, NOT PATCHED. A half-read hazard
 * with a missing coordinate would draw somewhere wrong, and a wire drawn in the
 * wrong place is worse than a wire not drawn: it is a wire the shooter has been
 * taught to trust. A height that is not a number becomes null, which is the
 * value that means "nobody said" everywhere else.
 */
export function reviveMarks(raw: unknown): SiteMark[] {
  if (!Array.isArray(raw)) return []
  const out: SiteMark[] = []
  for (const entry of raw) {
    const m = entry as Partial<Record<keyof SiteMark, unknown>> | null
    if (m === null || typeof m !== 'object') continue
    if (typeof m.id !== 'string' || m.id === '') continue
    if (!(MARK_KINDS as readonly string[]).includes(m.kind as string)) continue

    const shape = reviveShape(m.shape)
    if (shape === null) continue

    const kind = m.kind as MarkKind
    const height = typeof m.heightMeters === 'number' && Number.isFinite(m.heightMeters) && m.heightMeters > 0
      ? m.heightMeters
      : null

    out.push({
      id: m.id,
      kind,
      shape,
      heightMeters: height,
      foliage: canBeDeciduous(kind) && m.foliage === 'deciduous' ? 'deciduous' : canBeDeciduous(kind) && m.foliage === 'solid' ? 'solid' : DEFAULT_FOLIAGE[kind],
      source: m.source === 'osm' ? 'osm' : m.source === 'model' ? 'model' : 'manual',
      /* A model proposal that somehow persisted comes back UNCONFIRMED. */
      confirmed: m.source === 'model' ? m.confirmed === true : true,
      note: typeof m.note === 'string' ? m.note : '',
    })
  }
  return out
}

/**
 * The marks to draw and to compute with: the shooter's own, plus whatever OSM
 * returned for the area currently loaded.
 *
 * OSM MARKS ARE NOT PERSISTED. They belong to a bounding box and a moment, they
 * are re-fetched with the next generate, and keeping a stale copy would mean
 * drawing wires from a bounding box the shooter has since left.
 */
export function allMarks(mine: readonly SiteMark[], fromOsm: readonly SiteMark[]): SiteMark[] {
  return [...fromOsm, ...mine]
}
