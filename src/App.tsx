import { useCallback, useMemo, useRef, useState } from 'react'
import { type ConeMode } from './components/ConeFilter.tsx'
import { type MapHandle, type TapMode } from './components/MapView.tsx'
import { ModeRail } from './components/ModeRail.tsx'
import { PlanMode } from './components/PlanMode.tsx'
import { SetupMode } from './components/SetupMode.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_KIT } from './core/kit.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
import { extremesAround, tideStateAt } from './core/tide.ts'
import { formatClock } from './core/timezone.ts'
import { briefDriftMeters, formatDrift, isBriefStale, type BriefAnchor } from './lib/brief.ts'
import {
  defaultSelection,
  KIT_STORAGE_KEY,
  reviveSelection,
  type KitSelection,
} from './lib/kitSelection.ts'
import { fetchSiteGeometry, trimSummary } from './lib/overpass.ts'
import { parsePlanResponse } from './lib/parsePlan.ts'
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
import { usePersistentState } from './lib/usePersistentState.ts'
import { useTide } from './lib/useTide.ts'
import {
  blockedReason,
  canEnter,
  FORWARD_LABEL,
  nextMode,
  type Mode,
  type ModeAvailability,
} from './lib/mode.ts'
import {
  CALIBRATION_VENUE,
  hasErrors,
  resolveWindow,
  validateVenue,
  venueLatLon,
  withCoordinates,
  type VenueDraft,
} from './lib/venue.ts'

