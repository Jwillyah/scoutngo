import type { ReactNode } from 'react'
import { GOES_BAND_LABEL, goesBandFor } from '../core/goes.ts'
import { ConePicker, type ConeMode } from './ConePicker.tsx'
import type { KitProfile } from '../core/kit.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface LayersPanelProps {
  /** Cones have modes rather than a single on, so the picker comes with them. */
  kitProfile: KitProfile
  plan: PlannedPosition[]
  coneMode: ConeMode
  onConeMode: (next: ConeMode) => void
  lensFilters: string[]
  onLensFilters: (next: string[]) => void
  isolatedId: string | null
  onClearIsolate: () => void

  showArc: boolean
  onShowArc: (next: boolean) => void
  showLabels: boolean
  onShowLabels: (next: boolean) => void
  showTerrain: boolean
  onShowTerrain: (next: boolean) => void
  /**
   * TRUE WHEN TERRAIN IS ON BUT NOT DRAWING, because the view is zoomed past
   * the DEM's own detail. Said out loud rather than left as a surprise: see
   * TERRAIN_MAX_ZOOM in MapView for the measurement behind it.
   */
  terrainSuspended: boolean
  showBuildings: boolean
  onShowBuildings: (next: boolean) => void
  /** Why there are no boxes, when there are none. Never silence. */
  buildingsNote: string | null

  /*
   * THESE TWO CARRY THEIR OWN PANEL, which is why they are not plain
   * booleans here. See the note on PANEL_BACKED below.
   */
  showSky: boolean
  onShowSky: (next: boolean) => void
  marking: boolean
  onMarking: (next: boolean) => void
  markCount: number

  /** Sun altitude, so the sky row can say which band it will show. */
  sunAltitude: number | null
  onClose: () => void
}

function Row({
  label,
  note,
  on,
  onToggle,
  state,
}: {
  label: string
  note: string
  on: boolean
  onToggle: () => void
  /** Extra text after the state pill, for a count or a band name. */
  state?: ReactNode
}) {
  return (
    <button
      type="button"
      className={`lay__row${on ? ' lay__row--on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <span className="lay__text">
        <span className="lay__label">
          {label}
          {state}
        </span>
        {/*
          * EVERY ROW SAYS WHAT IT DOES BEFORE IT IS TAPPED. The complaint
          * about the old row was that eight controls read as noise; a word on
          * a chip is not what a layer does, and a layer whose effect you learn
          * by toggling it is a layer you toggle twice.
          */}
        <span className="lay__note">{note}</span>
      </span>
      <span className="lay__state" aria-hidden="true">
        {on ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

/**
 * WHAT DRAWS ON THE MAP, in one list.
 *
 * WHAT THIS REPLACES. Eight controls across three rows: the platform switch,
 * MORE, Conditions, Sun when, Hazards, Cones, Sun arc, Sky. Collapsed it was
 * fine; expanded it ate the map, and it read as noise because two different
 * kinds of thing sat side by side with nothing to tell them apart.
 *
 *   LAYERS draw on the map and are a state: Cones, Sun arc, Sky, Hazards,
 *   Labels. They belong in a list where that state is visible.
 *
 *   PANELS open over the map and are an action: Conditions, Sun when,
 *   Airspace. They stay as their own buttons, because a list of things that
 *   open is just a menu.
 *
 * THE PLATFORM SWITCH IS IN NEITHER and stays visible on the row. It is the
 * only control up there that changes what the NEXT TAP DOES rather than what
 * is drawn, which is a different kind of thing again and the one you need
 * without opening anything.
 *
 * PANEL_BACKED: Sky and Hazards are layers that come with a panel, and that is
 * deliberate rather than untidy. The sky cells are a model whose colours mean
 * nothing without the band key, and hazards need the editor to draw a wire.
 * Toggling either from here swaps to its panel, which closes this list, so
 * their rows read OFF while you are looking at them. Saying so here is better
 * than pretending they are plain toggles.
 */
export function LayersPanel({
  kitProfile,
  plan,
  coneMode,
  onConeMode,
  lensFilters,
  onLensFilters,
  isolatedId,
  onClearIsolate,
  showArc,
  onShowArc,
  showLabels,
  onShowLabels,
  showTerrain,
  onShowTerrain,
  terrainSuspended,
  showBuildings,
  onShowBuildings,
  buildingsNote,
  showSky,
  onShowSky,
  marking,
  onMarking,
  markCount,
  sunAltitude,
  onClose,
}: LayersPanelProps) {
  const band = sunAltitude === null ? null : goesBandFor(sunAltitude)

  return (
    <div className="lay" role="dialog" aria-label="Map layers">
      <div className="lay__head">
        <span className="lay__title">Layers</span>
        <button type="button" className="lay__close" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="lay__list">
        {/*
          * CONES KEEP THEIR OWN CONTROL. They are not a boolean: there is a
          * mode, a lens filter and an isolate, and flattening that into ON and
          * OFF would lose the thing the picker exists for.
          */}
        <div className="lay__cones">
          <span className="lay__label">Cones</span>
          <span className="lay__note">What each position can actually frame.</span>
          <ConePicker
            kit={kitProfile}
            plan={plan}
            coneMode={coneMode}
            onConeMode={onConeMode}
            lensFilters={lensFilters}
            onLensFilters={onLensFilters}
            isolatedId={isolatedId}
            onClearIsolate={onClearIsolate}
          />
        </div>

        <Row
          label="Sun arc"
          note="Where the sun rises and sets, as a path across the day."
          on={showArc}
          onToggle={() => onShowArc(!showArc)}
        />

        <Row
          label="Labels"
          note="Place names and roads over the imagery. Off while reading a venue, on while hunting for one."
          on={showLabels}
          onToggle={() => onShowLabels(!showLabels)}
        />

        <Row
          label="Terrain"
          note={
            terrainSuspended
              ? 'On, but not drawing: zoomed in past the elevation data. Zoom out to see it.'
              : 'Real elevation under the imagery, with a sky. Tilt to 80° to see it. Costs about 80% of the frame rate.'
          }
          on={showTerrain}
          onToggle={() => onShowTerrain(!showTerrain)}
          state={terrainSuspended ? <span className="lay__n"> paused</span> : null}
        />

        <Row
          label="Buildings"
          note={
            buildingsNote ??
            'OpenStreetMap footprints at their mapped heights. Coverage is uneven: an undrawn building is unmapped, not an empty lot.'
          }
          on={showBuildings}
          onToggle={() => onShowBuildings(!showBuildings)}
        />

        <Row
          label="Sky"
          note={
            band === null
              ? 'Cloud over the map. Opens its key, because the colours mean nothing without it.'
              : `Cloud over the map, ${GOES_BAND_LABEL[band].toLowerCase()} band. Opens its key.`
          }
          on={showSky}
          onToggle={() => onShowSky(!showSky)}
        />

        <Row
          label="Hazards"
          note="Wires and obstructions you have marked. Opens the editor to add more."
          on={marking}
          onToggle={() => onMarking(!marking)}
          state={markCount === 0 ? null : <span className="lay__n num"> {markCount}</span>}
        />
      </div>
    </div>
  )
}
