import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { TideExtreme } from '../core/tide.ts'
import { bodyPosition } from '../core/sun.ts'
import { groundOf } from '../core/homeDay.ts'
import { fishModel, fishWeek, fishWeekHero } from '../lib/fishPage.ts'
import { fetchWeatherExtras, type Hourly } from '../lib/tideSheetData.ts'
import { useTide } from '../lib/useTide.ts'
import { useTideSheet } from '../lib/useTideSheet.ts'
import { useWaterTemp } from '../lib/waterTemp.ts'
import type { Units } from '../lib/units.ts'
import { TapInPage } from './TapInPage.tsx'
import { TideCurve } from './TideCurve.tsx'
import '../styles/tapin-surf.css'

/*
 * THE FISH PAGE (Batch SIMPLE-2, Section 4; board Page_Fish), on the tap-in
 * skeleton. Today: the next tide turn, moonrise and moonset, the tide curve
 * with its turns marked, rows Moon · Pressure · Water · Wind. Week: seven
 * days of moon and tide.
 *
 * No best window is drawn: the app computes none (src/lib/fishPage.ts says
 * why), and a window from nothing would be an invented one.
 */

export interface FishPageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  now: Date
  onBack: () => void
}

const NO_TURNS: readonly TideExtreme[] = []
const FISH_SAFETY_LINE = 'Forecasts can be wrong · look first'
const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
] as const

export function FishPage({ venue, placeName, timeZone, units, now, onBack }: FishPageProps) {
  const [tab, setTab] = useState<string>('today')
  const tide = useTide(venue, now)
  const data = useTideSheet(true, venue, tide.status === 'ok' ? tide.station.id : null, 'off')
  const water = useWaterTemp(venue)
  const [extra, setExtra] = useState<Hourly | null>(null)
  useEffect(() => {
    let live = true
    void fetchWeatherExtras(venue).then((x) => live && setExtra(x), () => undefined)
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const extremes = tide.status === 'ok' ? tide.predictions.extremes : NO_TURNS
  const facing = data.facing.value !== null && data.facing.value !== 'inland' ? data.facing.value.facing : null
  const model = useMemo(
    () => fishModel({ now, venue, timeZone, units, extremes, month: data.month.value, extra, wind: data.wind.value, facing, water: water.status === 'ok' ? water.reading : null }),
    [now, venue, timeZone, units, extremes, data.month.value, extra, data.wind.value, facing, water],
  )
  const week = useMemo(() => fishWeek(now, venue, timeZone, [...extremes, ...(data.month.value ?? [])]), [now, venue, timeZone, extremes, data.month.value])
  const weekHero = fishWeekHero(now, timeZone)
  const how = (
    <>
      <p>Tide: NOAA's predictions for the nearest station{tide.status === 'ok' ? `, ${tide.station.name}` : ''}; the turns are its own table.</p>
      <p>Moon: how much is lit, and when it rises and sets on this day, worked from the sun and moon positions here.</p>
      <p>Pressure and wind: Open-Meteo, by the hour; the trend is now against three hours ago, under 1 hPa is steady. Water: the nearest reading.</p>
      <p>No best fishing window is shown: this app does not work one out, and it will not draw one it cannot back.</p>
    </>
  )
  const week7 = tab === 'week'
  return (
    <TapInPage
      title="Fish"
      spot={placeName}
      ground={groundOf(bodyPosition('sun', now, venue.lat, venue.lon).altitude, null, false)}
      kind="tipage--fish dpage--fish"
      onBack={onBack}
      how={how}
      safety={FISH_SAFETY_LINE}
      tabs={TABS}
      initialTab="today"
      onTab={setTab}
      hero={week7 ? weekHero : { eyebrow: model.eyebrow, value: model.value, sub: model.sub }}
      chart={
        week7 ? (
          <ul className="fishweek" data-fish-week>
            {week.map((d) => (
              <li key={d.date} className="fishweek__day">
                <b>{d.label}</b>
                <span>{d.moon} moon</span>
                <span>{d.rise}–{d.set}</span>
                <span className="fishweek__tides">{d.tides.length === 0 ? 'tide not in the table yet' : d.tides.join(' · ')}</span>
              </li>
            ))}
          </ul>
        ) : tide.status === 'ok' ? (
          <TideCurve variant="chart" curve={tide.predictions.curve} from={model.window.from} to={model.window.to} timeZone={timeZone} now={now} marks={model.marks} band={model.best} label="The water level from two hours ago to twelve ahead, with now and each tide turn marked." />
        ) : (
          <p className="tcurve__none">{tide.status === 'no-station' ? 'No tide station near enough to draw the water here.' : tide.status === 'unavailable' ? tide.reason : 'Waiting for NOAA.'}</p>
        )
      }
      rows={week7 ? [] : model.rows}
    />
  )
}
