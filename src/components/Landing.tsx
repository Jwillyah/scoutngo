import { useMemo, useState } from 'react'
import { CALIBRATION_VENUE, resolveWindow } from '../lib/venue.ts'
import { getSunPosition } from '../core/sun.ts'
import { phaseAt, phaseSpans } from '../core/nightWindow.ts'
import { ESRI_ATTRIBUTION } from './MapView.tsx'
import { TimeScrubber } from './TimeScrubber.tsx'
import { HowPage } from './HowPage.tsx'

/**
 * THE COVER. FIVE ELEMENTS AND TWO QUIET LINES.
 *
 *   the eyebrow        top-left, over the map
 *   the wordmark
 *   the headline
 *   the frame          full bleed, behind all of it
 *   one button
 *
 * plus the link under the headline and the licence line under the button.
 *
 * NOT A CARD ON A PAGE. The render IS the page: edge to edge, no frame, no
 * border, no rounded corner. A scrim rises from the bottom and the copy sits
 * on it. The old cover put a bordered figure in the middle of a scrolling
 * column of sections, which is a web page about an app; this is the app with
 * its name on it.
 *
 * EVERYTHING ELSE MOVED TO /how AND NOTHING WAS DELETED. The three stages, the
 * computed rule, the privacy rule, the build hash and the line about Settings
 * are all on that page, longer than they were here. A cover page that has to
 * be scrolled is not a cover page.
 *
 * THE SCRUBBER IS THE SEAM. It is the control the shooter touches more than
 * any other, it is the one piece of the app that is legible with no context
 * at all -- a bar of twilight with a time on it -- and it sits exactly where
 * the picture stops and the words start. It is REAL: the window, the bands and
 * the sun are computed for the venue in the frame, and dragging it moves the
 * time. Nothing on this page is a picture of a control.
 */
export function Landing({ onDismiss }: { onDismiss: () => void }) {
  const [view, setView] = useState<'cover' | 'how'>(() =>
    typeof window !== 'undefined' && window.location.pathname === '/how' ? 'how' : 'cover',
  )

  const show = (next: 'cover' | 'how') => {
    setView(next)
    /*
     * A REAL URL, so the link is shareable and the back button works. There is
     * no router in this app and adding one for two views would be a dependency
     * to carry forever; pushState is the whole of what is needed.
     */
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', next === 'how' ? '/how' : '/')
    }
  }

  if (view === 'how') {
    return <HowPage onBack={() => show('cover')} />
  }

  return <Cover onDismiss={onDismiss} onHow={() => show('how')} />
}

function Cover({ onDismiss, onHow }: { onDismiss: () => void; onHow: () => void }) {
  /*
   * THE SCRUBBER'S INPUTS ARE COMPUTED, not faked.
   *
   * The venue in the frame is the calibration venue, so the window, the sun
   * and the twilight bands on this bar are the real arithmetic for that place
   * on that date. There is no network here and no stored state: it is
   * src/core, given a coordinate and a clock.
   */
  const venueWindow = useMemo(() => resolveWindow(CALIBRATION_VENUE), [])
  const [scrub, setScrub] = useState(0.5)

  const at = useMemo(() => {
    if (venueWindow === null) return null
    const span = venueWindow.end.getTime() - venueWindow.start.getTime()
    return new Date(venueWindow.start.getTime() + span * scrub)
  }, [venueWindow, scrub])

  const sun = useMemo(
    () =>
      venueWindow === null || at === null
        ? null
        : getSunPosition(at, venueWindow.lat, venueWindow.lon),
    [venueWindow, at],
  )

  const bands = useMemo(
    () =>
      venueWindow === null
        ? []
        : phaseSpans(venueWindow.start, venueWindow.end, venueWindow.lat, venueWindow.lon),
    [venueWindow],
  )

  return (
    <div className="cover">
      {/*
        * THE FRAME, FULL BLEED AND BEHIND EVERYTHING.
        *
        * A real screenshot of this app: 3D with terrain on, two positions on
        * different glass with their coverage cones, the sun ray and the shadow
        * ray, and one hazard mark. Made by scripts/make-cover-frame.mjs, which
        * drives the app's own controls and photographs the result. It is not
        * drawn, not composited and not a mock-up in CSS -- the previous cover
        * was the last of those and that is exactly why it was replaced.
        *
        * aria-hidden with an empty alt: the page says everything this picture
        * says, in words, immediately below it.
        */}
      <img className="cover__frame" src="/cover-frame.jpg" alt="" aria-hidden="true" />

      {/* The scrim. Transparent over the plan, solid under the words. */}
      <div className="cover__scrim" aria-hidden="true" />

      <p className="cover__eyebrow">Sun · light · distance, computed</p>

      <div className="cover__copy">
        <h1 className="cover__name">ScoutNGo</h1>
        <p className="cover__head">Plan a shoot at a place you have never stood in.</p>

        <p className="cover__moreline">
          <button type="button" className="cover__more" onClick={onHow}>
            How it computes, and what leaves the device
          </button>
        </p>

        {/*
          * THE SEAM. Above the attribution, below the words, and real.
          */}
        {venueWindow === null || at === null || sun === null ? null : (
          <div className="cover__scrub">
            <TimeScrubber
              start={venueWindow.start}
              end={venueWindow.end}
              value={scrub}
              onChange={setScrub}
              at={at}
              sun={sun}
              timeZone={venueWindow.timeZone}
              timeZoneAbbr={venueWindow.timeZoneShort}
              tideExtremes={[]}
              phases={bands}
              phase={phaseAt(at, venueWindow.lat, venueWindow.lon)}
              flying={{ airPositions: 0, dronePlatform: false }}
            />
          </div>
        )}

        <p className="cover__attrib">
          An example venue, not your location. {ESRI_ATTRIBUTION}
        </p>

        <button type="button" className="cover__go" onClick={onDismiss}>
          Open the map
        </button>
        <p className="cover__licence">Free · open source · no account</p>
      </div>
    </div>
  )
}
