import { useState, type ReactNode } from 'react'

/*
 * LAYERS AS A SHEET OF PICTURES.
 *
 * WHAT THIS REPLACES. Rows of prose: a name, a four-line explanation of what
 * the layer does and why, and a toggle at the end. Eight of them, 634 px of
 * reading, to answer "is the cone layer on". The explanation was good writing
 * and it was in the wrong place -- a layer list is a thing you glance at mid
 * task, and glancing does not survive a paragraph.
 *
 * SO EVERY TILE IS A DRAWING OF WHAT IT DOES, inline SVG, no emoji and no
 * text-only tiles. A cone tile has a cone on it. The state is on the tile --
 * a lit border when on, and the count where there is one -- so it is readable
 * without reading.
 *
 * THE PROSE IS NOT DELETED, it is behind the single circled i at the foot.
 * The same move the cover made: a page nobody finishes is not more honest
 * than a page somebody reads.
 */

export interface BaseTile {
  id: string
  label: string
  /** "ON · z19", "ON · 62°", "OFF". The state, said in its own terms. */
  state: string
  on: boolean
  art: ReactNode
  onToggle: () => void
}

export interface OverlayTile {
  id: string
  label: string
  /** "ON", "OFF", or a count: "1 MARKED". */
  state: string
  on: boolean
  art: ReactNode
  onToggle: () => void
}

interface LayerTilesProps {
  base: readonly BaseTile[]
  overlays: readonly OverlayTile[]
  /** Things you do on the map rather than layers on it: the measure. */
  tools: readonly OverlayTile[]
  /** One line, as now: the imagery source and whether this zoom is past it. */
  sourceLine: string
  /** The paragraphs that used to be on every row. */
  about: ReactNode
}

export function LayerTiles({ base, overlays, tools, sourceLine, about }: LayerTilesProps) {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <div className="tiles">
      {/*
        * BASE AND TOOLS SHARE THE TOP ROW: two base tiles and the measure,
        * on the same four columns as the layers under them, so the whole page
        * fits a 390 x 844 phone with no scrolling (scripts/audit-overflow.mjs).
        * The measure lives here and on a long press, not on the map's edge.
        */}
      <div className="tiles__top">
        <div className="tiles__group tiles__group--base">
          <p className="tiles__head">Base</p>
          {base.map((tile) => (
          <button type="button" key={tile.id} className="tile" aria-pressed={tile.on} onClick={tile.onToggle}>
            <span className={`tile__art${tile.on ? ' tile__art--on' : ''}`} aria-hidden="true">
              {tile.art}
            </span>
            <span className="tile__label">{tile.label}</span>
            <span className={`tile__state${tile.on ? ' tile__state--on' : ''}`}>{tile.state}</span>
          </button>
          ))}
        </div>
        <div className="tiles__group tiles__group--tools">
          <p className="tiles__head">Tools</p>
          {tools.map((tile) => (
          <button type="button" key={tile.id} className="tile" aria-pressed={tile.on} onClick={tile.onToggle}>
            <span className={`tile__art${tile.on ? ' tile__art--on' : ''}`} aria-hidden="true">
              {tile.art}
            </span>
            <span className="tile__label">{tile.label}</span>
            <span className={`tile__state${tile.on ? ' tile__state--on' : ''}`}>{tile.state}</span>
          </button>
          ))}
        </div>
      </div>

      <p className="tiles__head">Over the map</p>
      <div className="tiles__grid">
        {overlays.map((tile) => (
          <button
            type="button"
            key={tile.id}
            className="tile"
            aria-pressed={tile.on}
            onClick={tile.onToggle}
          >
            <span className={`tile__art${tile.on ? ' tile__art--on' : ''}`} aria-hidden="true">
              {tile.art}
            </span>
            <span className="tile__label">{tile.label}</span>
            <span className={`tile__state${tile.on ? ' tile__state--on' : ''}`}>{tile.state}</span>
          </button>
        ))}
      </div>

      {/*
        * ONE LINE AND ONE i. The line states the imagery source and whether
        * this zoom is past its native resolution, which is a fact about what
        * is on screen right now. Everything else is behind the button.
        */}
      <div className="tiles__foot">
        <span className="tiles__source">{sourceLine}</span>
        <button
          type="button"
          className="tiles__i"
          aria-expanded={showAbout}
          aria-label="About these layers"
          onClick={() => setShowAbout(!showAbout)}
        >
          i
        </button>
      </div>

      {!showAbout ? null : <div className="tiles__about">{about}</div>}
    </div>
  )
}

