import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ConeMode } from './components/ConePicker.tsx'
import { type MapHandle } from './components/MapView.tsx'
import { ModeRail } from './components/ModeRail.tsx'
import { FieldMode } from './components/FieldMode.tsx'
import { PlanMode } from './components/PlanMode.tsx'
import { NewBuildNotice } from './components/NewBuildNotice.tsx'
import { Landing } from './components/Landing.tsx'
import { SetupMode } from './components/SetupMode.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_ALTITUDE_FEET } from './core/air.ts'
import { DEFAULT_SHOT_TYPE, DEFAULT_YAW_DEGREES, type ShotType } from './core/shotType.ts'
import type { ShootKind } from './core/shootWindow.ts'
import { chipWindow, type WindowSource } from './lib/chipWindow.ts'
import {
  allowedPlatforms,
  DEFAULT_PLATFORM_FILTER,
  platformCounts,
  showsPlatform,
  type PlatformFilter,
} from './core/platformFilter.ts'
import { DEFAULT_KIT, type KitProfile } from './core/kit.ts'
import { defaultOpticFor } from './core/optics.ts'
import { sharedOptic } from './core/mapLabel.ts'
import { subjectSizeMatters } from './core/fov.ts'
import { skyLayerOn, type MapPanel } from './core/mapPanel.ts'
import { hudState, type HudState } from './core/hud.ts'
import {
  holdToggle,
  NO_HOLDS,
  canPackAir,
  packForPlatform,
  type KitHolds,
} from './core/kitPacking.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
import { extremesAround, tideStateAt } from './core/tide.ts'
import { formatClock } from './core/timezone.ts'
import { LOCATED_ZOOM } from './lib/locateOnce.ts'
import { useNewBuild } from './lib/useNewBuild.ts'
import { useSkyFrames } from './lib/useSkyFrames.ts'
import { useWind } from './lib/useWind.ts'
import { briefDriftMeters, formatDrift, isBriefStale, type BriefAnchor } from './lib/brief.ts'
import {
  defaultSelection,
  KIT_PROFILE_STORAGE_KEY,
  KIT_STORAGE_KEY,
  reviveKitProfile,
  reviveSelection,
  type KitSelection,
} from './lib/kitSelection.ts'
import { fetchSiteGeometry, trimSummary } from './lib/overpass.ts'
import { parsePlanResponse } from './lib/parsePlan.ts'
import {
  addPosition,
  duplicatePosition,
  movePosition,
  removePosition,
  setAltitude,
  setOptic,
  setShotType,
  setYaw,
} from './lib/positions.ts'
import { assessPlan, planPositions, type CameraPosition } from './lib/plan.ts'
import {
  buildGenerateBody,
  droneAvailable,
  GENERATE_STAGES,
  requestPlan,
  selectedDroneCameraSpecs,
  selectedLenses,
  stageIndex,
  stageLabel,
  sunFacts,
  type GenerationState,
} from './lib/planRequest.ts'
import {
  mergeSpots,
  newSpotId,
  reviveSpots,
  SPOTS_STORAGE_KEY,
  type Spot,
} from './lib/spots.ts'
import {
  buildPack,
  fingerprintPlan,
  loadPack,
  packMatches,
  savePack,
  windowKeyOf,
  type FieldPack,
} from './lib/fieldPack.ts'
import type { PackBuildState } from './components/FieldPackControl.tsx'
import {
  parseDescribeResponse,
  parseShotList,
  requestParse,
  type DesiredShot,
  type DescribeState,
} from './lib/describe.ts'
import { resolveDate } from './core/when.ts'
import { clampRadius, RADIUS_DEFAULT_METERS } from './core/radius.ts'
import { venueTimeZone, deviceTimeZone } from './core/timezone.ts'
import {
  BIAS_HALF_SPAN_METERS,
  msUntilNominatim,
  PINNED_PLACEHOLDER,
  reverseGeocode,
  searchVenues,
  type SearchHit,
} from './lib/search.ts'
import { usePersistentState } from './lib/usePersistentState.ts'
import { useTide } from './lib/useTide.ts'
import {
  blockedReason,
  canEnter,
  FORWARD_LABEL,
  nextMode,
  setupGap,
  type Mode,
  type ModeAvailability,
  type SetupTarget,
} from './lib/mode.ts'
import {
  CALIBRATION_VENUE,
  defaultVenue,
  hasErrors,
  resolveWindow,
  subjectAcrossMeters,
  validateVenue,
  venueLatLon,
  withCoordinates,
  type VenueDraft,
} from './lib/venue.ts'
import {
  addMark,
  allMarks,
  makeMark,
  MARKS_STORAGE_KEY,
  removeMark,
  reviveMarks,
  updateMark,
} from './lib/marks.ts'
import type { MarkKind, SiteMark } from './core/siteMark.ts'
import { windHeightFor } from './core/windHeight.ts'
import { briefIsTyped, briefSourceLine } from './core/shootBrief.ts'
import type { SkyLayerKind } from './core/skyLayer.ts'
import { revivalNote, revivePositions } from './lib/revivePositions.ts'
import { generateBlock } from './lib/generateGate.ts'

/*
 * The calibration venue is a DEVELOPER SHORTCUT and means nothing to anyone
 * else, so it is off the screen entirely.
 *
 * Chosen: a query parameter, `?calibration=1`, over a long press on the
 * wordmark. A hidden gesture is undiscoverable for the one person who needs it
 * and is a surprise for everyone else who finds it by accident; a URL is typed
 * deliberately, survives a reload, and is trivially reachable from a test
 * harness, which is where this actually gets used.
 */
const wantsCalibration = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('calibration') === '1'

