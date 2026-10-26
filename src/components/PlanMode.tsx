import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LatLon } from '../core/geo.ts'
import { loadAirspaceOverlay, type AirspaceOverlay } from '../lib/airspaceOverlay.ts'
import { measureWords } from '../lib/measureWords.ts'
import { shootDayIcs } from '../core/shootIcs.ts'
import { saveText } from '../lib/saveText.ts'
import { isEventDay, venueToday } from '../core/eventDay.ts'
import { TFR_URL } from '../core/airspaceLookup.ts'
import type {
  Platform,
  PlatformFilter as PlatformFilterValue,
} from '../core/platformFilter.ts'
import type { ShotType } from '../core/shotType.ts'
import { formatClock } from '../core/timezone.ts'
import type { SkyState } from '../lib/useSkyFrames.ts'
import type { Wind } from '../core/upwind.ts'
import type { LevelWind } from '../core/windProfile.ts'
import type { VenueCloud } from '../lib/forecast.ts'
import { forecastAge, type Provenance } from '../lib/savedForecast.ts'
import { durationWords } from '../core/duration.ts'
import type { TideExtreme, TideState } from '../core/tide.ts'
import type { SunArc, SunPosition } from '../core/sun.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import type { GenerationState } from '../lib/generation.ts'
import type { DesiredShot } from '../lib/shotList.ts'
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
import { goesBandFor, zoomAdvice } from '../core/goes.ts'
import { boundaryNote } from '../core/skyTime.ts'
import { phaseAt } from '../core/nightWindow.ts'
import type { MarkKind, SiteMark } from '../core/siteMark.ts'
import { HazardPanel } from './HazardPanel.tsx'
import { BottomSheet } from './BottomSheet.tsx'
import { raisedTo, type SheetDetent } from '../core/sheetDetent.ts'
import type { HorizonInput } from '../core/skyWindow.ts'
import { AirspacePanel } from './AirspacePanel.tsx'
import type { ConeMode } from '../lib/coneMode.ts'
import { FieldPackControl, type PackBuildState } from './FieldPackControl.tsx'
import { OfflineAreas } from './OfflineAreas.tsx'
import type { VenueCacheState } from '../lib/useVenueCache.ts'
import type { Box } from '../lib/tileRange.ts'
import type { ReadFile } from '../lib/scoutFile.ts'
import { useOnline } from '../lib/useOnline.ts'
import { MapRail } from './MapRail.tsx'
import { SkyPanel } from './SkyPanel.tsx'
import { HOME, TIME_MATTERS, type CardKind, type SheetCard } from '../lib/sheetCard.ts'
import { formatWind, type Units } from '../lib/units.ts'
import { Card, CardMore } from './Card.tsx'
import { SkyLegend } from './SkyLegend.tsx'
import { WindCard } from './WindCard.tsx'
import { ChipRow, type Chip } from './ChipRow.tsx'
import { TopBar } from './TopBar.tsx'
import { startHeading } from '../lib/heading.ts'
import { MoonriseCard } from './MoonriseCard.tsx'
import { readCeilingFeet } from '../lib/venue.ts'
import { MAX_ALTITUDE_FEET } from '../core/air.ts'
import { facilityCellAt } from '../lib/uasfm.ts'
import { SettingsSheet } from './SettingsSheet.tsx'
import { AboutSheet, type HowSection } from './AboutSheet.tsx'
import { LayerTiles } from './LayerTiles.tsx'
import { TILE_ART } from './tileArt.tsx'
import { WeatherPanel } from './WeatherPanel.tsx'
import { SunReadout } from './SunReadout.tsx'
import { CamList } from './CamList.tsx'
import { SunCurve } from './SunCurve.tsx'
import { BUILDINGS_MIN_ZOOM, ESRI_NATIVE_MAX_ZOOM, MapView, type MapHandle } from './MapView.tsx'
import { buildingsToGeoJson, fetchBuildings, type Building } from '../lib/buildings.ts'
import { shadowMap } from '../core/shadowMap.ts'
import { shadowCollection } from '../lib/shadowLayer.ts'
import { lightNow } from '../core/lightNow.ts'
import { PlatformFilter } from './PlatformFilter.tsx'
import { PlanStatus } from './PlanStatus.tsx'
import { PositionCard } from './PositionCard.tsx'
import { ShotList } from './ShotList.tsx'
import { SunSearchPanel } from './SunSearchPanel.tsx'
import { TimeBar } from './TimeBar.tsx'
import { ToolDock } from './ToolDock.tsx'
import { ExposurePlayground } from './ExposurePlayground.tsx'
import { SkyCard } from './SkyCard.tsx'
import { CAMS, camKind } from '../data/cams.ts'
import { CallSheetCard } from './CallSheetCard.tsx'
import type { ToolContext } from '../core/callSheetTools.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import { classificationOf } from '../core/lighting.ts'
import { LightNowBlock } from './LightNowBlock.tsx'
import { getMoonArc } from '../core/moonArc.ts'
import type { SkyTab } from '../lib/skyTab.ts'
import { PhaseRule } from './PhaseRule.tsx'


/*
 * Room for the time bar at peek, measured at 390 wide: the grabber row 21,
 * the bar 130 (date line and strip with its hour labels), and 13 to spare.
 */
const PLAN_PEEK_PX = 164

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

