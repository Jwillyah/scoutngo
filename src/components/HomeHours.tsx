import { getPosition } from 'suncalc'
import { freshSky, skyCondition } from '../core/skyWord.ts'
import { formatShortHour } from '../core/timezone.ts'
import type { MetarSky } from '../core/metar.ts'
import { hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { formatTemperature, type Units } from '../lib/units.ts'
import { SkyIconSvg } from './SkyIconSvg.tsx'

/*
 * THE HOME'S EIGHT HOURS (Batch NOW, Section 3.1): the gap above "Next:"
 * becomes a slim strip, each hour its sky (the one sky word's icon,
 * src/core/skyWord.ts), its temperature and its chance of rain, from the
 * home's own forecast answer (no new question). It opens the Weather page.
 * The home drops it first when the page would scroll (Home.tsx's fit).
 */
export const HOME_HOURS = 8

export function HomeHours({ wx, now, venue, timeZone, units, obs, onOpen }: { wx: Hourly | null; now: Date; venue: { lat: number; lon: number }; timeZone: string; units: Units; obs: { sky?: MetarSky | null; visMi?: number | null; skyAt?: Date | null } | null; onOpen: () => void }) {
  if (wx === null) return null
  const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000
  const hours = Array.from({ length: HOME_HOURS }, (_, i) => new Date(start + i * 3_600_000))
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  return (
    <button type="button" className="hhours" data-home-hours onClick={onOpen} aria-label="The next eight hours: the weather">
      {hours.map((h, i) => {
        const t = new Date(h.getTime() + 1_800_000)
        const at = (n: string) => hourlyAt(wx, n, t)
        const cc = skyCondition({ code: at('weather_code'), layers: { low: at('cloud_cover_low'), mid: at('cloud_cover_mid'), high: at('cloud_cover_high') }, day: getPosition(t, venue.lat, venue.lon).altitude > -0.8, station: i === 0 ? freshSky(obs, now) : null })
        const rain = at('precipitation_probability')
        return (
          <span key={h.getTime()} className="hhours__h">
            <span className="hhours__at">{i === 0 ? 'Now' : formatShortHour(h, timeZone)}</span>
            {cc === null ? <span className="hhours__icon">—</span> : <SkyIconSvg icon={cc.icon} className="hhours__icon" />}
            <span className="hhours__t num">{deg(at('temperature_2m'))}</span>
            <span className="hhours__r num">{rain === null ? '—' : `${Math.round(rain)}%`}</span>
          </span>
        )
      })}
    </button>
  )
}
