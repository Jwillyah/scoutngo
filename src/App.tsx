import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet, type SheetState } from './components/BottomSheet.tsx'
import { KitProfile } from './components/KitProfile.tsx'
import { ConeFilter, type ConeMode } from './components/ConeFilter.tsx'
import { MapControls } from './components/MapControls.tsx'
import { OverflowMenu } from './components/OverflowMenu.tsx'
import { SpotsPanel } from './components/SpotsPanel.tsx'
import { MapView, type MapHandle, type TapMode } from './components/MapView.tsx'
import { TimeScrubber } from './components/TimeScrubber.tsx'
import { NavBar, type Tab } from './components/NavBar.tsx'
import { PlanPanel } from './components/PlanPanel.tsx'
import { PositionCard } from './components/PositionCard.tsx'
import { SearchField } from './components/SearchField.tsx'
import { ShotList } from './components/ShotList.tsx'
import { SunReadout } from './components/SunReadout.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_KIT } from './core/kit.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
import { briefDriftMeters, formatDrift, isBriefStale, type BriefAnchor } from './lib/brief.ts'
import {
  defaultSelection,
  KIT_STORAGE_KEY,
  reviveSelection,
  type KitSelection,
} from './lib/kitSelection.ts'
import { fetchSiteGeometry, trimSummary } from './lib/overpass.ts'
import { parsePlanResponse } from './lib/parsePlan.ts'
import { planPositions, type CameraPosition } from './lib/plan.ts'
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

  const [tab, setTab] = useState<Tab>('plan')
  const [sheet, setSheet] = useState<SheetState>('peek')
  const [sheetHeight, setSheetHeight] = useState(108)
  const [mode, setMode] = useState<TapMode>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [pitch, setPitch] = useState(0)
  const [venueOpen, setVenueOpen] = useState(false)
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

  /*
   * The cone filter, the scrubber and the nav bar stack at the bottom. Their
   * combined height is MEASURED rather than assembled from per-bar tokens:
   * the scrubber's real height is set by its own content, and a token that said
   * 62px while it rendered at 93px silently put it on top of the chips.
   */
  const dock = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(0)
  useEffect(() => {
    const node = dock.current
    if (node === null) return
    const observer = new ResizeObserver(() => setDockHeight(node.offsetHeight))
    observer.observe(node)
    setDockHeight(node.offsetHeight)
    return () => observer.disconnect()
  }, [])

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
    setTab('plan')
    setSheet('peek')
  }

  const onGenerate = async () => {
    setSubmitAttempted(true)
    if (hasErrors(errors)) {
      setTab('plan')
      setVenueOpen(true)
      setSheet('full')
      return
    }
    // Refuse to plan the wrong event.
    if (staleBrief) {
      setTab('plan')
      setSheet('half')
      return
    }

    /*
     * From here the stage is set immediately before the work it names, so what the
     * sheet says is what the app is actually waiting on. See GENERATE_STAGES.
     */
    setGeneration({ status: 'working', stage: 'capture' })
    setSheet('peek')

    const capture = mapHandle.current?.capture() ?? null
    if (capture === null) {
      setGeneration({ status: 'error', message: 'The map is not ready yet.' })
      setSheet('half')
      return
    }

    /*
     * Real land and water first, so the model is not guessing from pixels. If
     * Overpass is slow or down this falls straight back to the old behaviour:
     * no shapes in the prompt, and no siting warnings afterwards.
     */
    setGeneration({ status: 'working', stage: 'terrain' })
    const site = await fetchSiteGeometry(capture.bounds)
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
    /*
     * Stay on the map with the sheet at peek and frame everything. Jumping to
     * the shot list at half height used to bury a third of the new positions
     * under the sheet, where they could not be seen or dragged.
     */
    setSheet('peek')
    const placed = coords.filter((c) => c !== undefined)
    window.setTimeout(() => mapHandle.current?.fitAll([...placed, ...(aim ? [aim] : [])]), 60)
  }

  const onTab = (next: Tab) => {
    setTab(next)
    // Sun is a full screen readout over a dimmed map; the rest keep the map live.
    setSheet(next === 'sun' ? 'full' : sheet === 'peek' ? 'half' : sheet)
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

  return (
    <div
      className="shell"
      /* Drives the bottom offset of maplibre's own controls, so they ride up
         with the sheet instead of being covered by it. */
      style={
        {
          ['--sheet-live-height' as string]: `${sheetHeight}px`,
          ['--dock-height' as string]: `${dockHeight}px`,
        } as React.CSSProperties
      }
    >
      <MapView
        handle={mapHandle}
        venue={centre}
        onVenueChange={onVenueChange}
        subject={aim}
        onSubjectChange={setSubject}
        mode={mode}
        plan={visiblePlan}
        conePlan={conePlan}
        onPositionMove={onPositionMove}
        onLongPress={onLongPress}
        sunAzimuth={sun === null ? null : sun.azimuth}
        sunOverlay={sunOverlay}
        showSun={showSun}
        showArc={showArc}
        selectedId={selectedId}
        onSelect={onSelectPosition}
        onPitchChange={setPitch}
        bottomInset={sheetHeight}
      />

      {tab === 'sun' ? <div className="scrim" /> : null}

      <header className="hud">
        <SearchField onPick={onPick} />
        <div className="hud__row">
          {sun === null ? null : (
            <p className="hud__sun">
              <span className="hud__sun-label">Sun</span>
              <span className="num">{sun.azimuth.toFixed(1)}°</span>
              <span className="num">{sun.altitude.toFixed(1)}° alt</span>
            </p>
          )}
          <OverflowMenu
            mode={mode}
            onMode={setMode}
            showArc={showArc}
            onShowArc={setShowArc}
          />
        </div>
      </header>

      <MapControls
        showSun={showSun}
        onShowSun={setShowSun}
        pitch={pitch}
        onPitch={(next) => mapHandle.current?.setPitch(next)}
        onZoom={(delta) => mapHandle.current?.zoomBy(delta)}
        onFitAll={() => mapHandle.current?.fitAll(fitTargets)}
        canFitAll={fitTargets.length > 0}
      />

      {selected === null ? null : (
        <PositionCard planned={selected} onClose={() => setSelectedId(null)} />
      )}

      <BottomSheet
        state={sheet}
        onStateChange={setSheet}
        onHeightChange={setSheetHeight}
        reservedBottom={dockHeight}
        peek={
          <div className="peek">
            {/*
              * Generate collapses the sheet to peek, so this row is the only thing
              * on screen for the whole wait. While working it carries the step
              * rather than a stale venue summary next to a dead button.
              */}
            <button
              type="button"
              className="peek__summary"
              onClick={() => setSheet(sheet === 'peek' ? 'half' : 'peek')}
            >
              {generation.status === 'working' ? (
                <>
                  <span className="peek__label">
                    Generating · step {stageIndex(generation.stage) + 1} of{' '}
                    {GENERATE_STAGES.length}
                  </span>
                  <span className="peek__line">{stageLabel(generation.stage)}</span>
                </>
              ) : (
                <>
                  <span className="peek__label">{tab === 'plan' ? 'Shoot setup' : tab}</span>
                  <span className="peek__line">{summary}</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={onGenerate}
              disabled={generation.status === 'working'}
            >
              {generation.status === 'working' ? 'Working' : 'Generate'}
            </button>
          </div>
        }
      >
        {tab === 'plan' ? (
          <PlanPanel
            venue={venue}
            errors={errors}
            onVenueChange={onVenueDraftChange}
            venueOpen={venueOpen}
            onVenueToggle={() => setVenueOpen((open) => !open)}
            revealAllErrors={submitAttempted}
            generation={generation}
            siteNote={siteNote}
            staleBrief={staleBrief}
            drift={drift}
            onClearBrief={clearBrief}
            onKeepBrief={keepBrief}
          />
        ) : null}

        {tab === 'shots' ? (
          <ShotList plan={visiblePlan} selectedId={selectedId} onPick={flyToPosition} />
        ) : null}

        {tab === 'sun' ? (
          <SunReadout venueWindow={venueWindow} open onToggle={() => {}} />
        ) : null}

        {tab === 'kit' ? (
          <KitProfile value={kit} onChange={setKit} open onToggle={() => {}} />
        ) : null}

        {tab === 'spots' ? (
          <SpotsPanel
            spots={spots}
            onSave={saveSpot}
            onLoad={loadSpot}
            onDelete={(id) => setSpots(spots.filter((spot) => spot.id !== id))}
            onImport={(incoming) => setSpots(mergeSpots(spots, incoming))}
            suggestedName={venue.name.split(',')[0] ?? ''}
            canSave={centre !== null}
          />
        ) : null}
      </BottomSheet>

      <div className="dock" ref={dock}>
        <ConeFilter
          plan={plan}
          coneMode={coneMode}
          onConeMode={setConeMode}
          lensFilters={lensFilters}
          onLensFilters={setLensFilters}
          isolatedId={isolatedId}
          onClearIsolate={() => setIsolatedId(null)}
        />

        {venueWindow === null || scrubbedAt === null || sun === null ? null : (
          <TimeScrubber
            start={venueWindow.start}
            end={venueWindow.end}
            value={scrub}
            onChange={setScrub}
            at={scrubbedAt}
            sun={sun}
            timeZone={venueWindow.timeZone}
            timeZoneAbbr={venueWindow.timeZoneShort}
          />
        )}

        <NavBar tab={tab} onTab={onTab} shotCount={plan.length} />
      </div>
    </div>
  )
}

export default App
