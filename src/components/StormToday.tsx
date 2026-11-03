import type { LatLon } from '../core/geo.ts'
import { lightningLine } from '../core/lightning.ts'
import { clearingLight, rainbowWindow, shelfLikely, sunAltitude } from '../core/shooterStorm.ts'
import { cellLine } from '../core/stormCells.ts'
import { formingLine, formingWhy } from '../core/stormForming.ts'
import { formatClock } from '../core/timezone.ts'
import { useCoast } from '../lib/coastData.ts'
import type { StormPlay } from '../lib/useStormPlay.ts'
import type { Units } from '../lib/units.ts'
import { RadarStrip } from './RadarStrip.tsx'

/*
 * STORMS ON TODAY (Batch K addendum, B). When storms are in play (a cell
 * over you or coming within 90 minutes, or the models' storm line for
 * today), Today says so: the verdict's line explains the storm, then three
 * cards: STORMS (the SPC's risk, the cell, lightning and its age, a mini
 * radar), AFTER THE STORM (when it clears, a rainbow and where, the sunset
 * under the departing anvil), WATER (the rip current risk and the marine
 * forecast at the coast). Facts, never advice (rule 28).
 */
export function StormCards({ play, venue, timeZone, units, onRadar, beachWind = null }: { play: StormPlay; venue: LatLon; timeZone: string; units: Units; onRadar: () => void; beachWind?: string | null }) {
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  const clock = (d: Date) => formatClock(d, timeZone)
  const scanAt = play.now?.radar?.scanAt ?? new Date()
  const spc = play.risk?.spc.outlook?.[0] ?? null
  const bolt = play.now?.strikes == null ? null : lightningLine(venue, play.now.strikes, dist, clock)
  const clearing = clearingLight(venue, play.calls, scanAt)
  const bow = rainbowWindow(venue, play.calls, scanAt)
  const shelf = shelfLikely(play.calls, scanAt)
  const { coast } = useCoast(venue, null, dist, true)
  return (
    <>
      <div className="bcard bstorms">
        <div className="bcard__head">
          <span className="bcard__title">Storms</span>
          {spc === null ? null : <span className="bstorms__spc">SPC {spc.word}</span>}
        </div>
        {play.coming !== null ? (
          <p className="bline num">{cellLine(play.coming, { dist, clock })}</p>
        ) : play.forming !== null ? (
          <p className="bline num" data-forming>
            {formingLine(play.forming, dist)}
            {formingWhy(play.forming, dist, clock) === null ? null : <span className="bline--sub"> · {formingWhy(play.forming, dist, clock)}</span>}
          </p>
        ) : play.storm === null ? null : (
          <p className="bline">{play.storm}</p>
        )}
        <p className="bline bline--sub num">{bolt ?? 'No lightning in the last hour'}{shelf === null ? '' : ` · shelf cloud possible, from the ${shelf.look}`}</p>
        <RadarStrip venue={venue} radar={play.now?.radar ?? null} timeZone={timeZone} dist={dist} onOpen={onRadar} />
      </div>
      <div className="bcard bafter">
        <div className="bcard__head">
          <span className="bcard__title">After the storm</span>
        </div>
        {clearing === null ? <p className="bline">No clearing before sunset on the cells&rsquo; tracks.</p> : <p className="bline num">Clears by {clock(clearing.clears)} · sunset {clock(clearing.sunset)} under the departing anvil · fire possible toward the {clearing.look}</p>}
        {bow === null ? null : <p className="bline num">Rainbow possible {clock(bow.from)}–{clock(bow.to)}, toward the {bow.look}, sun {Math.round(sunAltitude(bow.from, venue))}° up</p>}
      </div>
      {(coast === null || (coast.rip === null && coast.marine === null)) && beachWind === null ? null : (
        <div className="bcard bwater">
          <div className="bcard__head">
            <span className="bcard__title">Water</span>
          </div>
          {beachWind === null ? null : <p className="bline num" data-beach-wind>{beachWind}</p>}
          {coast?.rip == null ? null : <p className="bline">{coast.rip}{coast.surf === null ? '' : ` · surf ${coast.surf}`}</p>}
          {coast?.marine == null ? null : <p className="bline bline--sub">{coast.marine.text.split(/(?<=\.)\s/).slice(0, 2).join(' ')} (NWS, {coast.marine.zone})</p>}
        </div>
      )}
    </>
  )
}
