import { useMemo, useState, type ReactNode } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { StationObs } from '../core/nowcast.ts'
import type { SpotStats } from '../core/spotSkill.ts'
import { chartTopFt } from '../core/surfRange.ts'
import { swellOf } from '../core/surfReads.ts'
import { nextTurns } from '../core/tideWindow.ts'
import { formatShortClock, formatShortHour } from '../core/timezone.ts'
import { waterHead, wetsuitWords } from '../core/waterTemp.ts'
import { bigCam, camLine } from '../lib/surfCam.ts'
import { barRuns, daylightAt, stretchWords, surfBars, surfHero, surfRuns, surfWindow, windFromNow, BARS_HOURS } from '../lib/surfTapIn.ts'
import { metresToFeet, compass } from '../lib/tideWords.ts'
import { formatTemperature, type Units } from '../lib/units.ts'
import { seaNow, sideWord, surfNowFrom } from '../lib/useSurfNow.ts'
import type { SurfSea } from '../lib/useSurfSea.ts'
import type { TideInfo } from '../lib/useTide.ts'
import { useBuoyPage } from '../lib/useBuoyPage.ts'
import { useSurfCams } from '../lib/useSurfCams.ts'
import { useWaterTemp } from '../lib/waterTemp.ts'
import { BuoysBody } from './BuoysPageV2.tsx'
import { CamBig, CamList } from './SurfCams.tsx'
import { WeekBars } from './SurfWeekBars.tsx'
import { TapInPage, type TapInRow } from './TapInPage.tsx'
import { TideCurve } from './TideCurve.tsx'
import '../styles/surf.css'
import '../styles/tapin-surf.css'

/*
 * THE SURF PAGE AS THE TAP-IN SKELETON (Batch SIMPLE-2, Section 4; boards
 * Surf_Now, Surf_Cams). Tabs Now · Week · Cams · Buoys, opening on Now.
 *
 *   Now    "NOW · POOR", the size range, "Choppy · NNE 8 kt cross-shore"; the
 *          next 24 hours as bars with the clean stretches lit, the one tide
 *          curve thin under them; rows Best · Tide · Swell · Water
 *   Week   the existing seven days
 *   Cams   src/components/SurfCams.tsx
 *   Buoys  the existing Buoys page's body (BuoysBody)
 *
 * "More details ›" opens the old Surf page, unchanged. "Clean" is the word
 * the surf code gives (src/core/surf.ts surfShape: glassy light wind, or
 * offshore, or cross-offshore under 8 kt); the page does not call it glassy.
 */

export interface SurfTapInProps {
  now: Date
  timeZone: string
  venue: LatLon
  spot: LatLon
  placeName: string
  sea: SurfSea
  stats: SpotStats
  units: Units
  ground: string
  station: StationObs | null
  tide: TideInfo
  how: ReactNode
  onBack: () => void
  onMore: () => void
}

const SURF_SAFETY_LINE = 'Forecasts can be wrong · look first'
const TABS = [
  { id: 'now', label: 'Now' },
  { id: 'week', label: 'Week' },
  { id: 'cams', label: 'Cams' },
  { id: 'buoys', label: 'Buoys' },
] as const

const W = 330
const H = 96
const LABEL_ROOM = 22
const AXIS_ROOM = 16
const CHAR_PX = 6.6

