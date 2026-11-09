/*
 * THE SKY PAGE IN WORDS (Batch Pages, Section 3; board SkyPage). The Sky
 * color page's three checks (Canvas · Gap · Not blocked) said plainly; the
 * light round the sunset or sunrise as four times; the week's rare light,
 * each in one line from the numbers that found it. Facts, never advice
 * (rule 28); nothing here says the sky or the area is "clear" of anything.
 */
import type { LayerRead } from './fireOutlook.ts'
import type { Special, SpecialKind } from './specialLight.ts'

/* ------------------------------------------------------------ the checks */

const LAYER_PLAIN = { high: 'high cloud', mid: 'mid cloud', low: 'low cloud' } as const

export interface PlainCheck {
  /** "Clouds to light up", "Gap at the horizon (WSW)", "Anything blocking the sun". */
  label: string
  value: string
}

/**
 * The three checks for the layer the page speaks for (src/core/fireOutlook.ts
 * leadLayer). `toward` is the compass point of the sun at the event.
 */
export function plainChecks(l: LayerRead | null, toward: string): PlainCheck[] {
  const gapLabel = `Gap at the horizon (${toward})`
  if (l === null) return [{ label: 'Clouds to light up', value: '—' }, { label: gapLabel, value: '—' }, { label: 'Anything blocking the sun', value: '—' }]
  const pct = l.cover === null ? '' : `, ${Math.round(l.cover)}%`
  return [
    { label: 'Clouds to light up', value: l.canvas ? `${LAYER_PLAIN[l.layer]}${pct}` : 'none' },
    /* No cloud to light: the gap does not decide anything. */
    { label: gapLabel, value: !l.canvas ? 'not needed' : l.gap === 'open' ? 'open' : l.gap === 'partial' ? 'partly open' : l.gap === 'closed' ? 'closed' : 'no glow this hour' },
    { label: 'Anything blocking the sun', value: l.hiddenBy === null ? 'no' : `yes, ${LAYER_PLAIN[l.hiddenBy.layer]} ${Math.round(l.hiddenBy.cover)}%` },
  ]
}

/** "Color likely" from the call; the page's headline. */
export function colorHeadline(call: 'Go' | 'Maybe' | 'Skip' | null): string {
  return call === 'Go' ? 'Color likely' : call === 'Maybe' ? 'Color possible' : call === 'Skip' ? 'Color unlikely' : 'No call yet'
}

/** The call's own why, its first sentence, without the verdict word in front: "5 of 5 models see lit low deck." */
export function plainReason(why: string | null): string | null {
  if (why === null || why.trim() === '') return null
  const first = why.replace(/^[A-Z][a-z]+:\s*/, '').split(/(?<=\.)\s/)[0].trim()
  const s = first.charAt(0).toUpperCase() + first.slice(1)
  return s.endsWith('.') ? s : `${s}.`
}

/* ------------------------------------------------------- tonight's light */

/** The sun's heights the bar marks, degrees: golden from +6, blue from -4, dark from -6 (src/core/sunBand.ts's bands). */
export const GOLDEN_DEG = 6
export const BLUE_DEG = -4
export const DARK_DEG = -6

/** When the sun crosses `deg` between `from` and `to` (it must cross once), to the minute; null if it does not. */
export function sunCrosses(altAt: (t: Date) => number, from: Date, to: Date, deg: number): Date | null {
  let a = from.getTime()
  let b = to.getTime()
  const fa = altAt(new Date(a)) - deg
  const fb = altAt(new Date(b)) - deg
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null
  for (let i = 0; i < 40 && b - a > 30_000; i += 1) {
    const m = (a + b) / 2
    const fm = altAt(new Date(m)) - deg
    if ((fm > 0) === (fa > 0)) a = m
    else b = m
  }
  return new Date(Math.round((a + b) / 2 / 60_000) * 60_000)
}

export interface LightMark {
  label: string
  at: Date | null
}

/**
 * Sunset: Golden (+6°) · Set · Blue (−4°) · Dark (−6°). Sunrise, the same
 * heights the other way: Blue (−6°) · Glow (−4°) · Rise · Golden ends (+6°).
 */
export function lightMarks(kind: 'sunrise' | 'sunset', event: Date, altAt: (t: Date) => number): LightMark[] {
  const before = new Date(event.getTime() - 3 * 3_600_000)
  const after = new Date(event.getTime() + 3 * 3_600_000)
  if (kind === 'sunset') {
    return [
      { label: 'Golden', at: sunCrosses(altAt, before, event, GOLDEN_DEG) },
      { label: 'Set', at: event },
      { label: 'Blue', at: sunCrosses(altAt, event, after, BLUE_DEG) },
      { label: 'Dark', at: sunCrosses(altAt, event, after, DARK_DEG) },
    ]
  }
  return [
    { label: 'Blue', at: sunCrosses(altAt, before, event, DARK_DEG) },
    { label: 'Glow', at: sunCrosses(altAt, before, event, BLUE_DEG) },
    { label: 'Rise', at: event },
    { label: 'Day', at: sunCrosses(altAt, event, after, GOLDEN_DEG) },
  ]
}

/* --------------------------------------------------- rare light this week */

/*
 * WHAT IS KEPT, AND WHY (Batch Pages, Section 3: "every item must be
 * explainable in one line from computed facts; drop any that can't"):
 *
 *   fog          kept: dew point, air and wind, the rule's own numbers
 *   rainbow      kept: showers on the side opposite the sun, the sun's height
 *   rays         kept: the low cloud's cover with the sun low behind it
 *   glass        kept: a low tide near sunrise and a light wind
 *   iridescence  dropped: it needs thin cloud within about 10° of the sun,
 *                and the forecast cannot place a cloud that close; its line
 *                had to say where to look instead of what was found
 *   fire         dropped here: the sunset or sunrise colour is this page's
 *                own headline, with its three checks above
 */
export const RARE_KEPT: readonly SpecialKind[] = ['rainbow', 'rays', 'fog', 'glass']
export const RARE_NAME: Partial<Record<SpecialKind, string>> = { rainbow: 'Rainbow chance', rays: 'Light rays', fog: 'Fog', glass: 'Mirror water' }
/** At most this many rows: the likeliest, then the soonest. */
export const RARE_MAX = 4

export interface RareRow {
  kind: SpecialKind
  at: Date
  name: string
  /** One line, from the numbers that found it. */
  why: string
  word: 'possible' | 'likely'
}

/** The week's rare light, kept kinds only, each with its one line; the likeliest first, then by time, RARE_MAX of them. */
export function rareRows(list: readonly Special[], now: Date): RareRow[] {
  return list
    .filter((s) => RARE_KEPT.includes(s.kind) && s.to.getTime() > now.getTime() && s.brief !== undefined && s.brief !== '')
    .map((s) => ({ kind: s.kind, at: s.from, name: RARE_NAME[s.kind] ?? s.kind, why: s.brief as string, word: s.word, share: s.of === 0 ? 0 : s.agree / s.of }))
    .sort((a, b) => b.share - a.share || a.at.getTime() - b.at.getTime())
    .slice(0, RARE_MAX)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ share: _share, ...r }) => r)
}

/** "showers to the east, sun low in the west": the rainbow's line from the bearings. */
export function rainbowBrief(showersPoint: string, sunPoint: string, sunDeg: number): string {
  return `showers to the ${showersPoint}, sun ${Math.round(sunDeg)}° up in the ${sunPoint}`
}
