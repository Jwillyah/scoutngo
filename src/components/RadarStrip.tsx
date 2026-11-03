import type { LatLon } from '../core/geo.ts'
import { latLonPixel } from '../core/stormCells.ts'
import { rainNearLine } from '../core/weatherWords.ts'
import { formatClock } from '../core/timezone.ts'
import type { Radar } from '../lib/stormData.ts'
import { radarTemplate } from '../lib/radarLayer.ts'

/*
 * THE LIVE RADAR STRIP (Batch K addendum, A6): the real map round the venue
 * with the radar composite on it, a wide window about 700 km across at zoom
 * 6, the venue marked; "live · 1:30 PM", the nearest rain and its motion,
 * and a door to the main map with the Radar layer on. The tiles are the
 * same map cells the map asks for: nothing about you.
 */
const Z = 6
const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'
export const STRIP_W = 358
export const STRIP_H = 76
/** On a storm day the strip gives up height to the storm line (Batch L): the Weather tab is one screen. */
export const STRIP_H_SHORT = 52

export function RadarStrip({ venue, radar, timeZone, dist, onOpen, short = false }: { venue: LatLon; radar: Radar | null; timeZone: string; dist: 'mi' | 'km'; onOpen: () => void; short?: boolean }) {
  const H = short ? STRIP_H_SHORT : STRIP_H
  const v = latLonPixel(Z, venue)
  /* The strip's top-left in global pixels, the venue in its middle. */
  const x0 = v.gx - STRIP_W / 2
  const y0 = v.gy - H / 2
  const tiles: { x: number; y: number }[] = []
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty += 1) for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + STRIP_W) / 256); tx += 1) tiles.push({ x: tx, y: ty })
  const radarUrl = radar === null ? null : radarTemplate(radar.scanAt)
  const line = radar === null ? 'Radar did not answer.' : rainNearLine(radar.nearRain, radar.flowToDeg, dist) ?? `no rain within ${dist === 'mi' ? '450 mi' : '700 km'}`
  return (
    <button type="button" className={`rstrip${short ? ' rstrip--short' : ''}`} onClick={onOpen} aria-label={`Radar: ${line}. Open on the map`}>
      <span className="rstrip__map" aria-hidden="true">
        {tiles.map((t) => (
          <span key={`${t.x}/${t.y}`} className="rstrip__tile" style={{ left: t.x * 256 - x0, top: t.y * 256 - y0 }}>
            <img src={`${IMAGERY}/${Z}/${t.y}/${t.x}`} alt="" loading="lazy" />
            {radarUrl === null ? null : <img className="rstrip__radar" src={radarUrl.replace('{z}', String(Z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))} alt="" loading="lazy" />}
          </span>
        ))}
        <i className="rstrip__you" />
      </span>
      <span className="rstrip__text">
        <span className="rstrip__live num">{radar === null ? 'radar' : `live · ${formatClock(radar.scanAt, timeZone)}`}</span>
        <span className="rstrip__line">{line}</span>
        <span className="rstrip__open">Open on the map ›</span>
      </span>
    </button>
  )
}
