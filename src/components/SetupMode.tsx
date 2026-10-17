import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import type { BuildCheck } from '../lib/build.ts'
import { BuildStamp } from './BuildStamp.tsx'
import { exampleIndex, SHOOT_EXAMPLES, SHOT_LIST_EXAMPLES } from '../lib/examples.ts'
import type { DescribeState, DesiredShot } from '../lib/describe.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import type { PlatformFilter } from '../core/platformFilter.ts'
import type { ShootKind } from '../core/shootWindow.ts'
import type { SearchHit } from '../lib/search.ts'
import { ringNode, type SetupTarget } from '../lib/mode.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { KitChips } from './KitChips.tsx'
import { KitProfile } from './KitProfile.tsx'
import { MapView, type MapHandle } from './MapView.tsx'
import { ReachSlider } from './ReachSlider.tsx'
import { SearchField } from './SearchField.tsx'
import { ColdStart } from './ColdStart.tsx'
import { SpotsPanel } from './SpotsPanel.tsx'
import { ShootChips } from './ShootChips.tsx'
import { StaleBrief } from './StaleBrief.tsx'
import { UseMyLocation } from './UseMyLocation.tsx'
import { VenuePlate } from './VenuePlate.tsx'

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
  staleBrief: boolean
  drift: string
  onClearBrief: () => void
  onKeepBrief: () => void
  kit: KitSelection
  onKit: (next: KitSelection) => void
  /** The shooter's own gear, editable under Kit and style. */
  kitProfile: KitProfileType
  onKitProfile: (next: KitProfileType) => void
  spots: Spot[]
  onSaveSpot: (name: string) => void
  onLoadSpot: (spot: Spot) => void
  onDeleteSpot: (id: string) => void
  onImportSpots: (incoming: Spot[]) => void
  suggestedName: string
  canSave: boolean
  describeText: string
  onDescribeText: (next: string) => void
  describeState: DescribeState
  onDescribe: () => void
  venueChoices: SearchHit[]
  onPickVenue: (hit: SearchHit) => void
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
  settings: { showCoords: boolean }
  onSettings: (next: { showCoords: boolean }) => void
  /**
   * A request to show the shooter what is blocking them. The tick changes on
   * every press of a blocked forward button, so pressing it twice points twice.
   */
  pointAt: { field: SetupTarget | 'brief' | null; tick: number }
  /** Whether a newer build is deployed, for the stamp under Settings. */
  newBuild: BuildCheck
  /** Brings back the landing page, which is otherwise shown once. */
  onShowLanding: () => void
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
  staleBrief,
  drift,
  onClearBrief,
  onKeepBrief,
  kit,
  onKit,
  kitProfile,
  onKitProfile,
  spots,
  onSaveSpot,
  onLoadSpot,
  onDeleteSpot,
  onImportSpots,
  suggestedName,
  canSave,
  describeText,
  onDescribeText,
  describeState,
  onDescribe,
  venueChoices,
  onPickVenue,
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
}: SetupModeProps) {
  /*
   * One example per load, so the placeholder shows the kind of work the reader
   * does rather than the author's own shoot. Fixed for the life of the screen:
   * a hint that changes while you read it is a distraction.
   */
  const [example] = useState(() => exampleIndex(SHOOT_EXAMPLES.length))
  const [drawer, setDrawer] = useState<Drawer>('none')

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
  const briefRef = useRef<HTMLTextAreaElement>(null)

  /*
   * The highlight is written straight onto the node rather than held in state.
   * It is a transient visual cue with a timer on it, nothing else renders from
   * it, and putting it in state would re-render the whole screen twice to flash
   * one border.
   */
  useEffect(() => {
    if (pointAt.field === null || pointAt.tick === 0) return
    const node = { venue: venueRef, date: dateRef, window: windowRef, brief: briefRef }[
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
                  {drawer === 'kit' ? <KitProfile value={kit} onChange={onKit} kit={kitProfile} onKitChange={onKitProfile} /> : null}
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
                      <label className="toggle">
                        <input
                          type="checkbox"
                          className="toggle__box"
                          checked={settings.showCoords}
                          onChange={(event) => onSettings({ showCoords: event.target.checked })}
                        />
                        <span className="toggle__text">
                          <span className="toggle__label">Show coordinates</span>
                          <span className="toggle__note">
                            Prints the venue's latitude and longitude under its name. Off by
                            default: the pin is the coordinate, and decimal degrees are of no
                            use to most people standing on a dock.
                          </span>
                        </span>
                      </label>

                      {/*
                        * WHICH BUILD IS THIS.
                        *
                        * A whole pass went on disagreeing about screenshots,
                        * because there was no way to tell from a phone whether
                        * the screen in front of you was the code that had just
                        * been pushed. There is no service worker in this app;
                        * what holds a stale build is iOS Safari, and a
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
                      <button type="button" className="settings__row" onClick={onShowLanding}>
                        What this is
                        <span className="settings__hint">
                          The page you saw first. Three stages, the rule, and
                          where your data lives.
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
        <div className="setup__search">
          <SearchField onPick={onSearchPick} label="Where's the shoot?" bias={searchBias} />
          {/*
            * ONLY WHILE THERE IS NOWHERE YET. Once a place is picked this is
            * clutter: the map is already where it needs to be, and a button
            * that would move it somewhere else is a way to lose work.
            */}
          {at === null && pendingPin === null ? (
            <UseMyLocation onLocated={onUseMyLocation} />
          ) : null}
        </div>

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

      <ReachSlider meters={reachMeters} onChange={onReachChange} />

      <VenuePlate
        name={venue.name}
        onName={(name) => onVenueChange({ ...venue, name })}
        nameFilled={defaults.name}
        at={at}
        showCoords={settings.showCoords}
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

        <StaleBrief
          staleBrief={staleBrief}
          drift={drift}
          onClearBrief={onClearBrief}
          onKeepBrief={onKeepBrief}
        />

        {venueChoices.length === 0 ? null : (
          <div className="setup__choices">
            <p className="setup__label">{venueChoices.length} places match. Which one?</p>
            {venueChoices.map((hit) => (
              <button
                key={hit.id}
                type="button"
                className="setup__choice"
                onClick={() => onPickVenue(hit)}
              >
                {hit.label}
              </button>
            ))}
          </div>
        )}

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
          * AND THE BOX, FOR WHAT IT IS ACTUALLY GOOD AT: a real client brief
          * or a pasted shot list. That is prose nobody wants to retype and
          * the one case where a model call earns itself.
          */}
        <div className="setup__block">
          <label className="setup__label" htmlFor="describe-shoot">
            Paste a client brief
          </label>
          <p className="setup__hint">
            Optional, and the only part of setup that needs a key. The chips above cover the
            usual case without one.
          </p>
          <textarea
            id="describe-shoot"
            ref={briefRef}
            className="setup__text"
            rows={2}
            value={describeText}
            placeholder={SHOOT_EXAMPLES[example]}
            onChange={(event) => onDescribeText(event.target.value)}
          />
          <div className="setup__row">
            <button
              type="button"
              className="setup__read"
              onClick={onDescribe}
              disabled={describeState.status === 'working' || describeText.trim() === ''}
            >
              {describeState.status === 'working' ? 'Reading…' : 'Read it'}
            </button>
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
          {describeState.status === 'done' ? (
            <p className="setup__note">
              Read {describeState.filled} fields.
              {describeState.needsVenue ? ' No map match — drop the pin yourself.' : ''}
            </p>
          ) : null}
          {describeState.status === 'error' ? (
            <p className="setup__note setup__note--bad">{describeState.message}</p>
          ) : null}
          {describeState.status === 'raw' ? (
            <p className="setup__note setup__note--bad">{describeState.reason}</p>
          ) : null}
        </div>

        {/* Kit LAST: it ships with defaults, so it can never block anything. */}
        <KitChips value={kit}
            platform={platformFilter} onChange={onKit} kit={kitProfile} onEdit={() => open('kit')} />

      </div>

    </div>
      {drawerPanel}
    </>
  )
}