export function SurfBars({ bars, from, to, now, timeZone, runs: lit = null }: { bars: ReturnType<typeof surfBars>['bars']; from: Date; to: Date; now: Date; timeZone: string; runs?: readonly { from: Date; to: Date }[] | null }) {
  const span = to.getTime() - from.getTime()
  const x = (t: number) => ((t - from.getTime()) / span) * W
  const slot = W / BARS_HOURS
  const top = chartTopFt(bars.map((b) => b.ft))
  const plot = H - LABEL_ROOM - AXIS_ROOM
  /* Batch SIMPLE-3, Section 0.3: the stretches lit are the one surf window's runs (src/lib/surfTapIn.ts surfRuns), when the page passes them. */
  const runs = (lit ?? barRuns(bars)).filter((r) => r.to.getTime() > from.getTime() && r.from.getTime() < to.getTime())
  const ticks = [1, 7, 13, 19].map((k) => new Date(from.getTime() + k * 3_600_000))
  const nowX = x(now.getTime())
  return (
    <svg className="sbars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The next 24 hours of surf, one bar an hour; the clean stretches are lit." data-surf-bars>
      {runs.map((r, k) => {
        const x0 = Math.max(0, x(r.from.getTime()))
        const x1 = Math.min(W, x(r.to.getTime()))
        const words = `clean ${formatShortHour(r.from, timeZone)}–${formatShortHour(r.to, timeZone)}`
        /* The words may be wider than a short stretch: centred on it, kept inside the picture, and left out when the stretch before already wrote over that spot. */
        const half = (words.length * CHAR_PX) / 2
        const mid = Math.min(W - half, Math.max(half, (x0 + x1) / 2))
        const before = runs.slice(0, k).map((p) => Math.min(W, Math.max(0, x(p.from.getTime()) + x(p.to.getTime()))) / 2)
        const crowded = before.some((m) => Math.abs(m - mid) < half * 2)
        return (
          <g key={r.from.getTime()} data-surf-clean>
            <rect className="sbars__band" x={x0} y={LABEL_ROOM - 4} width={Math.max(0, x1 - x0)} height={plot + 4} rx={4} />
            {crowded ? null : (
              <text className="sbars__bandt" x={mid} y={12} textAnchor="middle">
                {words}
              </text>
            )}
          </g>
        )
      })}
      {bars.map((b) => {
        const h = Math.max(2, (Math.min(b.ft, top) / top) * plot)
        return <rect key={b.at.getTime()} className={`sbars__bar${b.clean ? ' sbars__bar--clean' : ''}`} x={x(b.at.getTime() - 1_800_000) + 1} y={LABEL_ROOM + plot - h} width={slot - 2} height={h} rx={2} data-bar={b.ft.toFixed(1)} />
      })}
      <line className="sbars__now" x1={nowX} x2={nowX} y1={LABEL_ROOM - 4} y2={LABEL_ROOM + plot} />
      <text className="sbars__tick" x={Math.max(10, nowX)} y={H - 3} textAnchor="start">
        now
      </text>
      {ticks.slice(1).map((t) => (
        <text key={t.getTime()} className="sbars__tick" x={x(t.getTime())} y={H - 3} textAnchor="middle">
          {formatShortHour(t, timeZone)}
        </text>
      ))}
    </svg>
  )
}

function BuoysTab({ venue, placeName, timeZone, units }: { venue: LatLon; placeName: string; timeZone: string; units: Units }) {
  const data = useBuoyPage(venue)
  return (
    <section className="tipage__card tipage__chart" data-surf-buoys>
      <BuoysBody venue={venue} placeName={placeName} timeZone={timeZone} units={units} buoys={data.buoys} marine={data.marine} marineFailed={data.marineFailed} facing={data.facing} />
    </section>
  )
}

