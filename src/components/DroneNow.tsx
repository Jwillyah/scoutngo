import type { ReactNode } from 'react'
import type { DayBars, LimitChip } from '../core/droneNow.ts'
import type { DialRead } from '../core/calmDial.ts'

/*
 * THE DRONE PAGE'S NOW TAB (Batch DRONE, Section 2.1; Batch FIX, Section 6.2:
 * board Drone_Slim_1). Renders only: every number and word comes from
 * src/core (droneNow.ts, droneAirRead.ts) through DronePage.tsx.
 *
 *   the number, "from NNE · gusts 11 · at 400 ft", the compass
 *   ONE chip: teal under the limit, orange only for limit or gust trouble
 *   today's bars at 400 ft
 *   four one-line rows: Airspace (a button to the Airspace tab) · Battery ·
 *   Sky · GPS (no GPS row when this phone has never had a Kp)
 */

/** One line: a label on the left, the fact on the right ("Class C · 100 ft" then "KORF"). */
export interface DroneRow {
  key: string
  label: string
  big: string
  small: string | null
  /** 'drone': the amber of airspace and limits; 'caution': a word to notice ("Possible"). */
  tone?: 'drone' | 'caution'
  /** The whole row is a button (Airspace › the Airspace tab). */
  onTap?: () => void
  /** In place of the fact: a control (Plan's "Import a log ›"). */
  value?: ReactNode
}

export interface DroneNowData {
  /** The wind at 400 ft in the pilot's unit, rounded, or null when the forecast does not say. */
  speed: string | null
  unit: string
  /** "from NNE · gusts 11 · at 400 ft", or the part that is known. */
  fromLine: string | null
  /** Where the arrow points (where the wind blows to), or null with no direction. */
  towardDeg: number | null
  /** What the compass says (src/core/calmDial.ts): an arrow, "Calm", or a dash (Batch SIMPLE-1, Section 1: never an empty circle). */
  dial: DialRead
  /** The one chip (src/core/droneNow.ts limitChip), or null with no limit or no wind at 400 ft. */
  chip: LimitChip | null
  /** With no chip, why: "Add your drone in Settings › My gear for its wind limit". */
  note: string | null
  bars: DayBars | null
  /** "Today at 400 ft". */
  barsLabel: string
  /** Under the bars: "now", the calm window, sunset. */
  marks: { key: string; text: string; tone?: 'calm' | 'dusk' }[]
  /** Why there are no bars, in words. */
  barsNone: string
}

export function DroneCompass({ towardDeg, read }: { towardDeg: number | null; read?: DialRead }) {
  /* Callers that predate the dial read just the arrow: a direction is an arrow, none is a dash. */
  const dial: DialRead = read ?? (towardDeg === null ? 'none' : 'arrow')
  return (
    <svg className="drp__compass" viewBox="0 0 120 120" role="img" aria-label={dial === 'calm' ? 'Calm: no wind direction' : dial === 'none' || towardDeg === null ? 'No wind direction in the forecast' : `The wind blows toward ${Math.round(towardDeg)}°`}>
      <circle cx="60" cy="60" r="56" className="drp__compassring" />
      <text x="60" y="18" textAnchor="middle" className="drp__compassn">N</text>
      {dial === 'calm' ? (
        <text x="60" y="70" textAnchor="middle" className="drp__compasscalm" data-calm>
          Calm
        </text>
      ) : dial === 'none' || towardDeg === null ? (
        <text x="60" y="70" textAnchor="middle" className="drp__compasscalm" data-nodir>
          —
        </text>
      ) : (
        <g transform={`rotate(${towardDeg} 60 60)`} data-toward={Math.round(towardDeg)}>
          <path d="M60 92 L60 32 M48 46 L60 30 L72 46" className="drp__compassarrow" />
        </g>
      )}
    </svg>
  )
}

export function DroneBars({ bars, label, marks, none }: { bars: DayBars | null; label: string; marks: DroneNowData['marks']; none: string }) {
  const W = 300
  const H = 90
  const n = bars?.bars.length ?? 0
  const slot = n === 0 ? W : W / n
  return (
    <section className="dcard drp__today" aria-label={label}>
      <p className="dcard__label">{label}</p>
      {bars === null ? (
        <p className="drp__none">{none}</p>
      ) : (
        <>
          <svg className="drp__barpic" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={bars.bars.map((b) => b.role).join(', ')}>
            {bars.bars.map((b, i) => (
              <rect key={b.at.getTime()} x={i * slot + slot * 0.15} width={slot * 0.7} y={H - b.height * (H - 6)} height={b.height * (H - 6)} rx="3" className={`drp__bar drp__bar--${b.role}`} />
            ))}
            {bars.limitAt === null ? null : <line x1="0" x2={W} y1={H - bars.limitAt * (H - 6)} y2={H - bars.limitAt * (H - 6)} className="drp__limitline" vectorEffect="non-scaling-stroke" />}
            {bars.sunsetAt === null ? null : <line x1={bars.sunsetAt * W} x2={bars.sunsetAt * W} y1="0" y2={H} className="drp__sunsetline" vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="drp__marks num">
            {marks.map((m) => (
              <span key={m.key} className={m.tone === undefined ? undefined : `drp__mark--${m.tone}`}>
                {m.text}
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  )
}

/** The one-line rows (Now's four, Plan's four). */
export function DroneRows({ rows, label }: { rows: readonly DroneRow[]; label: string }) {
  return (
    <ul className="drp__rows" aria-label={label}>
      {rows.map((r) => {
        const inner = (
          <>
            <span className="drp__rlabel">{r.label}</span>
            {r.value ?? (
              <span className="drp__rval">
                <b className={r.tone === undefined ? undefined : `drp__rbig--${r.tone}`}>{r.big}</b>
                {r.small === null ? null : <span className="drp__rsmall">{r.small}</span>}
                {r.onTap === undefined ? null : <span className="drp__rgo" aria-hidden="true">›</span>}
              </span>
            )}
          </>
        )
        return (
          <li key={r.key} className="drp__rowline" data-row={r.key}>
            {r.onTap === undefined ? (
              <div className="drp__rowin">{inner}</div>
            ) : (
              <button type="button" className="drp__rowin drp__rowbtn" onClick={r.onTap}>
                {inner}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function DroneNowView({ data, rows }: { data: DroneNowData; rows: readonly DroneRow[] }) {
  return (
    <>
      <div className="drp__head">
        <div className="drp__headwords">
          <p className="drp__big num">
            {data.speed ?? '—'} <span className="drp__unit">{data.unit}</span>
          </p>
          <p className="drp__from">{data.fromLine ?? 'The forecast did not say the direction.'}</p>
        </div>
        <DroneCompass towardDeg={data.towardDeg} read={data.dial} />
      </div>
      {data.chip === null ? (
        data.note === null ? null : <p className="drp__limit drp__note">{data.note}</p>
      ) : (
        <p className={`drp__chip drp__limit drp__chip--${data.chip.tone}`} data-tone={data.chip.tone}>
          {data.chip.text}
        </p>
      )}
      <DroneBars bars={data.bars} label={data.barsLabel} marks={data.marks} none={data.barsNone} />
      {rows.length === 0 ? null : <DroneRows rows={rows} label="Airspace, battery, sky and GPS" />}
    </>
  )
}
