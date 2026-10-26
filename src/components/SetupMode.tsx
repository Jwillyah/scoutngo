import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import type { BuildCheck } from '../lib/build.ts'
import { BuildStamp } from './BuildStamp.tsx'
import { exampleIndex, SHOOT_EXAMPLES, SHOT_LIST_EXAMPLES } from '../lib/examples.ts'
import type { DesiredShot } from '../lib/shotList.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import { pickableKit, type KitSelection } from '../lib/kitSelection.ts'
import type { PlatformFilter } from '../core/platformFilter.ts'
import type { ShootKind } from '../core/shootWindow.ts'
import { ringNode, type SetupTarget } from '../lib/mode.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { KitChips } from './KitChips.tsx'
import { NUMERALS_LABEL, NUMERALS_NOTE } from '../core/numerals.ts'
import { KitProfile } from './KitProfile.tsx'
import { MapView, type MapHandle } from './MapView.tsx'
import { ReachSlider } from './ReachSlider.tsx'
import { SearchField } from './SearchField.tsx'
import { ColdStart } from './ColdStart.tsx'
import { SpotsPanel } from './SpotsPanel.tsx'
import { ShootChips } from './ShootChips.tsx'
import type { ResolvedName } from '../core/venueName.ts'
import type { Units } from '../lib/units.ts'
import { VenuePlate } from './VenuePlate.tsx'
import { TopBar } from './TopBar.tsx'
import { BottomSheet, type SheetDetent } from './BottomSheet.tsx'
import { useOnline } from '../lib/useOnline.ts'
import { locateOnce, LOCATE_MESSAGE } from '../lib/locateOnce.ts'

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
  /** The shooter's own gear, editable under Kit and style. */
  kitProfile: KitProfileType
  onKitProfile: (next: KitProfileType) => void
  /** Shelved gear ids. See SHELVED_STORAGE_KEY in src/lib/kitSelection.ts. */
  shelved: readonly string[]
  onShelve: (id: string, on: boolean) => void
  /** A change made to the kit on this load, said once. */
  kitNote: string | null
  spots: Spot[]
  onSaveSpot: (name: string) => void
  onLoadSpot: (spot: Spot) => void
  onDeleteSpot: (id: string) => void
  onImportSpots: (incoming: Spot[]) => void
  /** The plan on screen as a spot, for Save plan and Share. */
  currentPlan: () => Spot | null
  suggestedName: string
  canSave: boolean
  shotListText: string
  onShotListText: (next: string) => void
  desiredShots: DesiredShot[]
  /** A geocoded proposal awaiting confirmation. Never applied on its own. */
  pendingPin: { at: LatLon; label: string } | null
  onPendingMove: (at: LatLon) => void
  onConfirmPin: () => void
  onCancelPin: () => void
  /** Where the map is looking, used to rank nearby search results first. */
  searchBias: LatLon | null
  /** First run only: the one sentence under the pin. Retired by a drag. */
  showPinHint: boolean
  onPinDrag: () => void
  /** Which kind of shoot the chips are on, or null before one is tapped. */
  shootKind: ShootKind | null
  onShootKind: (next: ShootKind) => void
  /** The platform chips share the map's own filter: one choice, not two. */
  platformFilter: PlatformFilter
  onPlatformFilter: (next: PlatformFilter) => void
  /** What the last chip did to the window, or why it could not. */
  shootLine: string | null
  /** False with no drone in the kit. */
  airAvailable: boolean
  /** Whether any visible position could use a subject size. */
  subjectMatters: boolean
  /**
   * Tapped "Use my location", and the browser answered. Moves the map only:
   * the coordinate is not stored and does not become the pin.
   */
  onUseMyLocation: (at: LatLon) => void
  /** True while the date, or the window, is still the one the app chose. */
  defaults: { date: boolean; window: boolean; name: boolean }
  /** The handful of preferences that are genuinely preferences. */
  settings: {
    showNumbers: boolean
    showLabels: boolean
    showTerrain: boolean
    showBuildings: boolean
    units: Units
  }
  onSettings: (next: {
    showNumbers: boolean
    showLabels: boolean
    showTerrain: boolean
    showBuildings: boolean
    units: Units
  }) => void
  /**
   * A request to show the shooter what is blocking them. The tick changes on
   * every press of a blocked forward button, so pressing it twice points twice.
   */
  pointAt: { field: SetupTarget | null; tick: number }
  /** Whether a newer build is deployed, for the stamp under Settings. */
  newBuild: BuildCheck
  /*
   * THE SHELL'S PIECES, owned by App: the menu, the forward button that moves
   * to the plan, and a request from the menu to open a drawer.
   */
  onMenu: () => void
  menuOpen: boolean
  forward: React.ReactNode
  drawerRequest: { drawer: 'kit' | 'saved'; tick: number }
  /** Sky › Exposure: try the bag's body and lens on a photo. */
  onOpenExposure: () => void
  /** The top bar's +: there are no positions in setup, so it moves to the plan. */
  onAddPosition: () => void
  /** Brings back the landing page, which is otherwise shown once. */
  onShowLanding: () => void
  /** What the app knows about the venue's name. Derived in App, never typed. */
  venueNameState: ResolvedName
}

