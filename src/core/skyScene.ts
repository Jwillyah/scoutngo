/*
 * THE SKY SCENE (Batch SIMPLE-3, Section 3.2; mockups Sky_Sunrise2,
 * Sky_Sunset2): the Sunrise and Sunset tabs' picture, replacing the flat
 * block of SIMPLE-2's sky picture. Drawn from the computed state only, no
 * photo and no generated image. This file is the arithmetic (state to
 * geometry, 0..1 across and down) and the one sentence under it;
 * src/components/SkyScene.tsx draws it.
 *
 * WHAT IS DRAWN, and where each piece comes from:
 *
 *   sky      a gradient whose tone is the call's (Go warm, Maybe soft, Skip
 *            or none grey): the call, never a second guess at it
 *   layers   each cloud layer the call read (src/core/fireOutlook.ts, the
 *            verdict's mean sky), at its height (src/core/skyPicture.ts
 *            deckY, the square-root scale), its undersides lit where the
 *            call says that layer fires; a station's measured deck takes the
 *            place of the models' layer it falls in. Named from the height
 *            (src/core/cloudLayerName.ts: low < 6,500 ft, mid to 20,000,
 *            high above), in ft for a shooter in feet. A height no one
 *            measured carries "~"
 *   fog      a band on the horizon when the fog risk at the event is high
 *            (src/core/fogRisk.ts)
 *   sun      at its real azimuth: the picture spans 67.5° either side of it
 *            and the compass points along the foot say where that is
 *   ground   water where the spot faces (within 90° of its facing,
 *            src/lib/coast.ts), land elsewhere; inland, all land. The sun's
 *            glint on the water when it sits over water
 *
 * Nothing is drawn the state does not say: no layer with no cover, no fog
 * band without a high fog risk, no picture at all without the sun's azimuth.
 */
import type { Call } from './briefing.ts'
import { cloudHeightWords, cloudLayerOfFt, M_PER_FT } from './cloudLayerName.ts'
import type { FogKind, FogLevel } from './fogRisk.ts'
import type { Layer } from './skyColour.ts'
import { deckY, PICTURE_HALF_SPAN_DEG, PICTURE_HORIZON_Y, skyPicture } from './skyPicture.ts'
import { normalizeBearing } from './sun.ts'

/** A layer is drawn from this much cover, per cent (under it there is nothing to see). */
export const SCENE_MIN_COVER = 10
/** Water within this of the spot's facing. */
export const WATER_HALF_DEG = 90
/** The fog band's top, a share of the height above the horizon. */
export const FOG_BAND = 0.09
/** The ground's slices across the picture. */
const SLICES = 48

export type SceneTone = 'warm' | 'soft' | 'grey'

export interface SceneLayerIn {
  /** The models' band, or the band a station's deck falls in. */
  layer: Layer
  baseFt: number
  /** Over you and toward the sun, per cent; null when the forecast did not say. */
  cover: number | null
  /** The call says this layer lights (fires). */
  lit: boolean
  /** A station measured the base; false: the models' typical height. */
  measured: boolean
  /** The station that measured it. */
  by: string | null
}

export interface SkySceneIn {
  kind: 'sunrise' | 'sunset'
  sunAzDeg: number | null
  sunAltDeg: number | null
  call: Call | null
  layers: readonly SceneLayerIn[]
  gap: 'open' | 'partial' | 'closed' | null
  /** The fog at the event; null when it could not be said. */
  fog: { level: FogLevel | null; kind: FogKind | null } | null
  /** The spot's facing (a beach), null inland. */
  facingDeg: number | null
  miles: boolean
}

export interface ScenePuff {
  x: number
  w: number
}

export interface SceneLayer {
  layer: Layer
  y: number
  lit: boolean
  /** "~26,000 ft high", "8,000 ft mid". */
  label: string
  /** "high", from the height. */
  name: Layer
  puffs: ScenePuff[]
}

export interface SceneGround {
  x0: number
  x1: number
  kind: 'water' | 'land'
}

export interface SkySceneOut {
  fromDeg: number
  toDeg: number
  horizonY: number
  tone: SceneTone
  ticks: { x: number; label: string }[]
  sun: { x: number; y: number; label: string }
  layers: SceneLayer[]
  gap: { x: number; w: number; top: number; label: string } | null
  fog: { top: number; label: string } | null
  ground: SceneGround[]
  /** The sun sits over water: its glint is drawn. */
  glint: boolean
  /** One plain sentence: why the call is what it is. */
  sentence: string
}

const TONE: Record<Call, SceneTone> = { Go: 'warm', Maybe: 'soft', Skip: 'grey' }

/** The scene's tone from the call: the call's own, never a second read. */
export const sceneTone = (call: Call | null): SceneTone => (call === null ? 'grey' : TONE[call])

/** Whether an azimuth looks over water from a spot facing `facingDeg`. */
export function overWater(azDeg: number, facingDeg: number | null): boolean {
  if (facingDeg === null) return false
  const d = Math.abs(((normalizeBearing(azDeg - facingDeg) + 180) % 360) - 180)
  return d <= WATER_HALF_DEG
}

/** The ground along the horizon, water and land, in runs. */
export function sceneGround(fromDeg: number, facingDeg: number | null): SceneGround[] {
  const out: SceneGround[] = []
  for (let i = 0; i < SLICES; i += 1) {
    const mid = (i + 0.5) / SLICES
    const kind = overWater(fromDeg + mid * 2 * PICTURE_HALF_SPAN_DEG, facingDeg) ? 'water' : 'land'
    const last = out[out.length - 1]
    if (last !== undefined && last.kind === kind) last.x1 = (i + 1) / SLICES
    else out.push({ x0: i / SLICES, x1: (i + 1) / SLICES, kind })
  }
  return out
}

