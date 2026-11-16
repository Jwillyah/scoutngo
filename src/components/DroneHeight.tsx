import type { HeightGrid } from '../core/droneHeight.ts'
import { DroneCards, type DroneCardsData } from './DroneNow.tsx'

/*
 * THE DRONE PAGE'S BY HEIGHT TAB (Batch DRONE, Section 2.2; board Drone_P2).
 * Renders only: the grid is src/core/droneHeight.ts's.
 */
export interface DroneHeightData {
  headline: string
  sub: string
  grid: HeightGrid | null
  /** "Wind by height · kt · from NNW". */
  label: string
  ceilingLabel: string | null
  /** The hour under each column: "now", "11", "1p". */
  hourLabels: string[]
  /** One number per cell in the pilot's unit, rounded; "—" when the forecast does not say. */
  value: (mps: number | null) => string
  legend: { calm: string; near: string; over: string } | null
  none: string
}

export function DroneHeightView({ data, cards, onAirspace }: { data: DroneHeightData; cards: DroneCardsData; onAirspace: () => void }) {
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
      <DroneCards cards={cards} onAirspace={onAirspace} />
    </>
  )
}
