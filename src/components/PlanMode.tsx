import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type {
  Platform,
  PlatformFilter as PlatformFilterValue,
} from '../core/platformFilter.ts'
import type { ShotType } from '../core/shotType.ts'
import { goesBandFor, zoomAdvice } from '../core/goes.ts'
import { boundaryNote } from '../core/skyTime.ts'
import { formatClock } from '../core/timezone.ts'
import type { SkyState } from '../lib/useSkyFrames.ts'
import type { Wind } from '../core/upwind.ts'
import type { LevelWind } from '../core/windProfile.ts'
import type { SightlineCloud } from '../core/cloud.ts'
import type { TideExtreme, TideState } from '../core/tide.ts'
import type { SunArc, SunPosition } from '../core/sun.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import type { GenerationState } from '../lib/planRequest.ts'
import type { DesiredShot } from '../lib/describe.ts'
import type { FieldPack } from '../lib/fieldPack.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import type { OpticSelection } from '../core/optics.ts'
import { placingHint } from '../core/platformFilter.ts'
import { locateOnce } from '../lib/locateOnce.ts'
import type { SetupTarget } from '../lib/mode.ts'
import { GROUND_WIND_METERS, type WindHeight } from '../core/windHeight.ts'
import type { SkyLayerKind } from '../core/skyLayer.ts'
import { phaseAt, phaseSpans } from '../core/nightWindow.ts'
import type { MarkKind, SiteMark } from '../core/siteMark.ts'
import { HazardPanel } from './HazardPanel.tsx'
import { LayersPanel } from './LayersPanel.tsx'
import { BottomSheet } from './BottomSheet.tsx'
import { raisedTo, type SheetDetent } from '../core/sheetDetent.ts'
import { AirspacePanel } from './AirspacePanel.tsx'
import { ConditionsPanel } from './ConditionsPanel.tsx'
import type { ConeMode } from './ConePicker.tsx'
import { FieldPackControl, type PackBuildState } from './FieldPackControl.tsx'
import { MapRail } from './MapRail.tsx'
import { SheetSection } from './SheetSection.tsx'
import { BUILDINGS_MIN_ZOOM, MapView, type MapHandle } from './MapView.tsx'
import { buildingsToGeoJson, fetchBuildings } from '../lib/buildings.ts'
import { PlatformFilter } from './PlatformFilter.tsx'
import { SkyLegend } from './SkyLegend.tsx'
import { PlanStatus } from './PlanStatus.tsx'
import { PositionCard } from './PositionCard.tsx'
import { ShotList } from './ShotList.tsx'
import { SunSearchPanel } from './SunSearchPanel.tsx'
import { TimeScrubber } from './TimeScrubber.tsx'

/** What the one sheet is currently showing. Chosen by an explicit control. */
/*
 * THERE IS NO SHEET VIEW ANY MORE.
 *
 * It was 'plan' | 'conditions' | 'airspace' | 'sunsearch': four whole-sheet
 * screens that replaced each other, each with its own "Back to the plan"
 * button. That is a tab bar wearing a sheet, and it meant the plan and the
 * conditions could not be read in the same scroll.
 *
 * They are stacked SECTIONS now. One scroll, no back buttons, nothing to
 * switch between.
 */