/** How far terrain tilts the map when it is turned on. Enough to see a ridge stand up. */
const TERRAIN_TILT_DEGREES = 60
/** Whether the two-finger tilt hint has been shown on this phone. */
const TILT_HINT_KEY = 'scoutngo.tiltHint.v1'

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
  /**
   * CLOUD OVER THE VENUE for the scrubbed hour, from the same request as the
   * wind. This was `selectedCloud`, and App passed it the literal null, so
   * the CLOUD chip said "no data" everywhere. The sightline cloud for one
   * position is still on that position's card.
   */
  venueCloud: VenueCloud | null
  /** Write the one ScoutNGo file: kit, shelved gear, units, spots. */
  onExport: () => void
  /** Apply a read ScoutNGo file, and say what changed. */
  onImport: (file: ReadFile) => string
  /** The venue saving itself for offline. See src/lib/useVenueCache.ts. */
  venueCache: VenueCacheState
  /** The map's current view, for "take this area offline". */
  getView: () => Box | null
  /** Whether the wind and cloud are live or saved, and when they arrived. */
  forecast: Provenance
  /** Why there is no forecast at all, in words. Null when there is one. */
  forecastReason: string | null
  /** The low water nearest the shoot window. See src/lib/lowTide.ts. */
  lowTide: TideExtreme | null
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
  onIsolate: (id: string | null) => void
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
  onFixBlock: (field: SetupTarget | null) => void
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
  /*
   * UNITS AND THE DOORS OUT OF ABOUT.
   *
   * The About card is the only place settings live -- the bottom nav is three
   * stages and gets no fourth slot -- so everything that used to be a
   * Settings row arrives here.
   */
  /** The resolved venue name, already keyed to the coordinate. */
  venueNameLine: string
  /*
   * The town, which the venue bar has no room for. Null where the venue line
   * is one part -- "Big Meadow" -- or a coordinate.
   */
  venueTownLine: string | null
  units: Units
  onUnits: (next: Units) => void
  onHow: (section: HowSection) => void
  onEditKit: () => void
  onOpenSpots: () => void
  onOpenSettings: () => void
  savedSpotCount: number
  /** The shoot date, yyyy-mm-dd, for the leaf answer on a deciduous mark. */
  shootDate: string
  /** Which brief a generate would send: the typed one, or the chips. */
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
  /*
   * The peek's one line, or null when there is nothing to report that the
   * venue bar does not already say. See App.tsx.
   */
  peekStatus: { label: string; line: string } | null
  fitTargets: LatLon[]
  pack: FieldPack | null
  packIsCurrent: boolean
  packState: PackBuildState
  onPreparePack: () => void
  desiredShots: DesiredShot[]
  footer: React.ReactNode
  /* The shell's pieces, owned by App. */
  onMenu: () => void
  menuOpen: boolean
  /** The menu asked for a card: Sky or About. The tick makes a repeat ask open it again. */
  cardRequest: { kind: 'sky' | 'settings' | 'about' | 'callsheet' | 'exposure'; tick: number }
  /** What is in the bag, for the call sheet's kit tool. */
  bag: KitSelection
  /** The search pill was tapped: go and search. */
  onSearch: () => void
  /** The Now screen, from Sky's Tonight page. */
  onOpenNow: () => void
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
  /** "I have LAANC here", for this venue. See laancHere in src/lib/venue.ts. */
  laanc: boolean
  onLaanc: (on: boolean) => void
  /** "My approved ceiling" as typed for this venue, '' for the grid's. See approvedCeilingHere. */
  approvedCeiling: string
  onApprovedCeiling: (typed: string) => void
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
  venueCloud,
  venueCache,
  getView,
  onExport,
  onImport,
  forecast,
  forecastReason,
  lowTide,
  sky,
  selectedId,
  onSelect,
  selected,
  onFlyTo,
  coneMode,
  onConeMode,
  isolatedId,
  onIsolate,
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
  venueNameLine,
  venueTownLine,
  units,
  onUnits,
  onHow,
  onEditKit,
  onOpenSpots,
  onOpenSettings,
  savedSpotCount,
  shootDate,
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
  peekStatus,
  pack,
  packIsCurrent,
  packState,
  onPreparePack,
  desiredShots,
  footer,
  onMenu,
  menuOpen,
  cardRequest,
  bag,
  onSearch,
  onOpenNow,
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
  laanc,
  onLaanc,
  approvedCeiling,
  onApprovedCeiling,
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
  const [terrainPaused, setTerrainPaused] = useState(false)
  const [buildingsNote, setBuildingsNote] = useState<string | null>(null)
  const [sheetHeight, setSheetHeight] = useState(108)
  const [pitch, setPitch] = useState(0)

  const nightPhase = useMemo(
    () =>
      scrubbedAt === null || venue === null ? null : phaseAt(scrubbedAt, venue.lat, venue.lon),
    [scrubbedAt, venue],
  )

  /*
   * The dock height is READ AT RUNTIME rather than assembled from per-bar tokens: the
   * scrubber's real height is set by its own content, and a token that said 62px
   * while it rendered at 93px silently put it on top of the chips.
   */
  const dock = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(0)
  /*
   * THE MAP'S WIDTH IN CSS PIXELS, reported by the map on every move.
   *
   * zoomAdvice needs the real width to say whether the satellite layer has
   * any detail left at this zoom: the answer is about how many ground metres
   * one GOES pixel covers across the screen, and an assumed 390 is wrong on
   * every device that is not this one.
   */
  const [mapWidth, setMapWidth] = useState(390)
  const measureDock = (node: HTMLDivElement | null) => {
    dock.current = node
    if (node !== null) setDockHeight(node.offsetHeight)
  }

  /*
   * THE CHROME OVER THE TOP OF THE MAP, measured the same way as the dock.
   *
   * The venue bar and the chip row float above the map, and the sheet at FULL
   * would otherwise grow up behind them. Measured from the chip row's own
   * bottom edge rather than summed from CSS, because the chip values wrap to
   * two lines at some venue names and the row is then taller than any
   * constant written here would say.
   */
  const [topChrome, setTopChrome] = useState(0)
  const measureChips = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) setTopChrome(Math.round(node.getBoundingClientRect().bottom))
  }, [])

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
   * A NEW SELECTION FROM ANYWHERE RAISES, placing included. Adding a position
   * selects it, and that path went around onSelectAndRaise: the card was
   * selected behind the peek. While still placing, the map stays clear; the
   * card comes up when placing stops.
   */
  const selectedKey = selected?.position.id ?? null
  useEffect(() => {
    if (selectedKey === null || placing) return
    const timer = setTimeout(raiseToHalf, 0)
    return () => clearTimeout(timer)
  }, [selectedKey, placing, raiseToHalf])

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
   * THE SKYLINE, REPORTED BY MapView WHEN ITS TILES SETTLE.
   *
   * This used to poll MapHandle.horizonAt on a timer and stop when two reads
   * agreed, which settled on whatever was loaded at that instant rather than
   * on the finished DEM. MapView watches the map's own `idle` event now, which
   * is the one signal that actually means "the elevation data is here".
   */
  const [horizonProfile, setHorizonProfile] = useState<HorizonInput>({ kind: 'flat' })


  /*
   * Now, fixed at mount. A listing that recomputed `new Date()` every render
   * would re-derive ninety days of events on every keystroke elsewhere in the
   * sheet, and the first row would occasionally shuffle under the finger.
   */
  const [skyNow] = useState(() => new Date())


  /*
   * The band on screen and the zoom to judge it at. The band follows the sun
   * (src/core/goes.ts); the zoom and the width come from the map itself,
   * because the threshold depends on how wide the screen actually is.
   */
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
  /*
   * THE COMPASS. The needle follows the map's rotation; a tap turns the map
   * with the phone's heading, another puts north back at the top. See
   * src/lib/heading.ts for the iPhone permission and what is never kept.
   */
  const [mapBearing, setMapBearing] = useState(0)
  const [followHeading, setFollowHeading] = useState(false)
  /* The dock's Sun/Moon switch: the moon's line on the time bar and its rays on the map. */
  const [moonOn, setMoonOn] = useState(false)
  /*
   * PUT THE TIME BAR ON AN INSTANT. The window is the unit, so the moment can
   * sit anywhere in the day and beyond; a jump from the Sky card lands here too.
   */
  const scrubTo = useCallback(
    (next: Date) => {
      if (venueWindow === null) return
      const span = Math.max(60_000, venueWindow.end.getTime() - venueWindow.start.getTime())
      onScrub((next.getTime() - venueWindow.start.getTime()) / span)
    },
    [venueWindow, onScrub],
  )
  /*
   * WHAT THE CALL SHEET'S TOOLS ANSWER FROM. Built here, on the phone; the
   * coordinate in it is used by the tools and never put in an answer.
   */
  const callSheetContext = useMemo((): ToolContext | null => {
    if (venue === null || venueWindow === null) return null
    const names = (ids: string[], list: { id: string; name: string }[]) => list.filter((g) => ids.includes(g.id)).map((g) => g.name)
    return {
      venue,
      timeZone: venueWindow.timeZone,
      window: { start: venueWindow.start, end: venueWindow.end },
      positions: plan.map((p) => ({
        number: p.position.number,
        platform: p.position.platform,
        optic: p.optic.name,
        focalMm: p.focalLength,
        altitudeFeet: p.position.altitudeFeet,
        toSubjectMeters: p.groundRangeMeters,
        cameraBearing: p.aim.shotType === 'framed' ? p.aim.cameraBearing : null,
        light: p.read.shotType === 'framed' ? classificationOf(p.read) : null,
      })),
      bag: {
        bodies: names(bag.bodyIds, kitProfile.bodies),
        lenses: names(bag.lensIds, kitProfile.lenses),
        drones: names(bag.droneIds, kitProfile.drones),
      },
      conditions: {
        lowCloudPercent: venueCloud?.low ?? null,
        windKnots: wind === null ? null : wind.speedMps * 1.943844,
        lowTide: lowTide === null ? null : formatClock(lowTide.at, venueWindow.timeZone),
      },
      playbook: '',
      units: units.distance,
    }
  }, [venue, venueWindow, plan, bag, kitProfile, venueCloud, wind, lowTide, units.distance])

  /*
   * THE MOONRISE PLAN'S INPUTS. The lenses and drone in the bag, and the
   * drone's height: only with the LAANC switch on here, under the lower of
   * the grid and the approved ceiling, and never over 400 ft.
   */
  const moonriseInput = useMemo(() => {
    if (venue === null || venueWindow === null) return null
    const lenses = kitProfile.lenses.filter((l) => bag.lensIds.includes(l.id))
    const drone = kitProfile.drones.find((d) => bag.droneIds.includes(d.id))?.name ?? null
    const grid = facilityCellAt(venue.lat, venue.lon)?.ceilingFeet ?? null
    const approved = readCeilingFeet(approvedCeiling)
    const ceiling = Math.min(MAX_ALTITUDE_FEET, grid === null ? (approved ?? MAX_ALTITUDE_FEET) : Math.min(grid, approved ?? grid))
    const droneCeiling = !laanc
      ? { reason: 'the LAANC switch is off at this spot.' }
      : ceiling <= 0
        ? { reason: 'the grid ceiling here is 0 ft.' }
        : { feet: ceiling }
    return { venue, timeZone: venueWindow.timeZone, from: skyNow, lenses, drone, droneCeiling }
  }, [venue, venueWindow, kitProfile, bag, laanc, approvedCeiling, skyNow])

  /* Coast or road cameras on the cams card, and their pins on the map while it is open. */
  const [camKindShown, setCamKindShown] = useState<'coast' | 'road'>('coast')

  /* Which page of the Sky card is open. The dock's calendar opens it at the calendar. */
  const [skyTab, setSkyTab] = useState<SkyTab>('tonight')
  /*
   * TWO-PIN MEASURE. Null is off; on, each tap drops a pin and a third tap
   * starts over. The pins are not a plan: they are not saved or sent.
   */
  const [measurePins, setMeasurePins] = useState<LatLon[] | null>(null)
  const onMeasureAt = useCallback(
    (at: LatLon) => setMeasurePins((pins) => (pins === null ? null : pins.length >= 2 ? [at] : [...pins, at])),
    [],
  )
  /*
   * THE AIRSPACE OVERLAY. The data loads the first time it is switched on and
   * stays loaded; switching off only stops drawing it.
   */
  const [airspaceOn, setAirspaceOn] = useState(false)
  const [airspaceOverlay, setAirspaceOverlay] = useState<AirspaceOverlay | null>(null)
  const [airspaceDense, setAirspaceDense] = useState(false)
  const [airspaceFailed, setAirspaceFailed] = useState(false)
  useEffect(() => {
    if (!airspaceOn || airspaceOverlay !== null) return
    let live = true
    loadAirspaceOverlay().then(
      (overlay) => {
        if (live) setAirspaceOverlay(() => overlay)
      },
      () => {
        if (live) setAirspaceFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [airspaceOn, airspaceOverlay])
  const [headingNote, setHeadingNote] = useState<string | null>(null)
  const stopHeading = useRef<(() => void) | null>(null)
  const onCompass = useCallback(() => {
    if (stopHeading.current !== null) {
      stopHeading.current()
      stopHeading.current = null
      setFollowHeading(false)
      handle.current?.setBearing(0)
      return
    }
    void startHeading((degrees) => handle.current?.setBearing(degrees, true)).then((started) => {
      if (!started.ok) {
        setHeadingNote(started.reason)
        handle.current?.setBearing(0)
        return
      }
      setHeadingNote(null)
      stopHeading.current = started.stop
      setFollowHeading(true)
    })
  }, [handle])
  useEffect(() => () => stopHeading.current?.(), [])

  /*
   * TERRAIN ON TILTS THE MAP. A ridge seen from straight above is a stain; the
   * height is the reason to turn terrain on, so the map tilts to show it. The
   * first time, one line says how to tilt by hand, and then never again.
   */
  const [tiltHint, setTiltHint] = useState(false)
  const turnTerrain = useCallback(
    (on: boolean) => {
      onShowTerrain(on)
      if (!on) return
      handle.current?.setPitch(TERRAIN_TILT_DEGREES)
      let seen = false
      try {
        seen = localStorage.getItem(TILT_HINT_KEY) === 'seen'
        localStorage.setItem(TILT_HINT_KEY, 'seen')
      } catch {
        /* Storage refused: show it; it is one line. */
      }
      if (!seen) {
        setTiltHint(true)
        window.setTimeout(() => setTiltHint(false), 6000)
      }
    },
    [onShowTerrain, handle],
  )

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

  const [buildingData, setBuildingData] = useState<GeoJSON.FeatureCollection | null>(null)
  /* The footprints themselves, for the shadows. Loaded for either switch. */
  const [buildingList, setBuildingList] = useState<Building[] | null>(null)
  const wantBuildings = showBuildings || showSun

  useEffect(() => {
    if (!wantBuildings || venue === null) {
      setBuildingData(null)
      setBuildingList(null)
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
          setBuildingList(result.buildings)
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
  }, [wantBuildings, venue, mapZoom >= BUILDINGS_MIN_ZOOM])

  /*
   * THE SHADOW MAP, for the moment on the time bar. Footprint swept by
   * height / tan(sun altitude), src/core/shadowMap.ts; flat ground; a building
   * with no known height casts nothing and is counted, never guessed.
   */
  const shadows = useMemo(() => {
    if (!showSun || buildingList === null || sun === null) return null
    return shadowMap(
      buildingList.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.height.metres })),
      { azimuth: sun.azimuth, altitude: sun.altitude },
    )
  }, [showSun, buildingList, sun])
  const shadowFeatures = useMemo(() => {
    if (!showSun || venue === null || scrubbedAt === null) return null
    const person = lightNow(scrubbedAt, venue.lat, venue.lon).personShadow
    return shadowCollection(shadows, person === null ? null : { at: venue, lengthMeters: person.lengthMeters, bearing: person.bearing })
  }, [showSun, venue, scrubbedAt, shadows])

  /* Whether anything is in the air, which is what the pilot control is for. */
  const airPositions = plan.filter((p) => p.position.platform === 'air').length


  /* ------------------------------------------------------------ the card */

  /*
   * THE SHEET SHOWS ONE SUBJECT. `card` is the whole of what is in it.
   *
   * Dismissing any card returns to the shoot, which is a member of the union
   * like the rest rather than a special case: "go back" is "show the shoot".
   */
  const [card, setCard] = useState<SheetCard>(HOME)
  const camPins = useMemo(
    () =>
      card.kind !== 'cams'
        ? []
        : CAMS.filter((cam) => camKind(cam) === camKindShown).map((cam) => ({ id: cam.id, label: cam.name, at: cam.at, href: cam.url })),
    [card.kind, camKindShown],
  )
  /* No connection: one quiet mark in the venue bar, and nothing else. */
  const online = useOnline()
  const home = useCallback(() => setCard(HOME), [])

  /*
   * WHAT THE VENUE BAR SAYS. The name is already resolved upstream and is
   * never stale -- see src/core/venueName.ts -- and the date is the shoot's,
   * short, because the bar is a glance not a form.
   */
  const dateLabel = useMemo(
    () =>
      venueWindow === null
        ? '—'
        : venueWindow.start
            .toLocaleDateString('en-US', {
              timeZone: venueWindow.timeZone,
              weekday: 'short',
              day: 'numeric',
            })
            .toUpperCase(),
    [venueWindow],
  )

  /*
   * OPENING A CARD RAISES THE SHEET, by the same rule a position tap does:
   * a card behind an 88px peek is a card nobody can read. It never lowers.
   */
  const openCard = useCallback(
    (kind: CardKind) => {
      setCard((current) => (current.kind === kind ? HOME : ({ kind } as SheetCard)))
      raiseToHalf()
    },
    [raiseToHalf],
  )

  /* The menu's Sky and About open here, on the card they name, half up. */
  useEffect(() => {
    if (cardRequest.tick === 0) return
    const timer = setTimeout(() => {
      /* The exposure playground is a page of the Sky card. */
      if (cardRequest.kind === 'exposure') {
        setSkyTab('exposure')
        setCard({ kind: 'sky' } as SheetCard)
      } else {
        setCard({ kind: cardRequest.kind } as SheetCard)
      }
      raiseToHalf()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardRequest])

  const clock = useCallback(
    (at: Date | null) =>
      at === null || venueWindow === null ? null : formatClock(at, venueWindow.timeZone),
    [venueWindow],
  )

  /*
   * THE FOUR CHIPS. The rule is in docs/chips.md and the surface audit holds
   * the count: a chip earns its place only if its value could make you not
   * go. Every value carries its unit, and a value that is not known is a
   * dash rather than a zero.
   */
  const chips: Chip[] = useMemo(() => {
    const goldenLeft =
      venueWindow === null || scrubbedAt === null
        ? null
        : Math.round((venueWindow.end.getTime() - scrubbedAt.getTime()) / 60_000)
    const groundWind = wind?.speedMps ?? null
    const overRated =
      ratedWindMps !== null && groundWind !== null && groundWind > ratedWindMps
    /* LOW cloud: the layer that takes the sun away. The card shows all three. */
    const cloudPct = venueCloud?.low ?? null
    /* A saved forecast carries its age onto the chip; a live one carries nothing. */
    const age = forecast.kind === 'saved' ? forecastAge(forecast.fetchedAt, new Date()) : null

    return [
      {
        kind: 'golden',
        label: 'GOLDEN',
        value: goldenLeft === null ? null : goldenLeft <= 0 ? 'past' : durationWords(goldenLeft),
        urgent: goldenLeft !== null && goldenLeft > 0 && goldenLeft <= 60,
      },
      {
        kind: 'wind',
        label: 'WIND',
        /*
         * NULL, NOT formatWind's DASH. formatWind returns '—' for an absent
         * reading, which is right in a sentence and wrong on a chip -- see
         * the note on Chip.value in ChipRow.tsx.
         */
        value: groundWind === null ? null : formatWind(groundWind, units.wind),
        urgent: overRated,
        age: groundWind === null ? null : age,
      },
      {
        kind: 'cloud',
        label: 'CLOUD',
        value: cloudPct === null ? null : `${Math.round(cloudPct)}%`,
        age: cloudPct === null ? null : age,
      },
      {
        kind: 'tide',
        label: 'LOW TIDE',
        value: lowTide === null ? null : clock(lowTide.at),
        /* The zone is the unit of a clock time, said only away from the phone's own zone; see Chip.unit. */
        ...(venueWindow === null || venueWindow.timeZoneShort === '' ? {} : { unit: venueWindow.timeZoneShort }),
      },
    ]
  }, [venueWindow, scrubbedAt, wind, ratedWindMps, lowTide, venueCloud, forecast, units, clock])

  /*
   * WHICH GOES BAND THE SKY LAYER PAINTS, from the sun's altitude: visible
   * light has nothing to show after dark, and the infrared band does.
   */
  const skyBand = goesBandFor(sun?.altitude ?? -90)

  const weatherCommon = {
    at: scrubbedAt,
    timeZone: venueWindow?.timeZone ?? null,
    timeZoneAbbr: venueWindow?.timeZoneShort ?? null,
    wind,
    levels: windLevels,
    past: windPast,
    gustMps,
    windAt,
    windHeight,
    ratedWindMps,
    ratedWindSource,
    tide,
    tideNow,
    tideExtremes,
    cloud: venueCloud,
    forecast,
    forecastReason,
    units,
  }

  /*
   * HOME: THE SHOOT. The window, and the positions as thumbnails in a row
   * with a + at the end. Not a list of rows -- a shoot is a handful of places
   * you are going to stand, and a row of pictures is how that reads.
   */
  const shootCard = (
    <div className="shootc">
      <div className="shootc__head">
        {/*
          * THE TOWN LIVES HERE, because the venue bar could not hold it. The
          * bar names the venue; this says where in the world that is, once.
          */}
        <span className="shootc__title">{venueTownLine ?? 'The shoot'}</span>
        <span className="shootc__when num">
          {venueWindow === null
            ? '—'
            : `${clock(venueWindow.start) ?? '—'}–${clock(venueWindow.end) ?? '—'}`}
          {` · ${plan.length} ${plan.length === 1 ? 'position' : 'positions'}`}
        </span>
      </div>

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
          isolated={isolatedId === selected.position.id}
          onIsolate={onIsolate}
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
            * THE TWO THINGS YOU DO FROM HERE, AT THE HEAD OF THE LIST THEY
            * ADD TO. Add a position by hand, or ask for a plan.
            *
            * THEY WERE UNDER THE STATUS PARAGRAPH, which put both of them off
            * the bottom of the sheet at HALF: the screen said "no positions
            * yet" and the only two controls that fix that were somewhere
            * below the fold. A message that names a missing thing has to
            * offer the thing, and on the home card the offer comes first.
            *
            * Everything else that used to be in this footer -- start the
            * shoot, the airspace jump -- belongs to the stage that does it,
            * and the nav reaches every stage now.
            */}
          <div className="shootc__acts">
            {/*
              * A 32px SQUARE + WHEN IDLE, A SENTENCE WHEN ARMED.
              *
              * The + is at the head of the list it adds to and needs no
              * label there: it is the universal shape, and the aria-label
              * carries the words for anybody who cannot see it.
              *
              * ARMED IS DIFFERENT, and it is the one state that must use
              * words. "The button is lit" does not tell you the next thing
              * to do is tap the map, and an armed map that looks like an
              * ordinary map is how somebody drops a position by accident.
              */}
            <button
              type="button"
              className={`shootc__add${placing ? ' shootc__add--armed' : ''}`}
              aria-pressed={placing}
              aria-label={placing ? 'Stop placing positions' : 'Add a position'}
              onClick={() => onPlacing(!placing)}
            >
              {placing ? 'Tap the map · stop' : '+'}
            </button>
            <button type="button" className="shootc__gen" onClick={onGenerate}>
              Suggest
            </button>
          </div>

          <PlatformFilter
            value={platformFilter}
            onChange={onPlatformFilter}
            counts={platformCounts}
            hidden={hiddenByPlatform}
            airAvailable={airAvailable}
          />
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

          {/*
            * SAVE OFFLINE STAYS ON THE SHOOT, because it is about this shoot:
            * the photos for these positions, on this phone, for a place with
            * no signal. It was in a footer under five sections; it is one
            * control on the card about the thing it saves.
            */}
          {/*
            * THE SHOOT DAY IN THE PHONE'S CALENDAR: the window, golden hour
            * starting, and the end of civil twilight for the strobe, each with
            * an alarm. Times from src/core/shootIcs.ts.
            */}
          {venueWindow === null || venue === null ? null : (
            <button
              type="button"
              className="btn btn--small plan__ics"
              onClick={() =>
                saveText(
                  shootDayIcs({
                    name: venueNameLine,
                    lat: venue.lat,
                    lon: venue.lon,
                    start: venueWindow.start,
                    end: venueWindow.end,
                    stamp: new Date(),
                    uid: `scoutngo-${venue.lat.toFixed(5)}-${venue.lon.toFixed(5)}-${venueWindow.start.toISOString()}`,
                  }),
                  'text/calendar;charset=utf-8',
                  `scoutngo-shoot-${venueWindow.start.toISOString().slice(0, 10)}.ics`,
                )
              }
            >
              Add to calendar, with alarms
            </button>
          )}

          {/*
            * ON THE DAY, WITH A DRONE IN THE PLAN: today's restrictions are
            * the one thing this app cannot check. A link, never a verdict:
            * nothing here ever says there are none.
            */}
          {venueWindow !== null &&
          (airPositions > 0 || platformFilter === 'air') &&
          isEventDay(venueToday(venueWindow.start, venueWindow.timeZone), venueWindow.timeZone, new Date()) ? (
            <p className="eventday">
              <a href={TFR_URL} target="_blank" rel="noreferrer noopener">
                Check today's flight restrictions
              </a>
              <span className="eventday__why">This app does not check them.</span>
            </p>
          ) : null}

          <FieldPackControl
            pack={pack}
            matches={packIsCurrent}
            positions={plan.length}
            state={packState}
            timeZone={venueWindow?.timeZone ?? null}
            onPrepare={onPreparePack}
          />

          {/*
            * THE MAP, OFFLINE. The venue saves itself; a trip is taken by
            * hand, size first. See OfflineAreas.tsx.
            */}
          <OfflineAreas
            venueCache={venueCache}
            getView={getView}
            venueName={venueNameLine}
            online={online}
          />
        </>
      )}
    </div>
  )

  /*
   * LAYERS AS TILES. Every tile is a drawing of what it does and carries its
   * own state; the paragraphs that used to be on every row are behind the i.
   */
  const layersCard = (
    <LayerTiles
      base={[
        {
          id: 'satellite',
          label: 'Satellite',
          state: `ON · z${Math.round(mapZoom)}`,
          on: true,
          art: TILE_ART.satellite,
          onToggle: () => {},
        },
        {
          id: 'terrain',
          label: 'Terrain 3D',
          /* The tile says what the layer is actually doing, suspension included. */
          state: !showTerrain ? 'OFF' : terrainPaused ? 'PAUSED' : `ON · ${Math.round(pitch)}°`,
          on: showTerrain,
          art: TILE_ART.terrain,
          onToggle: () => turnTerrain(!showTerrain),
        },
        /*
         * NO CHART TILE. It toggled the same setting as Labels -- the Esri
         * roads and place names -- under a drawing of a nautical chart the app
         * does not have. Two tiles for one switch, one of them promising a
         * layer that does not exist: merged into Labels.
         */
      ]}
      overlays={[
        { id: 'cones', label: 'Cones', state: coneMode === 'all' ? 'ON' : 'OFF', on: coneMode === 'all', art: TILE_ART.cones, onToggle: () => onConeMode(coneMode === 'all' ? 'none' : 'all') },
        { id: 'sun', label: 'Sun arc', state: showArc ? 'ON' : 'OFF', on: showArc, art: TILE_ART.sunArc, onToggle: () => onShowArc(!showArc) },
        { id: 'shadows', label: 'Shadows', state: showSun ? 'ON' : 'OFF', on: showSun, art: TILE_ART.shadows, onToggle: () => onShowSun(!showSun) },
        { id: 'cloud', label: 'Cloud', state: showSky ? 'ON' : 'OFF', on: showSky, art: TILE_ART.cloud, onToggle: () => onShowSky(!showSky) },
        {
          id: 'hazards',
          label: 'Hazards',
          state: marks.length === 0 ? 'NONE' : `${marks.length} MARKED`,
          on: marks.length > 0,
          art: TILE_ART.hazards,
          onToggle: () => setCard({ kind: 'hazards' }),
        },
        {
          id: 'buildings',
          label: 'Buildings',
          /* A note from the fetch -- "none mapped here" -- is the state. */
          state: !showBuildings ? 'OFF' : (buildingsNote ?? 'ON'),
          on: showBuildings,
          art: TILE_ART.buildings,
          onToggle: () => onShowBuildings(!showBuildings),
        },
        { id: 'labels', label: 'Labels', state: showLabels ? 'ON' : 'OFF', on: showLabels, art: TILE_ART.labels, onToggle: () => onShowLabels(!showLabels) },
        {
          id: 'airspace',
          label: 'Airspace',
          /* The state says what is on the map, including when the grid is left out. */
          state: !airspaceOn
            ? 'OFF'
            : airspaceFailed
              ? 'DID NOT LOAD'
              : airspaceOverlay === null
                ? 'LOADING'
                : airspaceDense
                  ? 'ON · ZOOM IN FOR GRID'
                  : 'ON',
          on: airspaceOn,
          art: TILE_ART.airspace,
          /* On also opens the card: the shapes on the map, the words for the venue. */
          onToggle: () => {
            if (!airspaceOn) setCard({ kind: 'airspace' })
            setAirspaceOn(!airspaceOn)
          },
        },
      ]}
      sourceLine={`Esri World Imagery · native to z${ESRI_NATIVE_MAX_ZOOM} · showing z${Math.round(mapZoom)}`}
      about={
        <p className="tiles__prose">
          Cones are what each position can actually frame. The sun arc is where the sun rises and
          sets. Shadows are thrown from the marked heights. Cloud is GOES satellite imagery over the
          map. Hazards are what you marked plus what OpenStreetMap has. Labels are place names over
          the imagery, off while reading a venue and on while hunting for one. Airspace draws
          controlled airspace as white dashes, the FAA grid squares with the most LAANC can
          approve on each, and restricted areas and national parks in red.
        </p>
      }
    />
  )

  /*
   * ONE SWITCH, EXHAUSTIVE BY CONSTRUCTION. A new card is a new member of the
   * union and TypeScript asks for its body here; there is no list to forget
   * to append to.
   */
  const cardBody = ((): ReactNode => {
    switch (card.kind) {
      case 'shoot':
        return shootCard
      case 'wind':
        return (
          <WindCard
            wind={wind}
            levels={windLevels}
            gustMps={gustMps}
            ratedWindMps={ratedWindMps}
            ratedWindSource={ratedWindSource}
            atLabel={clock(scrubbedAt)}
            units={units}
            onClose={home}
          />
        )
      case 'cloud':
        return (
          <Card title="Cloud" at={clock(scrubbedAt)} onClose={home}>
            <WeatherPanel {...weatherCommon} show="cloud" />

            {/*
              * THE SATELLITE LAYER'S KEY LIVES HERE, WITH THE SUBJECT IT IS
              * ABOUT.
              *
              * It was in the conditions SECTION, which the shell rebuild
              * deleted -- and for a while the Cloud tile in Layers turned on
              * a layer that painted colours across the map with nothing
              * anywhere to say what they meant and no way to change what it
              * painted. A layer with no key is decoration; a layer whose
              * picker has no home is a feature hiding its own dependency,
              * which is shape D in docs/failure-modes.md.
              *
              * The cloud card is the right home rather than a convenient
              * one: the sky layer paints cloud, and this card is the one
              * about cloud. One subject, two views of it -- the forecast
              * number and the satellite picture.
              */}
            {!showSky ? null : (
              <SkyLegend
                band={skyBand}
                advice={zoomAdvice(skyBand, venue?.lat ?? 0, mapWidth, mapZoom)}
                sky={sky}
                clock={(at) =>
                  venueWindow === null
                    ? `${formatClock(at, 'UTC')} UTC`
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
            )}

            {/* The cameras show the sky the forecast is modelling. */}
            <CardMore links={[{ label: 'Sky cameras near here', onOpen: () => openCard('cams') }]} />
          </Card>
        )
      case 'tide':
        return (
          <Card title="Tide" at={clock(scrubbedAt)} onClose={home}>
            <WeatherPanel {...weatherCommon} show="tide" />
          </Card>
        )
      case 'golden':
        return (
          <Card title="The light" at={clock(scrubbedAt)} onClose={home}>
            {venue === null || scrubbedAt === null ? null : <LightNowBlock at={scrubbedAt} venue={venue} units={units} />}
            <SunReadout venueWindow={venueWindow} />
            {/*
              * WHAT THE PHASE REQUIRES, which came off the time scrubber when
              * that became a 34px control. It is a statement about the light
              * phase, and this is the card about the light phase.
              */}
            <PhaseRule
              phase={nightPhase}
              flying={{ airPositions, dronePlatform: platformFilter === 'air' }}
            />

            {/*
              * WHEN IS THE SUN BEHIND THAT BUILDING. It was the first row of
              * the Sky card, above a list of meteor showers -- a question
              * about the sun's bearing today, filed under what the sky does
              * over the next thirty nights. The sky card was the tallest in
              * the app at 94% of the two-viewport limit, and this is why.
              *
              * It is the same subject as the rest of this card: where the
              * light comes from, asked forward in time instead of now.
              */}
            <details className="sunwhen">
              <summary className="sunwhen__head">
                <span className="sunwhen__name">When is the sun here again</span>
                <span className="sunwhen__why">Pick a point and get the dates and times</span>
              </summary>
              <div className="sunwhen__body">
                <SunSearchPanel
                  venue={venue}
                  timeZone={venueWindow?.timeZone ?? null}
                  timeZoneAbbr={venueWindow?.timeZoneShort ?? null}
                  target={aimAt}
                  picking={placingAim}
                  onPickTarget={() => onPlacingAim(!placingAim)}
                />
              </div>
            </details>
            <CardMore
              links={[
                { label: 'The sun through the day', onOpen: () => openCard('suncurve') },
                /*
                 * THE SKY CARD'S DOOR. It used to be opened from the cloud
                 * card's "Sky cameras near here" row -- which was already
                 * the wrong name for it, and became no door at all when the
                 * cameras were split onto their own card. The list is what
                 * the sky does at this venue over the next thirty nights,
                 * which is the same subject as the light asked much further
                 * forward, so it opens from here.
                 */
                { label: 'The next 30 nights', onOpen: () => openCard('sky') },
              ]}
            />
          </Card>
        )
      case 'suncurve':
        return venue === null || venueWindow === null ? (
          <Card title="The day" onClose={home}>
            <p className="card2__source">Set the venue and this fills in.</p>
          </Card>
        ) : (
          <Card title="The day" onClose={home}>
            <SunCurve
              start={venueWindow.start}
              end={venueWindow.end}
              value={scrub}
              onChange={onScrub}
              at={scrubbedAt ?? venueWindow.start}
              venue={venue}
              horizon={horizonProfile}
              timeZone={venueWindow.timeZone}
              timeZoneAbbr={venueWindow.timeZoneShort}
              terrainOn={showTerrain}
              onShowTerrain={turnTerrain}
            />
          </Card>
        )
      case 'callsheet':
        return (
          <Card title="Call sheet" onClose={home}>
            <CallSheetCard context={callSheetContext} onOpenKey={() => openCard('about')} />
          </Card>
        )
      case 'sky':
        return (
          <Card title="Sky" onClose={home}>
            {venue === null || venueWindow === null || scrubbedAt === null ? (
              <SkyPanel
                venue={venue}
                timeZone={venueWindow?.timeZone ?? null}
                timeZoneAbbr={venueWindow?.timeZoneShort ?? null}
                horizon={horizonProfile}
                kit={kitProfile}
                now={skyNow}
              />
            ) : (
              <SkyCard
                venue={venue}
                timeZone={venueWindow.timeZone}
                timeZoneAbbr={venueWindow.timeZoneShort}
                at={scrubbedAt}
                tab={skyTab}
                onTab={setSkyTab}
                onJump={scrubTo}
                target={aimAt}
                picking={placingAim}
                onPickTarget={() => onPlacingAim(!placingAim)}
                onPlanMoonrise={() => openCard('moonrise')}
                onOpenNow={onOpenNow}
                exposure={<ExposurePlayground kit={kitProfile} bag={bag} />}
                events={
                  <SkyPanel
                    venue={venue}
                    timeZone={venueWindow.timeZone}
                    timeZoneAbbr={venueWindow.timeZoneShort}
                    horizon={horizonProfile}
                    kit={kitProfile}
                    now={skyNow}
                  />
                }
              />
            )}
            {/*
              * THE CAMERAS ARE THEIR OWN CARD NOW.
              *
              * This card was the tallest in the app -- 1589px, 94% of the
              * two-viewport limit -- because it held three subjects: where
              * the sun is today, what the sky does over the next thirty
              * nights, and which cameras are pointed at it this minute. The
              * first went to the light card; the cameras are here.
              *
              * AND IT FIXES A MISLABELLED DOOR. The cloud card's row read
              * "Sky cameras near here" and opened this card, which is mostly
              * meteor showers. Now it opens the cameras.
              */}
            <CardMore links={[{ label: 'Sky cameras near here', onOpen: () => openCard('cams') }]} />
          </Card>
        )
      case 'cams':
        return (
          <Card title={camKindShown === 'road' ? 'Road cameras' : 'Sky cameras'} onClose={home}>
            <CamList venue={venue} wind={wind} units={units} kind={camKindShown} onKind={setCamKindShown} />
          </Card>
        )
      case 'hazards':
        return (
          <Card title="Hazards" onClose={home}>
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
          </Card>
        )
      case 'airspace':
        return (
          <Card title="Airspace" onClose={home}>
            <AirspacePanel
              venue={venue}
              altitudeFeet={airAltitudeFeet}
              laanc={laanc}
              onLaanc={onLaanc}
              approvedCeiling={approvedCeiling}
              onApprovedCeiling={onApprovedCeiling}
            />
          </Card>
        )
      case 'layers':
        return (
          <Card title="Map & layers" onClose={home}>
            {layersCard}
            {/*
              * THE TILE TURNS THE LAYER ON; THE ROW OPENS WHAT IT DREW. Two
              * different questions -- "is it on" and "what is actually here"
              * -- and putting the second on the tile is what made the old
              * layer list a page of prose.
              */}
            <CardMore
              links={[
                { label: 'What is mapped here', onOpen: () => openCard('hazards') },
                { label: 'Airspace over this venue', onOpen: () => openCard('airspace') },
              ]}
            />
          </Card>
        )
      case 'moonrise':
        return (
          <Card title="Moonrise" onClose={home}>
            {moonriseInput === null ? (
              <p className="moonrise__none">Set the venue first: the moonrise is worked out for a place.</p>
            ) : (
              <MoonriseCard
                input={moonriseInput}
                target={aimAt}
                picking={placingAim}
                onPickTarget={() => onPlacingAim(!placingAim)}
                units={units}
                context={callSheetContext}
                onOpenKey={() => openCard('about')}
              />
            )}
          </Card>
        )
      case 'settings':
        return (
          <Card title="Settings" onClose={home}>
            <SettingsSheet units={units} onUnits={onUnits} />
          </Card>
        )
      case 'about':
        return (
          <Card title="About" onClose={home}>
            <AboutSheet
              onHow={onHow}
              onKit={onEditKit}
              onSpots={onOpenSpots}
              onApiKey={onOpenSettings}
              kitLine={`${kitProfile.bodies.length} bodies · ${kitProfile.lenses.length} lenses`}
              spotsLine={`${savedSpotCount} saved`}
              apiKeyLine="bring your own"
              onExport={onExport}
              onImport={onImport}
            />
          </Card>
        )
    }
  })()

  return (
    <div
      className="mode-plan"
      style={
        {
          ['--sheet-live-height' as string]: `${sheetHeight}px`,
          ['--dock-height' as string]: `${dockHeight}px`,
          /*
           * How far down the venue bar and the chip row reach. The map's own
           * scale bar and attribution ride up with the sheet; this is the
           * ceiling that stops them riding up behind the chips.
           */
          ['--top-chrome' as string]: `${topChrome}px`,
          /*
           * READ AT RUNTIME, not guessed. The row changes height when it collapses
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
        airspace={airspaceOn ? airspaceOverlay : null}
        onAirspaceDense={setAirspaceDense}
        measurePins={measurePins ?? undefined}
        onMeasureAt={onMeasureAt}
        onHorizon={setHorizonProfile}
        handle={mapHandle}
        venue={venue}
        onVenueChange={onVenueChange}
        mode={
          marking
            ? 'mark'
            : placing
              ? 'add'
              : placingPilot
                ? 'pilot'
                : placingAim
                  ? 'aim'
                  : measurePins !== null
                    ? 'measure'
                    : null
        }
        marks={marks}
        markDraft={markDraft}
        onMarkAt={onMarkAt}
        onSelectMark={onSelectMark}
        onAddAt={onAddAt}
        plan={visiblePlan}
        conePlan={conePlan}
        isolatedId={isolatedId}
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
        sunOverlay={
          sunOverlay === null || !moonOn || venue === null || scrubbedAt === null
            ? sunOverlay
            : { ...sunOverlay, moon: getMoonArc(scrubbedAt, venue.lat, venue.lon) }
        }
        shadowFeatures={shadowFeatures}
        linkPins={camPins}
        rayClock={venueWindow === null ? undefined : (at: Date) => formatClock(at, venueWindow.timeZone)}
        showSun={showSun}
        showArc={showArc}
        selectedId={selectedId}
        onSelect={onSelectAndRaise}
        onPitchChange={setPitch}
        onBearingChange={setMapBearing}
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
      {/*
        * THE SUN'S SIDE OF THE MAP, A FAINT WARM EDGE. Which way the light
        * comes from, before reading any number: the edge of the screen facing
        * the sun, turned with the map. Only while the sun is up; at night
        * there is no side to show.
        */}
      {sun === null || sun.altitude <= 0 ? null : (
        <div
          className="suntint"
          aria-hidden="true"
          style={{ ['--sun-side' as string]: `${(sun.azimuth - mapBearing + 360) % 360}deg` }}
        />
      )}
      {!tiltHint ? null : (
        <p className="tapnote" role="status">
          Tilt with two fingers: drag up or down.
        </p>
      )}
      {headingNote === null ? null : (
        <p className="tapnote" role="status">
          {headingNote}
        </p>
      )}
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
        * THE SHADOW LEGEND: what the dark shapes are and what is missing from
        * them. A building OpenStreetMap gives no height for casts nothing here,
        * and the count says how many that is rather than letting a sunny
        * patch read as sun.
        */}
      {shadows === null ? null : (
        <p className="shadowkey" role="status">
          {shadows.status === 'no-sun'
            ? 'No shadows: the sun is down.'
            : `Shadows from ${shadows.shadows.length} ${shadows.shadows.length === 1 ? 'building' : 'buildings'} with a known height.`}
          {shadows.skippedNoHeight === 0 ? '' : ` ${shadows.skippedNoHeight} more have no height and cast none here.`} Flat ground.
        </p>
      )}
      {measurePins === null ? null : (
        <p className="tapnote num" role="status">
          {measureWords(measurePins, units.distance)}
        </p>
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
      {/*
        * THE VENUE BAR AND THE CHIPS SIT OVER THE MAP, not in the sheet. They
        * are what the map is OF -- where, when, and the four numbers that
        * could make you not go -- so they stay put while the sheet changes
        * what it is about.
        */}
      <TopBar
        onMenu={onMenu}
        menuOpen={menuOpen}
        pill={
          /*
           * THE PILL NAMES THE PLACE AND THE DAY, and a tap goes to search it,
           * which is what a search pill is for. The venue bar this replaced
           * carried the same two facts in a row of its own.
           */
          <button type="button" className="pill-venue" onClick={onSearch} aria-label="Search for a venue">
            <span className="pill-venue__name">{venueNameLine}</span>
            <span className="pill-venue__date num">{dateLabel}</span>
          </button>
        }
        onAdd={() => onPlacing(!placing)}
        adding={placing}
        onLocate={onLocate}
        locating={locating}
        locateNote={null}
        online={online}
      />

      <ChipRow chips={chips} active={card.kind} onOpen={openCard} measureRef={measureChips} />

      {sheet === 'full' ? null : (
      <MapRail
        pitch={pitch}
        onPitch={(next) => handle.current?.setPitch(next)}
        bearing={mapBearing}
        heading={followHeading}
        onCompass={onCompass}
        measuring={measurePins !== null}
        onMeasure={() => setMeasurePins((pins) => (pins === null ? [] : null))}
      />
      )}

      {sheet === 'full' ? null : (
        <ToolDock
          moon={moonOn}
          onMoon={() => setMoonOn(!moonOn)}
          onCalendar={() => {
            setSkyTab('calendar')
            openCard('sky')
          }}
          lens={coneMode === 'all'}
          onLens={() => onConeMode(coneMode === 'all' ? 'none' : 'all')}
          layersOpen={card.kind === 'layers'}
          onLayers={() => openCard('layers')}
          onReset={() => {
            if (followHeading) onCompass()
            handle.current?.setBearing(0)
            handle.current?.setPitch(0)
            if (venue !== null) handle.current?.flyTo(venue)
            onScrub(0.5)
          }}
        />
      )}

      <BottomSheet
        /* Room for the time bar: its date line and its strip, measured, not the old one-line scrubber. */
        peekPx={PLAN_PEEK_PX}
        detent={sheet}
        onDetentChange={setSheet}
        onHeightChange={setSheetHeight}
        reservedBottom={dockHeight}
        reservedTop={topChrome}
        peek={
          <div className="peek">
            {/*
              * PEEK IS THE SCRUBBER, AND A LINE ONLY WHEN THERE IS ONE.
              *
              * It used to be a summary, a full width primary and a secondary
              * row, 176px of it, while the scrubber sat in its own bar below.
              * Two bars for two things that are read together.
              *
              * THE SHOOT LINE IS GONE FROM THE IDLE PEEK. It read "Shoot
              * setup · 11:00-15:00 EDT · Brew River Dock Bar, Salisbury MD",
              * which is exactly what the venue bar says a hundred pixels
              * above it -- and the peek is at the top of the sheet, so every
              * card in the app started fifty pixels lower to make room for a
              * repeat. It comes back while a plan generates, because the step
              * count is reported nowhere else.
              *
              * WHAT IT IS NOT IS A LOST TAP TARGET: the grabber above raises
              * the sheet, and so does tapping any card the sheet is showing.
              */}
            {peekStatus === null ? null : (
              <button type="button" className="peek__line" onClick={onPeekTap}>
                <span className="peek__label">{peekStatus.label}</span>
                <span className="peek__value">{peekStatus.line}</span>
              </button>
            )}

            {/*
              * THE TIME STRIP, ONLY WHERE TIME CHANGES THE READING.
              *
              * It used to be here unconditionally, which put a 250px time
              * panel above the layer tiles and above About. Which cards it
              * belongs on is one table in src/lib/sheetCard.ts rather than a
              * condition repeated at eleven call sites.
              */}
            {!TIME_MATTERS[card.kind] || venueWindow === null || scrubbedAt === null ? null : (
              <TimeBar
                at={scrubbedAt}
                lat={venue?.lat ?? 0}
                lon={venue?.lon ?? 0}
                timeZone={venueWindow.timeZone}
                moon={moonOn}
                onAt={scrubTo}
                onReset={() => onScrub(0.5)}
              />
            )}
          </div>
        }
        half={
          /*
           * ONE SUBJECT. The sheet shows exactly one card, because its
           * content IS a SheetCard and that union has one member at a time.
           *
           * WHAT THIS REPLACES: five sections in one scroll -- Conditions,
           * Sky, Sun curve, Layers, Hazards -- stacked, the first of them
           * 1937 px tall. Reading the wind meant scrolling past the tide, the
           * cloud, the airspace and the sun. See src/lib/sheetCard.ts.
           */
          <div className="sheet__card" data-card={card.kind}>
            {cardBody}
          </div>
        }
        full={null}
      />

      {/* The mode rail only. The scrubber moved into the sheet's peek. */}
      <div className="dock" ref={measureDock}>
        {footer}
      </div>
    </div>
  )
}