/** "~26,000 ft high" for the models' typical height (to the 1,000 ft: no one measured it), "8,000 ft mid" for a measured one; the name is the height's. */
export function sceneLayerLabel(l: Pick<SceneLayerIn, 'baseFt' | 'measured'>, miles: boolean): string {
  const ft = l.measured ? l.baseFt : Math.round(l.baseFt / 1000) * 1000
  const h = cloudHeightWords(ft * M_PER_FT, miles)
  return `${l.measured ? '' : '~'}${h} ${cloudLayerOfFt(l.baseFt)}`
}

/** Puffs for a layer: as many as its cover says (one per 20%, 1 to 5), spread evenly, each layer offset so they do not stack. */
export function scenePuffs(cover: number | null, index: number): ScenePuff[] {
  const n = cover === null ? 2 : Math.max(1, Math.min(5, Math.round(cover / 20)))
  const w = Math.min(0.34, 0.9 / n)
  const step = 1 / n
  const shift = ((index * 0.37) % 1) * step * 0.5
  return Array.from({ length: n }, (_, i) => ({ x: Math.min(1 - w, Math.max(0, i * step + shift + (step - w) / 2)), w }))
}

const NAME_WORD: Record<Layer, string> = { high: 'the high cloud', mid: 'the mid deck', low: 'the low deck' }
const listWords = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * The one sentence under the picture, from the same state: which layers
 * light (by their height's name), the gap, the fog. Nothing the state does
 * not say; with nothing known, "The forecast did not say."
 */
export function sceneSentence(s: Pick<SkySceneIn, 'kind' | 'call' | 'gap' | 'fog' | 'facingDeg'>, layers: readonly SceneLayer[]): string {
  const lit = layers.filter((l) => l.lit)
  const dark = layers.filter((l) => !l.lit)
  const fogHigh = s.fog?.level === 'high'
  const parts: string[] = []
  if (lit.length > 0) {
    /* Sunrise: the highest lights first. Sunset: the lowest lights first and the highest holds the light last. */
    const order = [...lit].sort((a, b) => (s.kind === 'sunrise' ? a.y - b.y : b.y - a.y))
    parts.push(`${listWords(order.map((l) => NAME_WORD[l.name])).replace(/^./, (c) => c.toUpperCase())} ${order.length === 1 ? 'is' : 'are'} lit from under`)
    if (s.gap === 'open') parts[0] += ' through a gap toward the sun'
    else if (s.gap === 'partial') parts[0] += ' through a part gap toward the sun'
  } else if (dark.length > 0) {
    parts.push(`${listWords(dark.map((l) => NAME_WORD[l.name])).replace(/^./, (c) => c.toUpperCase())} ${dark.length === 1 ? 'is' : 'are'} there, but the call does not see ${dark.length === 1 ? 'it' : 'them'} lit${s.gap === 'closed' ? ': no gap toward the sun' : ''}`)
  } else if (s.call !== null) {
    parts.push('No cloud to light')
  }
  if (fogHigh) parts.push(`fog sits low${s.facingDeg === null ? '' : ' on the water'}, so the sun ${s.kind === 'sunrise' ? 'comes up' : 'goes down'} soft`)
  if (parts.length === 0) return 'The forecast did not say.'
  const sentence = parts.join('; ')
  return `${sentence.replace(/^./, (c) => c.toUpperCase())}.`
}

export function skyScene(s: SkySceneIn): SkySceneOut | null {
  const base = skyPicture({ sunAzDeg: s.sunAzDeg, sunAltDeg: s.sunAltDeg, deck: null, gap: null })
  if (base === null) return null
  const centre = normalizeBearing(s.sunAzDeg as number)
  const drawn = s.layers
    .filter((l) => Number.isFinite(l.baseFt) && l.baseFt > 0 && (l.measured || l.cover === null || l.cover >= SCENE_MIN_COVER))
    .sort((a, b) => b.baseFt - a.baseFt)
  const layers: SceneLayer[] = drawn.map((l, i) => ({ layer: l.layer, y: deckY(l.baseFt), lit: l.lit, label: sceneLayerLabel(l, s.miles), name: cloudLayerOfFt(l.baseFt), puffs: scenePuffs(l.cover, i) }))
  const lowest = layers[layers.length - 1]
  const gapW = s.gap === 'open' ? 0.22 : s.gap === 'partial' ? 0.12 : null
  const gap = lowest === undefined || gapW === null ? null : { x: 0.5 - gapW / 2, w: gapW, top: Math.min(lowest.y + 0.05, PICTURE_HORIZON_Y - 0.06), label: `${s.gap === 'open' ? 'gap' : 'part gap'} ${base.sun.label}` }
  const fog = s.fog?.level === 'high' ? { top: PICTURE_HORIZON_Y - FOG_BAND, label: 'fog' } : null
  const ground = sceneGround(base.fromDeg, s.facingDeg)
  const glint = overWater(centre, s.facingDeg)
  return {
    fromDeg: base.fromDeg,
    toDeg: base.toDeg,
    horizonY: base.horizonY,
    tone: sceneTone(s.call),
    ticks: base.ticks,
    sun: base.sun,
    layers,
    gap,
    fog,
    ground,
    glint,
    sentence: sceneSentence(s, layers),
  }
}