/** What is open over the one screen. Only ever one at a time. */
type Drawer = 'none' | 'kit' | 'shots' | 'saved' | 'settings'

/**
 * SETUP: one screen, map first.
 *
 * WHAT THIS REPLACED. Ten stacked form fields, including a latitude and a
 * longitude typed by hand, that scrolled for two and a half screens before
 * reaching the button. Nobody sets a venue by typing decimal degrees; they point
 * at it. So the map is the top of the screen, the pin is the coordinate, and the
 * ring around it is the other fact that was never captured anywhere: how far the
 * shooter can actually get.
 *
 * NOTHING SCROLLS. Everything that is part of setting up this shoot is on the
 * one screen at 390x844. The three things that are reference rather than setup,
 * the full kit detail, a pasted shot list, and saved setups, open over it and
 * close again.
 */
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
  shotListText,
  onShotListText,
  desiredShots,
  onVenueChange,
  pendingPin,
  onPendingMove,
  onConfirmPin,
  onCancelPin,
  searchBias,
  showPinHint,
  onPinDrag,
  defaults,
  pointAt,
  settings,
  onSettings,
  onUseMyLocation,
  shootKind,
  onShootKind,
  platformFilter,
  onPlatformFilter,
  shootLine,
  airAvailable,
  subjectMatters,
  newBuild,
  onShowLanding,
  venueNameState,
  onMenu,
  menuOpen,
  forward,
  drawerRequest,
  onOpenExposure,
  onAddPosition,
}: SetupModeProps) {
  /*
   * One example per load, so the placeholder shows the kind of work the reader
   * does rather than the author's own shoot. Fixed for the life of the screen:
   * a hint that changes while you read it is a distraction.
   */
  const [example] = useState(() => exampleIndex(SHOOT_EXAMPLES.length))
  const [drawer, setDrawer] = useState<Drawer>('none')
  /* The menu's Kit and Saved spots land here, on the drawer they name. */
  useEffect(() => {
    if (drawerRequest.tick === 0) return
    const timer = setTimeout(() => setDrawer(drawerRequest.drawer), 0)
    return () => clearTimeout(timer)
  }, [drawerRequest])
  /* The form is a sheet over the full-screen map, half up by default. */
  const [sheet, setSheet] = useState<SheetDetent>('half')
  const online = useOnline()
  const [locating, setLocating] = useState(false)
  const [locateNote, setLocateNote] = useState<string | null>(null)
  const locate = () => {
    setLocating(true)
    setLocateNote(null)
    void locateOnce().then((result) => {
      setLocating(false)
      if (result.status === 'ok') onUseMyLocation(result.at)
      else setLocateNote(result.status === 'error' ? result.message : LOCATE_MESSAGE[result.status])
    })
  }

  /*
   * Keep the whole reach ring in view, whenever the pin OR the radius changes.
   *
   * Without this the default 400m ring sits entirely outside a z16.5 view: the
   * circle exists and none of it is on screen, so the number under the map
   * describes something invisible.
   *
   * IT NOW FOLLOWS THE RADIUS TOO, which it deliberately did not before. The old
   * reason was that re-zooming while a handle was being dragged fought the
   * gesture under the thumb. The handle is gone; the thumb is on a slider below
   * the map now, so the map is free to move and dragging the slider resizes the
   * ring and reframes it live.
   */
  const handle = mapHandle as React.RefObject<MapHandle | null>
  const [mapReady, setMapReady] = useState(false)
  const framed = useRef<string | null>(null)

  useEffect(() => {
    if (!mapReady || at === null) return
    const key = `${at.lat.toFixed(5)},${at.lon.toFixed(5)}@${reachMeters}`
    if (framed.current === key) return
    const movedPin = framed.current?.split('@')[0] !== key.split('@')[0]
    framed.current = key
    const edges = [0, 90, 180, 270].map((bearing) =>
      destinationPoint(at, bearing, reachMeters),
    )
    /*
     * A pin move is a journey and eases; a slider drag has to keep up with a
     * thumb, so it snaps.
     *
     * The padding is SETUP's own. The default is sized for PLAN's full height
     * map and reserves 150px at the top and 56 at the bottom, which on a 270px
     * map leaves 64px to draw the ring in and makes every reach look the same
     * size. Here the only thing overlapping the map is the search field.
     */
    handle.current?.fitAll(edges, movedPin ? 900 : 0, {
      top: 72,
      left: 28,
      right: 28,
      bottom: 24,
    })
  }, [at, reachMeters, handle, mapReady])
  /*
   * POINT AT THE PROBLEM.
   *
   * A blocked forward button used to print "Set a venue, a date and a window
   * first" and stop there, which is useless when the field it means is off the
   * bottom of a short screen. Pressing it now scrolls the missing field into
   * view and lights it up for a moment.
   */
  const venueRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLLabelElement>(null)
  const windowRef = useRef<HTMLLabelElement>(null)

  /*
   * The highlight is written straight onto the node rather than held in state.
   * It is a transient visual cue with a timer on it, nothing else renders from
   * it, and putting it in state would re-render the whole screen twice to flash
   * one border.
   */
  useEffect(() => {
    if (pointAt.field === null || pointAt.tick === 0) return
    const node = { venue: venueRef, date: dateRef, window: windowRef }[
      pointAt.field
    ].current
    if (node === null) return
    return ringNode(node)
  }, [pointAt])

  const subjectRef = useRef<HTMLLabelElement>(null)

  const open = (next: Drawer) => setDrawer((current) => (current === next ? 'none' : next))

  const setField =
    (field: 'date' | 'startTime' | 'endTime' | 'subjectAcrossMeters') => (value: string) =>
      onVenueChange({ ...venue, [field]: value })

  /*
   * THE DRAWER IS PORTALLED TO document.body, and that is the whole point.
   *
   * It used to be rendered inside .setup, which is itself a scroll container.
   * Two live scrollers stacked, with the drawer a DOM descendant of the outer
   * one: whatever the browser decides about which scroller owns a drag, the
   * arrangement is wrong, and three separate fixes have now worked around it
   * rather than removing it. A portal removes it. Out here the drawer's only
   * ancestor is document.body, so there is no outer scroller to compete with,
   * no ancestor stacking context to escape, and nothing of the screen behind
   * showing underneath it.
   */
  /*
   * LOCK THE SCREEN BEHIND WHILE A DRAWER IS OPEN.
   *
   * The layer underneath was still live: its scroller still took gestures, and
   * the forward button and the mode rail were still sitting there to be tapped
   * through a modal. One class on the root turns the page behind into exactly
   * what it looks like, which is background.
   */
  useEffect(() => {
    if (drawer === 'none') return
    const root = document.documentElement
    root.classList.add('is-drawer-open')
    return () => root.classList.remove('is-drawer-open')
  }, [drawer])

  const drawerPanel =
    drawer === 'none'
      ? null
      : createPortal(
                <div className="drawer">
                <div className="drawer__head">
                  <span className="drawer__title">
                    {drawer === 'kit'
                      ? 'Kit and style'
                      : drawer === 'shots'
                        ? 'Shot list'
                        : drawer === 'settings'
                          ? 'Settings'
                          : 'Saved setups'}
                  </span>
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
                  ) : null}
                  {drawer === 'shots' ? (
                    <div className="drawer__pad">
                      <p className="setup__note">
                        One shot per line. The plan has to cover these, and anything no
                        position covers is marked in the shot list.
                      </p>
                      <textarea
                        className="setup__text"
                        rows={8}
                        value={shotListText}
                        placeholder={SHOT_LIST_EXAMPLES[example]}
                        onChange={(event) => onShotListText(event.target.value)}
                      />
                    </div>
                  ) : null}
                  {drawer === 'settings' ? (
                    <div className="drawer__pad">
                      {/*
                        * THE ONE DISCLOSURE, and the only one.
                        *
                        * It replaced "Show coordinates", which did this for a
                        * single line of a single component. Two switches for
                        * "how much detail do I want" is the two-modes problem
                        * in miniature, so there is one, it is remembered, and
                        * it flips the whole app.
                        */}
                      <label className="toggle">
                        <input
                          type="checkbox"
                          className="toggle__box"
                          checked={settings.showNumbers}
                          onChange={(event) => onSettings({ ...settings, showNumbers: event.target.checked })}
                        />
                        <span className="toggle__text">
                          <span className="toggle__label">{NUMERALS_LABEL}</span>
                          <span className="toggle__note">{NUMERALS_NOTE}</span>
                        </span>
                      </label>

                      {/*
                        * WHICH BUILD IS THIS.
                        *
                        * A whole pass went on disagreeing about screenshots,
                        * because there was no way to tell from a phone whether
                        * the screen in front of you was the code that had just
                        * been pushed. The app's one service worker fetches the
                        * document network-first; what holds a stale build is iOS Safari, and a
                        * home-screen app more stubbornly still, keeping
                        * index.html and therefore the asset URLs it names.
                        *
                        * Monospace, because it is an identifier to read out
                        * loud or type into a message, not prose.
                        */}
                      {/*
                        * THE WAY BACK TO THE LANDING PAGE. It is shown once,
                        * so the only way to read it again is here, with the
                        * other things that are about the app rather than
                        * about the shoot.
                        */}
                      {/*
                        * STRAIGHT TO /how, NOT TO THE COVER.
                        *
                        * The cover is a name and a picture; somebody opening
                        * Settings to check what leaves their device wants the
                        * page with the answer on it, not the one with the
                        * button on it. /how has a way back to the cover.
                        */}
                      <button type="button" className="settings__row" onClick={onShowLanding}>
                        How it computes
                        <span className="settings__hint">
                          The three stages, what is arithmetic, what leaves
                          the device, and what this is not.
                        </span>
                      </button>

                      <BuildStamp deployed={newBuild} />
                    </div>
                  ) : null}

                  {drawer === 'saved' ? (
                    <SpotsPanel
                      spots={spots}
                      onSave={onSaveSpot}
                      onLoad={onLoadSpot}
                      onDelete={onDeleteSpot}
                      onImport={onImportSpots}
                      suggestedName={suggestedName}
                      canSave={canSave}
                      currentPlan={currentPlan}
                    />
                  ) : null}
                </div>
              </div>,
          document.body,
        )

  return (
    <>
    <div className="setup" inert={drawer !== 'none'}>
      {/* The map is the top of the screen and the pin is the coordinate. */}
      <div
        ref={venueRef}
        className={`setup__map${pendingPin === null ? '' : ' setup__map--pending'}`}
      >
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
        {/*
          * IS THIS THE SPOT? A geocoder returning one result is not the same as
          * one right answer, so nothing is accepted until this is answered. The
          * pin stays draggable while it is up, and the hint says so, because
          * dragging is the real safety net.
          */}
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

      {/*
        * THE TOP BAR, OVER THE MAP: the menu, the search pill, + and locate.
        * The search used to sit in a box over a map that was itself a box.
        */}
      <TopBar
        onMenu={onMenu}
        menuOpen={menuOpen}
        pill={<SearchField onPick={onSearchPick} label="Where's the shoot?" bias={searchBias} />}
        onAdd={onAddPosition}
        adding={false}
        onLocate={locate}
        locating={locating}
        locateNote={locateNote}
        online={online}
      />

      <BottomSheet
        detent={sheet}
        onDetentChange={setSheet}
        peek={forward}
        half={
          <div className="setup__sheet">
      <ReachSlider meters={reachMeters} onChange={onReachChange} />

      <VenuePlate
        state={venueNameState}
        latitude={venue.latitude}
        longitude={venue.longitude}
        at={at}
      />

      <div className="setup__body">
        {/*
          * REQUIRED THINGS FIRST. The pin, the date and the window are the only
          * inputs on this screen that block the forward button, so they sit directly
          * under the venue and above everything optional. They used to be last,
          * under the description and the kit, which is how they ended up off
          * the bottom of a short screen with the button blocked on them.
          */}
        <div className="pills">
          <label className="pill" ref={dateRef}>
            <span className="pill__label">Date</span>
            {defaults.date ? <span className="pill__default">default</span> : null}
            <input
              className="pill__input num"
              type="date"
              value={venue.date}
              onChange={(event) => setField('date')(event.target.value)}
            />
          </label>
          <label className="pill" ref={windowRef}>
            <span className="pill__label">Window</span>
            {defaults.window ? <span className="pill__default">default</span> : null}
            <span className="pill__pair">
              <input
                className="pill__input num"
                type="time"
                value={venue.startTime}
                onChange={(event) => setField('startTime')(event.target.value)}
              />
              <input
                className="pill__input num"
                type="time"
                value={venue.endTime}
                onChange={(event) => setField('endTime')(event.target.value)}
              />
            </span>
          </label>
          {/*
            * HOW BIG THE SUBJECT IS, ASKED ONLY WHERE IT CHANGES SOMETHING.
            *
            * It was always on screen, and on a drone shoot it changed nothing
            * at all: the wide-frame judgement it feeds is suppressed for air,
            * top-down and 360. A field with no consequence is worse than a
            * missing one, because it reads as something that matters, so it
            * gets filled in, and then nothing happens.
            *
            * See subjectSizeMatters in src/core/fov.ts: the same rule that
            * decides whether to judge a position decides whether to ask.
            */}
          {!subjectMatters ? null : (
            <label className="pill pill--wide" ref={subjectRef}>
              <span className="pill__label">Subject across</span>
              <span className="pill__pair">
                <input
                  className="pill__input num"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="—"
                  aria-label="How wide the subject is, in metres. Leave blank if unknown."
                  value={venue.subjectAcrossMeters}
                  onChange={(event) => setField('subjectAcrossMeters')(event.target.value)}
                />
                <span className="pill__unit">m</span>
              </span>
              {/*
                * WHAT IT DOES, IN THE FIELD. It said "m", which is a unit and
                * not a reason. Nobody types a number into a box that has not
                * said what the number is for.
                */}
              <span className="pill__why">
                Lets a ground framed shot say how many times wider than the
                subject it frames. Blank claims nothing.
              </span>
            </label>
          )}
        </div>

        {/*
          * NO PIN YET, SO OFFER THE PLACES ALREADY KNOWN. The map opens on the
          * Atlantic because the app does not know where you are and will not
          * find out; a list of spots is the answer that needs no guess.
          */}
        {at !== null ? null : <ColdStart spots={spots} onLoad={onLoadSpot} />}

        {/*
          * CHIPS FIRST, BOX SECOND.
          *
          * The box used to be the primary way to say what the shoot was, and
          * its answer went to a model to extract a date, a window and a
          * platform: an API call, a key, a wait and a chance of being misread,
          * for three things that are two taps. The chips do those three with
          * no network at all, which is what the common case deserves and what
          * an app expecting bring-your-own-key should not charge for.
          */}
        <div className="setup__block">
          <p className="setup__label">What kind of shoot?</p>
          <ShootChips
            kind={shootKind}
            onKind={onShootKind}
            platform={platformFilter}
            onPlatform={onPlatformFilter}
            windowLine={shootLine}
            airAvailable={airAvailable}
          />
        </div>

        {/*
          * NO BRIEF BOX. "Paste a client brief" sent prose to a model to pull
          * out a date, a window and a place; the chips do the first two with no
          * network and the search does the third, and Suggest no longer reads a
          * brief at all (src/core/suggest.ts). What stays is the row of links.
          */}
        <div className="setup__block">
          <div className="setup__row">
            <button type="button" className="setup__link" onClick={() => open('shots')}>
              {desiredShots.length === 0
                ? 'Paste a shot list'
                : `${desiredShots.length} shots listed`}
            </button>
            <button type="button" className="setup__link" onClick={() => open('saved')}>
              Saved
            </button>
            <button type="button" className="setup__link" onClick={() => open('settings')}>
              Settings
            </button>
          </div>
        </div>

        {/* Kit LAST: it ships with defaults, so it can never block anything. */}
        <KitChips value={kit}
            platform={platformFilter} onChange={onKit} kit={pickableKit(kitProfile, shelved)} onEdit={() => open('kit')} />

      </div>
          </div>
        }
        full={null}
      />
    </div>
      {drawerPanel}
    </>
  )
}
