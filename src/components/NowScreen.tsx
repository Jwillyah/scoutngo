import { useCallback, useEffect, useState } from 'react'
import { summariseSightline, type SightlineCloud } from '../core/cloud.ts'
import type { LatLon } from '../core/geo.ts'
import { icsFilename, peakEventIcs } from '../core/ics.ts'
import {
  glanceHeadline,
  nowGlance,
  timeLeftWords,
  type NowGlance,
} from '../core/nowGlance.ts'
import {
  MAX_METERS,
  OPEN_GROUND_CAVEAT,
  nearestOpenGround,
  openGroundSentence,
  type OpenGroundHit,
} from '../core/openGround.ts'
import { skyLine } from '../core/skyLine.ts'
import { formatClock, venueTimeZone } from '../core/timezone.ts'
import { fetchSightlineCloud } from '../lib/forecast.ts'
import { LOCATE_MESSAGE, locateOnce, type LocateResult } from '../lib/locateOnce.ts'
import { fetchOpenGround } from '../lib/openGroundQuery.ts'

interface NowScreenProps {
  onClose: () => void
  /** Drops into Setup with this coordinate as the pin and today already set. */
  onPlanHere: (at: LatLon) => void
}

/** Everything the screen needs, or the reason it has none of it. */
type Ask =
  | { state: 'idle' }
  | { state: 'asking' }
  | { state: 'refused'; message: string }
  | { state: 'located'; at: LatLon }

const MILES_SEARCHED = MAX_METERS / 1609.344

/**
 * THE NOW SCREEN.
 *
 * WHY IT EXISTS. Every other screen needs a pin, a date and a window before it
 * will say anything, which is right for planning a week out and useless at the
 * moment this is for: driving, the sky goes off, and there are about two
 * seconds to decide whether to pull over.
 *
 * WHAT IT IS NOT. No map, no scrubber, no setup, nothing to scroll. Six lines
 * in a fixed order, largest first, read while stopped. The order is the whole
 * design: how long have I got, which way do I look, when is the peak, what is
 * the sky doing, where can I stand.
 *
 * NO DEGREES ANYWHERE ON IT. "Look west-southwest" is something you can act on
 * at a windscreen; "look 254.1 degrees" needs a compass app and thirty seconds
 * nobody has. The degrees are the receipt and they belong in the planner.
 *
 * IT ASKS FOR A LOCATION ON A TAP AND KEEPS NOTHING. Same rule as everywhere
 * else: the coordinate comes from the browser when somebody presses the
 * button, is used, and is gone on close. Never an IP lookup, never stored.
 *
 * IT IS A DOOR, NOT A DEAD END. PLAN THIS SPOT carries the coordinate into
 * Setup with today's date already set, so the glance becomes a plan without
 * typing anything.
 */
