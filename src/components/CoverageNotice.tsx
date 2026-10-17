import { Receipt } from '../lib/numerals.tsx'
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
          {coverage.sectorCount} of 4 sectors
          <Receipt kind="bearing"> · {compass(coverage.spreadDegrees)} spread</Receipt>
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
          {coverage.dominantBearing === null ? null : (
            <Receipt kind="bearing">, around {compass(coverage.dominantBearing)}</Receipt>
          )}
          . There is no reverse angle here, and no backlit option to weigh up.
        </p>
      )}

      {/*
        * POSITIONS WITH NO BEARING, counted rather than dropped.
        *
        * Two reasons now reach here and they are deliberately said the same
        * way, because they are the same fact: standing on the subject, and
        * being a top-down or a 360. Neither has a direction from the subject,
        * so neither can cover a sector, and neither is an error. The wording
        * no longer claims they are all sitting on the subject, which stopped
        * being true when shot types arrived.
        */}
      {coverage.withoutBearing === 0 ? null : (
        <p className="coverage__sectors">
          <span className="num">{coverage.withoutBearing}</span>{' '}
          {coverage.withoutBearing === 1 ? 'position has' : 'positions have'} no bearing
          from the subject, either sitting on top of it or shooting top-down or 360, so{' '}
          {coverage.withoutBearing === 1 ? 'it is' : 'they are'} not counted above. Those
          are legitimate shots, not errors.
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
