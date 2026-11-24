/*
 * THE SKY PAGE IN WORDS (Batch Pages, Section 3; board SkyPage). The Sky
 * color page's three checks (Canvas · Gap · Not blocked) said plainly; the
 * light round the sunset or sunrise as four times; the week's rare light,
 * each in one line from the numbers that found it. Facts, never advice
 * (rule 28); nothing here says the sky or the area is "clear" of anything.
 */
import { getPosition } from 'suncalc'
import type { LatLon } from './geo.ts'
import type { LayerRead } from './fireOutlook.ts'
import { colorWords } from './homeDay.ts'
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
/**
 * Batch CORE, Section 1.7: `seen`, a deck the station reports now (fresh, under 20,000 ft) in words ("KNTU broken at
 * 6,000 ft"), and `gapSeen`, the gap as the observed call read it: the three lines then say the deck that is there,
 * not the models' empty sky.
 */
export function plainChecks(l: LayerRead | null, toward: string, seen: string | null = null, gapSeen: 'open' | null = null): PlainCheck[] {
  const gapLabel = `Gap at the horizon (${toward})`
  if (seen !== null) {
    const blockedBy = l?.hiddenBy == null ? null : `${LAYER_PLAIN[l.hiddenBy.layer]} ${Math.round(l.hiddenBy.cover)}%`
    return [
      { label: 'Clouds to light up', value: seen },
      { label: gapLabel, value: gapSeen === 'open' ? 'open (satellite)' : l?.canvas === true && l.gap !== null ? (l.gap === 'open' ? 'open' : l.gap === 'partial' ? 'partly open' : 'closed') : 'not read yet' },
      { label: 'Anything blocking the sun', value: blockedBy === null ? 'no' : `yes, ${blockedBy}` },
    ]
  }
  if (l === null) return [{ label: 'Clouds to light up', value: '—' }, { label: gapLabel, value: '—' }, { label: 'Anything blocking the sun', value: '—' }]
  const pct = l.cover === null ? '' : `, ${Math.round(l.cover)}%`
  /*
   * Batch LIVE, Section 10.4: the three lines from the one state, so they never disagree. On 14 Nov they read "Clouds
   * to light up: none", "no clouds, so no gap needed" and "Anything blocking: yes" together. Cloud blocking the sun
   * is cloud: the gap is closed by it, and nothing above it is lit.
   */
  const blocked = l.hiddenBy === null ? null : `${LAYER_PLAIN[l.hiddenBy.layer]} ${Math.round(l.hiddenBy.cover)}%`
  return [
    { label: 'Clouds to light up', value: l.canvas ? `${LAYER_PLAIN[l.layer]}${pct}` : blocked !== null ? 'none lit past the blocking cloud' : 'none' },
    /* No cloud to light and none in the way: the gap does not decide anything. */
    { label: gapLabel, value: blocked !== null && !l.canvas ? 'closed' : !l.canvas ? 'no clouds, so no gap needed' : l.gap === 'open' ? 'open' : l.gap === 'partial' ? 'partly open' : l.gap === 'closed' ? 'closed' : 'no glow this hour' },
    { label: 'Anything blocking the sun', value: blocked === null ? 'no' : `yes, ${blocked}` },
  ]
}