export function SurfTapIn({ now, timeZone, venue, spot, placeName, sea, stats, units, ground, station, tide, how, onBack, onMore }: SurfTapInProps) {
  const [tab, setTab] = useState<string>('now')
  const miles = units.distance === 'ft'
  const read = useMemo(() => surfNowFrom(sea, stats, now, timeZone, station), [sea, stats, now, timeZone, station])
  const water = useWaterTemp(spot)
  const cams = useSurfCams(venue, tab === 'cams')
  const head = read.now
  const call = read.week[0]?.call ?? null
  const hero = surfHero(call, head, head === null ? null : sideWord(head), windFromNow(sea, now, station), units)
  const sea0 = seaNow(sea, now, head?.periodS ?? null)
  const swell = swellOf(sea0.parts) ?? sea0.parts[0] ?? null
  const { from, to, bars } = surfBars(read.series, now)
  /* Batch SIMPLE-3, Section 0.3: the one surf window, the home's card's too (src/lib/surfTapIn.ts surfWindow). */
  const daylight = daylightAt(spot)
  const runs = surfRuns(read.series, daylight)
  const best = surfWindow(read.series, now, daylight)
  const turn = tide.status === 'ok' ? nextTurns(tide.predictions.extremes, now).next : null

  const noForecast = sea.marine === null
  const why = sea.status === 'loading' ? 'Asking for the sea forecast…' : sea.facingState === 'inland' ? 'No sea here: no surf to forecast.' : "The sea forecast didn't load · retrying"
  const rows: TapInRow[] = [
    { label: 'Best', value: best === null ? '—' : stretchWords(best, now, timeZone), detail: best === null ? 'no clean stretch with surf in 2 days' : 'clean' },
    {
      label: 'Tide',
      value: turn === null ? '—' : `${turn.kind === 'high' ? 'High' : 'Low'} ${formatShortClock(turn.at, timeZone)}`,
      detail: turn === null ? (tide.status === 'no-station' ? 'no tide station near here' : 'not in NOAA’s table yet') : `then ${turn.kind === 'high' ? 'falling' : 'rising'}`,
    },
    {
      label: 'Swell',
      value: swell === null ? '—' : `${swell.ft.toFixed(1)} ft${swell.periodS === null ? '' : ` ${Math.round(swell.periodS)} s`}`,
      detail: swell === null ? 'the forecast did not say' : swell.fromDeg === null ? undefined : compass(swell.fromDeg),
    },
    {
      label: 'Water',
      value: water.status === 'ok' ? waterHead(water.reading.c, units.temperature).replace(/^Water /, '').split(' · ')[0] : '—',
      detail: water.status === 'ok' ? (wetsuitWords(water.reading.c) ?? formatTemperature(water.reading.c, units.temperature)) : water.status === 'loading' ? 'asking…' : 'no reading near here',
    },
  ]

  const shown = cams.list === null ? null : bigCam(cams.list, cams.picked)
  const peak = read.week.reduce<(typeof read.week)[number] | null>((p, d) => (d.hour !== null && (p === null || p.hour === null || d.hour.centerFt > p.hour.centerFt) ? d : p), null)
  const heroFor = () => {
    if (tab === 'week')
      return {
        eyebrow: 'THE WEEK',
        value: peak?.call?.words ?? '—',
        sub: peak?.call == null ? 'The forecast did not say' : `Biggest ${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${peak.date}T12:00:00Z`))} · ${peak.call.wind}`,
      }
    if (tab === 'cams')
      return {
        eyebrow: cams.list === null ? 'CAMS' : `NEAR YOU · ${cams.list.length} ${cams.list.length === 1 ? 'CAM' : 'CAMS'}`,
        value: shown === null ? '—' : shown.cam.cam.name,
        sub: cams.list === null ? 'Looking for cams near you…' : shown === null ? 'No surf cam within 30 mi' : camLine(shown.cam, miles),
      }
    if (tab === 'buoys') {
      const b = sea.buoy?.status === 'ok' ? sea.buoy : null
      return {
        eyebrow: 'BUOYS · NDBC',
        value: b === null ? '—' : `${metresToFeet(b.waveM).toFixed(1)} ft`,
        sub: b === null ? (sea.buoy === null ? 'Asking the nearest buoy…' : 'No buoy reading') : `${b.buoy.id}${b.periodS === null ? '' : ` · ${Math.round(b.periodS)} s`} · ${formatShortClock(b.at, timeZone)}`,
      }
    }
    return noForecast ? { eyebrow: 'NOW', value: '—', sub: why } : { eyebrow: hero.eyebrow, value: hero.value, sub: hero.sub, ...(hero.shared === null ? {} : { shared: { key: 'surf', value: hero.shared } }) }
  }

  return (
    <TapInPage
      title="Surf"
      spot={placeName}
      ground={ground}
      kind="tipage--surf dpage--surf"
      onBack={onBack}
      how={how}
      safety={SURF_SAFETY_LINE}
      tabs={TABS}
      initialTab="now"
      onTab={setTab}
      hero={heroFor()}
      chart={
        tab === 'now' && !noForecast ? (
          <>
            {bars.length === 0 ? <p className="tcurve__none">The forecast did not say for the next hours.</p> : <SurfBars bars={bars} from={from} to={to} now={now} timeZone={timeZone} runs={runs} />}
            {tide.status === 'ok' ? (
              <>
                <p className="sbars__tidelabel">tide</p>
                <TideCurve variant="strip" curve={tide.predictions.curve} from={from} to={to} timeZone={timeZone} now={now} label="The water level over the same 24 hours." />
              </>
            ) : null}
          </>
        ) : tab === 'week' && !noForecast ? (
          <WeekBars week={read.week} />
        ) : undefined
      }
      rows={tab === 'now' && !noForecast ? rows : []}
      onMore={tab === 'now' ? onMore : undefined}
    >
      {(t: string) =>
        t === 'cams' ? (
          <>
            <section className="tipage__card tipage__chart" data-surf-cams>
              {shown === null ? <p className="tcurve__none">{cams.list === null ? 'Looking for cams near you…' : 'No surf cam within 30 mi.'}</p> : <CamBig cam={shown.cam} yours={shown.yours} />}
            </section>
            <p className="scams__note">Pick any cam near you. We remember it on this phone.</p>
            {cams.list === null || cams.list.length === 0 ? null : (
              <section className="tipage__card tipage__rows">
                <CamList list={cams.list} picked={cams.picked} onPick={cams.pick} miles={miles} />
              </section>
            )}
          </>
        ) : t === 'buoys' ? (
          <BuoysTab venue={venue} placeName={placeName} timeZone={timeZone} units={units} />
        ) : null
      }
    </TapInPage>
  )
}