function App() {
  const [venue, setVenue] = useState<VenueDraft>(CALIBRATION_VENUE)
  /*
   * The subject falls back to the venue coordinate until it is placed by hand.
   * Searching a new venue clears it, so it follows the new place rather than
   * pointing every cone back at the old town.
   */
  const [subject, setSubject] = useState<LatLon | null>(null)
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
  const [tapMode, setTapMode] = useState<TapMode>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [showSun, setShowSun] = useState(true)
  const [showArc, setShowArc] = useState(false)
  const [coneMode, setConeMode] = useState<ConeMode>('none')
  /* Multi select. Empty means no filter, which shows every lens. */
  const [lensFilters, setLensFilters] = useState<string[]>([])
  const [isolatedId, setIsolatedId] = useState<string | null>(null)

  /* Where the brief text was written. See lib/brief.ts. */
  const [briefAnchor, setBriefAnchor] = useState<BriefAnchor | null>({
    at: { lat: 38.364236, lon: -75.605912 },
  })

  const [spots, setSpots] = usePersistentState<Spot[]>(SPOTS_STORAGE_KEY, [], reviveSpots)

  const mapHandle = useRef<MapHandle>(null)

  const errors = useMemo(() => validateVenue(venue), [venue])
  const venueWindow = useMemo(() => resolveWindow(venue), [venue])
  const centre = useMemo(() => venueLatLon(venue), [venue])
  const aim = subject ?? centre

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
        : planPositions(positions, aim, sun.azimuth, land, kit.bodyIds),
    [positions, aim, sun, land, kit.bodyIds],
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
  const visiblePlan = useMemo(
    () =>
      lensFilters.length === 0
        ? plan
        : plan.filter((p) => lensFilters.includes(p.position.lensId)),
    [plan, lensFilters],
  )
  const conePlan = useMemo(() => {
    if (isolatedId !== null) return visiblePlan.filter((p) => p.position.id === isolatedId)
    return coneMode === 'all' ? visiblePlan : []
  }, [visiblePlan, isolatedId, coneMode])

  const onVenueChange = useCallback((at: LatLon) => {
    setVenue((current) => withCoordinates(current, at))
  }, [])

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
        return next
      })
    },
    [centre],
  )

  const onPositionMove = useCallback((id: string, at: LatLon) => {
    setPositions((current) =>
      current.map((p) => (p.id === id ? { ...p, at, moved: true } : p)),
    )
  }, [])

  const onPick = useCallback((at: LatLon, label: string) => {
    setVenue((current) => ({ ...withCoordinates(current, at), name: label }))
    setSubject(null)
    setPositions([])
    setGeneration({ status: 'idle' })
  }, [])

  /* Long press: venue first if it is unset, otherwise the subject. */
  const onLongPress = useCallback(
    (at: LatLon) => {
      if (centre === null) {
        setVenue((current) => withCoordinates(current, at))
      } else {
        setSubject(at)
      }
    },
    [centre],
  )

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
      subject,
      kit,
      positions,
    }
    setSpots(mergeSpots(spots, [spot]))
  }

  const loadSpot = (spot: Spot) => {
    setVenue(spot.venue)
    setSubject(spot.subject)
    setKit(spot.kit)
    setPositions(spot.positions)
    setBriefAnchor(null)
    setGeneration({ status: 'idle' })
    setMode('setup')
  }

  const onGenerate = async () => {
    setSubmitAttempted(true)
    /*
     * An incomplete venue or a stale brief is a SETUP problem, so send the user
     * back to the step that owns it rather than opening a panel over the map.
     */
    if (hasErrors(errors) || staleBrief) {
      setMode('setup')
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
      ),
    )
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
    )
    if (!parsed.ok) {
      setGeneration({ status: 'raw', reason: parsed.reason, raw: parsed.raw })
      return
    }

    // Normalized image coordinates become real ones through the map, using the
    // camera as it was when the image was taken.
    const coords = mapHandle.current?.unprojectFromCapture(capture, parsed.positions) ?? []

    setPositions(
      parsed.positions.map((raw, index) => ({
        id: `pos-${index + 1}`,
        number: index + 1,
        at: coords[index] ?? { lat: 0, lon: 0 },
        lensId: raw.lensId,
        focalLength: raw.focalLength,
        shot: raw.shot,
        risk: raw.risk,
        angleRationale: raw.angleRationale,
        platform: raw.platform,
        altitudeFeet: raw.altitudeFeet,
        moved: false,
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
  const venueShort = venue.name.split(',')[0]
  const summary =
    venue.name.trim() === ''
      ? 'No venue set'
      : `${venue.startTime}–${venue.endTime}${zoneSuffix} · ${venueShort}`

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
  const forwardBar =
    forward === null || forwardLabel === null ? null : (
      <div className="forward">
        {forwardBlocked === null ? null : (
          <p className="forward__why">{forwardBlocked}</p>
        )}
        <button
          type="button"
          className="btn btn--primary forward__btn"
          disabled={forwardBlocked !== null}
          onClick={() => goTo(forward)}
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
      {mode === 'setup' ? (
        <div className="mode-setup">
          <SetupMode
            venue={venue}
            errors={errors}
            onVenueChange={onVenueDraftChange}
            revealAllErrors={submitAttempted}
            staleBrief={staleBrief}
            drift={drift}
            onClearBrief={clearBrief}
            onKeepBrief={keepBrief}
            kit={kit}
            onKit={setKit}
            spots={spots}
            onSaveSpot={saveSpot}
            onLoadSpot={loadSpot}
            onDeleteSpot={(id) => setSpots(spots.filter((spot) => spot.id !== id))}
            onImportSpots={(incoming) => setSpots(mergeSpots(spots, incoming))}
            suggestedName={venue.name.split(',')[0] ?? ''}
            canSave={centre !== null}
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
          subject={aim}
          onSubjectChange={setSubject}
          onLongPress={onLongPress}
          tapMode={tapMode}
          onTapMode={setTapMode}
          plan={plan}
          visiblePlan={visiblePlan}
          conePlan={conePlan}
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
          onGenerate={onGenerate}
          onSearchPick={onPick}
          summary={summary}
          peekStatus={peekStatus}
          fitTargets={fitTargets}
          footer={
            <div className="mode__foot mode__foot--overlay">
              {forwardBar}
              {rail}
            </div>
          }
        />
      ) : null}

      {mode === 'field' ? (
        <div className="mode-field">
          {/*
            * FIELD is the next pass. The step exists and is reachable only once
            * there is a plan, but the arm's length card, the GPS walk-to and the
            * offline pack are deliberately not half built here: this pass is the
            * restructure, and it stays provably behaviour preserving.
            */}
          <div className="page">
            <p className="notice">
              Field mode is the next pass. It will show one position at a time, full
              screen, with the heading to point the camera and a walk-to distance
              from your GPS, cached so it works without signal.
            </p>
          </div>
          <div className="mode__foot">{rail}</div>
        </div>
      ) : null}
    </div>
  )
}

export default App
