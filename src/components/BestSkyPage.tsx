import { useRef, useState } from 'react'
import type { RadiusMi } from '../core/bestSky.ts'
import type { LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import { DEFAULT_RADIUS, useBestSky } from '../lib/useBestSky.ts'
import { BestSkyList } from './BestSkyList.tsx'
import { BestSkyMap } from './BestSkyMap.tsx'
import { BestSkySpot } from './BestSkySpot.tsx'
import { PageShell } from './PageShell.tsx'
import '../styles/bestsky.css'

/*
 * WHERE'S THE COLOR? (Batch BEST SKY, Sections 3-5; boards BestSky_Map,
 * BestSky_Card, BestSky_Spot). One page, three swipe pages with dots, as the
 * Sky page: 1 the map (src/components/BestSkyMap.tsx), 2 the ranked list
 * (BestSkyList.tsx), 3 one spot (BestSkySpot.tsx). It opens on page 1; the
 * radius is shared by all three; page 3 shows the spot picked on 1 or 2 (the
 * first by default). Words are facts on a scale: Likely, Possible, Little.
 */
interface Props {
  venue: LatLon
  placeName: string
  timeZone: string
  now: Date
  miles: boolean
  saved?: readonly { id: string; name: string; at: LatLon }[]
  onBack: () => void
  /** Open the map at a spot and the colour's time, the sun's line on. */
  onShowOnMap: (at: LatLon, when: Date) => void
}

const PAGES = ['Map', 'List', 'Spot'] as const

export function BestSkyPage({ venue, placeName, timeZone, now, miles, saved = [], onBack, onShowOnMap }: Props) {
  const [radius, setRadius] = useState<RadiusMi>(DEFAULT_RADIUS)
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const track = useRef<HTMLDivElement>(null)
  const sky = useBestSky(venue, radius, now, saved)
  const ev = sky.event
  /* Sideways only, and each page from its top: the three share one vertical scroller, so a page would otherwise open at the last one's depth. */
  const toTop = () => track.current?.closest('.ppage__body')?.scrollTo({ top: 0 })
  const go = (i: number) => {
    setPage(i)
    const t = track.current
    t?.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' })
    toTop()
  }
  const top = sky.ranked.filter((r) => r.word !== 'Little').slice(0, 3)
  const chosen = sky.ranked.find((r) => r.spot.id === picked) ?? top[0] ?? sky.ranked[0] ?? null
  const pick = (id: string) => {
    setPicked(id)
    go(2)
  }
  const when = ev === null ? 'next' : ev.kind === 'sunset' ? (sameDay(ev.at, now, timeZone) ? 'tonight' : 'tomorrow evening') : sameDay(ev.at, now, timeZone) ? 'this morning' : 'tomorrow morning'
  /* Page 1 is named as its board: "Color tonight · sunset 4:56". */
  const title = page === 0 ? `Color ${ev?.kind === 'sunrise' ? 'this morning' : 'tonight'}` : "Where's the color?"
  const sub = page === 0 ? (ev === null ? 'next sunrise or sunset' : `${ev.kind} ${formatClock(ev.at, timeZone)}`) : `near you · ${when}`

  return (
    <PageShell kind="bsky" title={title} sub={sub} ground="night" onBack={onBack} how={<BestSkyHow asked={sky.asked} satAt={sky.satAt} timeZone={timeZone} />}>
      <div className="bsky__dots" role="tablist" aria-label="Pages">
        {PAGES.map((p, i) => (
          <button key={p} type="button" role="tab" aria-label={p} aria-selected={page === i} className={`home__dot${page === i ? ' home__dot--on' : ''}`} onClick={() => go(i)} />
        ))}
      </div>
      <div
        className="bsky__track"
        ref={track}
        data-sideways
        onScroll={(e) => {
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
          if (i !== page) {
            setPage(i)
            toTop()
          }
        }}
      >
        <BestSkyMap venue={venue} radius={radius} sky={sky} top={top} miles={miles} timeZone={timeZone} onPick={pick} onRadius={setRadius} />
        <BestSkyList venue={venue} placeName={placeName} radius={radius} sky={sky} top={top} miles={miles} timeZone={timeZone} now={now} chosen={chosen} onPick={pick} onRadius={setRadius} onShowOnMap={onShowOnMap} />
        <BestSkySpot venue={venue} sky={sky} chosen={chosen} miles={miles} timeZone={timeZone} now={now} onShowOnMap={onShowOnMap} />
      </div>
    </PageShell>
  )
}

const sameDay = (a: Date, b: Date, timeZone: string) => a.toLocaleDateString('en-CA', { timeZone }) === b.toLocaleDateString('en-CA', { timeZone })

function BestSkyHow({ asked, satAt, timeZone }: { asked: number; satAt: Date | null; timeZone: string }) {
  return (
    <div className="bsky__how">
      <p>
        Every point of a grid round you (about 5 km apart, on the forecast cache's own grid) is scored the Sky color way: mid and high cloud 25–80% overhead or within about 50 km toward the sun to light; the low cloud toward the sun mostly clear; no thick low deck overhead. A patch toward the sun is a low glow on the horizon at most. Within 3 hours of the color, the satellite's cold cloud tops mark the real patches the models smear, carried to the color's time with the wind at 500 hPa (about 18,000 ft). After the sunset (before a sunrise) the clouds on the opposite side of the sky turn pink too: spots facing them score for it.
      </p>
      <p>
        <b>The map's wash</b>: a soft glow on every grid point that scores Possible or better, as strong as its score. No glow where the sky is clear or a low deck shuts it.
      </p>
      <p>
        <b>Who sees it</b>: cloud overhead lights up for anyone under it; the glow toward the sun needs a view open that way. When two spots score the same, the one facing the sun more directly ranks first, then the one with more of the patch in its view, then water in front, then the nearer to you.
      </p>
      <p>
        Each question names a tile of 25 points and the day, never you: {asked} {asked === 1 ? 'question' : 'questions'} for this area, each kept an hour. {satAt === null ? '' : `Satellite: GOES-East, ${formatClock(satAt, timeZone)}.`} Distances are straight lines from your spot, worked out on the phone. Likely and Possible are odds, never a promise.
      </p>
    </div>
  )
}