interface PlanModeProps {
  mapHandle: React.Ref<MapHandle>
  venue: LatLon | null
  onVenueChange: (at: LatLon) => void
  onLongPress: (at: LatLon) => void
  plan: PlannedPosition[]
  visiblePlan: PlannedPosition[]
  conePlan: PlannedPosition[]
  planCoverage: PlanCoverage | null
  onPositionMove: (id: string, at: LatLon) => void
  sun: SunPosition | null
  sunOverlay: { azimuth: number; shadowBearing: number; arc: SunArc } | null
  showSun: boolean
  onShowSun: (next: boolean) => void
  showArc: boolean
  onShowArc: (next: boolean) => void
  /** The GOES-19 cloud layer over the imagery. */
  showSky: boolean
  onShowSky: (next: boolean) => void
  /** Wind at the venue. Null until it answers, or when it fails. */
  wind: Wind | null
  windLevels: LevelWind[]
  gustMps: number | null
  windAt: Date | null
  windPast: boolean
  /**
   * The height to read the wind at, in feet, or null with nothing in the air.
   *
   * Taken from the air positions in the plan: the highest of them, because
   * that is the one the wind limits first.
   */
  /** Which height the wind is read at, and whether that height is assumed. */
  windHeight: WindHeight
  ratedWindMps: number | null
  ratedWindSource: string
  /** Cloud for the selected position, when it has been asked for. */
  selectedCloud: SightlineCloud | null
  /** Which sky source answers for the scrubbed moment, and its frames. */
  sky: SkyState
  selectedId: string | null
  onSelect: (id: string | null) => void
  selected: PlannedPosition | null
  onFlyTo: (id: string) => void
  coneMode: ConeMode
  onConeMode: (next: ConeMode) => void
  lensFilters: string[]
  onLensFilters: (next: string[]) => void
  isolatedId: string | null
  onClearIsolate: () => void
  venueWindow: VenueWindow | null
  scrubbedAt: Date | null
  scrub: number
  onScrub: (next: number) => void
  tide: TideInfo
  tideNow: TideState | null
  tideExtremes: TideExtreme[]
  generation: GenerationState
  siteNote: string | null
  terrainNote: string | null
  /** What loading a saved plan had to change to make sense of it. */
  positionNote: string | null
  onGenerate: () => void
  /** Takes the shooter to whatever a blocked generate named. */
  onFixBlock: (field: SetupTarget | 'brief' | null) => void
  /** The shooter's own gear. The lens picker and cone labels read it. */
  kitProfile: KitProfileType
  /** Which of the kit is packed, so the optic picker offers only that. */
  kitSelection: OpticSelection
  /** The marked hazards and notes at this place. */
  marks: readonly SiteMark[]
  /** Marking mode, which stays on until it is turned off. See HazardPanel. */
  marking: boolean
  onMarking: (next: boolean) => void
  markKind: MarkKind
  onMarkKind: (next: MarkKind) => void
  markDrawing: 'point' | 'line'
  onMarkDrawing: (next: 'point' | 'line') => void
  markDraft: readonly LatLon[]
  onMarkAt: (at: LatLon) => void
  onFinishLine: () => void
  onCancelLine: () => void
  selectedMark: SiteMark | null
  onSelectMark: (id: string | null) => void
  onChangeMark: (
    id: string,
    change: Partial<Pick<SiteMark, 'kind' | 'heightMeters' | 'foliage' | 'note'>>,
  ) => void
  onDeleteMark: (id: string) => void
  /** The shoot date, yyyy-mm-dd, for the leaf answer on a deciduous mark. */
  shootDate: string
  /** Which brief a generate would send: the typed one, or the chips. */
  briefSource: string
  /** Which measure the sky layer paints. */
  skyLayer: SkyLayerKind
  onSkyLayer: (next: SkyLayerKind) => void
  /** Arms the map so the next tap drops a position. The primary action here. */
  placing: boolean
  onPlacing: (next: boolean) => void
  onAddAt: (at: LatLon) => void
  onDeletePosition: (id: string) => void
  onDuplicatePosition: (id: string) => void
  onMovePosition: (id: string, delta: number) => void
  onSetOptic: (id: string, lensId: string, focalLength: number) => void
  /** How high an air position flies, in feet above ground. Clamped in core. */
  onSetAltitude: (id: string, feet: number) => void
  /** Framed, top-down or 360. Decides what geometry the position has at all. */
  onSetShotType: (id: string, shotType: ShotType) => void
  /** Which way a top-down's rectangle is turned. Never a camera bearing. */
  onSetYaw: (id: string, degrees: number) => void
  /** The forward step, offered as a SECONDARY action beside Generate. */
  onGoToField: () => void
  goToFieldBlocked: string | null
  summary: string
  peekStatus: { label: string; line: string }
  fitTargets: LatLon[]
  pack: FieldPack | null
  packIsCurrent: boolean
  packState: PackBuildState
  onPreparePack: () => void
  desiredShots: DesiredShot[]
  footer: React.ReactNode
  /** Ground, air or both. Decides what shows here AND what a generate asks for. */
  platformFilter: PlatformFilterValue
  showLabels: boolean
  onShowLabels: (next: boolean) => void
  showTerrain: boolean
  onShowTerrain: (next: boolean) => void
  showBuildings: boolean
  onShowBuildings: (next: boolean) => void
  onPlatformFilter: (next: PlatformFilterValue) => void
  platformCounts: Record<Platform, number>
  /** How many positions the platform choice is hiding. */
  hiddenByPlatform: number
  /** False with no drone in the kit, which makes Air a dead end rather than a choice. */
  airAvailable: boolean
  /**
   * Where the pilot is standing, and the arming for placing it.
   *
   * It is one position for the whole plan: the pilot stands somewhere and the
   * aircraft moves between hover points. Null until placed.
   */
  pilotAt: LatLon | null
  onPilotMove: (at: LatLon) => void
  placingPilot: boolean
  /** What the reverse sun search points at, and the mode that picks it. */
  aimAt: LatLon | null
  placingAim: boolean
  onPlacingAim: (next: boolean) => void
  onAimAt: (at: LatLon) => void
  /**
   * The planned air altitude in feet, or null with nothing in the air.
   *
   * Only ever a PLANNED altitude: see plannedAltitudeFeet in App.tsx for why
   * the assumed drone default is deliberately not passed here.
   */
  airAltitudeFeet: number | null
  onPlacingPilot: (next: boolean) => void
  /**
   * Whether the next tap will add an AIR position.
   *
   * True when the filter is on Air and a drone is in the kit. The button says
   * so, because adding a ground position while the filter hides ground would
   * drop something on the map and hide it in the same gesture.
   */
  addsAir: boolean
}

