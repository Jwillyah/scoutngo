import { horizonInFrame, projectSky } from '../core/sunSky.ts'
import type { SkyFrame } from '../lib/skyFrame.ts'

interface SunInSkyProps {
  frame: SkyFrame | null
}

/**
 * THE SUN, DRAWN WHERE IT IS.
 *
 * Not a bearing on the ground: the actual disc, at its computed azimuth AND
 * altitude, in the sky above the terrain, moving as the scrubber moves and
 * going behind a ridge when it goes behind a ridge. An altitude has nowhere to
 * live on a flat map, which is the whole reason the terrain is worth having.
 *
 * WHAT IT DOES NOT DO.
 *
 *   It draws NOTHING when there is no sky in frame. Below about 72 degrees of
 *   pitch the horizon is above the top edge, so a sun would be painted onto a
 *   patch of ground while implying an altitude the view cannot show. A flat
 *   map at least makes no claim.
 *
 *   It draws nothing when the sun is BELOW the horizon. There is no sun in the
 *   sky at blue hour and drawing one would contradict the band the app is
 *   simultaneously telling you about.
 *
 *   It says the terrain is in the way only when the DEM ANSWERED. 'unknown' is
 *   drawn as an ordinary sun with no claim attached, because the alternative is
 *   implying a clear line of sight the app has not checked.
 */
export function SunInSky({ frame }: SunInSkyProps) {
  if (frame === null) return null
  /* No sky on screen, nothing to put in it. */
  if (!horizonInFrame(frame)) return null
  /* The sun is down. The bands say so; a disc would contradict them. */
  if (frame.sunAltitude <= 0) return null

  const at = projectSky(frame.sunAzimuth, frame.sunAltitude, frame)
  if (!at.inFront) return null

  /*
   * CLAMPED TO THE EDGE RATHER THAN HIDDEN when it is off frame but in front.
   *
   * "The sun is up and to the left, outside the view" is useful: it tells you
   * which way to rotate. Dropping it entirely would make a rotating map look
   * like the sun had set.
   */
  const margin = 18
  const offFrame = !at.onScreen
  const x = Math.min(Math.max(at.x, margin), frame.width - margin)
  const y = Math.min(Math.max(at.y, margin), frame.height - margin)

  const behind = frame.visibility === 'behind-terrain'

  return (
    <div
      className={`sunsky${behind ? ' sunsky--behind' : ''}${offFrame ? ' sunsky--off' : ''}`}
      style={{ left: `${x}px`, top: `${y}px` }}
      aria-hidden="true"
    >
      <span className="sunsky__disc" />
      {/*
        * THE ONE WORD THAT IS NOT DECORATION. A sun behind a ridge still has
        * an azimuth and an altitude, and the thing worth knowing is that you
        * cannot see it from here. Only said when the DEM actually answered.
        */}
      {behind ? <span className="sunsky__tag">Behind the ridge</span> : null}
    </div>
  )
}
