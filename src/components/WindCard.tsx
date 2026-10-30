import type { LevelWind } from '../core/windProfile.ts'
import type { Wind } from '../core/upwind.ts'
import { formatWind, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { Card, CardHeadline, CardJudgement, CardSource } from './Card.tsx'

/*
 * THE WIND CARD.
 *
 * WHAT DECIDES SOMETHING HERE IS THE PROFILE, NOT THE GROUND READING. Every
 * other weather app shows the wind at 10 m. The aircraft is at 120 m, where
 * it is routinely half as much again and from a different direction --
 * measured at Lynnhaven across seven mornings: 1.2x to 2.3x, turning by up to
 * 49 degrees. See measurements/2026-10-18-lynnhaven-wind-profile.md.
 *
 * THE BARS ARE THE CARD. Three heights, each with its number, each coloured
 * by whether it is over the aircraft's published rating. A shooter reads
 * which bar crosses the line, not a paragraph about shear.
 *
 * AND THE JUDGEMENT IS STATED ONCE AND HANDED BACK. The app says the rating
 * and the reading. It does not say whether to fly.
 */

interface WindCardProps {
  wind: Wind | null
  levels: readonly LevelWind[]
  gustMps: number | null
  /** The aircraft's published limit, or null with nothing in the air. */
  ratedWindMps: number | null
  ratedWindSource: string
  /** When the reading is for. */
  atLabel: string | null
  units: Units
  onClose: () => void
  onAbout?: () => void
  /** Opens the Wind page: five models, three heights, the next 24 hours, measured now. */
  onModels?: () => void
}

/** The three heights worth drawing: the ground, and the two a drone works at. */
const SHOWN_METERS = [120, 60, 10] as const

const HEIGHT_LABEL: Record<number, string> = {
  120: '400 ft',
  60: '200 ft',
  10: 'ground',
}

export function WindCard({
  wind,
  levels,
  gustMps,
  ratedWindMps,
  ratedWindSource,
  atLabel,
  units,
  onClose,
  onAbout,
  onModels,
}: WindCardProps) {
  const ground = wind?.speedMps ?? null

  /*
   * THE SCALE IS THE WORST READING OR THE RATING, whichever is larger, so a
   * bar that crosses the limit is visibly past it rather than merely long.
   */
  const readings = SHOWN_METERS.map((m) => {
    const level = levels.find((l) => l.heightMeters === m)
    return { meters: m, speedMps: level?.speedMps ?? (m === 10 ? ground : null) }
  })
  const worst = readings.reduce((acc, r) => Math.max(acc, r.speedMps ?? 0), 0)
  const scale = Math.max(worst, ratedWindMps ?? 0, 1)

  const over = readings.filter(
    (r) => ratedWindMps !== null && r.speedMps !== null && r.speedMps > ratedWindMps,
  )
  const under = readings.filter(
    (r) => ratedWindMps !== null && r.speedMps !== null && r.speedMps <= ratedWindMps,
  )

  return (
    <Card title="Wind" at={atLabel} onAbout={onAbout} onClose={onClose}>
      <CardHeadline
        value={ground === null ? '—' : String(Math.round(windIn(ground, units.wind) ?? 0))}
        unit={
          ground === null
            ? 'the forecast did not say'
            : `${windUnitLabel(units.wind)}${wind?.fromDegrees === null || wind?.fromDegrees === undefined ? '' : ` from ${Math.round(wind.fromDegrees)}°`}`
        }
        note={gustMps === null ? null : `Gusting ${formatWind(gustMps, units.wind)} at the surface`}
        tone={gustMps === null ? 'plain' : 'warn'}
      />

      <p className="card2__eyebrow">By altitude</p>
      <div className="bars">
        {readings.map((reading) => {
          const value = windIn(reading.speedMps, units.wind)
          const share = reading.speedMps === null ? 0 : (reading.speedMps / scale) * 100
          const state =
            ratedWindMps === null || reading.speedMps === null
              ? 'plain'
              : reading.speedMps > ratedWindMps
                ? 'over'
                : reading.speedMps > ratedWindMps * 0.85
                  ? 'near'
                  : 'under'
          return (
            <div className="bars__row" key={reading.meters}>
              <span className="bars__at">{HEIGHT_LABEL[reading.meters] ?? `${reading.meters} m`}</span>
              <span className="bars__track" aria-hidden="true">
                <span className={`bars__fill bars__fill--${state}`} style={{ width: `${share}%` }} />
              </span>
              <span className={`bars__value bars__value--${state} num`}>
                {value === null ? '—' : Math.round(value)}
              </span>
            </div>
          )
        })}
      </div>

      {/*
        * THE ONE JUDGEMENT. Only when there is an aircraft to judge: a Part
        * 107 limit printed beside a tripod is a rule attached to something it
        * does not govern.
        */}
      {ratedWindMps === null ? null : (
        <CardJudgement
          rule={`Rated to ${formatWind(ratedWindMps, units.wind)}`}
          detail={
            over.length === 0
              ? 'Under the limit at every height here. Yours is the judgement.'
              : under.length === 0
                ? 'Over the limit at every height here. Yours is the judgement.'
                : `Over the limit at ${over
                    .map((r) => HEIGHT_LABEL[r.meters] ?? `${r.meters} m`)
                    .join(' and ')}, under it at ${under
                    .map((r) => HEIGHT_LABEL[r.meters] ?? `${r.meters} m`)
                    .join(' and ')}. Yours is the judgement.`
          }
          tone={over.length === 0 ? 'plain' : 'warn'}
        />
      )}

      <CardSource>
        {ratedWindMps === null
          ? 'Open-Meteo, 10 m and 180 m levels, interpolated.'
          : `Open-Meteo, 10 m and 180 m levels, interpolated. Rating: ${ratedWindSource}.`}
      </CardSource>
      {onModels === undefined ? null : (
        <button type="button" className="btn btn--small windc__models" onClick={onModels}>
          Five models, the next 24 hours
        </button>
      )}
    </Card>
  )
}
