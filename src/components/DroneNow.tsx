import type { DayBars } from '../core/droneNow.ts'

/*
 * THE DRONE PAGE'S NOW TAB (Batch DRONE, Section 2.1; board Drone_P1). Renders
 * only: every number and word comes from src/core/droneNow.ts through
 * DronePage.tsx.
 */
export interface DroneCardsData {
  airspace: { big: string; line: string }
  battery: { label: string; big: string; line: string }
  sky: { big: string; line: string }
  kp: { big: string; line: string }
}

export interface DroneNowData {
  /** The wind at 400 ft in the pilot's unit, rounded, or null when the forecast does not say. */
  speed: string | null
  unit: string
  /** "from NNW · gusts 22", or the part that is known. */
  fromLine: string | null
  /** "Under your 23 kt limit · gusts at 96%", or how to set a limit. */
  limitLine: string
  /** Where the arrow points (where the wind blows to), or null with no direction. */
  towardDeg: number | null
  chip: string | null
  bars: DayBars | null
  /** "Today at 400 ft · your limit 23 kt". */
  barsLabel: string
  /** Under the bars: "now", the calm window, sunset, civil dusk. */
  marks: { key: string; text: string; tone?: 'calm' | 'dusk' }[]
  /** Why there are no bars, in words. */
  barsNone: string
}

export function DroneCompass({ towardDeg }: { towardDeg: number | null }) {
  return (
    <svg className="drp__compass" viewBox="0 0 120 120" role="img" aria-label={towardDeg === null ? 'No wind direction in the forecast' : `The wind blows toward ${Math.round(towardDeg)}°`}>
      <circle cx="60" cy="60" r="56" className="drp__compassring" />
      <text x="60" y="18" textAnchor="middle" className="drp__compassn">N</text>
      <text x="108" y="64" textAnchor="middle" className="drp__compassk">E</text>
      <text x="60" y="113" textAnchor="middle" className="drp__compassk">S</text>
      <text x="12" y="64" textAnchor="middle" className="drp__compassk">W</text>
      {towardDeg === null ? null : (
        <g transform={`rotate(${towardDeg} 60 60)`} data-toward={Math.round(towardDeg)}>
          <path d="M60 92 L60 32 M48 46 L60 30 L72 46" className="drp__compassarrow" />
        </g>
      )}
      <circle cx="60" cy="60" r="5" className="drp__compasshub" />
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
            {bars.duskAt === null ? null : <line x1={bars.duskAt * W} x2={bars.duskAt * W} y1="0" y2={H} className="drp__duskline" vectorEffect="non-scaling-stroke" />}
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

export function DroneCards({ cards, onAirspace }: { cards: DroneCardsData; onAirspace: () => void }) {
  return (
    <ul className="wtiles drp__tiles">
      <li className="drp__tilecell">
        <button type="button" className="wtile drp__tile drp__tile--air" onClick={onAirspace}>
          <span className="wtile__label">Airspace</span>
          <span className="wtile__big">{cards.airspace.big}</span>
          <span className="wtile__line">{cards.airspace.line}</span>
          <span className="drp__tfr">Check TFRs ›</span>
        </button>
      </li>
      <li className="wtile drp__tile">
        <span className="wtile__label">{cards.battery.label}</span>
        <span className="wtile__big num">{cards.battery.big}</span>
        <span className="wtile__line">{cards.battery.line}</span>
      </li>
      <li className="wtile drp__tile">
        <span className="wtile__label">Sky</span>
        <span className="wtile__big num">{cards.sky.big}</span>
        <span className="wtile__line">{cards.sky.line}</span>
      </li>
      <li className="wtile drp__tile">
        <span className="wtile__label">GPS · Kp</span>
        <span className="wtile__big num">{cards.kp.big}</span>
        <span className="wtile__line">{cards.kp.line}</span>
      </li>
    </ul>
  )
}

export function DroneNowView({ data, cards, onAirspace }: { data: DroneNowData; cards: DroneCardsData; onAirspace: () => void }) {
  return (
    <>
      <div className="drp__head">
        <div className="drp__headwords">
          <p className="drp__at">at 400 ft</p>
          <p className="drp__big num">
            {data.speed ?? '—'} <span className="drp__unit">{data.unit}</span>
          </p>
          <p className="drp__from">{data.fromLine ?? 'The forecast did not say the direction.'}</p>
          <p className="drp__limit">{data.limitLine}</p>
        </div>
        <DroneCompass towardDeg={data.towardDeg} />
      </div>
      {data.chip === null ? null : <p className="drp__chip">{data.chip}</p>}
      <DroneBars bars={data.bars} label={data.barsLabel} marks={data.marks} none={data.barsNone} />
      <DroneCards cards={cards} onAirspace={onAirspace} />
    </>
  )
}
