/*
 * CLOUD FROM A METAR, read on the phone. weather.gov's latest observation
 * carries the METAR as text, and its own cloudLayers list came back empty
 * beside "FEW030 SCT250" (KNTU, 29 Oct), so the text is the source.
 */
export type Amount = 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV'

export interface CloudGroup {
  amount: Amount
  /** Base above the station, feet. */
  baseFt: number
}

export interface MetarSky {
  station: string
  /** Clear below 12,000 ft (CLR) or no cloud at all (SKC, NCD, NSC, CAVOK). */
  clear: boolean
  groups: CloudGroup[]
}

const WORD: Record<Amount, string> = { FEW: 'a few clouds', SCT: 'scattered cloud', BKN: 'a broken deck', OVC: 'an overcast deck', VV: 'sky hidden' }

export function parseMetarSky(text: string): MetarSky | null {
  const tokens = text.trim().split(/\s+/)
  const body = tokens[0] === 'METAR' || tokens[0] === 'SPECI' ? tokens.slice(1) : tokens
  const station = body[0]
  if (station === undefined || !/^[A-Z][A-Z0-9]{3}$/.test(station)) return null
  const rmk = body.indexOf('RMK')
  const main = rmk < 0 ? body : body.slice(0, rmk)
  const groups: CloudGroup[] = []
  let clear = false
  for (const t of main) {
    if (/^(CLR|SKC|NCD|NSC|CAVOK)$/.test(t)) clear = true
    const m = /^(FEW|SCT|BKN|OVC|VV)(\d{3})/.exec(t)
    if (m !== null) groups.push({ amount: m[1] as Amount, baseFt: Number(m[2]) * 100 })
  }
  if (!clear && groups.length === 0) return null
  return { station, clear, groups }
}

/** The lowest broken or overcast deck: what decides whether a low canvas is there. */
export function lowestDeck(sky: MetarSky): CloudGroup | null {
  return sky.groups.find((g) => g.amount === 'BKN' || g.amount === 'OVC' || g.amount === 'VV') ?? null
}

const ft = (n: number) => n.toLocaleString('en-US')

/** "broken deck at 2,900 ft", "clear below 12,000 ft", "a few clouds at 3,000 ft". */
export function skyWords(sky: MetarSky): string {
  if (sky.groups.length === 0) return sky.clear ? 'clear below 12,000 ft' : 'no cloud reported'
  const deck = lowestDeck(sky)
  const g = deck ?? sky.groups[0]
  return `${WORD[g.amount].replace(/^an? /, '')} at ${ft(g.baseFt)} ft`
}

/** Low cloud (under 6,500 ft) from the station, as the forecast's low layer would call it. */
export function stationLow(sky: MetarSky): 'deck' | 'some' | 'clear' {
  const low = sky.groups.filter((g) => g.baseFt < 6500)
  if (low.some((g) => g.amount === 'BKN' || g.amount === 'OVC' || g.amount === 'VV')) return 'deck'
  return low.length > 0 ? 'some' : 'clear'
}

/**
 * When the station and the forecast disagree about low cloud, say it, in one
 * line: "Station: broken deck at 2,900 ft · forecast said clear". Null when
 * they agree, or when either has nothing to say.
 */
export function disagreement(sky: MetarSky, forecastLow: number | null): string | null {
  if (forecastLow === null) return null
  const st = stationLow(sky)
  if (st === 'deck' && forecastLow < 30) return `Station: ${skyWords(sky)} · forecast said clear`
  if (st === 'clear' && forecastLow >= 70) return `Station: ${skyWords(sky)} · forecast said a low deck (${Math.round(forecastLow)}%)`
  return null
}

/** A METAR's wind group: "02007KT", "VRB03KT", "27015G25KT". Knots, FROM. Null without one. */
export function parseMetarWind(text: string): { fromDeg: number | null; kt: number; gustKt: number | null } | null {
  const m = /\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/.exec(text)
  if (m === null) return null
  return { fromDeg: m[1] === 'VRB' ? null : Number(m[1]), kt: Number(m[2]), gustKt: m[3] === undefined ? null : Number(m[3]) }
}
