import { MIN_SECTORS, SECTOR_NAMES } from '../core/coverage.ts'
import type { PlanCoverage } from '../lib/plan.ts'

interface CoverageNoticeProps {
  planCoverage: PlanCoverage | null
}

const compass = (bearing: number) => `${Math.round(bearing)}°`

/**
 * What the plan covers, and what it does not.
 *
 * THE POINT OF THIS COMPONENT. Once the model was given the sun's bearing it
 * started returning six well lit positions on one bank of the river, every time.
 * A prompt line asking for spread did not hold. So the app measures the spread
 * itself, in src/core/coverage.ts, and says so here.
 *
 * It REPORTS, it does not reject. A venue with one accessible bank genuinely has
 * one accessible bank, and the shooter is the one who knows that. What the tool
 * must not do is accept a cluster in silence and let it read as a considered plan.
 *
 * It is also live: it reads from the planned positions, so dragging a position
 * across the river clears the warning, and dragging it back brings it home.
 */
export function CoverageNotice({ planCoverage }: CoverageNoticeProps) {
  if (planCoverage === null) return null
  const { coverage, rangeVariety } = planCoverage
  if (coverage.bearings.length === 0 && coverage.withoutBearing === 0) return null

  const sectors = coverage.occupiedSectors.map((i) => SECTOR_NAMES[i]).join(', ')
  const problems = [
    coverage.clustered,
    !coverage.hasOppositeSide,
    rangeVariety.allNearMaxStandoff,
  ].filter(Boolean).length

  return (
    <div className={`coverage${problems > 0 ? ' coverage--thin' : ''}`}>
      <p className="coverage__head">
        <span className="coverage__label">Coverage</span>
        <span className="num">
          {coverage.sectorCount} of 4 sectors · {compass(coverage.spreadDegrees)} spread
        </span>
      </p>

      <p className="coverage__sectors">
        Positions sit in <span className="num">{sectors}</span>. Measured from the
        subject outward, by the app, not claimed by the model.
      </p>

      {!coverage.clustered ? null : (
        <p className="coverage__warn">
          Clustered. These positions fall in {coverage.sectorCount}{' '}
          {coverage.sectorCount === 1 ? 'sector' : 'sectors'}, fewer than the{' '}
          {MIN_SECTORS} asked for. That is a plan that sees the event from one side.
          Drag a position around the subject, or generate again.
        </p>
      )}

      {coverage.hasOppositeSide ? null : (
        <p className="coverage__warn">
          Nothing on the far side. Every position is within 90° of the same
          direction
          {coverage.dominantBearing === null
            ? ''
            : `, around ${compass(coverage.dominantBearing)}`}
          . There is no reverse angle here, and no backlit option to weigh up.
        </p>
      )}

      {coverage.withoutBearing === 0 ? null : (
        <p className="coverage__sectors">
          <span className="num">{coverage.withoutBearing}</span>{' '}
          {coverage.withoutBearing === 1 ? 'position sits' : 'positions sit'} on the
          subject, so {coverage.withoutBearing === 1 ? 'it has' : 'they have'} no
          bearing from it and {coverage.withoutBearing === 1 ? 'is' : 'are'} not
          counted above. That is a legitimate wide shot, not an error.
        </p>
      )}

      {!rangeVariety.allNearMaxStandoff ? null : (
        <p className="coverage__warn">
          Every position is parked near its maximum standoff,{' '}
          <span className="num">{Math.round(rangeVariety.minMeters)}</span> to{' '}
          <span className="num">{Math.round(rangeVariety.maxMeters)}m</span>. No
          near work in this plan.
        </p>
      )}
    </div>
  )
}
