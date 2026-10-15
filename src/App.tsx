import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ConeMode } from './components/ConePicker.tsx'
import { type MapHandle } from './components/MapView.tsx'
import { ModeRail } from './components/ModeRail.tsx'
import { FieldMode } from './components/FieldMode.tsx'
import { PlanMode } from './components/PlanMode.tsx'
import { NewBuildNotice } from './components/NewBuildNotice.tsx'
import { SetupMode } from './components/SetupMode.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_ALTITUDE_FEET } from './core/air.ts'
import {
  allowedPlatforms,
  DEFAULT_PLATFORM_FILTER,
  platformCounts,
  showsPlatform,
  type PlatformFilter,
} from './core/platformFilter.ts'
import { DEFAULT_KIT, selectedDroneCameras, type KitProfile } from './core/kit.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
import { extremesAround, tideStateAt } from './core/tide.ts'
import { formatClock } from './core/timezone.ts'
import { LOCATED_ZOOM } from './lib/locateOnce.ts'
import { useNewBuild } from './lib/useNewBuild.ts'
import { briefDriftMeters, formatDrift, isBriefStale, type BriefAnchor } from './lib/brief.ts'
import {
  defaultSelection,
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
  validateVenue,
  venueLatLon,
  withCoordinates,
  type VenueDraft,
} from './lib/venue.ts'

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
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle' })
  /* Real OSM shapes for the generated view. Empty until Overpass answers. */
  const [land, setLand] = useState<Landcover>(EMPTY_LANDCOVER)
  const [siteNote, setSiteNote] = useState<string | null>(null)
  /* 0 at the start of the window, 1 at the end. Starts at the midpoint. */
  const [scrub, setScrub] = useState(0.5)

  const [kit, setKit] = usePersistentState<KitSelection>(
    KIT_STORAGE_KEY,
    defaultSelection(DEFAULT_KIT),
    (raw) => reviveSelection(raw, DEFAULT_KIT),
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
   * THE KIT IS THE SHOOTER'S, NOT OURS.
   *
   * It shipped as a constant taken from the brief, which meant buying a lens
   * and being unable to use it. It is now editable state on the device, and
   * DEFAULT_KIT is only the starting point. Every field of view, frame width
   * and standoff band is computed from whatever is in here.
   */
  const [kitProfile, setKitProfile] = usePersistentState<KitProfile>(
    'scoutngo.kitProfile.v1',
    DEFAULT_KIT,
    (raw) => reviveKitProfile(raw),
  )

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

  /* Cones, bearings, lighting, framing and siting, all from src/core/. */
  const plan = useMemo(
    () =>
      aim === null || sun === null
        ? []
        : planPositions(
            positions,
            aim,
            sun.azimuth,
            land,
            kit.bodyIds,
            reachMeters,
            centre,
            kitProfile,
          ),
    [positions, aim, sun, land, kit.bodyIds, reachMeters, centre, kitProfile],
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

  /* The glass a new position starts on: the first lens actually packed. */
  const defaultOptic = useMemo(() => {
    const lens =
      kitProfile.lenses.find((l) => kit.lensIds.includes(l.id)) ?? kitProfile.lenses[0]
    return lens === undefined
      ? { lensId: '', focalLength: 50 }
      : { lensId: lens.id, focalLength: lens.minFocalLength }
  }, [kit.lensIds, kitProfile])

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
    const camera = selectedDroneCameras(kitProfile, kit.droneIds)[0]
    return camera === undefined
      ? null
      : { lensId: camera.id, focalLength: camera.equiv35 }
  }, [kit.droneIds, kitProfile])

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
    setPositions((current) => setOptic(current, id, lensId, focalLength))
  }, [])

  /* Clamped in core, so a typed 900 and a model's 900 both become 400. */
  const onSetAltitude = useCallback((id: string, feet: number) => {
    setPositions((current) => setAltitude(current, id, feet))
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
    }
    setSpots(mergeSpots(spots, [spot]))
  }

  const loadSpot = (spot: Spot) => {
    setVenue(spot.venue)
    cancelNameLookup()
    nameIsFilled.current = false
    setDefaults({ date: false, window: false, name: false })
    setKit(spot.kit)
    setPositions(spot.positions)
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
     * An incomplete venue or a stale brief is a SETUP problem, so send the user
     * back to the step that owns it rather than opening a panel over the map.
     */
    if (hasErrors(errors) || staleBrief) {
      setMode('setup')
      setPointAt((current) => ({ field: missing ?? 'venue', tick: current.tick + 1 }))
      return
    }

    /*
     * NO BRIEF, NO CALL.
     *
     * Pressed at an apartment complex with an empty description, this invented a
     * marina shoot: the model was handed a satellite image and nothing else, and
     * it is obliged to answer, so it answered about what it thought it saw. That
     * is the exact failure this app exists to not have.
     *
     * The model is never asked a question there is no information to answer. It
     * costs a request and produces confident fiction, and fiction shaped like a
     * plan is worse than no plan because it looks finished.
     */
    if (venue.eventDescription.trim() === '') {
      setMode('setup')
      setPointAt((current) => ({ field: 'brief', tick: current.tick + 1 }))
      setGeneration({
        status: 'error',
        message: 'Tell me what the shoot is first. Without it I would be guessing from the satellite image alone.',
      })
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
  const summary =
    centre === null
      ? 'No venue set'
      : `${venue.startTime}–${venue.endTime}${zoneSuffix} · ${venueShort}`

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
            onKit={setKit}
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
          airAvailable={droneAvailable(kit)}
          pilotAt={pilotAt}
          onPilotMove={onPilotMove}
          addsAir={addsAir}
          placingPilot={placingPilot}
          onPlacingPilot={setPlacingPilot}
          onSetAltitude={onSetAltitude}
          planCoverage={plan.length === 0 ? null : planCoverage}
          onPositionMove={onPositionMove}
          sun={sun}
          sunOverlay={sunOverlay}
          showSun={showSun}
          onShowSun={setShowSun}
          showArc={showArc}
          onShowArc={setShowArc}
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
          onGenerate={() => void onGenerate()}
          kitProfile={kitProfile}
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
