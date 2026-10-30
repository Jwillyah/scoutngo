import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import { pickableKit, type KitSelection } from '../lib/kitSelection.ts'
import type { PlatformFilter } from '../core/platformFilter.ts'
import { SHOOT_KIND_LABEL, type ShootKind } from '../core/shootWindow.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { KitChips } from './KitChips.tsx'
import { KitProfile } from './KitProfile.tsx'
import { MapView, type MapHandle } from './MapView.tsx'
import { ReachSlider } from './ReachSlider.tsx'
import { SearchField } from './SearchField.tsx'
import { SpotsPanel } from './SpotsPanel.tsx'
import type { ResolvedName } from '../core/venueName.ts'
import type { Units } from '../lib/units.ts'
import { VenuePlate } from './VenuePlate.tsx'
import { TopBar } from './TopBar.tsx'
import { useOnline } from '../lib/useOnline.ts'
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import type { SetupTarget } from '../lib/mode.ts'

/*
 * SETUP IN THREE QUICK STEPS (27 Oct, from the phone: "one long sheet over
 * half the screen that you scroll"). The map is the whole screen; over it,
 * one small card at a time, never more than a third of the screen and never
 * scrolling (scripts/audit-overflow.mjs walks all three at 390 x 844):
 *
 *   1  Where   find the venue or tap the map; the place's name and Next.
 *              "Same as last time" goes straight to the plan
 *   2  When    Sunrise, Sunset, Daytime or Pick a time, and the date
 *   3  How     Ground, Drone or Both; the kit, as last time; how far you
 *              can walk, in your own units. Done goes to the plan
 *
 * Every answer is the one kept from last time, so a step a returning
 * shooter does not need is one tap. The shot list lives on the Call sheet
 * now; Saved and Settings are in the menu.
 */
interface SetupModeProps {
  venue: VenueDraft
  errors: VenueErrors
  onVenueChange: (next: VenueDraft) => void
  at: LatLon | null
  onPinChange: (at: LatLon) => void
  onSearchPick: (at: LatLon, label: string) => void
  reachMeters: number
  onReachChange: (meters: number) => void
  mapHandle: React.Ref<MapHandle>
  kit: KitSelection
  onKit: (next: KitSelection) => void
  kitProfile: KitProfileType
  onKitProfile: (next: KitProfileType) => void
  shelved: readonly string[]
  onShelve: (id: string, on: boolean) => void
  kitNote: string | null
  spots: Spot[]
  onSaveSpot: (name: string) => void
  onLoadSpot: (spot: Spot) => void
  onDeleteSpot: (id: string) => void
  onImportSpots: (incoming: Spot[]) => void
  currentPlan: () => Spot | null
  suggestedName: string
  canSave: boolean
  /** A geocoded proposal awaiting confirmation. Never applied on its own. */
  pendingPin: { at: LatLon; label: string } | null
  onPendingMove: (at: LatLon) => void
  onConfirmPin: () => void
  onCancelPin: () => void
  searchBias: LatLon | null
  showPinHint: boolean
  onPinDrag: () => void
  shootKind: ShootKind | null
  onShootKind: (next: ShootKind) => void
  platformFilter: PlatformFilter
  onPlatformFilter: (next: PlatformFilter) => void
  /** What the last chip did to the window, or why it could not. */
  shootLine: string | null
  airAvailable: boolean
  /** Tapped "Use my location": moves the map only; the coordinate is not stored. */
  onUseMyLocation: (at: LatLon) => void
  units: Units
  /** On to the plan, and why not yet (the venue, the date, the window), or null. */
  onDone: () => void
  doneBlocked: string | null
  /** A blocked plan sent the shooter here: open on the step that fixes it. */
  pointAt: { field: SetupTarget | null; tick: number }
  /** A venue was kept from last time when the app opened: "Same as last time" is offered. */
  returning: boolean
  onMenu: () => void
  menuOpen: boolean
  drawerRequest: { drawer: 'kit' | 'saved'; tick: number }
  onOpenExposure: () => void
  onAddPosition: () => void
  venueNameState: ResolvedName
}

