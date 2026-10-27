import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ConeMode } from './lib/coneMode.ts'
import { type MapHandle } from './components/MapView.tsx'
import { FieldMode } from './components/FieldMode.tsx'
import { PlanMode } from './components/PlanMode.tsx'
import { NewBuildNotice } from './components/NewBuildNotice.tsx'
import { Landing } from './components/Landing.tsx'
import { NowScreen } from './components/NowScreen.tsx'
import { NUMERALS_DEFAULT } from './core/numerals.ts'
import { NumeralsProvider } from './lib/numerals.tsx'
import { SetupMode } from './components/SetupMode.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_ALTITUDE_FEET } from './core/air.ts'
import type { ShotType } from './core/shotType.ts'
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
import {
  canPackAir,
} from './core/kitPacking.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
import { extremesAround, tideStateAt } from './core/tide.ts'
import { LOCATED_ZOOM } from './lib/locateOnce.ts'
import { useNewBuild } from './lib/useNewBuild.ts'
import { useSkyFrames } from './lib/useSkyFrames.ts'
import { useWind } from './lib/useWind.ts'
import {
  defaultSelection,
  KIT_PROFILE_STORAGE_KEY,
  KIT_STORAGE_KEY,
  reviveKitProfile,
  reviveSelection,
  reviveShelved,
  setShelved,
  SHELVED_STORAGE_KEY,
  withoutShelved,
  type KitSelection,
} from './lib/kitSelection.ts'
import { applyAmendments, readApplied, writeApplied } from './lib/kitAmendments.ts'
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
  GENERATE_STAGES,
  stageIndex,
  stageLabel,
  type GenerationState,
} from './lib/generation.ts'
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
import { parseShotList, type DesiredShot } from './lib/shotList.ts'
import { clampRadius, RADIUS_DEFAULT_METERS } from './core/radius.ts'
import { formatSpan, formatWallTime, setClockHours, venueTimeZone } from './core/timezone.ts'
import { msUntilNominatim, reverseGeocode } from './lib/search.ts'
import { usePersistentState } from './lib/usePersistentState.ts'
import { venueTown } from './lib/venueParts.ts'
import { DEFAULT_UNITS, reviveUnits, type Units } from './lib/units.ts'
import {
  placeKey,
  shortVenueLabel,
  venueLabel,
  venueNameFor,
} from './core/venueName.ts'
import { useTide } from './lib/useTide.ts'
import { lowTideNearest } from './lib/lowTide.ts'
import { useVenueCache } from './lib/useVenueCache.ts'
import { buildScoutFile, saveScoutFile, scoutFilename, type ReadFile } from './lib/scoutFile.ts'
import { runSuggest } from './lib/suggestRun.ts'
import { readShareHash, SHARE_PREFIX } from './lib/planShare.ts'
import { Viewfinder, ViewfinderNeedsPlace } from './components/Viewfinder.tsx'
import { SideMenu } from './components/SideMenu.tsx'
import { backToNow, openingScrub } from './lib/backToNow.ts'
import { retrying } from './lib/retrying.ts'
import { planForNow } from './lib/planForNow.ts'
import { useNow } from './lib/useNow.ts'
import { clearPlace, loadPlace } from './lib/place.ts'
import { pathToMenuItem, type MenuItem } from './lib/menu.ts'
import {
  blockedReason,
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
  laancHere,
  withLaanc,
  withApprovedCeiling,
  approvedCeilingHere,
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
import { kitLine } from './core/kitLine.ts'
import { windHeightFor } from './core/windHeight.ts'
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
  /*
   * WHETHER A NAME LOOKUP IS IN FLIGHT.
   *
   * Not part of the venue: it is a fact about the network, not about the
   * place. It only decides whether an absent name reads as "looking" (show
   * the coordinate) or "unknown" (say so).
   */
  const [lookingUpName, setLookingUpName] = useState(false)

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
  const showSky = skyLayerOn(mapPanel)

  /*
   * THE LAYERS LIST is a map panel like the other two, so it cannot be open
   * beside them by construction. See src/core/mapPanel.ts.
   */

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

  /*
   * WHETHER THE PLAN ON SCREEN WAS GENERATED FROM A FLATTENED MAP.
   *
   * Held from the moment of capture rather than derived from whether terrain
   * is on NOW, because turning terrain on afterwards does not make the plan
   * any better informed about the ridge. See src/core/captureTerrain.ts.
   */
  const [terrainNote, setTerrainNote] = useState<string | null>(null)
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
  /*
   * SHELVED GEAR: the shooter's, never offered. Its own list, because it is a
   * fact about owning the gear and not about one shoot; see SHELVED_STORAGE_KEY.
   */
  const [shelved, setShelvedIds] = usePersistentState<string[]>(SHELVED_STORAGE_KEY, [], (raw) =>
    reviveShelved(raw, kitProfile),
  )

  const [kit, setKitStored] = usePersistentState<KitSelection>(
    KIT_STORAGE_KEY,
    defaultSelection(DEFAULT_KIT),
    (raw) => reviveSelection(raw, kitProfile, shelved),
  )
  /*
   * EVERY WRITE OF THE BAG GOES THROUGH THE SHELF. Nothing shelved can be put
   * in it, by a toggle, a reset, a spot loading, or a file importing.
   */
  const setKit = useCallback(
    (next: KitSelection) => setKitStored(withoutShelved(next, shelved)),
    [setKitStored, shelved],
  )
  const onShelve = useCallback(
    (id: string, on: boolean) => {
      const next = setShelved(shelved, id, on)
      setShelvedIds(next)
      if (on) setKitStored(withoutShelved(kit, next))
    },
    [shelved, setShelvedIds, setKitStored, kit],
  )

  /*
   * KIT CHANGES ASKED FOR BY NAME, applied to the stored kit once per device.
   * See src/lib/kitAmendments.ts for why this is not an edit to DEFAULT_KIT.
   */
  const [kitNote, setKitNote] = useState<string | null>(null)
  useEffect(() => {
    const result = applyAmendments(kitProfile, shelved, readApplied())
    writeApplied(result.applied)
    if (result.said.length === 0) return
    const added = result.profile.lenses
      .filter((lens) => !kitProfile.lenses.some((l) => l.id === lens.id))
      .map((lens) => lens.id)
    /* oxlint-disable react/set-state-in-effect -- a one-time migration of stored state */
    setKitProfile(result.profile)
    setShelvedIds(result.shelved)
    /* A lens added by name is in the bag, like the one it replaces was. */
    setKitStored(
      withoutShelved({ ...kit, lensIds: [...kit.lensIds, ...added] }, result.shelved),
    )
    setKitNote(result.said.join(' '))
    /* oxlint-enable react/set-state-in-effect */
    /* Once, on load: the stored values above are what it reads. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const [settings, setSettings] = usePersistentState<{
    showNumbers: boolean
    showLabels: boolean
    showTerrain: boolean
    showBuildings: boolean
    /*
     * WHICH UNITS EVERY NUMBER RENDERS IN, the chips included. A preference
     * persisting itself, which is the one direction a view control is allowed
     * to write: see docs/failure-modes.md on the kit and the filter.
     */
    units: Units
  }>(
    'scoutngo.settings',
    {
      showNumbers: NUMERALS_DEFAULT,
      showLabels: false,
      showTerrain: false,
      units: DEFAULT_UNITS,
      showBuildings: false,
    },
    (raw) => {
      const stored = raw as { showNumbers?: unknown; showCoords?: unknown } | null
      /*
       * MIGRATED FROM showCoords, WHICH THIS REPLACES RATHER THAN JOINS.
       *
       * The old setting printed the venue's latitude and longitude and
       * nothing else. It was the same idea at one call site, so it becomes
       * this one rather than sitting beside it: two switches for "how much
       * detail" is exactly the two-modes problem in miniature. Anybody who
       * had coordinates on wanted the receipts, so they keep them.
       */
      /*
       * Labels default OFF: the clean image is the point while reading a
       * venue. Remembered, because which job somebody is doing does not
       * change between launches.
       */
      const showLabels = (stored as { showLabels?: unknown } | null)?.showLabels === true
      /*
       * TERRAIN DEFAULTS OFF AND IS REMEMBERED. Off because it costs tiles and
       * frames and most venues are flat enough not to need it; remembered
       * because somebody shooting ridgelines is shooting ridgelines every time.
       */
      const showTerrain = (stored as { showTerrain?: unknown } | null)?.showTerrain === true
      const showBuildings =
        (stored as { showBuildings?: unknown } | null)?.showBuildings === true
      /*
       * UNITS, REVIVED FIELD BY FIELD. A stored object from before units
       * existed has none, and a half-written one could have a wind unit this
       * build does not know; either way the default stands rather than a
       * string nothing can convert reaching a readout.
       */
      const units: Units = reviveUnits((stored as { units?: unknown } | null)?.units)
      if (typeof stored?.showNumbers === 'boolean') {
        return { showNumbers: stored.showNumbers, showLabels, showTerrain, showBuildings, units }
      }
      return {
        showNumbers: stored?.showCoords === true,
        showLabels,
        showTerrain,
        showBuildings,
        units,
      }
    },
  )

  /*
   * THE CLOCK THE WHOLE APP WRITES IN, set from the stored units during
   * render rather than in an effect, so the first paint is already in the
   * shooter's clock. Idempotent. See formatClock in src/core/timezone.ts.
   */
  setClockHours(settings.units.clock)

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


  /* A pasted shot list, if one was sent. Editable lines. */
  const [shotListText, setShotListText] = useState('')
  const [desiredShots, setDesiredShots] = useState<DesiredShot[]>([])
  const [showSun, setShowSun] = useState(true)
  const [showArc, setShowArc] = useState(false)
  const [coneMode, setConeMode] = useState<ConeMode>('none')
  /* Multi select. Empty means no filter, which shows every lens. */
  const [lensFilters, setLensFilters] = useState<string[]>([])
  const [isolatedId, setIsolatedId] = useState<string | null>(null)

  const [spots, setSpots] = usePersistentState<Spot[]>(SPOTS_STORAGE_KEY, [], reviveSpots)

  /*
   * THE ONE FILE, OUT AND IN. Kit, shelved gear, units and spots. Kit and
   * units replace what is here, because a backup is the kit; spots are added,
   * because two devices' spots are both worth keeping. See src/lib/scoutFile.ts.
   */
  const onExportAll = () =>
    saveScoutFile(
      buildScoutFile({
        kit: { profile: kitProfile, selection: kit, shelved },
        units: settings.units,
        spots,
      }),
      scoutFilename('backup'),
    )
  const onImportFile = (file: ReadFile): string => {
    const did: string[] = []
    if (file.kit !== null) {
      setKitProfile(file.kit.profile)
      setShelvedIds(file.kit.shelved)
      setKitStored(withoutShelved(file.kit.selection, file.kit.shelved))
      did.push('kit replaced')
    }
    if (file.units !== null) {
      setSettings({ ...settings, units: file.units })
      did.push('units replaced')
    }
    if (file.spots.length > 0) {
      setSpots(mergeSpots(spots, file.spots))
      did.push(`${file.spots.length} ${file.spots.length === 1 ? 'spot' : 'spots'} added`)
    }
    return `Imported: ${did.join(', ')}.`
  }

  const mapHandle = useRef<MapHandle>(null)

  const errors = useMemo(() => validateVenue(venue), [venue])
  const venueWindow = useMemo(() => resolveWindow(venue), [venue])
  /*
   * KEYED ON THE COORDINATE, NOT THE VENUE OBJECT. Anything else about the
   * venue changing (its name filled in, its window) made a new centre with
   * the same numbers, and the 3D view, keyed on it, tore down its engine and
   * built it again while it was open: a second white flash and a second load.
   */
  const point = venueLatLon(venue)
  const centre = useMemo(() => (point === null ? null : { lat: point.lat, lon: point.lon }), [point?.lat, point?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  /*
   * ONE PIN. It is the thing being shot: it centres the map, it anchors the sun
   * and tide and timezone, and every cone bearing is measured to it. There used
   * to be a second "subject" coordinate that defaulted to this one and could be
   * moved separately, which put two near-identical white marks a few metres
   * apart with nothing to say which was which.
   */
  const aim = centre

  /*
   * THE PLACE AROUND THE VENUE, in one Overpass request (src/lib/place.ts):
   * the coastline the elevation both views read is cleaned against, and the
   * buildings and trees the 3D view draws. Saved on the phone once fetched.
   */
  useEffect(() => {
    if (centre === null) {
      clearPlace()
      return
    }
    void loadPlace(centre)
  }, [centre])

  /*
   * THE TIME BAR OPENS AT NOW on the shoot day, and in the middle of the
   * window on any other (src/lib/backToNow.ts openingScrub). Again whenever
   * the place, the day or the window changes.
   */
  useEffect(() => {
    setScrub(openingScrub(venue, new Date()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.latitude, venue.longitude, venue.date, venue.startTime, venue.endTime])

  /*
   * "PLAN FOR NOW" when the saved window is over or in the other half of the
   * day (src/lib/planForNow.ts). Offered, never applied without a tap.
   */
  const clockNow = useNow(60_000)
  const planNowOffer = useMemo(() => planForNow(venue, clockNow), [venue, clockNow])
  const onPlanForNow = useCallback(() => {
    if (planNowOffer === null) return
    setVenue((current) => ({ ...current, ...planNowOffer }))
  }, [planNowOffer])

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

  /*
   * THE LOW WATER THE CHIP SHOWS: the one nearest the window, not only one
   * inside it. See src/lib/lowTide.ts for why "inside" read "no data".
   */
  const lowTide = useMemo(() => {
    if (tide.status !== 'ok' || venueWindow === null) return null
    return lowTideNearest(tide.predictions.extremes, venueWindow.start, venueWindow.end)
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
  /*
   * ISOLATING ONE CONE NO LONGER DELETES THE OTHERS; IT OUTLINES THEM.
   *
   * It used to filter the list down to the isolated position, so the other
   * cones vanished. That answers "what does this one see" and loses the
   * question people are actually asking when they isolate, which is "what
   * does this one see THAT THE OTHERS DO NOT". An outline costs nothing to
   * read and keeps the comparison on screen.
   *
   * It is also what three overlapping translucent cones need. Stacked fills
   * at 0.22 compound into one green mass with no edges in it; one fill and
   * two outlines reads as a plan with a subject.
   *
   * The filled/outlined split is a PROPERTY on the feature, not two sources:
   * one collection, and the paint decides. Two sources would be two places
   * for one set of cones to get out of step.
   */
  const conePlan = useMemo(() => {
    if (isolatedId !== null) return visiblePlan
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
  /*
   * Whether the browser is sitting on /how. Kept in state rather than read on
   * every render so a popstate (the back button) re-renders the app.
   */
  const [atHowPath, setAtHowPath] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/how',
  )
  useEffect(() => {
    const onPop = () => setAtHowPath(window.location.pathname === '/how')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

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
    cloud: venueCloud,
    provenance: forecastProvenance,
    reason: forecastReason,
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
  /*
   * THE NAME, DERIVED. Every place that shows a venue name reads this, and
   * never venue.name directly: a cached name whose key does not match this
   * coordinate is a name for somewhere else.
   */
  const venueNameState = useMemo(
    () => venueNameFor(venue.name, venue.latitude, venue.longitude, lookingUpName),
    [venue.name, venue.latitude, venue.longitude, lookingUpName],
  )
  /*
   * A NAME FOR EVERY PIN, ASKED UNTIL IT ARRIVES. The lookup used to run only
   * when a pin was dropped, once: a search pick that came with no name, a
   * shared plan, or one dropped request left "Name unknown" in the top bar
   * (Virginia Beach, 27 Oct). Now any coordinate with no name of its own is
   * looked up, and asked again after a failure (src/lib/retrying.ts).
   */
  const nameUnknown = venueNameState.kind === 'unknown' && venueLatLon(venue) !== null
  useEffect(() => {
    if (!nameUnknown) return
    const at = venueLatLon(venue)
    if (at === null) return
    const key = placeKey(venue.latitude, venue.longitude)
    return retrying(async () => {
      await new Promise((resolve) => setTimeout(resolve, msUntilNominatim()))
      const name = await reverseGeocode(at)
      if (name === null) return false
      setVenue((current) =>
        placeKey(current.latitude, current.longitude) === key && venueNameFor(current.name, current.latitude, current.longitude, false).kind !== 'name'
          ? { ...current, name: { key, name } }
          : current,
      )
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameUnknown, venue.latitude, venue.longitude])

  const venueNameLine = useMemo(
    () => venueLabel(venueNameState, venue.latitude, venue.longitude),
    [venueNameState, venue.latitude, venue.longitude],
  )

  /*
   * THE VENUE SAVES ITSELF FOR OFFLINE when it is opened with signal: its
   * imagery and terrain for the ring the shooter can reach, size measured and
   * shown first. No button, because the button was forgotten and the trip
   * failed. See src/lib/useVenueCache.ts.
   */
  const venueCache = useVenueCache(centre, reachMeters, venueNameLine)


  /*
   * NO HOLDS ANY MORE, AND NOTHING LOST.
   *
   * KitHolds existed to remember which ids the shooter had ticked BY HAND, so
   * the packing chip could not undo them. With the chip no longer writing to
   * the kit, every tick in the selection is a hand tick: the selection IS the
   * record of what the shooter chose, and a second structure describing which
   * parts of it are "really" theirs is a second source for one fact.
   */
  const onKitChange = useCallback((next: KitSelection) => setKit(next), [setKit])

  /*
   * THE FILTER DOES NOT PACK THE BAG. IT NEVER DID, HONESTLY.
   *
   * THE RULE, STATED ONCE: the kit is what the shooter OWNS; the filter is
   * what they want to SEE. A view filter never writes to the kit.
   *
   * WHAT WAS HERE. An effect watched platformFilter and rewrote the kit
   * selection through packForPlatform: picking DRONE unticked the bodies and
   * glass, picking GROUND unticked the aircraft. It was asked for and it read
   * as sensible, and it made the control ONE-WAY. Selecting GROUND removed
   * the drone from the selection, droneAvailable then answered false, and the
   * AIR segment came back disabled with the title "No drone in the kit" --
   * with every kit chip in Setup still ticked. There was no way back to AIR
   * except reloading.
   *
   * That is the drone chip bug a second time, and the first fix was local:
   * a control deriving its enabled state from a selection it is the only way
   * to change. The shape is in docs/failure-modes.md as D.
   *
   * WHAT REPLACED IT: nothing. GROUND hides air positions and air optics from
   * the VIEW -- visiblePlan and opticsFor already do that, by platform, at
   * read time -- and the aircraft stays in the kit. Packing is now only what
   * the shooter does by hand in the kit row, which is the one place that
   * means "this is what I am carrying".
   */

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
      /*
       * NO "SHOULD WE REFILL IT" QUESTION ANY MORE.
       *
       * This used to ask whether the name was blank or auto-filled before
       * touching it, and left a hand-typed name alone -- which is exactly how
       * the header kept saying Brew River Dock Bar in Shenandoah. The name is
       * keyed on the coordinate now, so moving the pin invalidates it by
       * construction and there is nothing to decide.
       */
      setVenue((current) => withCoordinates(current, at))

      nameIsFilled.current = true
      setLookingUpName(true)
      setDefaults((d) => ({ ...d, name: true }))
      cancelNameLookup()
      const controller = new AbortController()
      const pinned = withCoordinates(venueNow.current, at)
      const timer = window.setTimeout(() => {
        void reverseGeocode(at, controller.signal).then((name) => {
          if (controller.signal.aborted) return
          setLookingUpName(false)
          /*
           * A FAILED LOOKUP LEAVES THE NAME ABSENT, not stale. venueNameFor
           * then reports 'unknown' and the plate says so, which is a true
           * statement; keeping the previous name would be a false one.
           */
          if (name === null) return
          setVenue((current) =>
            current.latitude === pinned.latitude && current.longitude === pinned.longitude
              ? { ...current, name: { key: placeKey(current.latitude, current.longitude), name } }
              : current,
          )
        })
      }, msUntilNominatim())
      nameLookup.current = { timer, controller }
    },
    [cancelNameLookup],
  )

  /*
   * THE NOW SCREEN.
   *
   * ONE TAP FROM LAUNCH, and not a fourth mode on the rail. The rail is a
   * progression along one axis, SETUP then PLAN then FIELD, and this is not a
   * stage of that: it is a glance that answers a question before any of them
   * have been started. Putting it on the rail would mean either a step that is
   * always available out of order or a step that gates the others, and it is
   * neither.
   *
   * NOT PERSISTED. It opens closed every launch. A screen that remembered
   * being open would hide the app from somebody who left it open once.
   */
  const [nowOpen, setNowOpen] = useState(false)

  /*
   * THE MENU, AND WHAT ITS ITEMS ASK FOR. The bottom tab row is gone; every
   * place it went, and the cards and drawers it could not reach, is one item in
   * the side menu. A request carries a tick so asking twice opens twice.
   */
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerRequest, setDrawerRequest] = useState<{ drawer: 'kit' | 'saved'; tick: number }>({
    drawer: 'kit',
    tick: 0,
  })
  const [cardRequest, setCardRequest] = useState<{ kind: 'sky' | 'settings' | 'about' | 'callsheet' | 'exposure'; tick: number }>({
    kind: 'sky',
    tick: 0,
  })
  /* The viewfinder: the camera with the plan over it. Opened from the menu, asks for its permissions on a tap. */
  const [viewfinderOpen, setViewfinderOpen] = useState(false)

  const onMenuPick = (item: MenuItem) => {
    switch (item) {
      case 'plan':
      case 'setup':
      case 'field':
        setMode(item)
        return
      case 'now':
        setNowOpen(true)
        return
      case 'viewfinder':
        setViewfinderOpen(true)
        return
      case 'sky':
      case 'exposure':
      case 'settings':
      case 'about':
      case 'callsheet':
        setMode('plan')
        setCardRequest((r) => ({ kind: item, tick: r.tick + 1 }))
        return
      case 'kit':
      case 'saved':
        setMode('setup')
        setDrawerRequest((r) => ({ drawer: item, tick: r.tick + 1 }))
        return
    }
  }
  const menuCurrent: MenuItem = mode

  /* The dock's Back to now: this minute at the venue, moving the shoot day to today if it is not. See src/lib/backToNow.ts. */
  const onBackToNow = useCallback(() => {
    const got = backToNow(venue, new Date())
    if (got === null) return
    const date = got.date
    if (date !== null) setVenue((current) => ({ ...current, date }))
    setScrub(got.scrub)
  }, [venue])

  /*
   * A PLACE THAT MOVED IS STILL A PLACE. /field, /now and the rest are the
   * names of places (src/lib/menu.ts OLD_PATHS); vercel.json serves the app
   * for each, and here the app goes there once and puts the address back.
   */
  const menuPickRef = useRef(onMenuPick)
  useEffect(() => {
    menuPickRef.current = onMenuPick
  })
  useEffect(() => {
    const go = () => {
      const item = pathToMenuItem(window.location.pathname)
      if (item === null) return
      window.history.replaceState(null, '', '/' + window.location.search + window.location.hash)
      menuPickRef.current(item)
    }
    go()
    /* And on back or forward to one: Field left the menu on 27 Oct, and /field is still its address. */
    window.addEventListener('popstate', go)
    return () => window.removeEventListener('popstate', go)
  }, [])

  /*
   * THE DOOR OUT OF IT: the glance becomes a plan with nothing typed.
   *
   * Carries the coordinate as the pin and TODAY as the date, because the whole
   * premise of the screen is that this is happening now. The window is left
   * alone: Setup already proposes one from the date, and overriding it here
   * would be this screen deciding what kind of shoot it is.
   */
  const planFromNow = useCallback(
    (at: LatLon) => {
      setNowOpen(false)
      const today = new Date()
      const iso = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-')
      setVenue((current) => ({ ...withCoordinates(current, at), date: iso }))
      setDefaults((d) => ({ ...d, date: true }))
      setMode('setup')
    },
    [],
  )

  const onVenueChange = dropVenuePin

  const onVenueDraftChange = useCallback(
    (next: VenueDraft) => {
      setVenue((current) => {
        /*
         * A default stops being a default the moment it is touched. Compared
         * field by field rather than wholesale, so editing the date does not
         * quietly claim the window was chosen too.
         */
        if (next.date !== current.date) setDefaults((d) => ({ ...d, date: false }))
        if ((next.name?.name ?? null) !== (current.name?.name ?? null)) {
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
    [cancelNameLookup],
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
      setVenue((current) => {
        const moved = withCoordinates(current, pin.at)
        return {
          ...moved,
          name: { key: placeKey(moved.latitude, moved.longitude), name: pin.label },
        }
      })
      /* A chosen search result names itself; it is not a guess to overwrite. */
      nameIsFilled.current = false
      cancelNameLookup()
      setDefaults((d) => ({ ...d, name: false }))
      setPositions([])
      setGeneration({ status: 'idle' })
      return null
    })
  }, [cancelNameLookup])

  const cancelPin = useCallback(() => setPendingPin(null), [])


  const onSelectPosition = (id: string | null) => {
    setSelectedId(id)
    // Tapping a position isolates its cone; tapping it again restores.
    setIsolatedId((current) => (id === null ? null : current === id ? null : id))
  }

  /*
   * A PLAN ARRIVING IN THE LINK'S FRAGMENT (src/lib/planShare.ts). Read once
   * at launch, then the fragment is cleared from the address bar so a reload
   * does not offer it again.
   */
  const [sharedPlan, setSharedPlan] = useState<Spot | null>(null)
  useEffect(() => {
    if (!window.location.hash.startsWith(SHARE_PREFIX)) return
    let live = true
    void readShareHash(window.location.hash).then((plan) => {
      if (!live) return
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setSharedPlan(plan)
    })
    return () => {
      live = false
    }
  }, [])

  const spotNamed = (name: string): Spot => ({
    id: newSpotId(),
    name,
    savedAt: new Date().toISOString(),
    venue,
    kit,
    positions,
    /* The wires go with the place, which is the point of saving a place. */
    marks,
  })

  const saveSpot = (name: string) => setSpots(mergeSpots(spots, [spotNamed(name)]))

  /* The plan on screen, for Save plan and Share. Named for the venue, or its coordinate. */
  const currentPlan = (): Spot | null => {
    if (centre === null) return null
    const named = venue.name !== null && venue.name.key === placeKey(venue.latitude, venue.longitude) ? venue.name.name : null
    return spotNamed(named ?? `${venue.latitude}, ${venue.longitude}`)
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
    setKit(reviveSelection(spot.kit, kitProfile, shelved))
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
    setGeneration({ status: 'idle' })
    setMode('setup')
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
    const block = generateBlock({ errors, missing })
    if (block !== null) {
      setGeneration({ status: 'blocked', block })
      return
    }

    /*
     * SUGGEST IS ARITHMETIC NOW, NOT A MODEL.
     *
     * This used to capture the map as a JPEG and ask a model where to stand.
     * From straight above a model cannot tell a two-storey building from a
     * twelve-storey one, so it put tripods behind hotels. The positions are
     * worked out in src/core/suggest.ts from the kit in the bag, building
     * footprints and heights, water, airspace, the shooter's own marks, the
     * terrain when it is on, and the sun at the scrubbed moment.
     */
    if (aim === null || centre === null || venueWindow === null) {
      setGeneration({ status: 'error', message: 'Set the venue and the window first.' })
      return
    }
    const shootAt = scrubbedAt ?? venueWindow.middle
    /* Notes from the old capture path would describe a run that no longer happens. */
    setSiteNote(null)
    setTerrainNote(null)
    setGeneration({ status: 'working', stage: 'capture' })
    const outcome = await runSuggest({
      subject: aim,
      reach: { centre, radiusMeters: reachMeters },
      profile: kitProfile,
      bag: kit,
      platforms: allowedPlatforms(platformFilter),
      airAltitudeFeet: DEFAULT_ALTITUDE_FEET,
      sun: getSunPosition(shootAt, aim.lat, aim.lon),
      subjectWidthMeters: subjectAcrossMeters(venue),
      date: venue.date,
      /* The shooter's marks and the power lines OSM maps: sightline.ts judges both. */
      marks: siteMarks,
      ...(mapHandle.current?.elevationAt === undefined || !settings.showTerrain
        ? {}
        : { elevationAt: (at: LatLon) => mapHandle.current?.elevationAt(at) ?? null }),
      units: settings.units,
      laanc: laancHere(venue),
      approvedCeilingFeet: approvedCeilingHere(venue),
      shootAt,
      onStage: (stage) => setGeneration({ status: 'working', stage }),
    })
    if (outcome.status === 'error') {
      setGeneration({ status: 'error', message: outcome.message })
      return
    }
    if (outcome.site !== null) {
      setLand(outcome.site.land)
      setOsmPower(outcome.site.power)
    }

    setPositions(outcome.positions)
    // Markers only until a cone is asked for. Six overlapping cones is noise.
    setConeMode('none')
    setLensFilters([])
    setIsolatedId(null)
    setGeneration({
      status: 'done',
      count: outcome.positions.length,
      dropped: 0,
      summary: outcome.summary,
    })
    // Stay on the map and frame everything that was just placed.
    const placed = outcome.positions.map((p) => p.at)
    window.setTimeout(() => mapHandle.current?.fitAll([...placed, aim]), 60)
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
  const zoneSuffix = venueWindow === null || venueWindow.timeZoneShort === '' ? '' : ` ${venueWindow.timeZoneShort}`
  const windowSpan = formatSpan(formatWallTime(venue.startTime) ?? venue.startTime, formatWallTime(venue.endTime) ?? venue.endTime)
  const venueShort = shortVenueLabel(venueNameState, venue.latitude, venue.longitude)
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

  /*
   * WHAT IS COMING, FROM THE PACKED KIT RATHER THAN FROM THE PLAN.
   *
   * The plan's shared optic is the right answer once positions exist and says
   * nothing before they do, which is most of the time somebody is looking at
   * this line. And on a drone shoot it named a lens: see src/core/kitLine.ts,
   * where the per-platform rule lives.
   *
   * The plan's optic still wins when there IS one, because by then it is the
   * measured answer for the positions on screen rather than what is in the bag.
   */
  const packedLine = kitLine(kitProfile, kit, platformFilter)
  const gearLine = oneOptic ?? packedLine

  const summary =
    centre === null
      ? 'No venue set'
      : `${windowSpan}${zoneSuffix} · ${venueShort}${
          gearLine === null ? '' : ` · ${gearLine}`
        }`

  /*
   * What is actually missing, for the forward button to point at: the first
   * field validateVenue flagged, read straight off its errors. See setupGap.
   */
  const gap = setupGap(errors)
  const missing = gap?.target ?? null
  const [pointAt, setPointAt] = useState<{
    field: SetupTarget | null
    tick: number
  }>({ field: null, tick: 0 })

  /** Takes the shooter to the thing a block named, and points at it. */
  const onFixBlock = useCallback((field: SetupTarget | null) => {
    setMode('setup')
    if (field !== null) setPointAt((current) => ({ field, tick: current.tick + 1 }))
    setGeneration({ status: 'idle' })
  }, [])

  /* Which steps are reachable. See src/lib/mode.ts. */
  const available: ModeAvailability = {
    venueReady: !hasErrors(errors),
    hasPlan: plan.length > 0,
  }

  /*
   * ANY STAGE FROM ANY STAGE. NO GATE.
   *
   * WHAT WAS HERE: `if (canEnter(next, available) || next === mode) setMode(next)`
   * -- the availability check, with a comment above the nav insisting the nav
   * called this "directly rather than through the availability gate". The
   * comment was written when the stepper was replaced and the gate was left
   * in. Pressing FIELD with no plan did nothing at all: no event, no feedback,
   * nothing to press next. The reachability audit found it by clicking FIELD
   * and reading the shell's own stage class afterwards.
   *
   * A SCREEN WITH NOTHING TO SHOW SAYS SO IN ITS OWN CONTENT, which is a
   * better place for it than a tab that refuses to move -- and that content
   * has to offer the control, which is why FIELD's empty state now carries a
   * button back to PLAN rather than the sentence "Generate a plan first".
   *
   * `blockedReason` stays, and is the only thing left of the gate: the
   * forward bar says why the next step is not earned yet, which is a
   * statement about the work and not a lock on the navigation. `canEnter`
   * existed only to make this line refuse, and is deleted with it.
   */
  const goTo = (next: Mode) => setMode(next)

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

  /*
   * THE PEEK LINE SAYS SOMETHING OR IT IS NOT THERE.
   *
   * It used to read `Shoot setup · 11:00-15:00 EDT · Brew River Dock Bar,
   * Salisbury MD` whenever nothing was happening -- which is the venue bar's
   * two fields, word for word, a hundred pixels below the venue bar. Two
   * sources for one fact (shape A in docs/failure-modes.md), and it cost
   * every card in the sheet about fifty pixels before the card began.
   *
   * While a plan is generating it is a different matter: the step count is
   * the only place that progress is reported, and nothing above says it.
   */
  const peekStatus =
    generation.status === 'working'
      ? {
          label: `Generating · step ${stageIndex(generation.stage) + 1} of ${GENERATE_STAGES.length}`,
          line: stageLabel(generation.stage),
        }
      : null

  return (
    /*
     * ONE PROVIDER AT THE ROOT, so the switch reaches the ray plates on the
     * map and the degrees on the time bar in the same flip. There is no
     * subtree anywhere that wants a different answer.
     */
    <NumeralsProvider show={settings.showNumbers}>
    <div className={`shell shell--${mode}`}>
      {/*
        * A NEWER BUILD ANNOUNCES ITSELF HERE, above everything, in every mode.
        * The one service worker keeps the app shell network-first, so it holds
        * no stale build; what can is iOS Safari keeping index.html. See
        * src/lib/build.ts and src/sw/shellRoutes.ts.
        */}
      {/*
        * THE COVER ON A FIRST RUN, AND /how WHENEVER IT IS ASKED FOR.
        *
        * `landingSeen` decides the FIRST RUN. The path decides everything
        * after it: /how is a real URL, so it has to render the page whether or
        * not the shooter has been here before, including when it is pasted to
        * somebody who has the app already.
        */}
      {landingSeen && !atHowPath ? null : (
        <Landing onDismiss={() => { setLandingSeen(true); setAtHowPath(false) }} />
      )}
      {!nowOpen ? null : (
        <NowScreen onClose={() => setNowOpen(false)} onPlanHere={planFromNow} />
      )}

      <NewBuildNotice check={newBuild} />
      {mode === 'setup' ? (
        <div className="mode-setup">
          <SetupMode
            venue={venue}
            errors={errors}
            onVenueChange={onVenueDraftChange}
            kit={kit}
            onKit={onKitChange}
            kitProfile={kitProfile}
            onKitProfile={setKitProfile}
            shelved={shelved}
            onShelve={onShelve}
            kitNote={kitNote}
            spots={spots}
            onSaveSpot={saveSpot}
            onLoadSpot={loadSpot}
            onDeleteSpot={(id) => setSpots(spots.filter((spot) => spot.id !== id))}
            onImportSpots={(incoming) => setSpots(mergeSpots(spots, incoming))}
            currentPlan={currentPlan}
            suggestedName={shortVenueLabel(venueNameState, venue.latitude, venue.longitude)}
            canSave={centre !== null}
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
            venueNameState={venueNameState}
            onShowLanding={() => {
              setAtHowPath(true)
              window.history.pushState({}, '', '/how')
            }}
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
            onMenu={() => setMenuOpen(true)}
            menuOpen={menuOpen}
            forward={forwardBar}
            drawerRequest={drawerRequest}
            onOpenExposure={() => {
              setMode('plan')
              setCardRequest((r) => ({ kind: 'exposure', tick: r.tick + 1 }))
            }}
            onAddPosition={() => {
              /* There are no positions in setup: the + goes to the plan, armed. */
              setMode('plan')
              setPlacing(true)
            }}
          />
        </div>
      ) : null}

      {mode === 'plan' ? (
        <PlanMode
          /*
           * THE BAR GETS THE NAME, THE SHOOT CARD GETS THE TOWN. One line
           * does not fit beside a date and an avatar at 390px. Both halves
           * come from core's own boundary; see src/lib/venueParts.ts.
           */
          venueNameLine={venueShort}
          venueTownLine={venueTown(venueNameLine, venueShort)}
          units={settings.units ?? DEFAULT_UNITS}
          onUnits={(next) => setSettings({ ...settings, units: next })}
          /*
           * ABOUT'S DOORS. /how is one page with two entry points, and kit,
           * spots and the key already live in Setup -- About points at them
           * rather than growing a second copy of each.
           */
          onHow={() => {
            setAtHowPath(true)
            window.history.pushState({}, '', '/how')
          }}
          onEditKit={() => setMode('setup')}
          onOpenSpots={() => setMode('setup')}
          onOpenSettings={() => setMode('setup')}
          savedSpotCount={spots.length}
          mapHandle={mapHandle}
          venue={centre}
          onVenueChange={onVenueChange}
          plan={plan}
          visiblePlan={visiblePlan}
          conePlan={conePlan}
          platformFilter={platformFilter}
          showLabels={settings.showLabels}
          onShowLabels={(next) => setSettings({ ...settings, showLabels: next })}
          showTerrain={settings.showTerrain}
          onShowTerrain={(next) => setSettings({ ...settings, showTerrain: next })}
          showBuildings={settings.showBuildings}
          onShowBuildings={(next) => setSettings({ ...settings, showBuildings: next })}
          onPlatformFilter={setPlatformFilter}
          platformCounts={platformTally}
          hiddenByPlatform={hiddenByPlatform}
          /*
           * WHAT THE SHOOTER OWNS, NOT WHAT IS TICKED RIGHT NOW. This read
           * droneAvailable(kit, ...), which asks the SELECTION -- so any
           * state that emptied the selection of drones disabled the segment
           * that is the only way to get them back. canPackAir asks the
           * profile: a drone in the bag means AIR is selectable, always.
           */
          airAvailable={canPackAir(kitProfile)}
          pilotAt={pilotAt}
          onPilotMove={onPilotMove}
          addsAir={addsAir}
          placingPilot={placingPilot}
          aimAt={aimAt}
          placingAim={placingAim}
          onPlacingAim={setPlacingAim}
          onAimAt={onAimAt}
          airAltitudeFeet={plannedAltitudeFeet}
          laanc={laancHere(venue)}
          onLaanc={(on) => setVenue((current) => withLaanc(current, on))}
          approvedCeiling={laancHere(venue) ? (venue.laancCeilingFeet ?? '') : ''}
          onApprovedCeiling={(typed) => setVenue((current) => withApprovedCeiling(current, typed))}
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
          venueCloud={venueCloud}
          onExport={onExportAll}
          onImport={onImportFile}
          venueCache={venueCache}
          getView={() => mapHandle.current?.viewport()?.bounds ?? null}
          forecast={forecastProvenance}
          forecastReason={forecastReason}
          lowTide={lowTide}
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
          onIsolate={setIsolatedId}
          venueWindow={venueWindow}
          scrubbedAt={scrubbedAt}
          scrub={scrub}
          onScrub={setScrub}
          onResetTime={() => setScrub(openingScrub(venue, new Date()))}
          planNow={planNowOffer}
          onPlanForNow={onPlanForNow}
          tide={tide}
          tideNow={tideNow}
          tideExtremes={tideExtremes}
          generation={generation}
          siteNote={siteNote}
          terrainNote={terrainNote}
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
          /* No foot: the tab row is gone, and the menu is in the top bar. */
          footer={null}
          onMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
          cardRequest={cardRequest}
          bag={kit}
          onSearch={() => setMode('setup')}
          onOpenNow={() => setNowOpen(true)}
          onBackToNow={onBackToNow}
        />
      ) : null}

      {mode === 'field' ? (
        <FieldMode
          plan={plan}
          venue={centre}
          tide={tide}
          pack={packIsCurrent ? pack : null}
          onPlan={() => setMode('plan')}
          footer={null}
          onMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
        />
      ) : null}

      {/*
        * A SHARED PLAN IS OFFERED, NOT APPLIED. Opening a link should never
        * silently replace what someone was working on.
        */}
      {sharedPlan === null ? null : (
        <div className="confirm confirm--shared" role="dialog" aria-label="Shared plan">
          <div className="confirm__text">
            <span className="confirm__q">Open the shared plan?</span>
            <span className="confirm__name">{sharedPlan.name}</span>
            <span className="confirm__hint">It replaces the plan on screen. Save yours first if you want it.</span>
          </div>
          <div className="confirm__actions">
            <button type="button" className="confirm__no" onClick={() => setSharedPlan(null)}>
              Not now
            </button>
            <button
              type="button"
              className="btn btn--primary confirm__yes"
              onClick={() => {
                loadSpot(sharedPlan)
                setSharedPlan(null)
              }}
            >
              Open
            </button>
          </div>
        </div>
      )}

      {viewfinderOpen && centre === null ? (
        <ViewfinderNeedsPlace
          onSetup={() => {
            setViewfinderOpen(false)
            setMode('setup')
          }}
          onClose={() => setViewfinderOpen(false)}
        />
      ) : null}
      {viewfinderOpen && centre !== null ? (
        <Viewfinder
          venue={centre}
          pins={plan.map((p) => ({ id: p.position.id, label: String(p.position.number), at: p.position.at }))}
          profile={kitProfile}
          bag={kit}
          timeZone={venueWindow?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          units={settings.units}
          onClose={() => setViewfinderOpen(false)}
        />
      ) : null}

      <SideMenu
        open={menuOpen}
        current={nowOpen ? 'now' : menuCurrent}
        onPick={onMenuPick}
        onClose={() => setMenuOpen(false)}
      />

    </div>
    </NumeralsProvider>
  )
}

export default App
