import { useEffect, useRef, useState } from 'react'
import { classifyLighting } from '../core/lighting.ts'
import { getSunPosition } from '../core/sun.ts'
import { tideStateAt } from '../core/tide.ts'
import type { LatLon } from '../core/geo.ts'
import type { FieldPack } from '../lib/fieldPack.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import { useGeolocation } from '../lib/useGeolocation.ts'
import { useNow } from '../lib/useNow.ts'
import type { TideInfo } from '../lib/useTide.ts'
import { FieldCard } from './FieldCard.tsx'

interface FieldModeProps {
  plan: PlannedPosition[]
  venue: LatLon | null
  tide: TideInfo
  /** Non-null only when it was built for THIS plan. See lib/fieldPack.ts. */
  pack: FieldPack | null
  footer: React.ReactNode
}

/**
 * FIELD: one position at a time, on the day.
 *
 * SWIPE BY SCROLL SNAP, not by a gesture library. The pages are a horizontally
 * scrolling list with mandatory snapping, so the browser does the physics, it
 * works with a thumb, a trackpad and arrow keys alike, and there is no drag
 * handler anywhere that could be mistaken for something editable.
 *
 * EVERYTHING IS COMPUTED AT NOW. The lighting and the tide on these cards are
 * recomputed from the current clock every tick, not carried over from wherever
 * the scrubber was left. That is the difference between a plan and a briefing:
 * by the time anyone is standing here the sun has moved.
 */
export function FieldMode({ plan, venue, tide, pack, footer }: FieldModeProps) {
  const now = useNow()
  const gps = useGeolocation()
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)

  /* Sun at the current moment, from the same core the map uses. */
  const sunNow = venue === null ? null : getSunPosition(now, venue.lat, venue.lon)

  /*
   * Tide from the pack when there is one, because NOAA is not reachable at a
   * venue with no signal. Falls back to the live fetch, so forgetting to prepare
   * degrades rather than breaks.
   */
  const tideSource =
    pack?.tide ?? (tide.status === 'ok' ? tide.predictions : null)
  const tideNow =
    tideSource === null ? null : tideStateAt(tideSource.curve, tideSource.extremes, now)

  /** Cached ground view for a position, or undefined to fetch it lazily. */
  const cachedImage = (id: string): string | undefined => {
    const packed = pack?.positions.find((p) => p.id === id)
    return packed?.groundView.status === 'ok' ? packed.groundView.image : undefined
  }

  /* Which card is on screen, read from scroll position rather than tracked by hand. */
  useEffect(() => {
    const node = track.current
    if (node === null) return
    const onScroll = () => {
      const width = node.clientWidth
      if (width > 0) setIndex(Math.round(node.scrollLeft / width))
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  const go = (next: number) => {
    const node = track.current
    if (node === null) return
    const clamped = Math.min(plan.length - 1, Math.max(0, next))
    node.scrollTo({ left: clamped * node.clientWidth, behavior: 'smooth' })
  }

  if (plan.length === 0) {
    return (
      <div className="mode-field">
        <div className="page">
          <p className="notice">No positions yet. Generate a plan first.</p>
        </div>
        <div className="mode__foot">{footer}</div>
      </div>
    )
  }

  return (
    <div className="mode-field">
      <div className="fieldpager">
        <div className="fieldpager__track" ref={track}>
          {plan.map((planned, i) => (
            <div className="fieldpager__page" key={planned.position.id}>
              <FieldCard
                planned={planned}
                lightingNow={
                  sunNow === null
                    ? planned.lighting
                    : classifyLighting(planned.positionBearing, sunNow.azimuth)
                }
                tideNow={tideNow}
                gps={gps}
                cachedImage={cachedImage(planned.position.id)}
                active={i === index}
                index={i}
                total={plan.length}
              />
            </div>
          ))}
        </div>

        {/* Big targets, because swiping is hard with one hand on a controller. */}
        <div className="fieldpager__nav">
          <button
            type="button"
            className="fieldpager__btn"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous position"
          >
            ‹
          </button>
          <span className="fieldpager__dots" aria-hidden="true">
            {plan.map((p, i) => (
              <span
                key={p.position.id}
                className={`fieldpager__dot${i === index ? ' fieldpager__dot--on' : ''}`}
              />
            ))}
          </span>
          <button
            type="button"
            className="fieldpager__btn"
            onClick={() => go(index + 1)}
            disabled={index === plan.length - 1}
            aria-label="Next position"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mode__foot">{footer}</div>
    </div>
  )
}
