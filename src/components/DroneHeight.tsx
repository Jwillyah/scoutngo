import type { HeightGrid } from '../core/droneHeight.ts'

/*
 * THE DRONE PAGE'S BY HEIGHT TAB (Batch DRONE, Section 2.2; Batch FIX,
 * Section 6.3: board Drone_Slim_2). Renders only: the grid, the headline and
 * its line are src/core/droneHeight.ts's.
 *
 * A short headline, one line under it, the grid and the legend. No cards:
 * they repeated Now's, and sat cut off behind the buttons.
 */
export interface DroneHeightData {
  /** "Calm all day", "Best 3–4:50 PM". */
  headline: string
  /** "6–9 kt from NNE at every height · limit 23". */
  sub: string
  grid: HeightGrid | null
  /** "kt by height". */
  label: string
  /** "your ceiling 100 ft", or null with no ceiling under 400 ft. */
  ceilingLabel: string | null
  /** The hour under each column: "now", "11a", "1p". */
  hourLabels: string[]
  /** One number per cell in the pilot's unit, rounded; "—" when the forecast does not say. */
  value: (mps: number | null) => string
  legend: { calm: string; near: string; over: string } | null
  none: string
}

export function DroneHeightView({ data }: { data: DroneHeightData }) {
  const g = data.grid
  const cols = g?.hours.length ?? 0
  const columns = `2.4em repeat(${Math.max(1, cols)}, minmax(0, 1fr))`
  return (
    <>
      <p className="drp__best" data-best>{data.headline}</p>
      <p className="drp__bestsub">{data.sub}</p>
      <section className="dcard drp__grid" aria-label={data.label}>
        <p className="dcard__label">
          {data.label}
          {data.ceilingLabel === null ? null : <span className="drp__ceilingk"> · {data.ceilingLabel}</span>}
        </p>
        {g === null || cols === 0 ? (
          <p className="drp__none">{data.none}</p>
        ) : (
          <div className="drp__table" role="table">
            {g.rows.map((row, r) => (
              <div key={row.ft} className={`drp__row${g.ceilingRow === r ? ' drp__row--ceiling' : ''}`} role="row" style={{ gridTemplateColumns: columns }}>
                <span className="drp__rowk" role="rowheader">{row.ft === 0 ? 'gnd' : row.ft}</span>
                {row.cells.map((c, i) => (
                  <span key={g.hours[i].getTime()} role="cell" className={`drp__cell drp__cell--${c.role}${g.sunsetCol === i ? ' drp__cell--sunset' : ''}`}>
                    {data.value(c.mps)}
                  </span>
                ))}
              </div>
            ))}
            <div className="drp__row drp__row--hours" role="row" style={{ gridTemplateColumns: columns }}>
              <span className="drp__rowk" />
              {data.hourLabels.map((h, i) => (
                <span key={`${h}${i}`} className="drp__hour num" role="columnheader">
                  {h}
                  {g.sunsetCol === i ? <b className="drp__sunsetk">sunset</b> : null}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      {data.legend === null ? null : (
        <p className="drp__legend num">
          <span className="drp__key drp__key--calm">{data.legend.calm}</span>
          <span className="drp__key drp__key--near">{data.legend.near}</span>
          <span className="drp__key drp__key--over">{data.legend.over}</span>
        </p>
      )}
    </>
  )
}
