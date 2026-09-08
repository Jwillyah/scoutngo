import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet, type SheetState } from './components/BottomSheet.tsx'
import { KitProfile } from './components/KitProfile.tsx'
import { MapView, type TapMode } from './components/MapView.tsx'
import { PositionCard } from './components/PositionCard.tsx'
import { SatelliteImage } from './components/SatelliteImage.tsx'
import { SunReadout } from './components/SunReadout.tsx'
import { VenueForm } from './components/VenueForm.tsx'
import type { LatLon } from './core/geo.ts'
import { DEFAULT_KIT } from './core/kit.ts'
import { getSunPosition } from './core/sun.ts'
import {
  defaultSelection,
  KIT_STORAGE_KEY,
  reviveSelection,
  type KitSelection,
} from './lib/kitSelection.ts'
import { planPositions } from './lib/plan.ts'
import { STUB_POSITIONS, STUB_SUBJECT } from './lib/positions.ts'
import type { Screenshot } from './lib/screenshot.ts'
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

type PanelKey = 'venue' | 'kit' | 'sun' | 'image'

function App() {
  /*
   * Opens on the calibration venue so the map lands on Brew River with the stub
   * positions in view. Swap to EMPTY_VENUE for a cold start.
   */
  const [venue, setVenue] = useState<VenueDraft>(CALIBRATION_VENUE)
  const [subject, setSubject] = useState<LatLon | null>(STUB_SUBJECT)
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null)

  const [kit, setKit] = usePersistentState<KitSelection>(
    KIT_STORAGE_KEY,
    defaultSelection(DEFAULT_KIT),
    (raw) => reviveSelection(raw, DEFAULT_KIT),
  )

  const [sheet, setSheet] = useState<SheetState>('peek')
  const [sheetHeight, setSheetHeight] = useState(108)
  const [mode, setMode] = useState<TapMode>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const errors = useMemo(() => validateVenue(venue), [venue])
  const venueWindow = useMemo(() => resolveWindow(venue), [venue])
  const centre = useMemo(() => venueLatLon(venue), [venue])

  /* Sun at mid window. Computed, never asserted. */
  const sun = useMemo(
    () => (venueWindow === null || centre === null
      ? null
      : getSunPosition(venueWindow.middle, centre.lat, centre.lon)),
    [venueWindow, centre],
  )

  /* STUB positions, real geometry. Cones and lighting all come from src/core/. */
  const plan = useMemo(
    () => (subject === null || sun === null ? [] : planPositions(STUB_POSITIONS, subject, sun.azimuth)),
    [subject, sun],
  )

  const selected = plan.find((p) => p.position.id === selectedId) ?? null

  const onVenueChange = useCallback((at: LatLon) => {
    setVenue((current) => withCoordinates(current, at))
  }, [])

  const venueFilled =
    !hasErrors(errors) &&
    venue.eventDescription.trim() !== '' &&
    venue.desiredOutcome.trim() !== ''
  const kitFilled =
    kit.bodyIds.length > 0 && kit.lensIds.length > 0 && kit.styleNotes.trim() !== ''

  const [open, setOpen] = useState<Record<PanelKey, boolean>>({
    venue: !venueFilled,
    kit: !kitFilled,
    sun: true,
    image: false,
  })

  const toggle = (key: PanelKey) => () => {
    setOpen((current) => ({ ...current, [key]: !current[key] }))
  }

  const wasFilled = useRef({ venue: venueFilled, kit: kitFilled })
  useEffect(() => {
    setOpen((current) => {
      let next = current
      if (venueFilled && !wasFilled.current.venue) next = { ...next, venue: false }
      if (kitFilled && !wasFilled.current.kit) next = { ...next, kit: false }
      wasFilled.current = { venue: venueFilled, kit: kitFilled }
      return next
    })
  }, [venueFilled, kitFilled])

  const onGenerate = () => {
    setSubmitAttempted(true)
    if (hasErrors(errors)) setSheet('full')
  }

  const summary =
    venue.name.trim() === ''
      ? 'No venue set'
      : `${venue.name.split(',')[0]} · ${venue.startTime} to ${venue.endTime}`

  return (
    <div className="shell">
      <MapView
        venue={centre}
        onVenueChange={onVenueChange}
        subject={subject}
        onSubjectChange={setSubject}
        mode={mode}
        plan={plan}
        sunAzimuth={sun === null ? null : sun.azimuth}
        selectedId={selectedId}
        onSelect={setSelectedId}
        bottomInset={sheetHeight}
      />

      <header className="hud">
        <h1 className="hud__mark">ScoutNGo</h1>
        {sun === null ? null : (
          <p className="hud__sun">
            <span className="hud__sun-label">Sun</span>
            <span className="num">{sun.azimuth.toFixed(1)}°</span>
            <span className="num">{sun.altitude.toFixed(1)}° alt</span>
          </p>
        )}
      </header>

      <div className="modes" role="group" aria-label="Map tap mode">
        <button
          type="button"
          className={`mode${mode === 'venue' ? ' mode--on' : ''}`}
          aria-pressed={mode === 'venue'}
          onClick={() => setMode(mode === 'venue' ? null : 'venue')}
        >
          Set venue
        </button>
        <button
          type="button"
          className={`mode${mode === 'subject' ? ' mode--on' : ''}`}
          aria-pressed={mode === 'subject'}
          onClick={() => setMode(mode === 'subject' ? null : 'subject')}
        >
          Set subject
        </button>
      </div>

      {selected === null ? null : (
        <PositionCard planned={selected} onClose={() => setSelectedId(null)} />
      )}

      <BottomSheet
        state={sheet}
        onStateChange={setSheet}
        onHeightChange={setSheetHeight}
        peek={
          <div className="peek">
            <button
              type="button"
              className="peek__summary"
              onClick={() => setSheet(sheet === 'peek' ? 'half' : 'peek')}
            >
              <span className="peek__label">Shoot setup</span>
              <span className="peek__line">{summary}</span>
            </button>
            <button type="button" className="btn btn--primary" onClick={onGenerate}>
              Generate
            </button>
          </div>
        }
      >
        {submitAttempted && !hasErrors(errors) ? (
          <p className="notice">
            Setup is complete. Plan generation is not wired up yet, so nothing has
            been sent anywhere.
          </p>
        ) : null}

        <VenueForm
          value={venue}
          errors={errors}
          onChange={setVenue}
          open={open.venue}
          onToggle={toggle('venue')}
          revealAllErrors={submitAttempted}
        />
        <KitProfile
          value={kit}
          onChange={setKit}
          open={open.kit}
          onToggle={toggle('kit')}
        />
        <SunReadout venueWindow={venueWindow} open={open.sun} onToggle={toggle('sun')} />
        <SatelliteImage
          value={screenshot}
          onChange={setScreenshot}
          open={open.image}
          onToggle={toggle('image')}
        />
      </BottomSheet>
    </div>
  )
}

export default App
