/*
 * THE SURF PAGE'S WORDS AND PARTS (Batch MAP2, Section 1; field check 9 Nov
 * 12:46 PM, Virginia Beach). Three things the page said wrong:
 *
 *   size     "2–4 ft" read "knee to waist": the words came from the band's
 *            centre, not from the ends the headline shows. Now both ends,
 *            the same rounded numbers (rangeEnds), each on the body ruler.
 *   period   "9 s" was the forecast's MEAN swell period; 44099's dominant
 *            (spectral peak) period read 13 s. Now the buoy's dominant
 *            period when a reading is fresh, else the forecast's peak period
 *            when it gives one, else its mean, said as a mean.
 *   parts    the sea in its own swells (board LOOKS · Surf, S7): the
 *            forecast's swells and wind waves, the top two on the headline;
 *            a buoy's own parts are what its .spec file has, never invented.
 */
import { rangeEnds } from './surfRange.ts'
import { saneAzimuth, sanePeriod } from './sanity.ts'

/** The body ruler, by whole feet of face (board LOOKS · Surf, S6). */
const PART = ['flat', 'ankle', 'knee', 'waist', 'chest', 'shoulder', 'head', 'head', 'overhead'] as const
export const bodyPart = (ft: number): string => (ft >= 10 ? 'well overhead' : ft >= 8 ? 'overhead' : PART[Math.max(0, Math.min(PART.length - 1, Math.round(ft)))])

/** The size words for a band, from the same ends the headline prints: "2–4 ft" is "knee to chest". */
export function rangeSizeWords(lowFt: number, highFt: number): string {
  const [lo, hi] = rangeEnds(lowFt, highFt)
  const a = bodyPart(lo)
  const b = bodyPart(hi)
  if (a === b) return a === 'flat' ? 'flat' : `${a} high`
  return `${a} to ${b}`
}

export interface PeriodRead {
  s: number
  /** "12 s, the buoy's peak" / "11 s peak" / "9 s mean". */
  words: string
  from: 'buoy' | 'forecast-peak' | 'forecast-mean'
}

/** The period to show: the buoy's dominant period when fresh, else the forecast's peak, else its mean, said as such. */
export function periodRead(buoyDominantS0: number | null, buoyFresh: boolean, forecastPeakS0: number | null, forecastMeanS0: number | null, buoyId: string | null = null): PeriodRead | null {
  /* Sanity (Batch QA, Section 4): a period outside 2-25 s is not said. */
  const buoyDominantS = sanePeriod(buoyDominantS0)
  const forecastPeakS = sanePeriod(forecastPeakS0)
  const forecastMeanS = sanePeriod(forecastMeanS0)
  if (buoyFresh && buoyDominantS !== null && buoyDominantS > 0) return { s: Math.round(buoyDominantS), words: `${Math.round(buoyDominantS)} s${buoyId === null ? '' : ` at ${buoyId}`}`, from: 'buoy' }
  if (forecastPeakS !== null && forecastPeakS > 0) return { s: Math.round(forecastPeakS), words: `${Math.round(forecastPeakS)} s peak`, from: 'forecast-peak' }
  if (forecastMeanS !== null && forecastMeanS > 0) return { s: Math.round(forecastMeanS), words: `${Math.round(forecastMeanS)} s mean`, from: 'forecast-mean' }
  return null
}

export interface SwellPart {
  name: string
  /** Open-water height of this part, feet (not faces at the beach). */
  ft: number
  periodS: number | null
  /** Where it comes FROM, degrees; null when not given. */
  fromDeg: number | null
}

const FT = 3.28084

/** The forecast's parts at an hour: swell, second and third swell, wind waves; biggest first; only those the forecast gives. */
export function forecastParts(read: (name: string) => number | null): SwellPart[] {
  const part = (name: string, h: string, t: string, d: string): SwellPart | null => {
    const m = read(h)
    if (m === null || !(m > 0.03)) return null
    return { name, ft: m * FT, periodS: sanePeriod(read(t)), fromDeg: saneAzimuth(read(d)) }
  }
  return [
    part('Swell', 'swell_wave_height', 'swell_wave_period', 'swell_wave_direction'),
    part('Second swell', 'secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction'),
    part('Third swell', 'tertiary_swell_wave_height', 'tertiary_swell_wave_period', 'tertiary_swell_wave_direction'),
    part('Wind waves', 'wind_wave_height', 'wind_wave_period', 'wind_wave_direction'),
  ]
    .filter((p): p is SwellPart => p !== null)
    .sort((a, b) => b.ft - a.ft)
}

const POINTS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 }

/**
 * NDBC's "wind waves" this long or longer are swell (Batch TRUTH, Section 2):
 * on 12 Nov 44099 split 1.3 ft · 9 s SE as wind waves beside a 0.3 ft swell,
 * and the beach had small clean lines, not chop. The split is by frequency
 * against the local wind; 8 s and up has travelled.
 */
export const SWELL_FROM_S = 8

/** A buoy's own parts from its spectral summary: the swell and the wind waves, those it reported; never a third. Wind waves of SWELL_FROM_S or longer are named swell, the bigger swell first. */
export function buoyParts(split: { swellM: number | null; swellS: number | null; swellFrom: string | null; windWaveM: number | null; windWaveS: number | null; windWaveFrom: string | null } | null): SwellPart[] {
  if (split === null) return []
  const out: SwellPart[] = []
  if (split.swellM !== null && split.swellM > 0) out.push({ name: 'Swell', ft: split.swellM * FT, periodS: sanePeriod(split.swellS), fromDeg: split.swellFrom === null ? null : (POINTS[split.swellFrom] ?? null) })
  if (split.windWaveM !== null && split.windWaveM > 0) {
    const periodS = sanePeriod(split.windWaveS)
    out.push({ name: periodS !== null && periodS >= SWELL_FROM_S ? 'Swell' : 'Wind waves', ft: split.windWaveM * FT, periodS, fromDeg: split.windWaveFrom === null ? null : (POINTS[split.windWaveFrom] ?? null) })
  }
  const swells = out.filter((p) => p.name === 'Swell').sort((a, b) => b.ft - a.ft)
  if (swells.length === 2) swells[1].name = 'Second swell'
  return [...swells, ...out.filter((p) => p.name !== 'Swell' && p.name !== 'Second swell')]
}

/** "2.1 ft · 9 s": a part's height and period, no direction (the arrow says that). */
export const partWords = (p: SwellPart): string => `${p.ft.toFixed(1)} ft${p.periodS === null ? '' : ` · ${Math.round(p.periodS)} s`}`