export function NowScreen({ onClose, onPlanHere }: NowScreenProps) {
  const [ask, setAsk] = useState<Ask>({ state: 'idle' })
  const [tick, setTick] = useState(() => new Date())
  const [cloud, setCloud] = useState<SightlineCloud | null>(null)
  const [ground, setGround] = useState<{ hit: OpenGroundHit | null; answered: boolean }>({
    hit: null,
    answered: false,
  })
  const [groundProblem, setGroundProblem] = useState<string | null>(null)

  /*
   * THE CLOCK, ONCE A MINUTE.
   *
   * The headline is a countdown in whole minutes, so a per-second timer would
   * re-render sixty times for fifty-nine identical screens. A minute is also
   * the resolution of the answer: nothing here is worth knowing to the second.
   */
  useEffect(() => {
    const timer = setInterval(() => setTick(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const locate = useCallback(() => {
    setAsk({ state: 'asking' })
    void locateOnce().then((result: LocateResult) => {
      if (result.status === 'ok') {
        setAsk({ state: 'located', at: result.at })
        setTick(new Date())
      } else {
        setAsk({ state: 'refused', message: LOCATE_MESSAGE[result.status] })
      }
    })
  }, [])

  const at = ask.state === 'located' ? ask.at : null
  const glance: NowGlance | null = at === null ? null : nowGlance(at, tick)
  const bearing = glance?.look?.bearing ?? null

  /*
   * THE SKY, ALONG THE BEARING THE SUN IS ON.
   *
   * Keyed on the rounded bearing rather than the glance, so the forecast is
   * fetched once rather than every time the minute ticks over.
   */
  const bearingKey = bearing === null ? null : Math.round(bearing)
  useEffect(() => {
    if (at === null || bearingKey === null) return
    const zone = venueTimeZone(at.lat, at.lon)
    if (zone === null) return
    let live = true
    void fetchSightlineCloud([{ id: 'now', from: at, bearing: bearingKey }], new Date(), zone).then(
      (result) => {
        if (!live) return
        setCloud(
          result.status === 'ok' && result.sightlines[0] !== undefined
            ? result.sightlines[0].cloud
            : /* Not a clear sky: summariseSightline turns nothing into nulls. */
              summariseSightline([]),
        )
      },
      () => {
        if (live) setCloud(summariseSightline([]))
      },
    )
    return () => {
      live = false
    }
  }, [at, bearingKey])

  /* Somewhere to stand, in roughly that direction. */
  useEffect(() => {
    if (at === null || bearingKey === null) return
    let live = true
    void fetchOpenGround(at).then(
      (result) => {
        if (!live) return
        if (result.status === 'ok') {
          setGround({ hit: nearestOpenGround(at, bearingKey, result.candidates), answered: true })
          setGroundProblem(null)
        } else {
          setGround({ hit: null, answered: false })
          setGroundProblem(result.reason)
        }
      },
      () => {
        if (!live) return
        setGround({ hit: null, answered: false })
        setGroundProblem('Overpass did not answer.')
      },
    )
    return () => {
      live = false
    }
  }, [at, bearingKey])

  const zone = at === null ? null : venueTimeZone(at.lat, at.lon)
  const clock = (when: Date) =>
    zone === null ? `${formatClock(when, 'UTC')} UTC` : formatClock(when, zone)

  /*
   * TOMORROW'S PEAK AS A FILE, built on the device and handed over once.
   *
   * A Blob and an object URL rather than a subscription feed: a feed would
   * mean a URL on a server that answers with this person's location and times
   * on a schedule, which is exactly the thing this app does not do.
   */
  const downloadIcs = useCallback(() => {
    if (at === null) return
    const tomorrow = new Date(tick.getTime() + 86_400_000)
    const ahead = nowGlance(at, tomorrow)
    if (ahead.peak === null) return

    const file = peakEventIcs({
      from: ahead.peak.from,
      to: ahead.peak.to,
      bearing: ahead.look?.bearing ?? null,
      stamp: new Date(),
      uid: `peak-${ahead.peak.from.toISOString().slice(0, 10)}@scoutngo`,
    })
    const url = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = icsFilename(ahead.peak.from)
    link.click()
    URL.revokeObjectURL(url)
  }, [at, tick])

  return (
    <div className="now" role="dialog" aria-modal="true" aria-label="Now">
      <button type="button" className="now__close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      {at === null || glance === null ? (
        <div className="now__ask">
          <h1 className="now__askhead">What is the sky doing?</h1>
          <p className="now__askwhy">
            This needs your location to answer. It is used on this device and not stored, not
            sent to any account, and never guessed from your network.
          </p>
          <button
            type="button"
            className="now__go"
            onClick={locate}
            disabled={ask.state === 'asking'}
          >
            {ask.state === 'asking' ? 'Asking…' : 'Use my location'}
          </button>
          {ask.state === 'refused' ? <p className="now__refused">{ask.message}</p> : null}
        </div>
      ) : (
        <div className="now__sheet">
          {/*
            * ONE: HOW LONG HAVE I GOT. The largest thing on the screen,
            * because it is the only line that has to survive a one second
            * glance.
            */}
          <p className="now__head">{glanceHeadline(glance)}</p>

          {/*
            * TWO: WHICH WAY. In words. There is no bearing on this screen at
            * all, by design.
            */}
          {glance.look === null ? null : (
            <p className="now__look">Look {glance.look.word}.</p>
          )}

          {/* THREE: when the light concentrates, and when to be standing there. */}
          {glance.peak === null ? (
            <p className="now__peak now__peak--none">
              No blue hour band today at this latitude.
            </p>
          ) : (
            <p className="now__peak">
              Peak light {clock(glance.peak.from)} to {clock(glance.peak.to)}.
            </p>
          )}

          {timeLeftWords(glance, tick) === null ? null : (
            <p className="now__left">{timeLeftWords(glance, tick)}</p>
          )}

          {/* FOUR: what the sky is doing. Hedged, and never a score. */}
          <p className="now__sky">{cloud === null ? 'Reading the cloud…' : skyLine(cloud)}</p>

          {/*
            * FIVE: SOMEWHERE TO STAND. "Open ground", never "clear view": the
            * app cannot see the treeline on the far side of a mapped field.
            * And it does not go quiet when nothing is mapped, because silence
            * would read as a statement about the ground.
            */}
          <p className="now__ground">
            {groundProblem !== null
              ? `Could not ask what is open nearby: ${groundProblem}`
              : !ground.answered
                ? 'Looking for open ground that way…'
                : openGroundSentence(ground.hit, MILES_SEARCHED)}
          </p>
          {ground.hit === null ? null : (
            <p className="now__caveat">{OPEN_GROUND_CAVEAT}</p>
          )}

          <div className="now__acts">
            {/* The door into the app. Carries the coordinate and today's date. */}
            <button type="button" className="now__go" onClick={() => onPlanHere(at)}>
              Plan this spot
            </button>

            {/*
              * TOMORROW, AS A FILE. Labelled as a reminder rather than a
              * forecast on the button itself, not only inside the file, so
              * nobody taps it expecting a prediction.
              */}
            <button type="button" className="now__second" onClick={downloadIcs}>
              Remind me tomorrow
            </button>
            <p className="now__icsnote">
              Downloads a calendar file for tomorrow’s peak window. A reminder to look, not a
              prediction: nothing here knows tomorrow’s sky.
            </p>
          </div>

          <p className="now__stamp">
            {clock(tick)}
            {zone === null ? '' : ' local'} · this location is not stored
          </p>
        </div>
      )}
    </div>
  )
}