/**
 * PLAN: the map is the whole screen.
 *
 * ONE reveal mechanism. The sheet is the only thing that opens, it has two
 * stops, and its payload is chosen by an explicit control rather than by a tab.
 * Conditions detail comes up in the same sheet instead of being a place you
 * navigate to, because sun and tide belong to the map and the scrubber.
 *
 * ONE THING PER REGION, which is what this screen did not have.
 *
 *   TOP    one row of reveals: Conditions, Cones, and the overflow.
 *   RIGHT  three map controls a gesture cannot replace.
 *   BOTTOM the sheet, carrying the one loud action and its two quiet ones.
 *   DOCK   time, then the rail. Nothing else.
 *
 * What came off: a venue search bar that duplicated SETUP, a sun readout that
 * duplicated the scrubber, two zoom buttons that duplicated pinch, and a
 * permanent lens chip row that is now one control. See the comments at each
 * site.
 */
export function PlanMode({
  mapHandle,
  venue,
  onVenueChange,
  onLongPress,
  plan,
  visiblePlan,
  conePlan,
  planCoverage,
  onPositionMove,
  sun,
  sunOverlay,
  showSun,
  onShowSun,
  showArc,
  onShowArc,
  showSky,
  onShowSky,
  wind,
  windLevels,
  gustMps,
  windAt,
  windPast,
  windHeight,
  ratedWindMps,
  ratedWindSource,
  selectedCloud,
  sky,
  selectedId,
  onSelect,
  selected,
  onFlyTo,
  coneMode,
  onConeMode,
  lensFilters,
  onLensFilters,
  isolatedId,
  onClearIsolate,
  venueWindow,
  scrubbedAt,
  scrub,
  onScrub,
  tide,
  tideNow,
  tideExtremes,
  generation,
  siteNote,
  terrainNote,
  positionNote,
  onGenerate,
  onFixBlock,
  kitProfile,
  kitSelection,
  marks,
  marking,
  onMarking,
  markKind,
  onMarkKind,
  markDrawing,
  onMarkDrawing,
  markDraft,
  onMarkAt,
  onFinishLine,
  onCancelLine,
  selectedMark,
  onSelectMark,
  onChangeMark,
  onDeleteMark,
  shootDate,
  briefSource,
  skyLayer,
  onSkyLayer,
  placing,
  onPlacing,
  onAddAt,
  onDeletePosition,
  onDuplicatePosition,
  onMovePosition,
  onSetOptic,
  onSetAltitude,
  onSetShotType,
  onSetYaw,
  onGoToField,
  goToFieldBlocked,
  peekStatus,
  fitTargets,
  pack,
  packIsCurrent,
  packState,
  onPreparePack,
  desiredShots,
  footer,
  platformFilter,
  showLabels,
  onShowLabels,
  showTerrain,
  onShowTerrain,
  showBuildings,
  onShowBuildings,
  onPlatformFilter,
  platformCounts,
  hiddenByPlatform,
  airAvailable,
  pilotAt,
  onPilotMove,
  placingPilot,
  aimAt,
  placingAim,
  onPlacingAim,
  onAimAt,
  airAltitudeFeet,
  onPlacingPilot,
  addsAir,
}: PlanModeProps) {
  const [sheet, setSheet] = useState<SheetDetent>('peek')

  /*
   * A MAP PANEL AND AN OPEN SHEET CANNOT BOTH EXIST.
   *
   * DERIVED, not remembered. src/core/mapPanel.ts made the two map panels
   * mutually exclusive by giving them one value; the sheet is a different kind
   * of thing with its own detents, so it cannot join that type. The same
   * guarantee is had by making the combination unrepresentable in what is
   * RENDERED: while a panel is open the sheet is at peek, whatever its own
   * state says.
   *
   * It matters more than tidiness. Measured with both open, the hazard panel
   * was squeezed to 26 pixels tall: the sheet took its room and it had nowhere
   * to go. A panel that exists and cannot be used is the thing this audit
   * exists to catch.
   */
  /*
   * THE LAYERS LIST COUNTS AS A PANEL HERE.
   *
   * Leaving it out let the sheet stay fully open underneath it, and the panel
   * audit caught exactly that: "layers and conditions are both on screen at
   * once". Same bug as the one this mechanism was built for, one panel later,
   * which is the argument for adding a new surface to the audit in the pass
   * that adds it rather than the pass that breaks it.
   */
  /*
   * NOTHING FORCES THE SHEET DOWN ANY MORE.
   *
   * There used to be a `panelOpen` that demoted an open sheet to peek whenever
   * a floating panel appeared, because two surfaces could otherwise cover each
   * other. There is one surface now: the panels are sections inside it, so
   * there is nothing to yield to and the detent the shooter set is the detent
   * they keep.
   */
  const [sheetHeight, setSheetHeight] = useState(108)
  const [pitch, setPitch] = useState(0)

  /*
   * DAY, CIVIL TWILIGHT AND NIGHT ACROSS THE WINDOW.
   *
   * Computed here rather than in the scrubber because the scrubber draws what
   * it is given and this needs the venue coordinate. Memoised on the window
   * and the venue: the band edges do not move as the bar is dragged, only the
   * marker on them does, and recomputing four solar events per frame while a
   * thumb is down is work for an answer that cannot have changed.
   */
  const nightBands = useMemo(
    () =>
      venueWindow === null || venue === null
        ? []
        : phaseSpans(venueWindow.start, venueWindow.end, venue.lat, venue.lon),
    [venueWindow, venue],
  )

  const nightPhase = useMemo(
    () =>
      scrubbedAt === null || venue === null ? null : phaseAt(scrubbedAt, venue.lat, venue.lon),
    [scrubbedAt, venue],
  )

  /*
   * The dock height is MEASURED rather than assembled from per-bar tokens: the
   * scrubber's real height is set by its own content, and a token that said 62px
   * while it rendered at 93px silently put it on top of the chips.
   */
  const dock = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(0)
  const measureDock = (node: HTMLDivElement | null) => {
    dock.current = node
    if (node !== null) setDockHeight(node.offsetHeight)
  }

  /*
   * The control row's own height, watched rather than read once: it changes
   * when the row collapses and when a count gains a digit.
   */
  const [hudHeight] = useState(0)

  /*
   * RAISE, NEVER LOWER.
   *
   * The only programmatic detent change in the app. A card or a section at
   * PEEK is content nobody can read, so opening one lifts a peeking sheet to
   * HALF — and does nothing at all if the shooter has already put it at HALF
   * or FULL. Nothing anywhere lowers the sheet, which is the rule that makes
   * the detent theirs rather than the app's.
   */
  const raiseToHalf = useCallback(() => {
    setSheet((current) => raisedTo(current, 'half'))
  }, [])

  /*
   * SELECTING RAISES, DESELECTING DOES NOT LOWER.
   *
   * The whole detent rule for selection, in one place. A card at PEEK is 88px
   * of a card, so a tap lifts a peeking sheet to HALF; a sheet the shooter has
   * already put at HALF or FULL is left exactly where it is; and clearing the
   * selection changes only what the sheet shows. Nothing here can lower it,
   * because raisedTo cannot, for any pair of detents.
   *
   * SELECTION AND DETENT ARE SEPARATE STATE. Neither reads the other, so a
   * re-render changes neither: the card appears because `selected` is not
   * null, and the sheet is as tall as `sheet` says, and those two facts never
   * consult each other.
   */
  const onSelectAndRaise = useCallback(
    (id: string | null) => {
      onSelect(id)
      if (id !== null) raiseToHalf()
    },
    [onSelect, raiseToHalf],
  )

  /*
   * TWO WAYS TO SELECT, ONE RULE.
   *
   * A position is selected by tapping it on the map, which arrives as
   * onSelect, OR by tapping its row in the list, which arrives as onFlyTo and
   * selects on the way to flying there. The surface audit caught the second
   * one going around the rule: a tap at PEEK left the sheet at PEEK, so the
   * card was selected behind an 88px sheet and the shooter saw nothing happen.
   *
   * Both go through raiseToHalf now. The lesson is the usual one: a rule
   * enforced at one of two entry points is a rule enforced at neither.
   */
  const onPickAndRaise = useCallback(
    (id: string) => {
      onFlyTo(id)
      raiseToHalf()
    },
    [onFlyTo, raiseToHalf],
  )

  /*
   * TAPPING THE SHOOT LINE RAISES, like tapping a position will in the next
   * commit. Same rule, same helper: peek goes to half, anything else is left
   * exactly where the shooter put it.
   */
  const onPeekTap = raiseToHalf

  const handle = mapHandle as React.RefObject<MapHandle | null>

  /*
   * The band on screen and the zoom to judge it at. The band follows the sun
   * (src/core/goes.ts); the zoom and the width come from the map itself,
   * because the threshold depends on how wide the screen actually is.
   */
  const skyBand = goesBandFor(sun?.altitude ?? -90)
  const [mapZoom, setMapZoom] = useState(16.5)

  /*
   * LOCATE, FROM THE RAIL.
   *
   * ONE QUESTION, ONE ANSWER, NOTHING KEPT. locateOnce asks the browser once
   * and the coordinate moves the camera and is then gone: not stored, not
   * written to the venue, not turned into a pin. Same rule as the NOW screen
   * and as Setup's own locate button.
   *
   * NEVER AN IP LOOKUP. A refusal is an answer and the map simply stays where
   * it was.
   */
  const [locating, setLocating] = useState(false)
  const onLocate = useCallback(() => {
    setLocating(true)
    void locateOnce().then((result) => {
      setLocating(false)
      if (result.status !== 'ok') return
      handle.current?.flyTo(result.at, Math.max(mapZoom, 15))
    })
  }, [handle, mapZoom])


  /*
   * THE BUILDING FOOTPRINTS, FETCHED FOR THE VIEW.
   *
   * Only while the layer is on and only once zoomed in enough to draw them, so
   * nothing is requested for a shooter who never turns them on. Keyed on the
   * rounded viewport so panning a little does not re-ask.
   *
   * THE FAILURE IS A SENTENCE, NOT A BLANK. Overpass coverage is uneven and
   * Overpass itself is often unavailable, and an empty map with no explanation
   * reads as "no buildings here", which is a claim about the ground. See
   * BUILDINGS_COVERAGE_NOTE.
   */
  const [terrainPaused, setTerrainPaused] = useState(false)

  const [buildingData, setBuildingData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [buildingsNote, setBuildingsNote] = useState<string | null>(null)

  useEffect(() => {
    if (!showBuildings || venue === null) {
      setBuildingData(null)
      setBuildingsNote(null)
      return
    }
    if (mapZoom < BUILDINGS_MIN_ZOOM) {
      setBuildingData(null)
      setBuildingsNote('Zoom in to load buildings.')
      return
    }
    let live = true
    /* A box around the venue, which is what the extrusion needs covering. */
    const span = 0.01
    void fetchBuildings({
      west: venue.lon - span,
      east: venue.lon + span,
      south: venue.lat - span,
      north: venue.lat + span,
    }).then(
      (result) => {
        if (!live) return
        if (result.status === 'ok') {
          setBuildingData(buildingsToGeoJson(result.buildings) as GeoJSON.FeatureCollection)
          setBuildingsNote(
            result.buildings.length === 0
              ? 'OpenStreetMap has no buildings mapped here. That is the map being empty, not the ground.'
              : null,
          )
        } else {
          setBuildingData(null)
          setBuildingsNote(`Buildings could not be loaded: ${result.reason}`)
        }
      },
      () => {
        if (!live) return
        setBuildingData(null)
        setBuildingsNote('Buildings could not be loaded.')
      },
    )
    return () => {
      live = false
    }
    /* mapZoom only matters for crossing the threshold, not every nudge. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBuildings, venue, mapZoom >= BUILDINGS_MIN_ZOOM])

  const [mapWidth, setMapWidth] = useState(390)

  /* Whether anything is in the air, which is what the pilot control is for. */
  const airPositions = plan.filter((p) => p.position.platform === 'air').length


  return (
    <div
      className="mode-plan"
      style={
        {
          ['--sheet-live-height' as string]: `${sheetHeight}px`,
          ['--dock-height' as string]: `${dockHeight}px`,
          /*
           * MEASURED, not guessed. The row changes height when it collapses
           * and when the platform counts gain a digit, and the hazard panel
           * is positioned below it: a hard-coded number here is how a panel
           * ends up across the button that closes it, which is exactly what
           * the panel audit caught.
           */
          ['--hud-height' as string]: `${hudHeight}px`,
        } as React.CSSProperties
      }
    >
      <MapView
        handle={mapHandle}
        venue={venue}
        onVenueChange={onVenueChange}
        mode={
          marking ? 'mark' : placing ? 'add' : placingPilot ? 'pilot' : placingAim ? 'aim' : null
        }
        marks={marks}
        markDraft={markDraft}
        onMarkAt={onMarkAt}
        onSelectMark={onSelectMark}
        onAddAt={onAddAt}
        plan={visiblePlan}
        conePlan={conePlan}
        pilotAt={pilotAt}
        onPilotMove={onPilotMove}
        onAimAt={onAimAt}
        onPositionMove={onPositionMove}
        onLongPress={onLongPress}
        sunAzimuth={sun === null ? null : sun.azimuth}
        sunAltitude={sun?.altitude ?? null}
        showSky={showSky}
        showLabels={showLabels}
        showTerrain={showTerrain}
        onTerrainPaused={setTerrainPaused}
        showBuildings={showBuildings}
        buildings={buildingData}
        skyFrameAt={sky.frameAt}
        skyForecast={sky.cells}
        skyLayer={skyLayer}
        windMeters={windHeight.feet === null ? GROUND_WIND_METERS : windHeight.feet * 0.3048}
        ratedWindMps={ratedWindMps}
        skyForecastOpacity={sky.opacity}
        sunOverlay={sunOverlay}
        showSun={showSun}
        showArc={showArc}
        selectedId={selectedId}
        onSelect={onSelectAndRaise}
        onPitchChange={setPitch}
        onViewChange={(zoom: number, width: number) => {
          setMapZoom(zoom)
          setMapWidth(width)
        }}
        bottomInset={sheetHeight}
      />

      {/*
        * ONE ROW OF REVEALS, and every one of them opens something rather than
        * stating something.
        *
        * THE VENUE SEARCH IS GONE. The venue is set in SETUP, on a screen built
        * around exactly that, with result merging, a confirm step and a
        * draggable pin. A second search bar here was a second way to do a job
        * that already has a home, sitting on top of the map it would move.
        * Changing the venue means stepping back to SETUP, which the rail does.
        *
        * THE SUN READOUT IS GONE TOO. It printed the same azimuth and altitude
        * the scrubber prints, one screen-height apart, and the scrubber's
        * version is the honest one: those numbers belong to a MOMENT, and the
        * scrubber is what chooses the moment.
        */}
      {/*
        * ARMED, SAID ON THE MAP IN WORDS. The button says what it is for; this
        * says what the map is now waiting for, where the waiting happens. An
        * icon would be one more thing to decode on a screen that just lost two
        * markers for being undecodable.
        */}
      {!placing ? null : (
        <p className="tapnote">{placingHint('position', addsAir ? 'air' : 'ground')}</p>
      )}
      {/*
        * The same affordance for the pilot, with its own words, because
        * "tap where you'll stand" is what the other one says and these are
        * two different standing places.
        */}
      {!placingPilot ? null : <p className="tapnote">{placingHint('pilot', 'ground')}</p>}
      {!placingAim ? null : (
        <p className="tapnote">Tap the thing you want the sun behind.</p>
      )}

      {/*
        * THE CONTROL ROW, COLLAPSED ONCE THERE IS A PLAN.
        *
        * Measured at 390x844 it was 150px over three lines, 18 percent of the
        * screen before any map. One line was the alternative and is not
        * possible: the controls are about 650px of legible text end to end,
        * and the only way to fit them is icons, which trades the thing that
        * makes a control usable in sun for space that can be found another
        * way. See src/core/hud.ts for the reasoning in full.
        *
        * THE PLATFORM SWITCH STAYS because it is the only one here that
        * changes what the NEXT TAP DOES rather than what is drawn, and it
        * carries the counts that say whether the filter is hiding anything.
        */}
      {/*
        * NOTHING FLOATS OVER THE TOP-LEFT OF THE MAP ANY MORE.
        *
        * The HUD was two rows of word-pills: the platform switch, a LESS/MORE
        * disclosure, and up to six reveals. Every one of them has a better
        * home:
        *
        *   the platform switch is a filter, so it moved to the head of the
        *   list it filters, inside the sheet
        *
        *   Conditions, Sun when, Airspace, Layers and Hazards are content, so
        *   they are sections in the sheet
        *
        *   the LESS/MORE disclosure went with them: there is nothing left to
        *   disclose, so a control for disclosing it is a control for nothing
        *
        * What acts on the map immediately with no surface at all is in the
        * rail on the right edge. That is the whole rule, and the layers
        * control is the test of it: it looks small enough to put in the rail
        * and it has content, so it is a section.
        */}

      {/*
        * THE SKY KEY, only while the layer is on.
        *
        * It carries the colour table NASA GIBS publishes for the band on
        * screen, and the zoom warning when one satellite pixel has grown
        * bigger than the view. Both are about the layer, so both live with it
        * rather than in a panel somewhere else.
        */}
      {/*
        * THE RAIL. Four icons, right edge, and nothing else floats.
        *
        * THE RULE IT ENFORCES: a control belongs here only if it acts on the
        * map IMMEDIATELY and opens NO surface. Sun overlay, pitch reset,
        * locate and fit-all all do exactly that. Layers looks small enough to
        * belong and does not qualify, because it has content, and content
        * lives in the sheet. That exception is the one worth refusing.
        */}
      {/*
        * AND IT IS GONE AT FULL, because at FULL there is no map to steer.
        *
        * CAUGHT IN A SCREENSHOT, not by a check, which is the part worth
        * recording. The sheet at full covers 92% of the screen and the rail
        * kept floating above it: four map controls on roughly 40x130px of the
        * shoot line and the scrubber's right edge. The new surface audit
        * passed it, because the rail is an allowed surface and the assertion
        * only asked what covers the MAP, never what covers the sheet.
        *
        * That is the same blind spot the deleted PROTECTED list was invented
        * to patch, arriving in new clothes exactly as predicted. The fix is
        * the general rule rather than another entry: a surface may not cover
        * another surface, asserted pairwise by position in audit-surface.mjs,
        * three elements and no list.
        *
        * Hiding it is right rather than merely convenient. Every control here
        * acts on the map immediately, and at full the map is 6.7% of the
        * screen -- there is nothing left to act on, and the shooter at full
        * is reading, not steering.
        */}
      {sheet === 'full' ? null : (
      <MapRail
        showSun={showSun}
        onShowSun={onShowSun}
        pitch={pitch}
        onResetPitch={() => handle.current?.setPitch(0)}
        onLocate={onLocate}
        locating={locating}
        onFitAll={() => handle.current?.fitAll(fitTargets)}
        canFitAll={fitTargets.length > 0}
      />
      )}

      <BottomSheet
        detent={sheet}
        onDetentChange={setSheet}
        onHeightChange={setSheetHeight}
        reservedBottom={dockHeight}
        peek={
          <div className="peek">
            {/*
              * PEEK IS THE SHOOT LINE AND THE SCRUBBER. Nothing else.
              *
              * It used to be a summary, a full width primary and a secondary
              * row, 176px of it, while the scrubber sat in its own bar below.
              * Two bars for two things that are read together. The scrubber is
              * the thing you touch most and the shoot line is what tells you
              * what you are scrubbing, so they are the peek and everything
              * that acts on the PLAN moved in with the plan.
              */}
            <button type="button" className="peek__line" onClick={onPeekTap}>
              <span className="peek__label">{peekStatus.label}</span>
              <span className="peek__value">{peekStatus.line}</span>
            </button>

            {venueWindow === null || scrubbedAt === null || sun === null ? null : (
              <TimeScrubber
                start={venueWindow.start}
                end={venueWindow.end}
                value={scrub}
                onChange={onScrub}
                at={scrubbedAt}
                sun={sun}
                timeZone={venueWindow.timeZone}
                timeZoneAbbr={venueWindow.timeZoneShort}
                tideExtremes={tideExtremes}
                phases={nightBands}
                phase={nightPhase}
                flying={{ airPositions, dronePlatform: platformFilter === 'air' }}
              />
            )}
          </div>
        }
        half={
          <div className="sheet__half">
            {/*
              * THE SELECTED POSITION'S CARD IS THE HALF CONTENT.
              *
              * It was the fourth and last surface floating over the map, with
              * z-index 4 and its bottom offset computed from the dock plus the
              * live sheet height. Selection now changes WHAT the sheet shows
              * and the detent decides HOW MUCH of it, which are two separate
              * questions that one absolute position had tangled together.
              *
              * THE FILTER LIVES WITH WHAT IT FILTERS, which is the list, so it
              * goes with the list rather than with the card.
              */}
            {selected !== null ? null : (
              <PlatformFilter
                value={platformFilter}
                onChange={onPlatformFilter}
                counts={platformCounts}
                hidden={hiddenByPlatform}
                airAvailable={airAvailable}
              />
            )}

            {selected !== null ? (
              <PositionCard
                planned={selected}
                shootAt={scrubbedAt}
                timeZone={venueWindow?.timeZone ?? null}
                tide={tideNow}
                onClose={() => onSelect(null)}
                count={plan.length}
                onDelete={onDeletePosition}
                onDuplicate={onDuplicatePosition}
                onMove={onMovePosition}
                onSetOptic={onSetOptic}
                onSetAltitude={onSetAltitude}
                onSetShotType={onSetShotType}
                onSetYaw={onSetYaw}
                kit={kitProfile}
                selection={kitSelection}
                marks={marks}
                subject={venue}
                pilotAt={pilotAt}
                onPlacePilot={() => onPlacingPilot(true)}
              />
            ) : (
              <>
                {/*
                  * THE SLAB IS GONE. A full width ADD POSITION button owned a
                  * whole row of the screen for an action the map itself
                  * already performs on a tap. What is left is a 32px + at the
                  * head of the list it adds to, and suggesting is a text
                  * action beside it rather than a second slab: the model has
                  * never placed well enough to deserve equal weight with the
                  * shooter's own tap on ground they know.
                  */}
                <div className="plist__head">
                  <h2 className="plist__title">
                    Positions
                    <span className="plist__n num"> {plan.length}</span>
                  </h2>
                  <div className="plist__acts">
                    <button
                      type="button"
                      className={`plist__add${placing ? ' plist__add--armed' : ''}`}
                      onClick={() => onPlacing(!placing)}
                      aria-pressed={placing}
                      aria-label={
                        placing
                          ? 'Cancel adding a position'
                          : addsAir
                            ? 'Add an air position by tapping the map'
                            : 'Add a position by tapping the map'
                      }
                    >
                      {placing ? '\u00D7' : '+'}
                    </button>
                    <button
                      type="button"
                      className="plist__suggest"
                      onClick={onGenerate}
                      disabled={generation.status === 'working'}
                    >
                      {generation.status === 'working' ? 'Suggesting\u2026' : 'Suggest'}
                      <span className="plist__why">{briefSource}</span>
                    </button>
                  </div>
                </div>

                <ShotList
                  plan={visiblePlan}
                  planCoverage={null}
                  desiredShots={desiredShots}
                  selectedId={selectedId}
                  onPick={onPickAndRaise}
                />

                <PlanStatus
                  generation={generation}
                  onFixBlock={onFixBlock}
                  planCoverage={planCoverage}
                  siteNote={siteNote}
                  terrainNote={terrainNote}
                  positionNote={positionNote}
                />
              </>
            )}
          </div>
        }
        full={
          <div className="sheet__sections">
            {/*
              * FIVE SECTIONS, ONE SCROLL, no back buttons and nothing to
              * switch between. Each was its own surface over the map; three of
              * them were absolutely positioned with their own bottom-offset
              * arithmetic against the live sheet height, which is where three
              * separate bugs came from.
              *
              * A SIXTH APPEARS WHEN SOMETHING IS FLYING. Airspace is gated on
              * an air position for the same reason it always was: Part 107
              * paperwork beside a tripod is a rule attached to something it
              * does not govern.
              */}
            <SheetSection title="Conditions">
              <ConditionsPanel
                venueWindow={venueWindow}
                tide={tide}
                scrubbedAt={scrubbedAt}
                venue={venue}
                wind={wind}
                windLevels={windLevels}
                gustMps={gustMps}
                windAt={windAt}
                windPast={windPast}
                windHeight={windHeight}
                ratedWindMps={ratedWindMps}
                ratedWindSource={ratedWindSource}
                tideNow={tideNow}
                cloud={selectedCloud}
              />
            </SheetSection>

            <SheetSection title="Sun when">
              <SunSearchPanel
                venue={venue}
                timeZone={venueWindow?.timeZone ?? null}
                timeZoneAbbr={venueWindow?.timeZoneShort ?? null}
                target={aimAt}
                picking={placingAim}
                onPickTarget={() => onPlacingAim(!placingAim)}
              />
            </SheetSection>

            {airPositions === 0 ? null : (
              <SheetSection title="Airspace">
                <AirspacePanel venue={venue} altitudeFeet={airAltitudeFeet} />
              </SheetSection>
            )}

            <SheetSection title="Layers">
              <LayersPanel
                kitProfile={kitProfile}
                plan={plan}
                coneMode={coneMode}
                onConeMode={onConeMode}
                lensFilters={lensFilters}
                onLensFilters={onLensFilters}
                isolatedId={isolatedId}
                onClearIsolate={onClearIsolate}
                showArc={showArc}
                onShowArc={onShowArc}
                showLabels={showLabels}
                onShowLabels={onShowLabels}
                showTerrain={showTerrain}
                onShowTerrain={onShowTerrain}
                showBuildings={showBuildings}
                onShowBuildings={onShowBuildings}
                buildingsNote={buildingsNote}
                terrainSuspended={terrainPaused}
                showSky={showSky}
                onShowSky={onShowSky}
                marking={marking}
                onMarking={onMarking}
                markCount={marks.length}
                sunAltitude={sun?.altitude ?? null}
                mapZoom={mapZoom}
              />
            </SheetSection>

            <SheetSection title="Hazards">
              <HazardPanel
                marks={marks}
                kind={markKind}
                onKind={onMarkKind}
                drawing={markDrawing}
                onDrawing={onMarkDrawing}
                draft={markDraft}
                onFinishLine={onFinishLine}
                onCancelLine={onCancelLine}
                selected={selectedMark}
                onSelect={onSelectMark}
                onChange={onChangeMark}
                onDelete={onDeleteMark}
                marking={marking}
                onMarking={onMarking}
                date={shootDate}
                latitude={venue?.lat ?? null}
              />
            </SheetSection>

            <SheetSection title="Sky">
              <SkyLegend
                band={skyBand}
                advice={zoomAdvice(skyBand, venue?.lat ?? 0, mapWidth, mapZoom)}
                sky={sky}
                clock={(at) =>
                  venueWindow === null
                    ? at.toISOString().slice(11, 16)
                    : formatClock(at, venueWindow.timeZone)
                }
                boundary={
                  venueWindow === null
                    ? null
                    : boundaryNote(new Date(), (at) => formatClock(at, venueWindow.timeZone))
                }
                onZoomOut={(zoom) => handle.current?.zoomTo(zoom)}
                layer={skyLayer}
                onLayer={onSkyLayer}
                windHeight={windHeight}
                ratedWindMps={ratedWindMps}
              />
            </SheetSection>

            <div className="sheet__acts">
              <button
                type="button"
                className="act"
                onClick={onPreparePack}
                disabled={plan.length === 0 || packState.status === 'working'}
              >
                <span className="act__label">
                  {packState.status === 'working'
                    ? `Saving ${packState.done}/${packState.total}`
                    : packIsCurrent
                      ? 'Save again'
                      : 'Save offline'}
                </span>
                <span className="act__why">
                  {plan.length === 0
                    ? 'Add a position first'
                    : packState.status === 'working'
                      ? 'Downloading photos'
                      : packIsCurrent
                        ? 'Saved and current'
                        : 'Works with no signal'}
                </span>
              </button>
              <button
                type="button"
                className="act"
                onClick={onGoToField}
                disabled={goToFieldBlocked !== null}
              >
                <span className="act__label">Start the shoot</span>
                <span className="act__why">
                  {goToFieldBlocked === null ? 'One position at a time' : 'Add a position first'}
                </span>
              </button>
              {airPositions === 0 ? null : (
                <button
                  type="button"
                  className={`act${placingPilot ? ' act--armed' : ''}`}
                  onClick={() => onPlacingPilot(!placingPilot)}
                  aria-pressed={placingPilot}
                >
                  <span className="act__label">
                    {placingPilot
                      ? 'Tap the map \u00b7 cancel'
                      : pilotAt === null
                        ? 'Place the pilot position'
                        : 'Move the pilot position'}
                  </span>
                  <span className="act__why">Measures the distance to each aircraft</span>
                </button>
              )}
            </div>

            <FieldPackControl
              pack={pack}
              matches={packIsCurrent}
              positions={plan.length}
              state={packState}
              timeZone={venueWindow?.timeZone ?? null}
              onPrepare={onPreparePack}
            />
          </div>
        }
      />

      {/* The mode rail only. The scrubber moved into the sheet's peek. */}
      <div className="dock" ref={measureDock}>
        {footer}
      </div>
    </div>
  )
}
