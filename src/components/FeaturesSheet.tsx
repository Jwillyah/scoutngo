import { useState, type ReactNode } from 'react'

/*
 * FEATURES (Batch K addendum, E): everything drawn on the map, one home per
 * item, replacing "Map & layers" and the dock. Two columns of compact
 * switches, each with a coloured icon square; fits 390 x 844.
 *
 *   quick      Viewfinder · Measure · Skyline
 *   WEATHER    pick one: Off · Radar · Wind · Clouds (the old Cloud tile
 *              is Clouds now)
 *   STORMS     Lightning · Warnings · Storm tracks
 *   SHOOTING   Shadows · Sun arc · Moon path (was the dock's moon) · Cones
 *              (its one home now) · Light map
 *   DRONE      Airspace · Hazards, and "Airspace over this venue ›"
 *   MAP        Satellite · Terrain · 3D, and Labels · Buildings
 *   foot       the imagery's source and zoom · "What is mapped here ›"
 *
 * Moved to the menu: Preflight (Drone), Calendar (Sky). Back to now is the ↺
 * on the time sheet.
 */
export type WeatherLayer = 'off' | 'radar' | 'wind' | 'clouds'

export interface Switch {
  id: string
  label: string
  on: boolean
  onToggle: () => void
  /** The icon square's colour. */
  color: string
  icon: ReactNode
  /** A word under the label: "Flat here", "Needs the scan". */
  note?: string
}

interface FeaturesProps {
  quick: { label: string; onClick: () => void; on?: boolean }[]
  weather: WeatherLayer
  onWeather: (w: WeatherLayer) => void
  storms: Switch[]
  shooting: Switch[]
  drone: Switch[]
  onAirspaceVenue: () => void
  base: 'satellite' | 'terrain' | '3d'
  onBase: (b: 'satellite' | 'terrain' | '3d') => void
  /** "Flat here" when the terrain round the venue is too flat to draw; null otherwise. */
  baseNote: string | null
  map: Switch[]
  sourceLine: string
  onWhatMapped: () => void
  /** What each layer is: the old Map & layers "i", one tap away. */
  about?: ReactNode
}

const WEATHER: { id: WeatherLayer; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'radar', label: 'Radar' },
  { id: 'wind', label: 'Wind' },
  { id: 'clouds', label: 'Clouds' },
]

function Switches({ items }: { items: Switch[] }) {
  return (
    <div className="feat__grid">
      {items.map((s) => (
        <button key={s.id} type="button" role="switch" aria-checked={s.on} data-feature={s.id} className={`feat__sw${s.on ? ' feat__sw--on' : ''}`} onClick={s.onToggle}>
          <span className="feat__icon" style={{ background: s.color }} aria-hidden="true">{s.icon}</span>
          <span className="feat__label">
            {s.label}
            {s.note === undefined ? null : <span className="feat__note">{s.note}</span>}
          </span>
          <span className="feat__toggle" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export function FeaturesSheet(p: FeaturesProps) {
  const [about, setAbout] = useState(false)
  return (
    <div className="feat">
      <div className="feat__quick">
        {p.quick.map((q) => (
          <button key={q.label} type="button" className={`feat__qbtn${q.on === true ? ' feat__qbtn--on' : ''}`} aria-pressed={q.on} onClick={q.onClick}>
            {q.label}
          </button>
        ))}
      </div>

      <p className="feat__head">Weather · pick one</p>
      <div className="feat__weather" role="radiogroup" aria-label="Weather on the map">
        {WEATHER.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={p.weather === w.id} data-weather={w.id} className={`feat__wtile feat__wtile--${w.id}${p.weather === w.id ? ' feat__wtile--on' : ''}`} onClick={() => p.onWeather(w.id)}>
            <span className="feat__wart" aria-hidden="true" />
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      <p className="feat__head">Storms</p>
      <Switches items={p.storms} />

      <p className="feat__head">Shooting</p>
      <Switches items={p.shooting} />

      <p className="feat__head">
        Drone
        <button type="button" className="feat__link" onClick={p.onAirspaceVenue}>Airspace over this venue ›</button>
      </p>
      <Switches items={p.drone} />

      <div className="seg feat__base" role="group" aria-label="The map">
        <span className="feat__head feat__head--inline">Map</span>
        {(['satellite', 'terrain', '3d'] as const).map((b) => (
          <button key={b} type="button" className={`seg__btn${p.base === b ? ' seg__btn--on' : ''}`} aria-pressed={p.base === b} onClick={() => p.onBase(b)}>
            {b === 'satellite' ? 'Satellite' : b === 'terrain' ? 'Terrain' : '3D'}
          </button>
        ))}
        {p.baseNote === null ? null : <span className="feat__note">{p.baseNote}</span>}
      </div>
      <Switches items={p.map} />

      <p className="feat__foot">
        <span className="num">{p.sourceLine}</span>
        <button type="button" className="feat__link" onClick={p.onWhatMapped}>What is mapped here ›</button>
        {p.about === undefined ? null : (
          <button type="button" className="tiles__i" aria-expanded={about} aria-label="About these layers" onClick={() => setAbout(!about)}>
            i
          </button>
        )}
      </p>
      {about ? <div className="tiles__about">{p.about}</div> : null}
    </div>
  )
}
