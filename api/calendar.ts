/*
 * ===========================================================================
 * THE SKY CALLS AS A CALENDAR FEED. THIS FUNCTION LOGS NOTHING AND KEEPS NOTHING.
 *
 * WHY A GET WITH THE PLACE IN THE URL, unlike every other route here
 * (tests/apiBodies.test.ts): a calendar app subscribes to a URL and asks it
 * again by itself; it cannot send a body. So this is opt-in (Settings ›
 * Alerts, off by default), and the place it takes is the venue ROUNDED TO 2
 * DECIMALS, about a kilometre: it refuses any coordinate written finer
 * (src/core/calendarFeed.ts FEED_COORD). Settings says plainly that the
 * calendar app sends those rounded coordinates on each refresh, and that
 * Vercel's own request logs keep the request line for an hour.
 *
 * WHAT IT DOES: for the next FEED_DAYS sunrises and sunsets, the same Sky
 * fire read the app makes (src/core/fireOutlook.ts, src/core/briefing.ts)
 * from Open-Meteo's models, asked with the same rounded points; Go or Maybe
 * become events with an alarm. In the three hours before an event it also
 * reads the stations by id (src/lib/feedObs.ts, Batch J, Section 6; three,
 * not one, since Batch TRUTH: on 12 Nov the overnight models dropped the
 * deck KNTU was reporting, the Maybe fell to Skip and left the calendar), as
 * the phone does: a call that moves to Go, or to Skip, moves in the calendar.
 * ===========================================================================
 */
import { getPosition, getTimes } from 'suncalc'
import { CONFIRM_WITHIN_MS, eventCall, type CallObs, type CallRead } from '../src/core/briefing.ts'
import { feedIds, feedObsFrom, latestSkies } from '../src/lib/feedObs.ts'
import { feedCoords, feedIcs, FEED_DAYS } from '../src/core/calendarFeed.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { firePathsRangeUrl, nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { feedBestSpot } from '../src/lib/feedBestSky.ts'

const AVWX_METAR = 'https://aviationweather.gov/api/data/metar'
/** The stations are read this long before an event, as the phone's observations (src/lib/useSkyObs.ts OBS_FROM_MS). */
export const FEED_OBS_MS = 3 * 3_600_000

/** The stations' read for one event, by ids only (src/lib/feedObs.ts); null when the service does not answer. */
async function stationsFor(at: { lat: number; lon: number }, event: Date): Promise<CallObs | null> {
  const { own, ids } = feedIds(at, event)
  if (ids.length === 0) return null
  try {
    const r = await fetch(`${AVWX_METAR}?ids=${ids.join(',')}&format=raw&hours=2`, { signal: AbortSignal.timeout(8000) })
    return r.ok ? feedObsFrom(at, event, latestSkies(await r.text()), own) : null
  } catch {
    return null
  }
}

export async function GET(request: Request): Promise<Response> {
  const u = new URL(request.url)
  const at = feedCoords(u.searchParams.get('lat'), u.searchParams.get('lon'))
  if (at === null) return new Response('Expected lat and lon with exactly two decimals.', { status: 400 })
  const now = new Date()
  const events: { kind: 'sunrise' | 'sunset'; at: Date }[] = []
  for (let n = 0; n < FEED_DAYS; n += 1) {
    const t = getTimes(new Date(now.getTime() + n * 86_400_000), at.lat, at.lon)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const e = t[kind]
      if (e instanceof Date && !Number.isNaN(e.getTime()) && e.getTime() > now.getTime() - 30 * 60_000) events.push({ kind, at: e })
    }
  }
  const reads: CallRead[] = []
  for (const kind of ['sunrise', 'sunset'] as const) {
    const mine = events.filter((e) => e.kind === kind)
    if (mine.length === 0) continue
    const mid = mine[Math.floor(mine.length / 2)].at
    try {
      const r = await fetch(firePathsRangeUrl(at, getPosition(mid, at.lat, at.lon).azimuth, mine[0].at.toISOString().slice(0, 10), mine[mine.length - 1].at.toISOString().slice(0, 10)))
      const data = r.ok ? parseFirePaths(await r.json()) : null
      for (const e of mine) {
        const paths = data === null ? [] : pathsAt(data, nearestHour(e.at))
        const lead = e.at.getTime() - now.getTime()
        const obs = lead <= FEED_OBS_MS && lead >= -CONFIRM_WITHIN_MS ? await stationsFor(at, e.at) : null
        const read = eventCall(paths.length === 0 ? null : fireVerdict(paths, { event: e.at, kind, venue: at }), kind, e.at, now, null, obs)
        /* Batch BEST SKY, Section 6: the best spot near, for the next day's events worth a look. */
        const bestNear = read.call === 'Go' || read.call === 'Maybe' ? await feedBestSpot(at, e.at, now).catch(() => null) : null
        reads.push({ ...read, bestNear })
      }
    } catch {
      /* No answer: no events for this kind; the calendar keeps asking. */
    }
  }
  return new Response(feedIcs(reads, at, now), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'public, max-age=1800' },
  })
}
