import { useEffect, useRef, useState } from 'react'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import { exampleIndex, SHOOT_EXAMPLES, SHOT_LIST_EXAMPLES } from '../lib/examples.ts'
import type { DescribeState, DesiredShot } from '../lib/describe.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import type { SearchHit } from '../lib/search.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { KitChips } from './KitChips.tsx'
import { KitProfile } from './KitProfile.tsx'
import { MapView, type MapHandle } from './MapView.tsx'
import { ReachSlider } from './ReachSlider.tsx'
import { SearchField } from './SearchField.tsx'
import { SpotsPanel } from './SpotsPanel.tsx'
import { StaleBrief } from './StaleBrief.tsx'
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
}

/** What is open over the one screen. Only ever one at a time. */
type Drawer = 'none' | 'kit' | 'shots' | 'saved'

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
  const open = (next: Drawer) => setDrawer((current) => (current === next ? 'none' : next))

  const setField = (field: 'date' | 'startTime' | 'endTime') => (value: string) =>
    onVenueChange({ ...venue, [field]: value })

  return (
    <div className="setup">
      {/* The map is the top of the screen and the pin is the coordinate. */}
      <div className={`setup__map${pendingPin === null ? '' : ' setup__map--pending'}`}>
        <MapView
          handle={mapHandle}
          venue={pendingPin?.at ?? at}
          onVenueChange={pendingPin === null ? onPinChange : onPendingMove}
          /*
           * ONE PIN. The subject crosshair used to sit here on top of the venue
           * pin: two marks for one place, inviting the question of which one was
           * the venue. The subject is a PLAN concept now. It defaults to this
           * pin and is only moved when the action is offset from the venue.
           */
          subject={null}
          onSubjectChange={() => {}}
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

      <VenuePlate name={venue.name} at={at} />

      <div className="setup__body">
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

        <div className="setup__block">
          <label className="setup__label" htmlFor="describe-shoot">
            What's the shoot?
          </label>
          <textarea
            id="describe-shoot"
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

        <KitChips value={kit} onChange={onKit} onEdit={() => open('kit')} />

        {/* Date and window as two pills, not four stacked fields. */}
        <div className="pills">
          <label className="pill">
            <span className="pill__label">Date</span>
            <input
              className="pill__input num"
              type="date"
              value={venue.date}
              onChange={(event) => setField('date')(event.target.value)}
            />
          </label>
          <label className="pill">
            <span className="pill__label">Window</span>
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
        </div>
      </div>

      {/* One drawer at a time, over the screen, never pushing it taller. */}
      {drawer === 'none' ? null : (
        <div className="drawer">
          <div className="drawer__head">
            <span className="drawer__title">
              {drawer === 'kit' ? 'Kit and style' : drawer === 'shots' ? 'Shot list' : 'Saved setups'}
            </span>
            <button type="button" className="drawer__close" onClick={() => setDrawer('none')}>
              Done
            </button>
          </div>
          <div className="drawer__body">
            {drawer === 'kit' ? <KitProfile value={kit} onChange={onKit} /> : null}
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
        </div>
      )}
    </div>
  )
}
