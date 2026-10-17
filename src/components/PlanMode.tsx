import { useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type {
  Platform,
  PlatformFilter as PlatformFilterValue,
} from '../core/platformFilter.ts'
import type { ShotType } from '../core/shotType.ts'
import { goesBandFor, zoomAdvice } from '../core/goes.ts'
import { boundaryNote } from '../core/skyTime.ts'
import { formatClock } from '../core/timezone.ts'
import type { SkyState } from '../lib/useSkyFrames.ts'
import type { Wind } from '../core/upwind.ts'
import type { LevelWind } from '../core/windProfile.ts'
import type { SightlineCloud } from '../core/cloud.ts'
import type { TideExtreme, TideState } from '../core/tide.ts'
import type { SunArc, SunPosition } from '../core/sun.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import type { GenerationState } from '../lib/planRequest.ts'
import type { DesiredShot } from '../lib/describe.ts'
import type { FieldPack } from '../lib/fieldPack.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import type { OpticSelection } from '../core/optics.ts'
import { placingHint } from '../core/platformFilter.ts'
import type { SetupTarget } from '../lib/mode.ts'
import { GROUND_WIND_METERS, type WindHeight } from '../core/windHeight.ts'
import type { SkyLayerKind } from '../core/skyLayer.ts'
import type { MarkKind, SiteMark } from '../core/siteMark.ts'
import { HazardPanel } from './HazardPanel.tsx'
import { BottomSheet, type SheetState } from './BottomSheet.tsx'
import { ConditionsPanel } from './ConditionsPanel.tsx'
import { ConePicker, type ConeMode } from './ConePicker.tsx'
import { FieldPackControl, type PackBuildState } from './FieldPackControl.tsx'
import { MapControls } from './MapControls.tsx'
import { MapView, type MapHandle } from './MapView.tsx'
import { OverflowMenu } from './OverflowMenu.tsx'
import { PlatformFilter } from './PlatformFilter.tsx'
import { SkyLegend } from './SkyLegend.tsx'
import { PlanStatus } from './PlanStatus.tsx'
import { PositionCard } from './PositionCard.tsx'
import { ShotList } from './ShotList.tsx'
import { TimeScrubber } from './TimeScrubber.tsx'

/** What the one sheet is currently showing. Chosen by an explicit control. */
type SheetView = 'plan' | 'conditions'

interface PlanModeProps {
  mapHandle: React.Ref<MapHandle>
  venue: LatLon | null
  onVenueChange: (at: LatLon) => void
  onLongPress: (at: LatLon) => void
  plan: PlannedPosition[]
  visiblePlan: PlannedPosition[]
  conePlan: PlannedPosition[]
  planCoverage: PlanCoverage | null
  onPositionMove: (id: string, at: LatLon) => void
  sun: SunPosition | null
  sunOverlay: { azimuth: number; shadowBearing: number; arc: SunArc } | null
  showSun: boolean
  onShowSun: (next: boolean) => void
  showArc: boolean
  onShowArc: (next: boolean) => void
  /** The GOES-19 cloud layer over the imagery. */
  showSky: boolean
  onShowSky: (next: boolean) => void
  /** Wind at the venue. Null until it answers, or when it fails. */
  wind: Wind | null
  windLevels: LevelWind[]
  gustMps: number | null
  windAt: Date | null
  windPast: boolean
  /**
   * The height to read the wind at, in feet, or null with nothing in the air.
   *
   * Taken from the air positions in the plan: the highest of them, because
   * that is the one the wind limits first.
   */
  /** Which height the wind is read at, and whether that height is assumed. */
  windHeight: WindHeight
  ratedWindMps: number | null
  ratedWindSource: string
  /** Cloud for the selected position, when it has been asked for. */
  selectedCloud: SightlineCloud | null
  /** Which sky source answers for the scrubbed moment, and its frames. */
  sky: SkyState
  selectedId: string | null
  onSelect: (id: string | null) => void
  selected: PlannedPosition | null
  onFlyTo: (id: string) => void
  coneMode: ConeMode
  onConeMode: (next: ConeMode) => void
  lensFilters: string[]
  onLensFilters: (next: string[]) => void
  isolatedId: string | null
  onClearIsolate: () => void
  venueWindow: VenueWindow | null
  scrubbedAt: Date | null
  scrub: number
  onScrub: (next: number) => void
  tide: TideInfo
  tideNow: TideState | null
  tideExtremes: TideExtreme[]
  generation: GenerationState
  siteNote: string | null
  /** What loading a saved plan had to change to make sense of it. */
  positionNote: string | null
  onGenerate: () => void
  /** Takes the shooter to whatever a blocked generate named. */
  onFixBlock: (field: SetupTarget | 'brief' | null) => void
  /** The shooter's own gear. The lens picker and cone labels read it. */
  kitProfile: KitProfileType
  /** Which of the kit is packed, so the optic picker offers only that. */
  kitSelection: OpticSelection
  /** The marked hazards and notes at this place. */
  marks: readonly SiteMark[]
  /** Marking mode, which stays on until it is turned off. See HazardPanel. */
  marking: boolean
  onMarking: (next: boolean) => void
  markKind: MarkKind
  onMarkKind: (next: MarkKind) => void
  markDrawing: 'point' | 'line'
  onMarkDrawing: (next: 'point' | 'line') => void
  markDraft: readonly LatLon[]
  onMarkAt: (at: LatLon) => void
  onFinishLine: () => void
  onCancelLine: () => void
  selectedMark: SiteMark | null
  onSelectMark: (id: string | null) => void
  onChangeMark: (
    id: string,
    change: Partial<Pick<SiteMark, 'kind' | 'heightMeters' | 'foliage' | 'note'>>,
  ) => void
  onDeleteMark: (id: string) => void
  /** The shoot date, yyyy-mm-dd, for the leaf answer on a deciduous mark. */
  shootDate: string
  /** Which brief a generate would send: the typed one, or the chips. */
  briefSource: string
  /** Which measure the sky layer paints. */
  skyLayer: SkyLayerKind
  onSkyLayer: (next: SkyLayerKind) => void
  /** Arms the map so the next tap drops a position. The primary action here. */
  placing: boolean
  onPlacing: (next: boolean) => void
  onAddAt: (at: LatLon) => void
  onDeletePosition: (id: string) => void
  onDuplicatePosition: (id: string) => void
  onMovePosition: (id: string, delta: number) => void
  onSetOptic: (id: string, lensId: string, focalLength: number) => void
  /** How high an air position flies, in feet above ground. Clamped in core. */
  onSetAltitude: (id: string, feet: number) => void
  /** Framed, top-down or 360. Decides what geometry the position has at all. */
  onSetShotType: (id: string, shotType: ShotType) => void
  /** Which way a top-down's rectangle is turned. Never a camera bearing. */
  onSetYaw: (id: string, degrees: number) => void
  /** The forward step, offered as a SECONDARY action beside Generate. */
  onGoToField: () => void
  goToFieldBlocked: string | null
  summary: string
  peekStatus: { label: string; line: string }
  fitTargets: LatLon[]
  pack: FieldPack | null
  packIsCurrent: boolean
  packState: PackBuildState
  onPreparePack: () => void
  desiredShots: DesiredShot[]
  footer: React.ReactNode
  /** Ground, air or both. Decides what shows here AND what a generate asks for. */
  platformFilter: PlatformFilterValue
  onPlatformFilter: (next: PlatformFilterValue) => void
  platformCounts: Record<Platform, number>
  /** How many positions the platform choice is hiding. */
  hiddenByPlatform: number
  /** False with no drone in the kit, which makes Air a dead end rather than a choice. */
  airAvailable: boolean
  /**
   * Where the pilot is standing, and the arming for placing it.
   *
   * It is one position for the whole plan: the pilot stands somewhere and the
   * aircraft moves between hover points. Null until placed.
   */
  pilotAt: LatLon | null
  onPilotMove: (at: LatLon) => void
  placingPilot: boolean
  onPlacingPilot: (next: boolean) => void
  /**
   * Whether the next tap will add an AIR position.
   *
   * True when the filter is on Air and a drone is in the kit. The button says
   * so, because adding a ground position while the filter hides ground would
   * drop something on the map and hide it in the same gesture.
   */
  addsAir: boolean
}

/**
 * PLAN: the map is the whole screen.
 *
 * ONE reveal mechanism. The sheet is the only thing that opens, it has two
 * stops, and its payload is chosen by an explicit control rather than by a tab.
 * Conditions detail comes up in the same sheet instead of being a place you
 * navigate to, because sun and tide belong to the map and the scrubber.
 *
 * ONE THING PER REGION, which is what this screen did not have.
 *
 *   TOP    one row of reveals: Conditions, Cones, and the overflow.
 *   RIGHT  three map controls a gesture cannot replace.
 *   BOTTOM the sheet, carrying the one loud action and its two quiet ones.
 *   DOCK   time, then the rail. Nothing else.
 *
 * What came off: a venue search bar that duplicated SETUP, a sun readout that
 * duplicated the scrubber, two zoom buttons that duplicated pinch, and a
 * permanent lens chip row that is now one control. See the comments at each
 * site.
 */
export function PlanMode({
  mapHandle,
  venue,
  onVenueChange,
  onLongPress,
  plan,
  visiblePlan,
  conePlan,
  planCoverage,
  onPositionMove,
  sun,
  sunOverlay,
  showSun,
  onShowSun,
  showArc,
  onShowArc,
  showSky,
  onShowSky,
  wind,
  windLevels,
  gustMps,
  windAt,
  windPast,
  windHeight,
  ratedWindMps,
  ratedWindSource,
  selectedCloud,
  sky,
  selectedId,
  onSelect,
  selected,
  onFlyTo,
  coneMode,
  onConeMode,
  lensFilters,
  onLensFilters,
  isolatedId,
  onClearIsolate,
  venueWindow,
  scrubbedAt,
  scrub,
  onScrub,
  tide,
  tideNow,
  tideExtremes,
  generation,
  siteNote,
  positionNote,
  onGenerate,
  onFixBlock,
  kitProfile,
  kitSelection,
  marks,
  marking,
  onMarking,
  markKind,
  onMarkKind,
  markDrawing,
  onMarkDrawing,
  markDraft,
  onMarkAt,
  onFinishLine,
  onCancelLine,
  selectedMark,
  onSelectMark,
  onChangeMark,
  onDeleteMark,
  shootDate,
  briefSource,
  skyLayer,
  onSkyLayer,
  placing,
  onPlacing,
  onAddAt,
  onDeletePosition,
  onDuplicatePosition,
  onMovePosition,
  onSetOptic,
  onSetAltitude,
  onSetShotType,
  onSetYaw,
  onGoToField,
  goToFieldBlocked,
  peekStatus,
  fitTargets,
  pack,
  packIsCurrent,
  packState,
  onPreparePack,
  desiredShots,
  footer,
  platformFilter,
  onPlatformFilter,
  platformCounts,
  hiddenByPlatform,
  airAvailable,
  pilotAt,
  onPilotMove,
  placingPilot,
  onPlacingPilot,
  addsAir,
}: PlanModeProps) {
  const [sheet, setSheet] = useState<SheetState>('peek')
  const [sheetHeight, setSheetHeight] = useState(108)
  const [view, setView] = useState<SheetView>('plan')
  const [pitch, setPitch] = useState(0)

  /*
   * The dock height is MEASURED rather than assembled from per-bar tokens: the
   * scrubber's real height is set by its own content, and a token that said 62px
   * while it rendered at 93px silently put it on top of the chips.
   */
  const dock = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(0)
  const measureDock = (node: HTMLDivElement | null) => {
    dock.current = node
    if (node !== null) setDockHeight(node.offsetHeight)
  }

  const openWith = (next: SheetView) => {
    setView(next)
    setSheet('open')
  }

  const handle = mapHandle as React.RefObject<MapHandle | null>

  /*
   * The band on screen and the zoom to judge it at. The band follows the sun
   * (src/core/goes.ts); the zoom and the width come from the map itself,
   * because the threshold depends on how wide the screen actually is.
   */
  const skyBand = goesBandFor(sun?.altitude ?? -90)
  const [mapZoom, setMapZoom] = useState(16.5)
  const [mapWidth, setMapWidth] = useState(390)

  /* Whether anything is in the air, which is what the pilot control is for. */
  const airPositions = plan.filter((p) => p.position.platform === 'air').length

  return (
    <div
      className="mode-plan"
      style={
        {
          ['--sheet-live-height' as string]: `${sheetHeight}px`,
          ['--dock-height' as string]: `${dockHeight}px`,
        } as React.CSSProperties
      }
    >
      <MapView
        handle={mapHandle}
        venue={venue}
        onVenueChange={onVenueChange}
        mode={marking ? 'mark' : placing ? 'add' : placingPilot ? 'pilot' : null}
        marks={marks}
        markDraft={markDraft}
        onMarkAt={onMarkAt}
        onSelectMark={onSelectMark}
        onAddAt={onAddAt}
        plan={visiblePlan}
        conePlan={conePlan}
        pilotAt={pilotAt}
        onPilotMove={onPilotMove}
        onPositionMove={onPositionMove}
        onLongPress={onLongPress}
        sunAzimuth={sun === null ? null : sun.azimuth}
        sunAltitude={sun?.altitude ?? null}
        showSky={showSky}
        skyFrameAt={sky.frameAt}
        skyForecast={sky.cells}
        skyLayer={skyLayer}
        windMeters={windHeight.feet === null ? GROUND_WIND_METERS : windHeight.feet * 0.3048}
        ratedWindMps={ratedWindMps}
        skyForecastOpacity={sky.opacity}
        sunOverlay={sunOverlay}
        showSun={showSun}
        showArc={showArc}
        selectedId={selectedId}
        onSelect={onSelect}
        onPitchChange={setPitch}
        onViewChange={(zoom: number, width: number) => {
          setMapZoom(zoom)
          setMapWidth(width)
        }}
        bottomInset={sheetHeight}
      />

      {/*
        * ONE ROW OF REVEALS, and every one of them opens something rather than
        * stating something.
        *
        * THE VENUE SEARCH IS GONE. The venue is set in SETUP, on a screen built
        * around exactly that, with result merging, a confirm step and a
        * draggable pin. A second search bar here was a second way to do a job
        * that already has a home, sitting on top of the map it would move.
        * Changing the venue means stepping back to SETUP, which the rail does.
        *
        * THE SUN READOUT IS GONE TOO. It printed the same azimuth and altitude
        * the scrubber prints, one screen-height apart, and the scrubber's
        * version is the honest one: those numbers belong to a MOMENT, and the
        * scrubber is what chooses the moment.
        */}
      {/*
        * ARMED, SAID ON THE MAP IN WORDS. The button says what it is for; this
        * says what the map is now waiting for, where the waiting happens. An
        * icon would be one more thing to decode on a screen that just lost two
        * markers for being undecodable.
        */}
      {!placing ? null : (
        <p className="tapnote">{placingHint('position', addsAir ? 'air' : 'ground')}</p>
      )}
      {/*
        * The same affordance for the pilot, with its own words, because
        * "tap where you'll stand" is what the other one says and these are
        * two different standing places.
        */}
      {!placingPilot ? null : <p className="tapnote">{placingHint('pilot', 'ground')}</p>}

      <header className="hud">
        <div className="hud__row">
          {/* The single control that reveals sun and tide detail. */}
          <button type="button" className="mode" onClick={() => openWith('conditions')}>
            Conditions
          </button>
          {/*
            * HAZARDS. Up here with the other reveals rather than buried in the
            * overflow, because on a site full of wires this is the first thing
            * touched and the count has to be visible without opening anything.
            */}
          <button
            type="button"
            className={`mode${marking ? ' mode--on' : ''}`}
            aria-pressed={marking}
            onClick={() => onMarking(!marking)}
          >
            Hazards
            {marks.length === 0 ? null : (
              <span className="mode__n num"> {marks.length}</span>
            )}
          </button>
          <ConePicker
            kit={kitProfile}
            plan={plan}
            coneMode={coneMode}
            onConeMode={onConeMode}
            lensFilters={lensFilters}
            onLensFilters={onLensFilters}
            isolatedId={isolatedId}
            onClearIsolate={onClearIsolate}
          />
          <PlatformFilter
            value={platformFilter}
            onChange={onPlatformFilter}
            counts={platformCounts}
            hidden={hiddenByPlatform}
            airAvailable={airAvailable}
          />
          <OverflowMenu
            showArc={showArc}
            onShowArc={onShowArc}
            showSky={showSky}
            onShowSky={onShowSky}
            sunAltitude={sun?.altitude ?? null}
          />
        </div>
      </header>

      {/*
        * THE SKY KEY, only while the layer is on.
        *
        * It carries the colour table NASA GIBS publishes for the band on
        * screen, and the zoom warning when one satellite pixel has grown
        * bigger than the view. Both are about the layer, so both live with it
        * rather than in a panel somewhere else.
        */}
      {!marking ? null : (
        <HazardPanel
          marks={marks}
          kind={markKind}
          onKind={onMarkKind}
          drawing={markDrawing}
          onDrawing={onMarkDrawing}
          draft={markDraft}
          onFinishLine={onFinishLine}
          onCancelLine={onCancelLine}
          selected={selectedMark}
          onSelect={onSelectMark}
          onChange={onChangeMark}
          onDelete={onDeleteMark}
          onClose={() => onMarking(false)}
          date={shootDate}
          latitude={venue?.lat ?? null}
        />
      )}

      {!showSky ? null : (
        <SkyLegend
          band={skyBand}
          advice={zoomAdvice(skyBand, venue?.lat ?? 0, mapWidth, mapZoom)}
          sky={sky}
          clock={(at) =>
            venueWindow === null ? at.toISOString().slice(11, 16) : formatClock(at, venueWindow.timeZone)
          }
          boundary={
            venueWindow === null
              ? null
              : boundaryNote(new Date(), (at) => formatClock(at, venueWindow.timeZone))
          }
          /*
           * THE NUDGE IS ACTIONABLE, not just informative. "Nothing happened"
           * is what the map looks like from here, so the panel that explains
           * it also fixes it in one tap.
           */
          onZoomOut={(zoom) => handle.current?.zoomTo(zoom)}
          layer={skyLayer}
          onLayer={onSkyLayer}
          windHeight={windHeight}
          ratedWindMps={ratedWindMps}
        />
      )}

      <MapControls
        showSun={showSun}
        onShowSun={onShowSun}
        pitch={pitch}
        onPitch={(next) => handle.current?.setPitch(next)}
        onFitAll={() => handle.current?.fitAll(fitTargets)}
        canFitAll={fitTargets.length > 0}
      />

      {selected === null ? null : (
        <PositionCard
          planned={selected}
          shootAt={scrubbedAt}
          timeZone={venueWindow?.timeZone ?? null}
          tide={tideNow}
          onClose={() => onSelect(null)}
          count={plan.length}
          onDelete={onDeletePosition}
          onDuplicate={onDuplicatePosition}
          onMove={onMovePosition}
          onSetOptic={onSetOptic}
          onSetAltitude={onSetAltitude}
          onSetShotType={onSetShotType}
          onSetYaw={onSetYaw}
          kit={kitProfile}
          selection={kitSelection}
          marks={marks}
          subject={venue}
          pilotAt={pilotAt}
          onPlacePilot={() => onPlacingPilot(true)}
        />
      )}

      <BottomSheet
        state={sheet}
        onStateChange={setSheet}
        onHeightChange={setSheetHeight}
        reservedBottom={dockHeight}
        peek={
          <div className="peek">
            <button
              type="button"
              className="peek__summary"
              onClick={() => {
                setView('plan')
                setSheet(sheet === 'peek' ? 'open' : 'peek')
              }}
            >
              <span className="peek__label">{peekStatus.label}</span>
              <span className="peek__line">{peekStatus.line}</span>
            </button>

            {/*
              * ADDING A POSITION IS THE LOUD ACTION, and suggesting is not.
              *
              * It was the other way round, and it was wrong. Suggestion has
              * never placed well enough to trust: what actually produces a plan
              * is the shooter putting a position on a spot they know. So the
              * primary is the thing that works, and the model is offered
              * underneath as the optional help it is.
              */}
            <button
              type="button"
              className={`btn btn--primary peek__go${placing ? ' peek__go--armed' : ''}`}
              onClick={() => onPlacing(!placing)}
              aria-pressed={placing}
            >
              {placing
                ? 'Tap the map · cancel'
                : addsAir
                  ? 'Add air position'
                  : 'Add position'}
            </button>

            {/*
              * EACH SECONDARY SAYS WHAT IT DOES, and when it cannot be pressed
              * it says why instead. "Prepare field pack" and "Go to field"
              * named internal concepts: the first one downloads the photos so
              * the day works without signal, and the second opens the screen
              * you hold while walking. Neither of those was guessable.
              */}
            {/*
              * THE ONE SECONDARY AT PEEK. Adding and suggesting are the two
              * things you do WHILE planning, so they are the two things in
              * reach. Saving a pack and walking out of the door are things you
              * do once the plan exists, and they live in the sheet with the
              * plan detail rather than taking a row of the map for the whole
              * session.
              */}
            <div className="peek__second peek__second--one">
              <button
                type="button"
                className="act"
                onClick={onGenerate}
                disabled={generation.status === 'working'}
              >
                <span className="act__label">
                  {generation.status === 'working' ? 'Suggesting…' : 'Suggest positions'}
                </span>
                {/*
                  * WHICH BRIEF IS GOING, said before it goes.
                  *
                  * The typed box is no longer a gate: the chips are the
                  * intent and the brief is built from them. That is only
                  * honest if the shooter can see which of the two is being
                  * sent, so the button says so rather than substituting
                  * quietly. See src/core/shootBrief.ts.
                  */}
                <span className="act__why">
                  {generation.status === 'working' ? 'Asking the model' : briefSource}
                </span>
              </button>
            </div>
          </div>
        }
      >
        {view === 'conditions' ? (
          <>
            <div className="btn-row btn-row--pad">
              <button type="button" className="btn btn--small" onClick={() => setView('plan')}>
                Back to the plan
              </button>
            </div>
            <ConditionsPanel
              venueWindow={venueWindow}
              tide={tide}
              scrubbedAt={scrubbedAt}
              venue={venue}
              wind={wind}
              windLevels={windLevels}
              gustMps={gustMps}
              windAt={windAt}
              windPast={windPast}
              windHeight={windHeight}
              ratedWindMps={ratedWindMps}
              ratedWindSource={ratedWindSource}
              tideNow={tideNow}
              cloud={selectedCloud}
            />
          </>
        ) : (
          <>
            <div className="sheetacts">
              {/*
                * THE PILOT POSITION. Only offered when something is actually
                * flying: with no air positions there is nothing to measure
                * from, and a control for it would be a question about a plan
                * that does not have the thing it is asking about.
                *
                * It exists to MEASURE. Placing it draws a line to each air
                * position and prints the distance on that position's card.
                * Nothing about it is a check, a clearance or a permission.
                */}
              {airPositions === 0 ? null : (
                <button
                  type="button"
                  className={`act${placingPilot ? ' act--armed' : ''}`}
                  onClick={() => onPlacingPilot(!placingPilot)}
                  aria-pressed={placingPilot}
                >
                  <span className="act__label">
                    {placingPilot
                      ? 'Tap the map · cancel'
                      : pilotAt === null
                        ? 'Place the pilot position'
                        : 'Move the pilot position'}
                  </span>
                  <span className="act__why">
                    {pilotAt === null
                      ? 'Measures the distance to each air position'
                      : 'Drag the P marker, or tap a new spot'}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="act"
                onClick={onPreparePack}
                disabled={plan.length === 0 || packState.status === 'working'}
              >
                <span className="act__label">
                  {packState.status === 'working'
                    ? `Saving ${packState.done}/${packState.total}`
                    : packIsCurrent
                      ? 'Save again'
                      : 'Save offline'}
                </span>
                <span className="act__why">
                  {plan.length === 0
                    ? 'Add a position first'
                    : packState.status === 'working'
                      ? 'Downloading photos'
                      : packIsCurrent
                        ? 'Saved and current'
                        : 'Works with no signal'}
                </span>
              </button>
              <button
                type="button"
                className="act"
                onClick={onGoToField}
                disabled={goToFieldBlocked !== null}
              >
                <span className="act__label">Start the shoot</span>
                <span className="act__why">
                  {goToFieldBlocked === null
                    ? 'One position at a time'
                    : 'Add a position first'}
                </span>
              </button>
            </div>

            <PlanStatus
              generation={generation}
              onFixBlock={onFixBlock}
              planCoverage={planCoverage}
              siteNote={siteNote}
              positionNote={positionNote}
            />
            <FieldPackControl
              pack={pack}
              matches={packIsCurrent}
              positions={plan.length}
              state={packState}
              timeZone={venueWindow?.timeZone ?? null}
              onPrepare={onPreparePack}
            />
            <ShotList
              plan={visiblePlan}
              planCoverage={null}
              desiredShots={desiredShots}
              selectedId={selectedId}
              onPick={onFlyTo}
            />
          </>
        )}
      </BottomSheet>

      {/*
        * THE DOCK IS TIME, THEN THE RAIL. It used to be a lens chip row, the
        * scrubber, a full width forward button and the rail: four stacked bars
        * over the bottom third of the map. The chips became one control in the
        * HUD and the forward button became a secondary beside Generate, which
        * is where the hierarchy belonged anyway.
        */}
      <div className="dock" ref={measureDock}>
        {venueWindow === null || scrubbedAt === null || sun === null ? null : (
          <TimeScrubber
            start={venueWindow.start}
            end={venueWindow.end}
            value={scrub}
            onChange={onScrub}
            at={scrubbedAt}
            sun={sun}
            timeZone={venueWindow.timeZone}
            timeZoneAbbr={venueWindow.timeZoneShort}
            tideExtremes={tideExtremes}
          />
        )}

        {footer}
      </div>
    </div>
  )
}
