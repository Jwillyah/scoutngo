/*
 * THE SHADOW LEGEND, SHORT AND IN FULL.
 *
 * It was one sentence across the 2D map ("Shadows from 965 buildings with a
 * known height. 349 more have no height and cast none here. Flat ground.
 * Heights from the 2013 lidar scan..."), which on a phone ran over the map
 * it was explaining (27 Oct, at the pier). Now one short line over the map,
 * and the whole of it in the map's "i" (MapCredits.tsx).
 */
type ShadowCount = { status: 'no-sun'; skippedNoHeight: number } | { status: string; shadows: readonly unknown[]; skippedNoHeight: number }

const fmt = (x: number) => x.toLocaleString('en-US')

/** "Shadows: 965 buildings · 349 no height". */
/*
 * WITH THE SUN DOWN, ONE THING TO SAY: WHEN THEY COME BACK (29 Oct, from the
 * pier: "No shadows: the sun is down. 349 more have no height and cast none
 * here. Flat ground." reads broken, "349 more" of what). `sunrise` is the
 * next sunrise as a clock time, or null when there is none to say.
 */
export function shadowKeyLine(shadows: ShadowCount, sunrise: string | null = null): string {
  if (!('shadows' in shadows)) return sunrise === null ? 'No shadows: the sun is down.' : `No shadows until sunrise at ${sunrise}`
  const n = shadows.shadows.length
  return `Shadows: ${fmt(n)} ${n === 1 ? 'building' : 'buildings'}${shadows.skippedNoHeight === 0 ? '' : ` · ${fmt(shadows.skippedNoHeight)} no height`}`
}

/** The shadow legend in full, for the map's "i". */
export function shadowKeyNotes(shadows: ShadowCount, scanYearUsed: number | null | undefined, sunrise: string | null = null): string[] {
  if (!('shadows' in shadows)) return [shadowKeyLine(shadows, sunrise)]
  const n = shadows.shadows.length
  return [
    `Shadows from ${fmt(n)} ${n === 1 ? 'building' : 'buildings'} with a known height.`,
    ...(shadows.skippedNoHeight === 0 ? [] : [`${fmt(shadows.skippedNoHeight)} more have no height on the map and cast no shadow here.`]),
    'Shadows fall on flat ground.',
    ...(scanYearUsed === undefined ? [] : [`Heights from the ${scanYearUsed ?? 'public'} lidar scan; newer buildings may be missing.`]),
  ]
}