type Drawer = 'none' | 'kit' | 'saved'
type Step = 1 | 2 | 3

/* The step's words on the shoot day: "Tue 28 Oct", and "today" when it is. */
function dayWords(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return 'Pick a date'
  const at = new Date(Date.UTC(y, m - 1, d, 12))
  const words = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return date === today ? `Today, ${words}` : words
}

const PLATFORM_WORDS: [PlatformFilter, string][] = [
  ['ground', 'Ground'],
  ['air', 'Drone'],
  ['both', 'Both'],
]

export function SetupMode({
  venue,
  at,
  onPinChange,
  onSearchPick,
  reachMeters,
  onReachChange,
  mapHandle,
  kit,
  onKit,
  kitProfile,
  onKitProfile,
  shelved,
  onShelve,
  kitNote,
  spots,
  onSaveSpot,
  onLoadSpot,
  onDeleteSpot,
  onImportSpots,
  currentPlan,
  suggestedName,
  canSave,
  onVenueChange,
  pendingPin,
  onPendingMove,
  onConfirmPin,
  onCancelPin,
  searchBias,
  showPinHint,
  onPinDrag,
  shootKind,
  onShootKind,
  platformFilter,
  onPlatformFilter,
  shootLine,
  airAvailable,
  onUseMyLocation,
  units,
  onDone,
  doneBlocked,
  returning,
  pointAt,
  venueNameState,
  onMenu,
  menuOpen,
  drawerRequest,
  onOpenExposure,
  onAddPosition,
}: SetupModeProps) {
  const [step, setStep] = useState<Step>(1)
  useEffect(() => {
    if (pointAt.tick === 0 || pointAt.field === null) return
    const timer = setTimeout(() => setStep(pointAt.field === 'venue' ? 1 : 2), 0)
    return () => clearTimeout(timer)
  }, [pointAt])
  const [picking, setPicking] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>('none')
  useEffect(() => {
    if (drawerRequest.tick === 0) return
    const timer = setTimeout(() => setDrawer(drawerRequest.drawer), 0)
    return () => clearTimeout(timer)
  }, [drawerRequest])
  const online = useOnline()
  const [locating, setLocating] = useState(false)
  const [locateNote, setLocateNote] = useState<string | null>(null)
  const locate = () => {
    setLocating(true)
    setLocateNote(null)
    void locateOnce().then((result) => {
      setLocating(false)
      if (result.status === 'ok') onUseMyLocation(result.at)
      else setLocateNote(locateWords(result))
    })
  }
  /*
   * THE PHONE'S OWN REGION, IF IT HAS SAID SO BEFORE. With no venue yet and
   * the location already allowed (the browser's own permission, asked
   * before), the map goes to where the phone is, once. Never asked for here,
   * and never an IP lookup (tests/noIpGeolocation.test.ts); otherwise the map
   * opens on the region of the phone's time zone (src/core/regionView.ts).
   */
  useEffect(() => {
    if (at !== null) return
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
    void perms
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (s.state === 'granted') locate()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handle = mapHandle as React.RefObject<MapHandle | null>
  const [mapReady, setMapReady] = useState(false)
  const framed = useRef<string | null>(null)
  /* Keep the whole reach ring in view whenever the pin or the radius changes, above the card. */
  useEffect(() => {
    if (!mapReady || at === null) return
    const key = `${at.lat.toFixed(5)},${at.lon.toFixed(5)}@${reachMeters}`
    if (framed.current === key) return
    const movedPin = framed.current?.split('@')[0] !== key.split('@')[0]
    framed.current = key
    const edges = [0, 90, 180, 270].map((bearing) => destinationPoint(at, bearing, reachMeters))
    handle.current?.fitAll(edges, movedPin ? 900 : 0, { top: 72, left: 28, right: 28, bottom: 300 })
  }, [at, reachMeters, handle, mapReady])

  const setField = (field: 'date' | 'startTime' | 'endTime') => (value: string) => onVenueChange({ ...venue, [field]: value })

  useEffect(() => {
    if (drawer === 'none') return
    const root = document.documentElement
    root.classList.add('is-drawer-open')
    return () => root.classList.remove('is-drawer-open')
  }, [drawer])

  /* Portalled to the body: no scroller behind it to compete for a drag. */
  const drawerPanel =
    drawer === 'none'
      ? null
      : createPortal(
          <div className="drawer">
            <div className="drawer__head">
              <span className="drawer__title">{drawer === 'kit' ? 'Kit and style' : 'Saved setups'}</span>
              <button type="button" className="drawer__close" onClick={() => setDrawer('none')}>
                Done
              </button>
            </div>
            <div className="drawer__body">
              {drawer === 'kit' ? (
                <>
                  <div className="drawer__pad">
                    <button type="button" className="btn btn--small" onClick={onOpenExposure}>
                      Try your settings on a photo
                    </button>
                  </div>
                  <KitProfile value={kit} onChange={onKit} kit={kitProfile} onKitChange={onKitProfile} shelved={shelved} onShelve={onShelve} note={kitNote} />
                </>
              ) : (
                <SpotsPanel spots={spots} onSave={onSaveSpot} onLoad={onLoadSpot} onDelete={onDeleteSpot} onImport={onImportSpots} suggestedName={suggestedName} canSave={canSave} currentPlan={currentPlan} />
              )}
            </div>
          </div>,
          document.body,
        )

  const next = (s: Step) => () => setStep(s)
  const dots = (
    <span className="wiz__dots" role="img" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`wiz__dot${n === step ? ' wiz__dot--on' : ''}`} />
      ))}
    </span>
  )

  return (
    <>
      <div className="setup" inert={drawer !== 'none'}>
        <div className={`setup__map${pendingPin === null ? '' : ' setup__map--pending'}`}>
          <MapView
            handle={mapHandle}
            venue={pendingPin?.at ?? at}
            onVenueChange={pendingPin === null ? onPinChange : onPendingMove}
            mode={null}
            plan={[]}
            conePlan={[]}
            isolatedId={null}
            onPositionMove={() => {}}
            onLongPress={pendingPin === null ? onPinChange : onPendingMove}
            sunAzimuth={null}
            sunOverlay={null}
            showSun={false}
            showArc={false}
            selectedId={null}
            onSelect={() => {}}
            onPitchChange={() => {}}
            bottomInset={0}
            radiusMeters={reachMeters}
            pinHint={showPinHint && pendingPin === null ? 'Drag the pin to the exact spot.' : null}
            onPinDrag={onPinDrag}
            onReady={() => setMapReady(true)}
          />
          {/* A searched place is a proposal until confirmed: name, Confirm or No. */}
          {pendingPin === null ? null : (
            <div className="confirm">
              <div className="confirm__text">
                <span className="confirm__q">Is this the spot?</span>
                <span className="confirm__name">{pendingPin.label.split(',')[0]}</span>
                <span className="confirm__hint">Drag the pin to fix it</span>
              </div>
              <div className="confirm__actions">
                <button type="button" className="confirm__no" onClick={onCancelPin}>
                  No
                </button>
                <button type="button" className="btn btn--primary confirm__yes" onClick={onConfirmPin}>
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>

        <TopBar
          onMenu={onMenu}
          menuOpen={menuOpen}
          pill={<SearchField onPick={onSearchPick} label="Where's the shoot?" bias={searchBias} />}
          onAdd={onAddPosition}
          adding={false}
          onLocate={locate}
          locating={locating}
          /* Said once, in step 1 under its button, while the card shows; the bar's note only when it does not (ux-rules 2). */
          locateNote={pendingPin === null && step === 1 ? null : locateNote}
          online={online}
        />

        {pendingPin !== null ? null : (
          <section className="wiz" aria-label={`Setup, step ${step} of 3`} data-step={step}>
            {/*
              * THE BODY SCROLLS, THE ROW BELOW IT NEVER MOVES. In a Safari
              * tab (664 px of page under the toolbars) step 3's kit and reach
              * were taller than the card's 35% and its overflow cut Back and
              * Done off (field test, 30 Oct).
              */}
            <div className="wiz__body">
            {step === 1 ? (
              <>
                <p className="wiz__title">Where</p>
                {at === null ? (
                  <p className="wiz__line">Find the venue, or tap the map.</p>
                ) : (
                  <VenuePlate state={venueNameState} latitude={venue.latitude} longitude={venue.longitude} at={at} />
                )}
                <div className="wiz__row">
                  <button type="button" className="wiz__ghost" onClick={locate} disabled={locating}>
                    {locating ? 'Finding you…' : locateNote !== null ? 'Retry' : 'Use my location'}
                  </button>
                  {returning && at !== null ? (
                    <button type="button" className="wiz__ghost" onClick={onDone}>
                      Same as last time
                    </button>
                  ) : null}
                </div>
                {locateNote === null ? null : <p className="wiz__small">{locateNote}</p>}
              </>
            ) : step === 2 ? (
              <>
                <p className="wiz__title">When</p>
                <div className="wiz__kinds" role="group" aria-label="What kind of shoot">
                  {(['sunrise', 'sunset', 'daytime'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`wiz__big${!picking && shootKind === k ? ' wiz__big--on' : ''}`}
                      aria-pressed={!picking && shootKind === k}
                      onClick={() => {
                        setPicking(false)
                        onShootKind(k)
                      }}
                    >
                      {SHOOT_KIND_LABEL[k]}
                    </button>
                  ))}
                  <button type="button" className={`wiz__big${picking ? ' wiz__big--on' : ''}`} aria-pressed={picking} onClick={() => setPicking(true)}>
                    Pick a time
                  </button>
                </div>
                {picking ? (
                  <div className="wiz__times">
                    <input className="wiz__time num" type="time" aria-label="Start" value={venue.startTime} onChange={(e) => setField('startTime')(e.target.value)} />
                    <span aria-hidden="true">to</span>
                    <input className="wiz__time num" type="time" aria-label="End" value={venue.endTime} onChange={(e) => setField('endTime')(e.target.value)} />
                  </div>
                ) : shootLine === null ? null : (
                  <p className="wiz__small num">{shootLine}</p>
                )}
                <label className="wiz__date">
                  <span className="wiz__dateword">{dayWords(venue.date)}</span>
                  <span className="wiz__change">Change</span>
                  {/* The real control, over the words: one tap opens the phone's date picker. */}
                  <input className="wiz__datein" type="date" aria-label="Shoot date" value={venue.date} onChange={(e) => setField('date')(e.target.value)} />
                </label>
              </>
            ) : (
              <>
                <p className="wiz__title">How</p>
                <div className="wiz__seg" role="group" aria-label="Ground, drone or both">
                  {PLATFORM_WORDS.map(([p, words]) => {
                    const dead = p === 'air' && !airAvailable
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`wiz__segbtn${platformFilter === p ? ' wiz__segbtn--on' : ''}`}
                        aria-pressed={platformFilter === p}
                        aria-disabled={dead}
                        onClick={() => (dead ? setDrawer('kit') : onPlatformFilter(p))}
                      >
                        {words}
                      </button>
                    )
                  })}
                </div>
                <KitChips value={kit} platform={platformFilter} onChange={onKit} kit={pickableKit(kitProfile, shelved)} onEdit={() => setDrawer('kit')} oneRow />
                <ReachSlider meters={reachMeters} onChange={onReachChange} unit={units.distance} />
              </>
            )}
            {step === 3 && doneBlocked !== null ? <p className="wiz__small wiz__why">{doneBlocked}</p> : null}
            </div>
            <div className="wiz__nav">
              {step === 1 ? <span /> : (
                <button type="button" className="wiz__back" onClick={next((step - 1) as Step)}>
                  Back
                </button>
              )}
              {dots}
              {step === 3 ? (
                <button type="button" className="btn btn--primary wiz__next" aria-disabled={doneBlocked !== null} onClick={() => (doneBlocked === null ? onDone() : setStep(doneBlocked.includes('venue') ? 1 : 2))}>
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary wiz__next"
                  aria-disabled={step === 1 && at === null}
                  onClick={() => {
                    if (step === 1 && at === null) return
                    setStep((step + 1) as Step)
                  }}
                >
                  Next
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      {drawerPanel}
    </>
  )
}
