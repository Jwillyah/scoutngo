import { useCallback, useMemo, useRef, useState } from 'react'
import { BottomSheet, type SheetState } from './components/BottomSheet.tsx'
import { KitProfile } from './components/KitProfile.tsx'
import { MapControls } from './components/MapControls.tsx'
import { MapView, type MapHandle, type TapMode } from './components/MapView.tsx'
import { SCRUB_HEIGHT, TimeScrubber } from './components/TimeScrubber.tsx'
import { NAV_HEIGHT, NavBar, type Tab } from './components/NavBar.tsx'
import { PlanPanel } from './components/PlanPanel.tsx'
import { PositionCard } from './components/PositionCard.tsx'
import { SearchField } from './components/SearchField.tsx'
import { ShotList } from './components/ShotList.tsx'
import { SunReadout } from './components/SunReadout.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_KIT } from './core/kit.ts'
import { EMPTY_LANDCOVER, type Landcover } from './core/siting.ts'
import { getSunArc, getSunPosition } from './core/sun.ts'
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
  requestPlan,
  selectedLenses,
  type GenerationState,
} from './lib/planRequest.ts'
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

  /* Cones, bearings, lighting and siting, all from src/core/. */
  const plan = useMemo(
    () => (aim === null || sun === null ? [] : planPositions(positions, aim, sun.azimuth, land)),
    [positions, aim, sun, land],
  )

  const selected = plan.find((p) => p.position.id === selectedId) ?? null

  const onVenueChange = useCallback((at: LatLon) => {
    setVenue((current) => withCoordinates(current, at))
  }, [])

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

  const onGenerate = async () => {
    setSubmitAttempted(true)
    if (hasErrors(errors)) {
      setTab('plan')
      setVenueOpen(true)
      setSheet('full')
      return
    }

    const capture = mapHandle.current?.capture() ?? null
    if (capture === null) {
      setGeneration({ status: 'error', message: 'The map is not ready yet.' })
      setSheet('half')
      return
    }

    setGeneration({ status: 'working' })
    setSheet('peek')

    /*
     * Real land and water first, so the model is not guessing from pixels. If
     * Overpass is slow or down this falls straight back to the old behaviour:
     * no shapes in the prompt, and no siting warnings afterwards.
     */
    const site = await fetchSiteGeometry(capture.bounds)
    if (site.status === 'ok') {
      setLand(site.geometry.land)
      setSiteNote(null)
    } else {
      setLand(EMPTY_LANDCOVER)
      setSiteNote(`${site.reason} Positions were not checked against land and water.`)
    }

    const response = await requestPlan(
      buildGenerateBody(
        venue,
        kit,
        capture,
        site.status === 'ok' ? trimSummary(site.geometry.summary) : undefined,
      ),
    )
    if (response.status !== 'ok' || typeof response.raw !== 'string') {
      setGeneration({
        status: 'error',
        message: response.message ?? 'The generate function did not return a plan.',
      })
      return
    }

    const parsed = parsePlanResponse(response.raw, selectedLenses(kit))
    if (!parsed.ok) {
      setGeneration({ status: 'raw', reason: parsed.reason, raw: parsed.raw })
      return
    }

    // Normalized image coordinates become real ones through the map, using the
    // camera as it was when the image was taken.
    const coords = mapHandle.current?.unprojectFromCapture(capture, parsed.positions) ?? []
    const bodyId = kit.bodyIds[0] ?? DEFAULT_KIT.bodies[0].id

    setPositions(
      parsed.positions.map((raw, index) => ({
        id: `pos-${index + 1}`,
        number: index + 1,
        at: coords[index] ?? { lat: 0, lon: 0 },
        bodyId,
        lensId: raw.lensId,
        focalLength: raw.focalLength,
        shot: raw.shot,
        risk: raw.risk,
        moved: false,
      })),
    )
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
    setSelectedId(id)
    const target = plan.find((p) => p.position.id === id)
    if (target !== undefined) mapHandle.current?.flyTo(target.position.at)
  }

  const fitTargets = [...plan.map((p) => p.position.at), ...(aim === null ? [] : [aim])]

  const summary =
    venue.name.trim() === ''
      ? 'No venue set'
      : `${venue.name.split(',')[0]} · ${venue.startTime} to ${venue.endTime}`

  return (
    <div className="shell">
      <MapView
        handle={mapHandle}
        venue={centre}
        onVenueChange={onVenueChange}
        subject={aim}
        onSubjectChange={setSubject}
        mode={mode}
        plan={plan}
        onPositionMove={onPositionMove}
        sunAzimuth={sun === null ? null : sun.azimuth}
        sunOverlay={sunOverlay}
        selectedId={selectedId}
        onSelect={setSelectedId}
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
          <button
            type="button"
            className={`mode${mode === 'venue' ? ' mode--on' : ''}`}
            aria-pressed={mode === 'venue'}
            onClick={() => setMode(mode === 'venue' ? null : 'venue')}
          >
            Venue
          </button>
          <button
            type="button"
            className={`mode${mode === 'subject' ? ' mode--on' : ''}`}
            aria-pressed={mode === 'subject'}
            onClick={() => setMode(mode === 'subject' ? null : 'subject')}
          >
            Subject
          </button>
        </div>
      </header>

      <MapControls
        pitch={pitch}
        onPitch={(next) => mapHandle.current?.setPitch(next)}
        onZoom={(delta) => mapHandle.current?.zoomBy(delta)}
        onFitAll={() => mapHandle.current?.fitAll(fitTargets)}
        canFitAll={fitTargets.length > 0}
      />

      {selected === null ? null : (
        <PositionCard planned={selected} onClose={() => setSelectedId(null)} />
      )}

      {venueWindow === null || scrubbedAt === null || sun === null ? null : (
        <TimeScrubber
          start={venueWindow.start}
          end={venueWindow.end}
          value={scrub}
          onChange={setScrub}
          at={scrubbedAt}
          sun={sun}
        />
      )}

      <BottomSheet
        state={sheet}
        onStateChange={setSheet}
        onHeightChange={setSheetHeight}
        reservedBottom={NAV_HEIGHT + SCRUB_HEIGHT}
        peek={
          <div className="peek">
            <button
              type="button"
              className="peek__summary"
              onClick={() => setSheet(sheet === 'peek' ? 'half' : 'peek')}
            >
              <span className="peek__label">{tab === 'plan' ? 'Shoot setup' : tab}</span>
              <span className="peek__line">{summary}</span>
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
            onVenueChange={setVenue}
            venueOpen={venueOpen}
            onVenueToggle={() => setVenueOpen((open) => !open)}
            revealAllErrors={submitAttempted}
            generation={generation}
            siteNote={siteNote}
          />
        ) : null}

        {tab === 'shots' ? (
          <ShotList plan={plan} selectedId={selectedId} onPick={flyToPosition} />
        ) : null}

        {tab === 'sun' ? (
          <SunReadout venueWindow={venueWindow} open onToggle={() => {}} />
        ) : null}

        {tab === 'kit' ? (
          <KitProfile value={kit} onChange={setKit} open onToggle={() => {}} />
        ) : null}
      </BottomSheet>

      <NavBar tab={tab} onTab={onTab} shotCount={plan.length} />
    </div>
  )
}

export default App
