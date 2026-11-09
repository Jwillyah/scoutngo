import { useState, type ReactNode } from 'react'
import { Segmented, Toggle } from './ui.tsx'
import '../styles/features.css'

/*
 * THE MAP SHEET, FEATURES v3 (Batch Map, Section 4; board
 * docs/mockups/FeaturesV3.png), in the one style (src/components/ui.tsx):
 *
 *   WEATHER       four tiles with icons: Off · Rain · Wind · Clouds, the
 *                 chosen one white
 *   ON THE MAP    one glass card of 50 px rows, an icon and a toggle each:
 *                 Lightning (last 45 min), Warnings, Sun and moon lines,
 *                 Airspace, and More › (storm tracks, hazards, buildings and
 *                 the rest, one tap deeper)
 *   MAP STYLE     Satellite · Plain · 3D
 *   tools         round Viewfinder · Measure · Skyline with their names
 *   foot          the credit in small words; no zoom, no debug
 *
 * Section labels never touch the group under them, nothing is monospace,
 * and the whole sheet fits one screen at 390 x 844 and 412 x 915 at its top
 * height. The picker's rules (Batch M) still decide which rows are offered:
 * the lead filters them before they get here.
 */
export type WeatherLayer = 'off' | 'radar' | 'wind' | 'clouds'

export interface Switch {
  id: string
  label: string
  on: boolean
  onToggle: () => void
  icon: ReactNode
  /** A word after the label: "last 45 min", "Flat here". */
  note?: string
}

interface FeaturesProps {
  weather: WeatherLayer
  onWeather: (w: WeatherLayer) => void
  /** The ON THE MAP rows, in order. */
  rows: Switch[]
  /** What More › holds: switches, then links. */
  moreRows: Switch[]
  links: { label: string; onClick: () => void }[]
  base: 'satellite' | 'terrain' | '3d'
  onBase: (b: 'satellite' | 'terrain' | '3d') => void
  /** "Flat here" when the terrain round the venue is too flat to draw; null otherwise. */
  baseNote: string | null
  tools: { label: string; icon: ReactNode; onClick: () => void; on?: boolean }[]
  /** "Imagery Esri · labels OpenFreeMap". */
  credit: string
  /** What each layer is, behind More ›. */
  about?: ReactNode
}

const WEATHER: { id: WeatherLayer; label: string; icon: ReactNode }[] = [
  { id: 'off', label: 'Off', icon: <path d="M5.6 5.6l12.8 12.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /> },
  { id: 'radar', label: 'Rain', icon: <path d="M7 15a4.5 4.5 0 0 1 .8-8.9A5.5 5.5 0 0 1 18 8a3.5 3.5 0 0 1-.5 7M9 18l-1 2M13 18l-1 2M17 18l-1 2" /> },
  { id: 'wind', label: 'Wind', icon: <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" /> },
  { id: 'clouds', label: 'Clouds', icon: <path d="M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.6 9 4.5 4.5 0 0 1 17 18z" /> },
]

const svg = (path: ReactNode, className: string) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    {path}
  </svg>
)

function Rows({ items, more }: { items: Switch[]; more?: { sub: string; onOpen: () => void } }) {
  return (
    <div className="feat3__card">
      {items.map((s) => (
        <div key={s.id} className="feat3__row" data-row={s.id}>
          <span className="feat3__ricon" aria-hidden="true">
            {s.icon}
          </span>
          <span className="feat3__rlabel">
            {s.label}
            {s.note === undefined ? null : <span className="feat3__rnote"> {s.note}</span>}
          </span>
          <Toggle on={s.on} label={s.label} feature={s.id} onChange={() => s.onToggle()} />
        </div>
      ))}
      {more === undefined ? null : (
        <button type="button" className="feat3__row feat3__row--more" onClick={more.onOpen}>
          <span className="feat3__ricon" aria-hidden="true">
            {svg(<path d="M6 12h.01M12 12h.01M18 12h.01" />, 'feat3__glyph')}
          </span>
          <span className="feat3__rlabel">
            More<span className="feat3__rnote"> {more.sub}</span>
          </span>
          <span className="feat3__chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}
    </div>
  )
}

export function FeaturesSheet(p: FeaturesProps) {
  const [more, setMore] = useState(false)
  if (more) {
    return (
      <div className="feat3" data-feat-more>
        <button type="button" className="feat3__back" onClick={() => setMore(false)}>
          ‹ Map
        </button>
        <p className="feat3__head">More on the map</p>
        <Rows items={p.moreRows} />
        <div className="feat3__links">
          {p.links.map((l) => (
            <button key={l.label} type="button" className="ui-chip feat3__link" onClick={l.onClick}>
              {l.label} ›
            </button>
          ))}
        </div>
        {p.about === undefined ? null : <div className="feat3__about">{p.about}</div>}
        <p className="feat3__credit">{p.credit}</p>
      </div>
    )
  }
  return (
    <div className="feat3">
      <p className="feat3__head">Weather</p>
      <div className="feat3__weather" role="radiogroup" aria-label="Weather on the map">
        {WEATHER.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={p.weather === w.id} data-weather={w.id} className={`feat3__wtile${p.weather === w.id ? ' feat3__wtile--on' : ''}`} onClick={() => p.onWeather(w.id)}>
            {svg(w.icon, 'feat3__wicon')}
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      <p className="feat3__head">On the map</p>
      <Rows items={p.rows} more={{ sub: p.moreRows.slice(0, 3).map((m) => m.label.toLowerCase()).join(', '), onOpen: () => setMore(true) }} />

      <p className="feat3__head">Map style</p>
      <Segmented
        label="Map style"
        value={p.base}
        options={[
          { id: 'satellite', label: 'Satellite' },
          { id: 'terrain', label: 'Plain' },
          { id: '3d', label: '3D' },
        ]}
        onChange={p.onBase}
      />
      {p.baseNote === null ? null : <p className="feat3__note">{p.baseNote}</p>}

      <div className="feat3__tools">
        {p.tools.map((t) => (
          <button key={t.label} type="button" className={`feat3__tool${t.on === true ? ' feat3__tool--on' : ''}`} aria-pressed={t.on} onClick={t.onClick}>
            <span className="ui-round ui-round--icon feat3__tcircle">{t.icon}</span>
            <span className="feat3__tlabel">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="feat3__credit">{p.credit}</p>
    </div>
  )
}