/** "Color likely" from the call; the page's headline. The words are colorWords' (src/core/homeDay.ts), the one set every screen uses (Batch QA, Section 0). */
export function colorHeadline(call: 'Go' | 'Maybe' | 'Skip' | null): string {
  const said = colorWords(call)
  return said === null ? 'No call yet' : said.charAt(0).toUpperCase() + said.slice(1)
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
/* Batch LIVE, Section 10.7: at most three a week shown (it was four); the rest behind "+N more". */
export const RARE_MAX = 3
/** The week's rare light waits this long for its forecasts, then says they did not arrive. */
export const RARE_WAIT_MS = 10_000

export interface RareRow {
  kind: SpecialKind
  at: Date
  name: string
  /** One line, from the numbers that found it. */
  why: string
  word: 'possible' | 'likely'
}

/** Light rays need the sun up, or all but (Batch NOW, Section 1.5: "Light rays Mon 2:00 AM"). */
export const RAYS_SUN_FROM_DEG = -1

/**
 * ONE FILTER FOR THE LIST AND THE MAP (Batch NOW, Section 1.5: iridescence on
 * the map's card, not in the list): a kept kind, and rays only with the sun
 * above RAYS_SUN_FROM_DEG at their time where you are.
 */
export function rareKept(s: Special, venue: LatLon | null): boolean {
  if (!RARE_KEPT.includes(s.kind)) return false
  if (s.kind === 'rays' && venue !== null && getPosition(s.from, venue.lat, venue.lon).altitude <= RAYS_SUN_FROM_DEG) return false
  return true
}

/**
 * The week's rare light, kept kinds only, each with its one line; the
 * likeliest first, then by time, `max` of them (RARE_MAX; the page shows the
 * rest behind "+2 more"). The same kind for the same
 * reason is said once, at its first time (Batch QA, Section 0: four "Light
 * rays" rows, one reason, said four days running).
 */
export function rareRows(list: readonly Special[], now: Date, venue: LatLon | null = null, max = RARE_MAX): RareRow[] {
  const seen = new Set<string>()
  return list
    .filter((s) => rareKept(s, venue) && s.to.getTime() > now.getTime() && s.brief !== undefined && s.brief !== '')
    .sort((a, b) => a.from.getTime() - b.from.getTime())
    .filter((s) => {
      const key = `${s.kind}|${s.brief}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((s) => ({ kind: s.kind, at: s.from, name: RARE_NAME[s.kind] ?? s.kind, why: s.brief as string, word: s.word, share: s.of === 0 ? 0 : s.agree / s.of }))
    .sort((a, b) => b.share - a.share || a.at.getTime() - b.at.getTime())
    .slice(0, max)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ share: _share, ...r }) => r)
}

/** "showers to the east, sun low in the west": the rainbow's line from the bearings. */
export function rainbowBrief(showersPoint: string, sunPoint: string, sunDeg: number): string {
  return `showers to the ${showersPoint}, sun ${Math.round(sunDeg)}° up in the ${sunPoint}`
}

/* ------------------------------------------- the sky toward the sun (D_Sky) */

/** The heights the side view draws the decks at: the forecast's own layer bands' middles (src/core/fireOutlook.ts LAYER_BAND_M), in metres. */
export const SIDE_TOP_M = 12_000

export interface SideLayer {
  layer: 'low' | 'mid' | 'high'
  /** Metres up, and as a share of the view's height from the foot. */
  heightM: number
  y: number
  cover: number | null
  /** Enough cloud to light (30-90%). */
  canvas: boolean
  /** Lit at the event, by the models' mean. */
  lit: boolean
}

/**
 * The side view toward the sun: each deck at its real height (a square root
 * of the height, so the low deck is not squashed against the sea), the sun
 * at its height above the horizon, and the light's path from it to the deck
 * the page speaks for.
 */
export function sideView(layers: readonly { layer: 'low' | 'mid' | 'high'; heightM: number; cover: number | null; canvas: boolean; fires: boolean }[], sunAltDeg: number, leadLayer: 'low' | 'mid' | 'high' | null): { layers: SideLayer[]; sun: { x: number; y: number }; path: { from: { x: number; y: number }; to: { x: number; y: number } } | null } {
  const y = (m: number) => 0.92 - 0.82 * Math.sqrt(Math.max(0, Math.min(SIDE_TOP_M, m)) / SIDE_TOP_M)
  const out = layers.map((l) => ({ layer: l.layer, heightM: l.heightM, y: y(l.heightM), cover: l.cover, canvas: l.canvas, lit: l.fires }))
  /* The sun near the horizon on the left, a little above or below it by its height (a degree is a few per cent of the view). */
  const sun = { x: 0.12, y: Math.max(0.6, Math.min(1.02, 0.92 - sunAltDeg * 0.03)) }
  const lead = out.find((l) => l.layer === leadLayer && l.canvas) ?? null
  return { layers: out, sun, path: lead === null ? null : { from: sun, to: { x: 0.9, y: lead.y } } }
}

/* ------------------------------------------------- the light, as a bar */

export interface LightSegment {
  key: 'golden' | 'color' | 'blue' | 'dark'
  label: string
  from: Date
  to: Date
}

/**
 * Golden · color · blue · dark, in the order they come (sunset), or dark ·
 * blue · color · golden (sunrise), each from the sun's height and nothing
 * else (src/core/sunBand.ts's bands): golden from +6° to the sunset (the
 * sunrise to +6°), color, the afterglow, from the sunset down to −4° (from
 * −4° up to the sunrise), blue from −4° to −6°, dark from −6°.
 *
 * WHY NOT THE CALL'S WINDOW (Batch SIMPLE-3, Section 3.4). Until 24 Nov the
 * color segment was the call's own window and golden ran up to its start. On
 * 23 Nov at Atlantic Park the call said 5:07–5:17 PM, so golden read
 * 4:12–5:07 PM, past the 4:50 PM sunset, and color 5:07–5:17 sat on top of
 * blue 5:10–5:21. The call's window is when the clouds may be lit, which is a
 * different fact from the sky's phases: the page says it as the call's peak,
 * not as a second set of phase times. The call's window is used only where a
 * height is never reached (the sun not getting down to −4° within three hours
 * of the event, a summer night far north).
 *
 * Ordered and disjoint by construction: each segment starts no earlier than
 * the one before it ends, and a segment left with no time is dropped.
 */
export function lightTimeline(kind: 'sunrise' | 'sunset', event: Date, marks: readonly LightMark[], colorFrom: Date | null, colorTo: Date | null): LightSegment[] {
  const at = (label: string) => marks.find((m) => m.label === label)?.at ?? null
  const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)
  let segs: (LightSegment | null)[]
  if (kind === 'sunset') {
    const golden = at('Golden')
    const blue = at('Blue')
    const dark = at('Dark')
    const colorEnd = blue ?? (colorTo !== null && colorTo.getTime() > event.getTime() ? colorTo : plus(event, 10))
    segs = [
      golden === null ? null : { key: 'golden', label: 'golden', from: golden, to: event },
      { key: 'color', label: 'color', from: event, to: colorEnd },
      blue === null ? null : { key: 'blue', label: 'blue', from: blue, to: dark ?? plus(blue, 15) },
      dark === null ? null : { key: 'dark', label: 'dark', from: dark, to: plus(dark, 30) },
    ]
  } else {
    const blue = at('Blue')
    const glow = at('Glow')
    const day = at('Day')
    const colorStart = glow ?? (colorFrom !== null && colorFrom.getTime() < event.getTime() ? colorFrom : plus(event, -10))
    segs = [
      blue === null ? null : { key: 'dark', label: 'dark', from: plus(blue, -30), to: blue },
      blue === null ? null : { key: 'blue', label: 'blue', from: blue, to: colorStart },
      { key: 'color', label: 'color', from: colorStart, to: event },
      day === null ? null : { key: 'golden', label: 'golden', from: event, to: day },
    ]
  }
  const out: LightSegment[] = []
  for (const s of segs) {
    if (s === null) continue
    const prev = out[out.length - 1]
    const from = prev === undefined || s.from.getTime() >= prev.to.getTime() ? s.from : prev.to
    if (s.to.getTime() > from.getTime()) out.push({ ...s, from })
  }
  return out
}

/** Where now sits along the bar, 0 to 1, or null when it is outside it. */
export function nowShare(segs: readonly LightSegment[], now: Date): number | null {
  if (segs.length === 0) return null
  const a = segs[0].from.getTime()
  const b = segs[segs.length - 1].to.getTime()
  const t = now.getTime()
  return t < a || t > b ? null : (t - a) / (b - a)
}

/* ------------------------------------------------ which events, which day */

/** "Tonight", "Tomorrow morning", "Tomorrow evening", "Thu morning": the day word for an event, from now, in the spot's zone. */
export function eventDayWord(event: Date, kind: 'sunrise' | 'sunset', now: Date, timeZone: string): string {
  const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const today = iso(now)
  const tomorrow = iso(new Date(now.getTime() + 86_400_000))
  const d = iso(event)
  const part = kind === 'sunset' ? 'evening' : 'morning'
  if (d === today) return kind === 'sunset' ? 'Tonight' : 'This morning'
  if (d === tomorrow) return `Tomorrow ${part}`
  return `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(event)} ${part}`
}

/** The next event of a kind still to come: never one that has passed (Batch Flow, Section 4; field 9 Nov 8:31 PM: tonight's past sunset was shown). */
export function nextEvent<T extends { events: Record<'sunrise' | 'sunset', Date | null> }>(days: readonly T[], kind: 'sunrise' | 'sunset', now: Date): T | null {
  return days.find((d) => d.events[kind] !== null && (d.events[kind] as Date).getTime() > now.getTime()) ?? null
}

/** What the menu's Calendar row calls each mark: short, lower case after the day. */
export const MARK_WORD: Partial<Record<SpecialKind, string>> = { rainbow: 'rainbow', rays: 'light rays', fog: 'fog', glass: 'mirror water' }

/**
 * THE NEXT MARKED DAY, FOR THE MENU'S CALENDAR ROW (Batch Polish 2, Section
 * 2): "Thu · rainbow", "Today · fog". The soonest of the week's rare light
 * still to come; null when the week found none.
 */
export function nextMarkWord(rows: readonly RareRow[], now: Date, timeZone: string): string | null {
  const next = rows.filter((r) => r.at.getTime() > now.getTime() - 3_600_000).sort((a, b) => a.at.getTime() - b.at.getTime())[0]
  if (next === undefined) return null
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const word = day(next.at) === day(now) ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(next.at)
  return `${word} · ${MARK_WORD[next.kind] ?? next.name.toLowerCase()}`
}