function App() {
  const [venue, setVenue] = useState<VenueDraft>(() =>
    wantsCalibration() ? CALIBRATION_VENUE : defaultVenue(new Date()),
  )
  /*
   * Which of the date and window values are still the app's choice rather than
   * the shooter's. Shown on the pills so a default is never mistaken for a
   * decision, and cleared the moment either is edited or a venue is loaded.
   */
  const [defaults, setDefaults] = useState(() => ({
    date: !wantsCalibration(),
    window: !wantsCalibration(),
    /* The venue name, while it is a reverse geocode or a placeholder. */
    name: false,
  }))
  const [positions, setPositions] = useState<CameraPosition[]>([])

  /*
   * What loading a saved plan had to change to make sense of it, or null.
   * Shown rather than done quietly: silently correcting saved work is how a
   * plan changes under the shooter between one visit and the next.
   */
  const [positionNote, setPositionNote] = useState<string | null>(null)

  /*
   * WHAT IS DANGEROUS AND WHAT IS IN THE WAY, marked by the shooter.
   *
   * PERSISTED, unlike positions, because a position belongs to a plan and a
   * wire belongs to a place. The wire is still there next year.
   */
  const [marks, setMarks] = usePersistentState<SiteMark[]>(
    MARKS_STORAGE_KEY,
    [],
    (raw) => reviveMarks(raw),
  )

  /*
   * What OSM had mapped of the power network, last time a generate read the
   * area. NOT PERSISTED: it belongs to a bounding box and a moment, and a
   * stale copy would draw wires from a box the shooter has since left.
   */
  const [osmPower, setOsmPower] = useState<SiteMark[]>([])

  /** Everything drawn and everything computed with. OSM first, so mine draw over. */
  const siteMarks = useMemo(() => allMarks(marks, osmPower), [marks, osmPower])

  /*
   * ONE PANEL OVER THE MAP, AT MOST. Two booleans had four states and only
   * three were legal; this type has three and all three are. See
   * src/core/mapPanel.ts for why that is the fix rather than each button
   * remembering to close the other.
   */
  const [mapPanel, setMapPanel] = useState<MapPanel>('none')

  /*
   * The shooter's own choice about the control row, remembered for the
   * session. Null means the rule in src/core/hud.ts decides.
   */
  const [hudOverride, setHudOverride] = useState<HudState | null>(null)
  const showSky = skyLayerOn(mapPanel)

  /*
   * MARKING MODE. Unlike placing a position, it stays on until it is turned
   * off: a car park with wires down two sides is six marks in a row, and a
   * mode that disarmed between each would be six trips to the button.
   */
  const marking = mapPanel === 'hazards'
  const [markKind, setMarkKind] = useState<MarkKind>('power-line')
  const [markDrawing, setMarkDrawing] = useState<'point' | 'line'>('point')
  const [markDraft, setMarkDraft] = useState<LatLon[]>([])
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null)

  const selectedMark = useMemo(
    () => siteMarks.find((mark) => mark.id === selectedMarkId) ?? null,
    [siteMarks, selectedMarkId],
  )

  /** A tap while marking: a point lands straight away, a line gathers vertices. */
  const onMarkAt = useCallback(
    (at: LatLon) => {
      if (markDrawing === 'line') {
        setMarkDraft((current) => [...current, at])
        return
      }
      const mark = makeMark(markKind, { kind: 'point', at })
      setMarks(addMark(marks, mark))
      setSelectedMarkId(mark.id)
    },
    [markDrawing, markKind, marks, setMarks],
  )

  const onFinishLine = useCallback(() => {
    if (markDraft.length < 2) return
    const mark = makeMark(markKind, { kind: 'line', path: markDraft })
    setMarks(addMark(marks, mark))
    setMarkDraft([])
    setSelectedMarkId(mark.id)
  }, [markDraft, markKind, marks, setMarks])

  /*
   * EDITING AN OSM MARK MAKES IT YOURS. Giving a height to a wire OSM mapped
   * is the shooter saying "I have looked at this one", which is a stronger
   * claim than the database made, and it should stop being drawn as a dashed
   * guess. Nothing is lost: the original is still in OSM.
   */
  const onChangeMark = useCallback(
    (id: string, change: Parameters<typeof updateMark>[2]) => {
      if (marks.some((mark) => mark.id === id)) {
        setMarks(updateMark(marks, id, change))
        return
      }
      const adopted = osmPower.find((mark) => mark.id === id)
      if (adopted === undefined) return
      setMarks(updateMark(addMark(marks, { ...adopted, source: 'manual' }), id, change))
    },
    [marks, osmPower, setMarks],
  )

  const onDeleteMark = useCallback(
    (id: string) => {
      setMarks(removeMark(marks, id))
      setSelectedMarkId(null)
    },
    [marks, setMarks],
  )
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle' })
  /* Real OSM shapes for the generated view. Empty until Overpass answers. */
  const [land, setLand] = useState<Landcover>(EMPTY_LANDCOVER)
  const [siteNote, setSiteNote] = useState<string | null>(null)
  /* 0 at the start of the window, 1 at the end. Starts at the midpoint. */
  const [scrub, setScrub] = useState(0.5)

  /*
   * THE KIT IS THE SHOOTER'S, NOT OURS.
   *
   * It shipped as a constant taken from the brief, which meant buying a lens
   * and being unable to use it. It is now editable state on the device, and
   * DEFAULT_KIT is only the starting point. Every field of view, frame width
   * and standoff band is computed from whatever is in here.
   */
  const [kitProfile, setKitProfile] = usePersistentState<KitProfile>(
    KIT_PROFILE_STORAGE_KEY,
    DEFAULT_KIT,
    (raw) => reviveKitProfile(raw),
  )

  /*
   * REVIVED AGAINST THE SHOOTER'S OWN KIT, not against DEFAULT_KIT.
   *
   * DEFAULT_KIT is only the starting point; the profile above is editable, so
   * a drone or a lens somebody added themselves has an id that DEFAULT_KIT has
   * never heard of. Reviving against the shipped profile stripped those ids on
   * every reload, which left a selection that counted as empty and a Drone chip
   * that could not make an air position. Same bug as the stale spot id, from
   * the other direction: the thing validated against has to be the thing the
   * app actually computes with.
   */
  const [kit, setKit] = usePersistentState<KitSelection>(
    KIT_STORAGE_KEY,
    defaultSelection(DEFAULT_KIT),
    (raw) => reviveSelection(raw, kitProfile),
  )

  /*
   * THE ONE NAVIGATION STATE. Three modes on a time axis, replacing five tabs
   * plus three sheet detents plus accordions. The sheet keeps its own state
   * inside PlanMode, because it is a detail of that mode rather than of the app.
   */
  const [mode, setMode] = useState<Mode>('setup')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /*
   * THE ONE INPUT AT THE FRONT OF SETUP. What the shooter typed, what came back,
   * which fields it filled, and any geocoding choice still to be made. The form
   * underneath is filled from this; it is never replaced by it.
   */
  /*
   * How far the shooter can get from the venue, dragged on the setup map. A real
   * constraint, so it becomes a hard ceiling in the prompt and a check on every
   * returned position. See src/core/radius.ts.
   */
  const [reachMeters, setReachMeters] = useState(RADIUS_DEFAULT_METERS)
  const onReach = (meters: number) => setReachMeters(clampRadius(meters))

  /*
   * Whether the first run hint under the pin has been retired. Kept on the
   * device: it answers "can I move this", and once you know, you know.
   */

  /*
   * Preferences, kept on the device. Small on purpose: a setting is a decision
   * the app could not make for you, and every one of these had to earn its
   * place by being genuinely a matter of taste rather than a default we dodged.
   */
  const [settings, setSettings] = usePersistentState<{ showCoords: boolean }>(
    'scoutngo.settings',
    { showCoords: false },
    (raw) => ({
      showCoords: (raw as { showCoords?: unknown } | null)?.showCoords === true,
    }),
  )

  const [pinHintDone, setPinHintDone] = usePersistentState<boolean>(
    'scoutngo.pinHintDone',
    false,
    (raw) => raw === true,
  )

  /* The setup map has its own handle; PLAN keeps mapHandle for its capture. */
  const setupMap = useRef<MapHandle>(null)

  /*
   * A PIN IS NEVER ACCEPTED AUTOMATICALLY.
   *
   * Searching "atlantic park virginia beach" returned exactly one Nominatim
   * result, a neighbourhood four kilometres inland, and the app took it. One
   * result is not one right answer. Every geocoded pin now lands here first, is
   * flown to, and has to be confirmed, with dragging as the real correction.
   */
  const [pendingPin, setPendingPin] = useState<{ at: LatLon; label: string } | null>(null)

  const [describeText, setDescribeText] = useState('')
  const [describeState, setDescribeState] = useState<DescribeState>({ status: 'idle' })
  const [venueChoices, setVenueChoices] = useState<SearchHit[]>([])

  /* A pasted shot list, if one was sent. Editable lines. */
  const [shotListText, setShotListText] = useState('')
  const [desiredShots, setDesiredShots] = useState<DesiredShot[]>([])
  const [showSun, setShowSun] = useState(true)
  const [showArc, setShowArc] = useState(false)
  const [coneMode, setConeMode] = useState<ConeMode>('none')
  /* Multi select. Empty means no filter, which shows every lens. */
  const [lensFilters, setLensFilters] = useState<string[]>([])
  const [isolatedId, setIsolatedId] = useState<string | null>(null)

  /* Where the brief text was written. See lib/brief.ts. */
  const [briefAnchor, setBriefAnchor] = useState<BriefAnchor | null>(() =>
    wantsCalibration() ? { at: { lat: 38.364236, lon: -75.605912 } } : null,
  )

  const [spots, setSpots] = usePersistentState<Spot[]>(SPOTS_STORAGE_KEY, [], reviveSpots)

  const mapHandle = useRef<MapHandle>(null)

  const errors = useMemo(() => validateVenue(venue), [venue])
  const venueWindow = useMemo(() => resolveWindow(venue), [venue])
  const centre = useMemo(() => venueLatLon(venue), [venue])
  /*
   * ONE PIN. It is the thing being shot: it centres the map, it anchors the sun
   * and tide and timezone, and every cone bearing is measured to it. There used
   * to be a second "subject" coordinate that defaulted to this one and could be
   * moved separately, which put two near-identical white marks a few metres
   * apart with nothing to say which was which.
   */
  const aim = centre

  /* The moment the scrubber is sitting on. */
  const scrubbedAt = useMemo(() => {
    if (venueWindow === null) return null
    const span = venueWindow.end.getTime() - venueWindow.start.getTime()
    return new Date(venueWindow.start.getTime() + span * scrub)
  }, [venueWindow, scrub])

  const sun = useMemo(
    () =>
      scrubbedAt === null || centre === null
        ? null
        : getSunPosition(scrubbedAt, centre.lat, centre.lon),
    [scrubbedAt, centre],
  )

  /* Sunrise and sunset bearings for the overlay, also straight from core. */
  const sunOverlay = useMemo(() => {
    if (sun === null || scrubbedAt === null || centre === null) return null
    return {
      azimuth: sun.azimuth,
      shadowBearing: sun.shadowBearing,
      arc: getSunArc(scrubbedAt, centre.lat, centre.lon),
    }
  }, [sun, scrubbedAt, centre])

  /*
   * HOW WIDE THE SUBJECT IS, OR NULL BECAUSE NOBODY SAID.
   *
   * Null travels all the way down. classifyFraming makes no comparison, the
   * card prints the frame width on its own and the map carries no flag. The
   * alternative, which is what this replaced, was a hidden 60 m and a red badge
   * on every position of a drone shoot.
   */
  const subjectMeters = useMemo(() => subjectAcrossMeters(venue), [venue])

  /* Cones, bearings, lighting, framing and siting, all from src/core/. */
  const plan = useMemo(
    () =>
      aim === null || sun === null
        ? []
        : planPositions(
            positions,
            aim,
            sun,
            land,
            kit.bodyIds,
            reachMeters,
            centre,
            kitProfile,
            subjectMeters,
            { marks: siteMarks, date: venue.date },
          ),
    [
      positions,
      aim,
      sun,
      land,
      kit.bodyIds,
      reachMeters,
      centre,
      kitProfile,
      subjectMeters,
      siteMarks,
      venue.date,
    ],
  )

  /*
   * Coverage is computed from the PLANNED positions, so it is live. Drag the one
   * position that was on the far bank back across the river and the cluster
   * warning comes back, which is the honest behaviour.
   */
  const planCoverage = useMemo(() => assessPlan(plan), [plan])

  /*
   * Tide for the venue and the shoot date. Fetched once per day and venue, not
   * per scrubber drag: see the dependency note in useTide.
   */
  const tide = useTide(centre, venueWindow?.middle ?? null)

  /* Turns falling inside the window, for the scrubber marks and the prompt. */
  const tideExtremes = useMemo(() => {
    if (tide.status !== 'ok' || venueWindow === null) return []
    return extremesAround(tide.predictions.extremes, venueWindow.start, venueWindow.end)
      .inWindow
  }, [tide, venueWindow])

  /* The tide at the scrubbed moment. Computed in core, never asserted. */
  const tideNow = useMemo(() => {
    if (tide.status !== 'ok' || scrubbedAt === null) return null
    return tideStateAt(tide.predictions.curve, tide.predictions.extremes, scrubbedAt)
  }, [tide, scrubbedAt])

  /*
   * THE FIELD PACK. Loaded once at startup, rebuilt only on an explicit press.
   * The fingerprint is recomputed from the live plan every render, so a pack
   * that no longer describes what is on screen is reported as stale rather than
   * used: a pack from a different plan is worse than no pack.
   */
  const [pack, setPack] = useState<FieldPack | null>(() => loadPack())
  const [packState, setPackState] = useState<PackBuildState>({ status: 'idle' })

  const fingerprint = useMemo(
    () => fingerprintPlan(centre, windowKeyOf(venueWindow), plan),
    [centre, venueWindow, plan],
  )
  const packIsCurrent = packMatches(pack, fingerprint)

  const preparePack = async () => {
    if (centre === null || plan.length === 0) return
    setPackState({ status: 'working', done: 0, total: plan.length })

    const built = await buildPack(
      centre,
      fingerprint,
      plan,
      tide.status === 'ok' ? tide.predictions : undefined,
      (done, total) => setPackState({ status: 'working', done, total }),
    )

    /*
     * Held in memory whatever storage does, so Field mode works this session
     * even if the browser refused to persist it. The failure is still reported.
     */
    setPack(built)
    const saved = savePack(built)
    setPackState(
      saved.status === 'ok' ? { status: 'idle' } : { status: 'error', reason: saved.reason },
    )
  }

  const selected = plan.find((p) => p.position.id === selectedId) ?? null

  /*
   * The brief was written about one place. If the venue has moved far from it,
   * say so loudly and refuse to generate until it is resolved. Silently planning
   * a boat docking contest at a beach park is the failure this prevents.
   */
  const staleBrief = isBriefStale(
    briefAnchor,
    centre,
    venue.eventDescription,
    venue.desiredOutcome,
  )
  const drift = formatDrift(briefDriftMeters(briefAnchor, centre))

  /* Markers respect the lens filter; cones additionally respect isolate. */
  /*
   * GROUND, AIR OR BOTH. One choice, applied to what the map shows AND to what
   * a generate is allowed to come back with, through the same predicate in
   * src/core/platformFilter.ts. Two copies of that rule drift, and the way it
   * shows up is a position in the plan that never appears on the map.
   */
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(DEFAULT_PLATFORM_FILTER)

  const visiblePlan = useMemo(() => {
    const byPlatform = plan.filter((p) => showsPlatform(platformFilter, p.position.platform))
    return lensFilters.length === 0
      ? byPlatform
      : byPlatform.filter((p) => lensFilters.includes(p.position.lensId))
  }, [plan, lensFilters, platformFilter])

  /** How many the platform choice is hiding, so the control can say so. */
  const hiddenByPlatform = useMemo(
    () => plan.length - plan.filter((p) => showsPlatform(platformFilter, p.position.platform)).length,
    [plan, platformFilter],
  )
  const platformTally = useMemo(
    () => platformCounts(plan.map((p) => ({ platform: p.position.platform }))),
    [plan],
  )
  const conePlan = useMemo(() => {
    if (isolatedId !== null) return visiblePlan.filter((p) => p.position.id === isolatedId)
    return coneMode === 'all' ? visiblePlan : []
  }, [visiblePlan, isolatedId, coneMode])

  /*
   * MANUAL PLACEMENT IS THE PRIMARY WAY TO BUILD A PLAN.
   *
   * `placing` arms the map: the next tap drops a position rather than clearing
   * the selection. It disarms itself afterwards, because a mode that stays on
   * is a mode you forget you are in and then wonder why the map stopped
   * behaving.
   */
  /* Whether a newer build is deployed. Reports only; never reloads by itself. */
  const newBuild = useNewBuild()

  /*
   * THE LANDING PAGE, SHOWN ONCE.
   *
   * A returning shooter goes straight to the map. An app that explains itself
   * every time is an app that does not trust you to have read it, and this one
   * is used at six in the morning in a car park.
   *
   * Persisted like everything else: in this browser, on this device. Clearing
   * site data shows it again, which is the correct behaviour for something
   * whose whole claim is that it keeps nothing anywhere else.
   */
  const [landingSeen, setLandingSeen] = usePersistentState<boolean>(
    'scoutngo.landing.v1',
    false,
    (raw) => raw === true,
  )

  /*
   * THE SKY LAYER, off by default.
   *
   * It is a different kind of thing from everything else on the map: observed
   * weather rather than computed geometry, and it covers the imagery. Nobody
   * planning a client event shoot needs it, so it is asked for.
   */

  /*
   * WHAT THE SKY LAYER PAINTS. Cloud decides whether there is light; wind
   * decides whether the aircraft leaves the bag. See src/core/skyLayer.ts.
   */
  const [skyLayer, setSkyLayer] = useState<SkyLayerKind>('cloud')

  /*
   * WHAT THE SKY LAYER SHOWS FOR THE SCRUBBED MOMENT. Past and now get a real
   * GOES frame; the future gets the Open-Meteo cloud grid. Frames live in
   * memory for the session only and never reach a field pack.
   */
  const sky = useSkyFrames(aim, scrubbedAt, venueWindow?.timeZone ?? null, showSky, skyLayer)

  /*
   * THE SHOOT CHIPS. One tap sets the platform filter and the window, with no
   * model call: see src/core/shootWindow.ts for the arithmetic and
   * src/lib/shootPreset.ts for the glue.
   */
  const [shootKind, setShootKind] = useState<ShootKind | null>(null)

  /*
   * THE CHIP SETS THE WINDOW IN EITHER ORDER.
   *
   * It used to be done in the tap handler, which runs once, so a chip tapped
   * before the pin existed left a note saying it had done nothing and nothing
   * ever came back to finish it. "That ordering trap is on me to remember and
   * it should not be."
   *
   * So the tap only records the choice, and the rule is a CONDITION watched by
   * the effect below: whenever a kind and a pin and a date all exist, the
   * window follows the chip. See src/lib/chipWindow.ts.
   */
  const onShootKind = useCallback((kind: ShootKind) => {
    setShootKind(kind)
  }, [])

  /*
   * WHERE THE WINDOW CAME FROM, which "has it changed" cannot tell you once a
   * chip has changed it once. A window the app chose is a guess waiting to be
   * improved; a window the shooter typed is an instruction.
   */
  const [windowSource, setWindowSource] = useState<WindowSource>('default')

  /*
   * DERIVED DURING RENDER, not stored. What the chip would do is a function of
   * the chip, the pin and the date, so holding it in state would mean two
   * answers to one question, which is the shape of most of the bugs in this
   * file's history.
   */
  const chipOutcome = useMemo(
    () =>
      chipWindow({
        kind: shootKind,
        source: windowSource,
        centre,
        date: venue.date,
        timeZone:
          venueWindow?.timeZone ?? (centre === null ? null : venueTimeZone(centre.lat, centre.lon)),
      }),
    [shootKind, windowSource, centre, venue.date, venueWindow],
  )
  const shootLine = chipOutcome.line

  /*
   * THE ONE SIDE EFFECT: writing the times the chip decided on.
   *
   * WHY AN EFFECT AND NOT THE EVENT HANDLERS, which is what the lint rule
   * below would prefer. The condition depends on three things that arrive
   * independently: the chip, the pin and the date. Doing it from the event
   * means doing it from every event that can change any of them, which today
   * is the chip, a pin drag, a map tap, a search result, the date field,
   * loading a saved spot, and a parsed brief. Seven call sites for one rule is
   * the shape that produced the bug this fixes, and the eighth one added next
   * month is the one that would be forgotten.
   *
   * So the rule lives in one place and watches the condition. The write is
   * guarded above, so it fires once and does not loop.
   */
  /* oxlint-disable react/set-state-in-effect -- one rule, one place; see above */
  useEffect(() => {
    if (chipOutcome.action !== 'apply') return
    /*
     * Already says this, so there is nothing to write. The source is left
     * alone deliberately: marking it here would be a state write that changes
     * nothing, and the next render re-derives the same answer anyway.
     */
    if (venue.startTime === chipOutcome.startTime && venue.endTime === chipOutcome.endTime) return
    setVenue((current) => ({
      ...current,
      startTime: chipOutcome.startTime,
      endTime: chipOutcome.endTime,
    }))
    setWindowSource('chip')
    setDefaults((current) => ({ ...current, window: false }))
  }, [chipOutcome, venue.startTime, venue.endTime])
  /* oxlint-enable react/set-state-in-effect */

  /*
   * Wind at the venue, for the hour the scrubber is on. Feeds the readout and
   * the cam ranking; every failure is null and both say so.
   */
  const {
    wind,
    levels: windLevels,
    gustMps,
    at: windAt,
    past: windPast,
  } = useWind(aim, scrubbedAt, venueWindow?.timeZone ?? null)

  /*
   * THE HEIGHT TO READ THE WIND AT.
   *
   * The highest air position in the plan, or the default flight height when
   * the shoot is set to Drone and nothing is placed yet, or the ground. The
   * rule is in src/core/windHeight.ts and the panel says which of the three it
   * gave: an assumed height that reads like a planned one is the app putting
   * words in the shooter's mouth about how high they are going.
   */
  const windHeight = useMemo(
    () =>
      windHeightFor(
        positions.filter((p) => p.platform === 'air').map((p) => p.altitudeFeet),
        platformFilter,
      ),
    [positions, platformFilter],
  )

  /*
   * The published wind rating of the aircraft actually coming, when there is
   * one. Null is left null: an invented wind limit is something somebody could
   * fly on. See src/core/kit.ts.
   */
  const rated = useMemo(() => {
    const drones = kitProfile.drones.filter((d) => kit.droneIds.includes(d.id))
    const withRating = drones.filter((d) => d.maxWindMps !== null)
    if (withRating.length === 0) return { mps: null, source: '' }
    /* The most limiting aircraft in the bag, which is the one that decides. */
    const lowest = withRating.reduce((a, b) =>
      (a.maxWindMps ?? Infinity) <= (b.maxWindMps ?? Infinity) ? a : b,
    )
    return { mps: lowest.maxWindMps, source: lowest.maxWindSource }
  }, [kit.droneIds, kitProfile])

  const [placing, setPlacing] = useState(false)

  /*
   * WHERE THE PILOT STANDS. One position for the whole plan, because the pilot
   * stands somewhere and the aircraft moves between hover points.
   *
   * Placed by tapping the map, like a position, and draggable afterwards. It
   * is used for exactly one thing: measuring the distance to each air
   * position. It is not a check and it does not gate anything.
   */
  const [pilotAt, setPilotAt] = useState<LatLon | null>(null)
  const [placingPilot, setPlacingPilot] = useState(false)
  const onPilotMove = useCallback((at: LatLon) => {
    setPlacingPilot(false)
    setPilotAt(at)
  }, [])

  /*
   * THE ALTITUDE THE LAANC PANEL ANSWERS AGAINST.
   *
   * ONLY A PLANNED ONE, never the assumed drone default. windHeightFor also
   * answers with a default height when the shoot is set to Drone and nothing
   * is placed yet, which is right for reading the wind off a forecast and
   * wrong here: that panel compares the map's ceiling against "the altitude I
   * have set", and an assumed height would produce a paperwork route that
   * looked computed from a number the shooter never chose.
   */
  const plannedAltitudeFeet = windHeight.source === 'position' ? windHeight.feet : null

  /*
   * WHAT THE REVERSE SUN SEARCH IS POINTED AT.
   *
   * Tapped on the map, and used for exactly one thing: deriving the bearing
   * from the venue to it, so "when is the sun behind that building" and "when
   * is the sun on bearing 254" are the same question. It is READ ONLY: it adds
   * no position, moves nothing, and is not part of the plan or the field pack.
   */
  const [aimAt, setAimAt] = useState<LatLon | null>(null)
  const [placingAim, setPlacingAim] = useState(false)
  const onAimAt = useCallback((at: LatLon) => {
    setPlacingAim(false)
    setAimAt(at)
  }, [])

  /*
   * THE GLASS A NEW POSITION STARTS ON, ASKED OF THE PLATFORM.
   *
   * Both of these used to be built here, by hand, out of different pieces of
   * the kit: the ground one from kit.lenses and the air one from
   * selectedDroneCameras. Two hand-rolled optic lists is how the card came to
   * have a third, which offered ground glass on an aircraft. There is one
   * answer to "what can this platform shoot with" now and it lives in
   * core/optics.ts; everything that needs an optic asks it.
   */
  const defaultOptic = useMemo(() => {
    const optic = defaultOpticFor('ground', kitProfile, kit)
    return optic === null
      ? { lensId: '', focalLength: 50 }
      : { lensId: optic.id, focalLength: optic.minFocalLength }
  }, [kit, kitProfile])

  /*
   * WHAT A NEW POSITION IS, WHICH THE FILTER DECIDES.
   *
   * With the filter on Air, adding a GROUND position would drop something on
   * the map and hide it in the same gesture. So the filter controls what you
   * make as well as what you see, and the button says which it will be.
   *
   * An air position needs a drone CAMERA rather than a lens: the aircraft
   * cannot mount the 200-600, and plan.ts resolves the optic by id. Fixed
   * focal length, because the Air 3S cameras are not zooms.
   */
  const defaultAirOptic = useMemo(() => {
    const optic = defaultOpticFor('air', kitProfile, kit)
    return optic === null ? null : { lensId: optic.id, focalLength: optic.minFocalLength }
  }, [kit, kitProfile])

  /*
   * WHICH BRIEF A GENERATE WOULD SEND. Shown on the button, because the chips
   * standing in for a typed brief is only honest if it is visible.
   */
  const briefSource = useMemo(
    () =>
      briefSourceLine(
        {
          kind: shootKind,
          platform: platformFilter,
          venueName: venue.name,
          shotCount: desiredShots.length,
        },
        briefIsTyped({ event: venue.eventDescription, outcome: venue.desiredOutcome }),
      ),
    [
      shootKind,
      platformFilter,
      venue.name,
      venue.eventDescription,
      venue.desiredOutcome,
      desiredShots.length,
    ],
  )

  /*
   * WHAT THE SHOOTER TICKED BY HAND, so a chip never undoes it.
   *
   * Recorded by DIFFING the selection rather than by every chip row reporting
   * which id it changed. The kit is edited from two places, the chip row and
   * the full kit panel, and both hand back a whole selection; asking each of
   * them to also report the id is two chances to forget. The diff cannot
   * forget, and it is how an import or a restore gets treated as the shooter's
   * choice too, which it is.
   */
  const [kitHolds, setKitHolds] = useState<KitHolds>(NO_HOLDS)

  const onKitChange = useCallback(
    (next: KitSelection) => {
      setKitHolds((held) => {
        let out = held
        for (const key of ['bodyIds', 'lensIds', 'droneIds'] as const) {
          const before = new Set(kit[key])
          const after = new Set(next[key])
          for (const id of after) if (!before.has(id)) out = holdToggle(out, id, true)
          for (const id of before) if (!after.has(id)) out = holdToggle(out, id, false)
        }
        return out
      })
      setKit(next)
    },
    [kit, setKit],
  )

  /*
   * THE PLATFORM CHIP PACKS THE BAG.
   *
   * "Drone selected, and the kit row has a7IV, a7III, 28-75 and 200-600 all
   * ticked." The chip said what was flying and the bag still held everything.
   *
   * A WATCHED CONDITION, like the window in src/lib/chipWindow.ts, rather than
   * something the chip's own handler does: the packing depends on the filter
   * AND the profile AND the holds, and doing it from the one handler that
   * changes the first of those is how an ordering trap gets built. The rule is
   * in src/core/kitPacking.ts and returns the selection UNCHANGED when there is
   * nothing to do, which is what stops this looping.
   */
  // oxlint-disable react/set-state-in-effect -- one rule, one place; see above
  useEffect(() => {
    const packed = packForPlatform(platformFilter, kitProfile, kit, kitHolds)
    if (packed === kit) return
    if (
      packed.bodyIds.join() === kit.bodyIds.join() &&
      packed.lensIds.join() === kit.lensIds.join() &&
      packed.droneIds.join() === kit.droneIds.join()
    ) {
      return
    }
    setKit({ ...kit, ...packed })
  }, [platformFilter, kitProfile, kit, kitHolds, setKit])
  // oxlint-enable react/set-state-in-effect

  const addsAir = platformFilter === 'air' && defaultAirOptic !== null

  const addPositionAt = useCallback(
    (at: LatLon) => {
      setPlacing(false)
      setPositions((current) => {
        const next =
          addsAir && defaultAirOptic !== null
            ? addPosition(current, {
                at,
                ...defaultAirOptic,
                platform: 'air',
                altitudeFeet: DEFAULT_ALTITUDE_FEET,
              })
            : addPosition(current, { at, ...defaultOptic })
        const added = next[next.length - 1]
        if (added !== undefined) window.setTimeout(() => setSelectedId(added.id), 0)
        return next
      })
    },
    [defaultOptic, defaultAirOptic, addsAir],
  )

  const onDeletePosition = useCallback((id: string) => {
    setSelectedId(null)
    setPositions((current) => removePosition(current, id))
  }, [])

  const onDuplicatePosition = useCallback((id: string) => {
    setPositions((current) => {
      const next = duplicatePosition(current, id)
      const copy = next[next.findIndex((p) => p.id === id) + 1]
      if (copy !== undefined) window.setTimeout(() => setSelectedId(copy.id), 0)
      return next
    })
  }, [])

  const onMovePosition = useCallback((id: string, delta: number) => {
    setPositions((current) => movePosition(current, id, delta))
  }, [])

  const onSetOptic = useCallback((id: string, lensId: string, focalLength: number) => {
    setPositions((current) => setOptic(current, kitProfile, id, lensId, focalLength))
  }, [kitProfile])

  /* Clamped in core, so a typed 900 and a model's 900 both become 400. */
  const onSetAltitude = useCallback((id: string, feet: number) => {
    setPositions((current) => setAltitude(current, id, feet))
  }, [])

  /*
   * WHAT KIND OF SHOT A POSITION IS. Everything downstream recomputes from it:
   * whether there is a camera bearing at all, therefore whether there is a
   * lighting class, and therefore whether a cone is drawn.
   */
  const onSetShotType = useCallback((id: string, shotType: ShotType) => {
    setPositions((current) => setShotType(current, id, shotType))
  }, [])

  const onSetYaw = useCallback((id: string, degrees: number) => {
    setPositions((current) => setYaw(current, id, degrees))
  }, [])

  /*
   * NAMING A DROPPED PIN.
   *
   * A pin carries a coordinate and nothing else, and the name is never required,
   * so this only makes the plan read better later. It is filled when the name is
   * empty or is still one the app filled, never over one the shooter typed or
   * chose from search.
   *
   * The placeholder goes in at once and the lookup replaces it when it answers.
   * Nothing waits on it: a failure, a timeout or no signal leaves the
   * placeholder standing. A newer drop cancels an older lookup, and the shared
   * Nominatim clock keeps it under one request per second alongside search.
   */
  const venueNow = useRef(venue)
  useEffect(() => {
    venueNow.current = venue
  }, [venue])
  const nameIsFilled = useRef(defaults.name)
  useEffect(() => {
    nameIsFilled.current = defaults.name
  }, [defaults.name])
  const nameLookup = useRef<{ timer: number; controller: AbortController } | null>(null)

  const cancelNameLookup = useCallback(() => {
    if (nameLookup.current === null) return
    window.clearTimeout(nameLookup.current.timer)
    nameLookup.current.controller.abort()
    nameLookup.current = null
  }, [])
  useEffect(() => cancelNameLookup, [cancelNameLookup])

  const dropVenuePin = useCallback(
    (at: LatLon) => {
      const fill = venueNow.current.name.trim() === '' || nameIsFilled.current
      setVenue((current) =>
        fill
          ? { ...withCoordinates(current, at), name: PINNED_PLACEHOLDER }
          : withCoordinates(current, at),
      )
      if (!fill) return

      nameIsFilled.current = true
      setDefaults((d) => ({ ...d, name: true }))
      cancelNameLookup()
      const controller = new AbortController()
      const pinned = withCoordinates(venueNow.current, at)
      const timer = window.setTimeout(() => {
        void reverseGeocode(at, controller.signal).then((name) => {
          if (name === null || controller.signal.aborted || !nameIsFilled.current) return
          setVenue((current) =>
            current.latitude === pinned.latitude && current.longitude === pinned.longitude
              ? { ...current, name }
              : current,
          )
        })
      }, msUntilNominatim())
      nameLookup.current = { timer, controller }
    },
    [cancelNameLookup],
  )

  const onVenueChange = dropVenuePin

  /*
   * Editing the brief re-anchors it to wherever the venue is now: text typed
   * here is by definition about here. Only coordinate changes make it stale.
   */
  const onVenueDraftChange = useCallback(
    (next: VenueDraft) => {
      setVenue((current) => {
        const briefEdited =
          next.eventDescription !== current.eventDescription ||
          next.desiredOutcome !== current.desiredOutcome
        if (briefEdited && centre !== null) setBriefAnchor({ at: centre })
        /*
         * A default stops being a default the moment it is touched. Compared
         * field by field rather than wholesale, so editing the date does not
         * quietly claim the window was chosen too.
         */
        if (next.date !== current.date) setDefaults((d) => ({ ...d, date: false }))
        if (next.name !== current.name) {
          nameIsFilled.current = false
          cancelNameLookup()
          setDefaults((d) => ({ ...d, name: false }))
        }
        if (next.startTime !== current.startTime || next.endTime !== current.endTime) {
          setDefaults((d) => ({ ...d, window: false }))
          /*
           * TYPED, and from here a chip leaves it alone and says so. The
           * chip's own write goes through the effect above and never through
           * here, so this only ever fires for a real edit.
           */
          setWindowSource('typed')
        }
        return next
      })
    },
    [centre, cancelNameLookup],
  )

  const onPositionMove = useCallback((id: string, at: LatLon) => {
    setPositions((current) =>
      current.map((p) => (p.id === id ? { ...p, at, moved: true } : p)),
    )
  }, [])

  /* A search result is a PROPOSAL. It is confirmed on the map, never taken. */
  const onPick = useCallback((at: LatLon, label: string) => {
    setPendingPin({ at, label })
  }, [])

  const onPendingMove = useCallback((at: LatLon) => {
    setPendingPin((current) => (current === null ? null : { ...current, at }))
  }, [])

  const confirmPin = useCallback(() => {
    setPendingPin((pin) => {
      if (pin === null) return null
      setVenue((current) => ({ ...withCoordinates(current, pin.at), name: pin.label }))
      /* A chosen search result names itself; it is not a guess to overwrite. */
      nameIsFilled.current = false
      cancelNameLookup()
      setDefaults((d) => ({ ...d, name: false }))
      setBriefAnchor({ at: pin.at })
      setPositions([])
      setGeneration({ status: 'idle' })
      return null
    })
  }, [cancelNameLookup])

  const cancelPin = useCallback(() => setPendingPin(null), [])

  /* Long press drops the pin. With one pin there is nothing else it can mean. */
  const onLongPress = useCallback((at: LatLon) => dropVenuePin(at), [dropVenuePin])

  const clearBrief = () => {
    setVenue((current) => ({ ...current, eventDescription: '', desiredOutcome: '' }))
    setBriefAnchor(centre === null ? null : { at: centre })
  }

  /* Keeping it is a deliberate acknowledgement, so re-anchor here. */
  const keepBrief = () => {
    setBriefAnchor(centre === null ? null : { at: centre })
  }

  const onSelectPosition = (id: string | null) => {
    setSelectedId(id)
    // Tapping a position isolates its cone; tapping it again restores.
    setIsolatedId((current) => (id === null ? null : current === id ? null : id))
  }

  const saveSpot = (name: string) => {
    const spot: Spot = {
      id: newSpotId(),
      name,
      savedAt: new Date().toISOString(),
      venue,
      kit,
      positions,
      /* The wires go with the place, which is the point of saving a place. */
      marks,
    }
    setSpots(mergeSpots(spots, [spot]))
  }

  const loadSpot = (spot: Spot) => {
    setVenue(spot.venue)
    cancelNameLookup()
    nameIsFilled.current = false
    setDefaults({ date: false, window: false, name: false })
    /*
     * THE SPOT'S KIT IS REVIVED AGAINST THE KIT, NOT TRUSTED.
     *
     * A spot is JSON: saved months ago, exported, imported from someone else,
     * or written when an id was spelled differently. An id that no longer
     * resolves used to travel straight into the selection, where it counted
     * towards "a drone is available" while resolving to no camera. The Drone
     * chip was then offerable and every air position it promised came out
     * ground. reviveSelection drops what the kit does not have, which is the
     * same treatment the stored selection in localStorage already got.
     */
    setKit(reviveSelection(spot.kit, kitProfile))
    /*
     * POSITIONS ARE REVIVED, NOT TRUSTED, for the same reason the kit is and
     * for a sharper one: a spot saved while an older bug was live is a fossil
     * of that bug, and loading it restores the contradiction on a build where
     * the bug has since been fixed twice. See src/lib/revivePositions.ts.
     */
    const revival = revivePositions(spot.positions, kitProfile)
    setPositions(revival.positions)
    setPositionNote(revivalNote(revival))
    setMarks(reviveMarks(spot.marks ?? []))
    setBriefAnchor(null)
    setGeneration({ status: 'idle' })
    setMode('setup')
  }

  /**
   * Reads the description, then geocodes the PLACE NAME it returned.
   *
   * The model never supplies a coordinate; Nominatim does, and when it offers
   * more than one match the shooter picks. The date token is resolved here too,
   * against the venue's own timezone once there is a venue to have one.
   */
  const onDescribe = async () => {
    const text = describeText.trim()
    if (text === '') return
    setDescribeState({ status: 'working' })
    setVenueChoices([])

    const response = await requestParse(text)
    if (response.status !== 'ok' || typeof response.raw !== 'string') {
      setDescribeState({
        status: 'error',
        message: response.message ?? 'The parse function did not answer.',
      })
      return
    }

    const parsed = parseDescribeResponse(response.raw)
    if (!parsed.ok) {
      setDescribeState({ status: 'raw', reason: parsed.reason, raw: parsed.raw })
      return
    }

    const { shoot, filled } = parsed

    /* Geocode the name. Never guess between matches. */
    let hits: SearchHit[] = []
    if (shoot.venueSearch !== '') {
      try {
        hits = await searchVenues(
          shoot.venueSearch,
          undefined,
          centre === null
            ? undefined
            : { centre, halfSpanMeters: BIAS_HALF_SPAN_METERS },
        )
      } catch {
        hits = []
      }
    }

    /*
     * Even a single hit goes to the confirm step. Nothing about "only one
     * result" means "the right one", and the whole failure this replaces was
     * the app believing otherwise.
     */
    const proposal = hits[0] ?? null
    const at = proposal === null ? venueLatLon(venue) : { lat: proposal.lat, lon: proposal.lon }

    /*
     * The date token resolves against the VENUE's clock, so it is done after
     * geocoding. With no venue yet it falls back to this device, which is the
     * best available answer and is visible in the form either way.
     */
    const zone =
      at === null ? deviceTimeZone() : (venueTimeZone(at.lat, at.lon) ?? deviceTimeZone())
    const resolvedDate = shoot.date === '' ? '' : (resolveDate(shoot.date, new Date(), zone) ?? '')

    setVenue((current) => {
      const next: VenueDraft = {
        ...current,
        ...(resolvedDate === '' ? {} : { date: resolvedDate }),
        ...(shoot.startTime === '' ? {} : { startTime: shoot.startTime }),
        ...(shoot.endTime === '' ? {} : { endTime: shoot.endTime }),
        ...(shoot.eventBrief === '' ? {} : { eventDescription: shoot.eventBrief }),
        ...(shoot.wantOut === '' ? {} : { desiredOutcome: shoot.wantOut }),
      }
      return next
    })

    /* One hit becomes a pin to confirm; several become a list to choose from. */
    if (hits.length === 1 && proposal !== null) {
      setPendingPin({ at: { lat: proposal.lat, lon: proposal.lon }, label: proposal.label })
    } else if (hits.length > 1) {
      setVenueChoices(hits)
    }

    setDescribeState({
      status: 'done',
      /*
       * Counted as FORM INPUTS, not as parsed values, so the number matches what
       * the shooter can see marked below. One parsed venue fills three inputs:
       * name, latitude and longitude.
       */
      filled: filled.length - (filled.includes('venue') ? 1 : 0),
      needsVenue: shoot.venueSearch !== '' && hits.length === 0,
      searched: shoot.venueSearch,
    })
  }

  /*
   * USE MY LOCATION moves the camera and nothing else.
   *
   * It does NOT set the pin. A browser fix without high accuracy is good to a
   * few hundred metres over GPS and a few kilometres over wifi, so turning it
   * straight into a venue coordinate would be the app asserting a precision it
   * was not given. It takes you to the neighbourhood; the pin is still placed
   * by hand or by search, which is where the precision actually comes from.
   *
   * And nothing is kept. The coordinate goes to flyTo and is not written to
   * localStorage, not put in a saved spot, and not sent anywhere.
   */
  const onUseMyLocation = useCallback((at: LatLon) => {
    mapHandle.current?.flyTo(at, LOCATED_ZOOM)
  }, [])

  /** The shooter picked one of several geocoding matches. */
  /* Choosing from the list still proposes; the map is where it is accepted. */
  const onPickVenue = (hit: SearchHit) => {
    setPendingPin({ at: { lat: hit.lat, lon: hit.lon }, label: hit.label })
    setVenueChoices([])
  }

  const onShotListChange = (text: string) => {
    setShotListText(text)
    setDesiredShots(parseShotList(text))
  }

  const onGenerate = async () => {
    /*
     * WHY IT CANNOT RUN, SAID ON THE SCREEN THE BUTTON IS ON.
     *
     * This used to navigate to SETUP from inside the handler, in the same
     * breath as writing the reason into generation state. PlanStatus, the only
     * thing that renders that state, lives inside PlanMode, so the navigation
     * unmounted the message before a frame was drawn. The button did nothing,
     * visibly, every time the brief was empty, which since the chips arrived is
     * most of the time. Measured in the browser; see src/lib/generateGate.ts.
     *
     * Nothing navigates here now. The block is shown where it happened, with a
     * button that goes and fixes it, so leaving the screen is a choice the
     * shooter makes after reading why.
     */
    const block = generateBlock({ errors, missing, staleBrief })
    if (block !== null) {
      setGeneration({ status: 'blocked', block })
      return
    }

    /*
     * From here the stage is set immediately before the work it names, so what the
     * sheet says is what the app is actually waiting on. See GENERATE_STAGES.
     */
    setGeneration({ status: 'working', stage: 'capture' })

    /*
     * OVERPASS AND THE IMAGE ENCODE RUN TOGETHER.
     *
     * Overpass only needs the bounding box, which is free to read, while the
     * expensive part of a capture is the JPEG encode of the canvas. Reading the
     * viewport first lets the request go out before the encode starts, so the two
     * overlap instead of queueing.
     *
     * Be honest about the size of this: measured on a real run, the encode is
     * about 65ms and Overpass about 1.1s, so this removes the encode from the
     * critical path and no more. The 11s the model takes is untouched, and it is
     * where the wait actually lives. The structure is still right: nothing here
     * should wait on something it does not need.
     */
    const viewport = mapHandle.current?.viewport() ?? null
    if (viewport === null) {
      setGeneration({ status: 'error', message: 'The map is not ready yet.' })
      return
    }

    /*
     * Started, deliberately not awaited. If Overpass is slow or down this still
     * falls straight back to the old behaviour: no shapes in the prompt and no
     * siting warnings afterwards, on its own internal timeout.
     */
    const sitePending = fetchSiteGeometry(viewport.bounds)

    const capture = mapHandle.current?.capture() ?? null
    if (capture === null) {
      // The in-flight request is left to settle on its own; it caches either way.
      void sitePending
      setGeneration({ status: 'error', message: 'The map is not ready yet.' })
      return
    }

    setGeneration({ status: 'working', stage: 'terrain' })
    const site = await sitePending
    if (site.status === 'ok') {
      setLand(site.geometry.land)
      setOsmPower(site.geometry.power)
      setSiteNote(null)
    } else {
      setLand(EMPTY_LANDCOVER)
      setSiteNote(`${site.reason} Positions were not checked against land and water.`)
    }

    setGeneration({ status: 'working', stage: 'positions' })
    const response = await requestPlan(
      buildGenerateBody(
        venue,
        kit,
        capture,
        site.status === 'ok' ? trimSummary(site.geometry.summary) : undefined,
        venueWindow?.timeZoneLabel ?? '',
        /*
         * Sun at the start, middle and end, computed HERE before the call. The
         * model is told where the light is so it can choose a vantage with it in
         * mind. Nothing comes back about lighting: src/core/lighting.ts still
         * recomputes every call from the coordinates returned.
         */
        venueWindow === null ? [] : sunFacts(venueWindow),
        /*
         * Where the subject is in the captured image, and which way that image is
         * oriented. Without these the model is told the sun sits at 134 degrees
         * while looking at a picture with no compass on it, and has to guess.
         */
        {
          subjectPoint:
            aim === null
              ? undefined
              : mapHandle.current?.projectToCapture(capture, [aim])[0],
          imageNorthBearing: capture.camera.bearing,
        },
        /*
         * Tide as a fact, like the sun figures. Computed in src/core/tide.ts from
         * NOAA data; the model never performs the arithmetic and never returns a
         * tide claim, because there is no tide field to parse.
         */
        tide.status !== 'ok' || tideNow === null || venueWindow === null
          ? undefined
          : {
              feet: Number(tideNow.feet.toFixed(2)),
              direction: tideNow.direction,
              station: tide.station.name,
              distanceKm: Number(tide.distanceKm.toFixed(1)),
              turns: tideExtremes.map((e) => ({
                kind: e.kind,
                clock: formatClock(e.at, venueWindow.timeZone),
                feet: Number(e.feet.toFixed(2)),
              })),
            },
        desiredShots.map((shot) => shot.text),
        reachMeters,
        /*
         * The Ground/Air/Both choice. Asked for here and enforced in the
         * parser, so a plan can never contain a platform the map is hiding.
         */
        allowedPlatforms(platformFilter),
        /*
         * WHAT THE CHIPS SAY, which stands in for a typed brief. Sunrise plus
         * Drone plus this venue and this window is the shoot, structured, and
         * the model is told in as many words that no event was described and
         * that it must not invent one.
         */
        {
          kind: shootKind,
          platform: platformFilter,
          venueName: venue.name,
          shotCount: desiredShots.length,
        },
      ),
    )
    /*
     * No key is not a failure. Suggestion is optional, manual placement is the
     * primary path, and saying so plainly beats a red error about an
     * environment variable the reader may not have.
     */
    if (response.status === 'no-key') {
      setGeneration({
        status: 'no-key',
        message: response.message ?? 'Suggesting positions needs an Anthropic key.',
      })
      return
    }
    if (response.status !== 'ok' || typeof response.raw !== 'string') {
      setGeneration({
        status: 'error',
        message: response.message ?? 'The generate function did not return a plan.',
      })
      return
    }

    setGeneration({ status: 'working', stage: 'lighting' })
    const parsed = parsePlanResponse(
      response.raw,
      selectedLenses(kit),
      droneAvailable(kit),
      selectedDroneCameraSpecs(kit),
      desiredShots.length,
      allowedPlatforms(platformFilter),
    )
    if (!parsed.ok) {
      setGeneration({ status: 'raw', reason: parsed.reason, raw: parsed.raw })
      return
    }

    // Normalized image coordinates become real ones through the map, using the
    // camera as it was when the image was taken.
    const coords = mapHandle.current?.unprojectFromCapture(capture, parsed.positions) ?? []

    /*
     * A COORDINATE THAT CANNOT BE RESOLVED FAILS VISIBLY.
     *
     * This used to end `?? { lat: 0, lon: 0 }` per position. Null Island is a
     * real place on the map, so a position that failed to unproject was not
     * dropped or flagged, it was PLACED, somewhere off West Africa, and then
     * fitAll framed it: six markers piled in a corner of a view zoomed out to
     * span an ocean, looking for all the world like a planning result.
     *
     * The failure mode mattered more than its likelihood. A position silently
     * placed somewhere wrong is worse than a position refused, because the
     * wrong one gets walked to.
     */
    if (coords.length !== parsed.positions.length || coords.some((c) => c === undefined)) {
      setGeneration({
        status: 'error',
        message:
          'The map could not turn those positions into coordinates. Nothing was placed. Try again without moving the map while it works.',
      })
      return
    }

    setPositions(
      parsed.positions.map((raw, index) => ({
        id: `pos-${index + 1}`,
        number: index + 1,
        at: coords[index],
        lensId: raw.lensId,
        focalLength: raw.focalLength,
        shot: raw.shot,
        risk: raw.risk,
        angleRationale: raw.angleRationale,
        coversShot: raw.coversShot,
        platform: raw.platform,
        altitudeFeet: raw.altitudeFeet,
        /*
         * A SUGGESTED POSITION IS ALWAYS FRAMED. The model is not asked for a
         * shot type and does not get to choose one: a 360 or a top-down is a
         * decision about what picture you are making, which is the shooter's,
         * and there is no bearing to recover if a model picks wrong.
         */
        shotType: DEFAULT_SHOT_TYPE,
        yawDegrees: DEFAULT_YAW_DEGREES,
        moved: false,
        origin: 'suggested',
      })),
    )
    // Markers only until a cone is asked for. Six overlapping cones is noise.
    setConeMode('none')
    setLensFilters([])
    setIsolatedId(null)
    setGeneration({ status: 'done', count: parsed.positions.length, dropped: parsed.dropped })
    // Stay on the map and frame everything that was just placed.
    const placed = coords.filter((c) => c !== undefined)
    window.setTimeout(() => mapHandle.current?.fitAll([...placed, ...(aim ? [aim] : [])]), 60)
  }

  const flyToPosition = (id: string) => {
    onSelectPosition(id)
    const target = plan.find((p) => p.position.id === id)
    if (target !== undefined) mapHandle.current?.flyTo(target.position.at)
  }

  const fitTargets = [...plan.map((p) => p.position.at), ...(aim === null ? [] : [aim])]

  /*
   * The window is named with its zone, and it comes FIRST.
   *
   * This line is the only part of the sheet visible at peek, it is one line, and
   * it ellipsizes. With the venue name leading, a 390px phone cut it at
   * "Brew River Dock Bar · 11:00 to 15:..." and threw away the zone, which is the
   * exact ambiguity the timezone work existed to remove. The window is the part
   * that has to survive truncation; the venue name is already on the map.
   */
  const zoneSuffix = venueWindow === null ? '' : ` ${venueWindow.timeZoneShort}`
  const venueShort = venue.name.split(',')[0] || PINNED_PLACEHOLDER
  /*
   * THE OPTIC, SAID ONCE, when every position shares it.
   *
   * The map plates drop it in that case, because six plates reading SIGMA is
   * six copies of a constant. The answer to "on what" still has to exist
   * somewhere, so it moves here, in full rather than as the short tag: this
   * line has room and "Sigma 28-75 f2.8" is the real answer that "SIGMA" is
   * only shorthand for. Null when the positions differ, because then every
   * plate is already carrying its own and this would be the repetition.
   */
  const oneOptic = sharedOptic(visiblePlan.map((p) => ({ opticName: p.optic.name })))

  const summary =
    centre === null
      ? 'No venue set'
      : `${venue.startTime}–${venue.endTime}${zoneSuffix} · ${venueShort}${
          oneOptic === null ? '' : ` · ${oneOptic}`
        }`

  /*
   * What is actually missing, for the forward button to point at: the first
   * field validateVenue flagged, read straight off its errors. See setupGap.
   */
  const gap = setupGap(errors)
  const missing = gap?.target ?? null
  const [pointAt, setPointAt] = useState<{
    field: SetupTarget | 'brief' | null
    tick: number
  }>({ field: null, tick: 0 })

  /** Takes the shooter to the thing a block named, and points at it. */
  const onFixBlock = useCallback((field: SetupTarget | 'brief' | null) => {
    setMode('setup')
    if (field !== null) setPointAt((current) => ({ field, tick: current.tick + 1 }))
    setGeneration({ status: 'idle' })
  }, [])

  /* Which steps are reachable. See src/lib/mode.ts. */
  const available: ModeAvailability = {
    venueReady: !hasErrors(errors),
    hasPlan: plan.length > 0,
  }

  const goTo = (next: Mode) => {
    if (canEnter(next, available) || next === mode) setMode(next)
  }

  const forward = nextMode(mode)
  const forwardLabel = FORWARD_LABEL[mode]
  const forwardBlocked = forward === null ? null : blockedReason(forward, available)

  /*
   * The forward control. Large, singular, and at the bottom of whatever mode you
   * are in, so moving on reads as finishing a step rather than changing channel.
   * When the next step is not earned yet it says why instead of vanishing.
   */
  /*
   * A BLOCKED BUTTON IS NOT A DISABLED BUTTON.
   *
   * It used to be `disabled`, which meant pressing it did nothing at all: no
   * event, no feedback, and a one line reason printed above it that said "set a
   * date" while the date field was off the bottom of the screen. Pressing it now
   * scrolls the missing field into view and lights it up. It still refuses to
   * move on, and it still says why, but it answers the question it raises.
   */
  const forwardBar =
    forward === null || forwardLabel === null ? null : (
      <div className="forward">
        {forwardBlocked === null ? null : (
          <p className="forward__why">
            {mode === 'setup' && gap !== null ? gap.copy : forwardBlocked}
          </p>
        )}
        <button
          type="button"
          className={`btn btn--primary forward__btn${
            forwardBlocked === null ? '' : ' forward__btn--blocked'
          }`}
          aria-disabled={forwardBlocked !== null}
          onClick={() => {
            if (forwardBlocked === null) {
              goTo(forward)
              return
            }
            setPointAt((current) => ({ field: missing, tick: current.tick + 1 }))
          }}
        >
          {forwardLabel}
        </button>
      </div>
    )

  const rail = <ModeRail mode={mode} available={available} onMode={goTo} />

  const peekStatus =
    generation.status === 'working'
      ? {
          label: `Generating · step ${stageIndex(generation.stage) + 1} of ${GENERATE_STAGES.length}`,
          line: stageLabel(generation.stage),
        }
      : { label: 'Shoot setup', line: summary }

  return (
    <div className={`shell shell--${mode}`}>
      {/*
        * A NEWER BUILD ANNOUNCES ITSELF HERE, above everything, in every mode.
        * There is no service worker in this app; what holds a stale build is
        * iOS Safari keeping index.html. See src/lib/build.ts.
        */}
      {landingSeen ? null : <Landing onDismiss={() => setLandingSeen(true)} />}

      <NewBuildNotice check={newBuild} />
      {mode === 'setup' ? (
        <div className="mode-setup">
          <SetupMode
            venue={venue}
            errors={errors}
            onVenueChange={onVenueDraftChange}
            staleBrief={staleBrief}
            drift={drift}
            onClearBrief={clearBrief}
            onKeepBrief={keepBrief}
            kit={kit}
            onKit={onKitChange}
            kitProfile={kitProfile}
            onKitProfile={setKitProfile}
            spots={spots}
            onSaveSpot={saveSpot}
            onLoadSpot={loadSpot}
            onDeleteSpot={(id) => setSpots(spots.filter((spot) => spot.id !== id))}
            onImportSpots={(incoming) => setSpots(mergeSpots(spots, incoming))}
            suggestedName={venue.name.split(',')[0] ?? ''}
            canSave={centre !== null}
            describeText={describeText}
            onDescribeText={setDescribeText}
            describeState={describeState}
            onDescribe={() => void onDescribe()}
            venueChoices={venueChoices}
            onPickVenue={onPickVenue}
            shootKind={shootKind}
            onShootKind={onShootKind}
            platformFilter={platformFilter}
            onPlatformFilter={setPlatformFilter}
            shootLine={shootLine}
            /*
             * THE PROFILE, NOT THE SELECTION. The Drone chip PACKS the
             * aircraft, so reading its availability from what is packed lets
             * Ground untick the aircraft and strand the chip. See canPackAir
             * in src/core/kitPacking.ts.
             */
            airAvailable={canPackAir(kitProfile)}
            subjectMatters={subjectSizeMatters(
              visiblePlan.map((p) => ({
                platform: p.position.platform,
                shotType: p.position.shotType,
              })),
            )}
            newBuild={newBuild}
            onShowLanding={() => setLandingSeen(false)}
            onUseMyLocation={onUseMyLocation}
            shotListText={shotListText}
            onShotListText={onShotListChange}
            desiredShots={desiredShots}
            at={centre}
            onPinChange={onVenueChange}
            onSearchPick={onPick}
            reachMeters={reachMeters}
            onReachChange={onReach}
            mapHandle={setupMap}
            pendingPin={pendingPin}
            onPendingMove={onPendingMove}
            onConfirmPin={confirmPin}
            onCancelPin={cancelPin}
            searchBias={centre}
            showPinHint={!pinHintDone}
            onPinDrag={() => setPinHintDone(true)}
            defaults={defaults}
            pointAt={pointAt}
            settings={settings}
            onSettings={setSettings}
          />
          <div className="mode__foot">
            {forwardBar}
            {rail}
          </div>
        </div>
      ) : null}

      {mode === 'plan' ? (
        <PlanMode
          mapHandle={mapHandle}
          venue={centre}
          onVenueChange={onVenueChange}
          onLongPress={onLongPress}
          plan={plan}
          visiblePlan={visiblePlan}
          conePlan={conePlan}
          platformFilter={platformFilter}
          onPlatformFilter={setPlatformFilter}
          platformCounts={platformTally}
          hiddenByPlatform={hiddenByPlatform}
          airAvailable={droneAvailable(kit, kitProfile)}
          pilotAt={pilotAt}
          onPilotMove={onPilotMove}
          addsAir={addsAir}
          placingPilot={placingPilot}
          aimAt={aimAt}
          placingAim={placingAim}
          onPlacingAim={setPlacingAim}
          onAimAt={onAimAt}
          airAltitudeFeet={plannedAltitudeFeet}
          onPlacingPilot={setPlacingPilot}
          onSetAltitude={onSetAltitude}
          onSetShotType={onSetShotType}
          onSetYaw={onSetYaw}
          planCoverage={plan.length === 0 ? null : planCoverage}
          onPositionMove={onPositionMove}
          sun={sun}
          sunOverlay={sunOverlay}
          showSun={showSun}
          onShowSun={setShowSun}
          showArc={showArc}
          onShowArc={setShowArc}
          showSky={showSky}
          onShowSky={(next) => {
            /*
             * Through the one panel value, so opening the sky key closes
             * whatever else was open rather than stacking on it.
             */
            setMapPanel(next ? 'sky' : 'none')
            if (next) {
              setMarkDraft([])
              setSelectedMarkId(null)
            }
          }}
          wind={wind}
          windLevels={windLevels}
          gustMps={gustMps}
          windAt={windAt}
          windPast={windPast}
          windHeight={windHeight}
          ratedWindMps={rated.mps}
          ratedWindSource={rated.source}
          selectedCloud={null}
          sky={sky}
          selectedId={selectedId}
          onSelect={onSelectPosition}
          selected={selected}
          onFlyTo={flyToPosition}
          coneMode={coneMode}
          onConeMode={setConeMode}
          lensFilters={lensFilters}
          onLensFilters={setLensFilters}
          isolatedId={isolatedId}
          onClearIsolate={() => setIsolatedId(null)}
          venueWindow={venueWindow}
          scrubbedAt={scrubbedAt}
          scrub={scrub}
          onScrub={setScrub}
          tide={tide}
          tideNow={tideNow}
          tideExtremes={tideExtremes}
          generation={generation}
          siteNote={siteNote}
          positionNote={positionNote}
          onGenerate={() => void onGenerate()}
          onFixBlock={onFixBlock}
          kitProfile={kitProfile}
          kitSelection={kit}
          marks={siteMarks}
          marking={marking}
          onMarking={(next) => {
            setMapPanel(next ? 'hazards' : 'none')
            if (!next) {
              setMarkDraft([])
              setSelectedMarkId(null)
            }
          }}
          markKind={markKind}
          onMarkKind={setMarkKind}
          markDrawing={markDrawing}
          onMarkDrawing={(next) => {
            setMarkDrawing(next)
            setMarkDraft([])
          }}
          markDraft={markDraft}
          onMarkAt={onMarkAt}
          onFinishLine={onFinishLine}
          onCancelLine={() => setMarkDraft([])}
          selectedMark={selectedMark}
          onSelectMark={setSelectedMarkId}
          onChangeMark={onChangeMark}
          onDeleteMark={onDeleteMark}
          shootDate={venue.date}
          briefSource={briefSource}
          hud={hudState(positions.length, hudOverride)}
          onHudOverride={setHudOverride}
          skyLayer={skyLayer}
          onSkyLayer={setSkyLayer}
          placing={placing}
          onPlacing={setPlacing}
          onAddAt={addPositionAt}
          onDeletePosition={onDeletePosition}
          onDuplicatePosition={onDuplicatePosition}
          onMovePosition={onMovePosition}
          onSetOptic={onSetOptic}
          pack={pack}
          packIsCurrent={packIsCurrent}
          packState={packState}
          onPreparePack={() => void preparePack()}
          onGoToField={() => goTo('field')}
          goToFieldBlocked={blockedReason('field', available)}
          desiredShots={desiredShots}
          summary={summary}
          peekStatus={peekStatus}
          fitTargets={fitTargets}
          /*
           * PLAN's foot is the rail and nothing else. Its forward step, "Go to
           * field", is now a secondary button beside Generate in the sheet:
           * a full width primary down here was a second loudest thing fighting
           * the one action this screen exists for.
           */
          footer={<div className="mode__foot mode__foot--overlay">{rail}</div>}
        />
      ) : null}

      {mode === 'field' ? (
        <FieldMode
          plan={plan}
          venue={centre}
          tide={tide}
          pack={packIsCurrent ? pack : null}
          footer={rail}
        />
      ) : null}

    </div>
  )
}

export default App
