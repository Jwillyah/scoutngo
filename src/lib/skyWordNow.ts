/*
 * ONE SKY WORD NOW, PER SPOT (Batch CORE, Section 4.1; 15 Nov 5:46 PM: the
 * home said "Overcast" while the map's strip said "Mostly cloudy"). The two
 * read different answers: the home the briefing's forecast and the station,
 * the strip the wind request's hour. The home says the word for now (src/
 * components/Home.tsx) and puts it here; the strip, at now, says the same
 * word while it is no older than SHARED_FOR_MS. Kept in memory only.
 */
export const SHARED_FOR_MS = 10 * 60_000

const words = new Map<string, { word: string; at: number }>()
const keyOf = (at: { lat: number; lon: number }) => `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`

export function shareSkyWordNow(at: { lat: number; lon: number }, word: string | null, now: number = Date.now()): void {
  if (word === null) words.delete(keyOf(at))
  else words.set(keyOf(at), { word, at: now })
}

/** The home's word for now at this spot, when it is fresh; else null (the strip then reads its own). */
export function skyWordNowFor(at: { lat: number; lon: number }, now: number = Date.now()): string | null {
  const w = words.get(keyOf(at))
  return w === undefined || now - w.at > SHARED_FOR_MS ? null : w.word
}
