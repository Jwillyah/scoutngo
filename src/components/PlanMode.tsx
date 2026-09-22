import { useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { TideExtreme, TideState } from '../core/tide.ts'
import type { SunArc, SunPosition } from '../core/sun.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import type { GenerationState } from '../lib/planRequest.ts'
import type { DesiredShot } from '../lib/describe.ts'
import type { FieldPack } from '../lib/fieldPack.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { BottomSheet, type SheetState } from './BottomSheet.tsx'
import { ConditionsPanel } from './ConditionsPanel.tsx'
import { ConePicker, type ConeMode } from './ConePicker.tsx'
import { FieldPackControl, type PackBuildState } from './FieldPackControl.tsx'
import { MapControls } from './MapControls.tsx'
import { MapView, type MapHandle, type TapMode } from './MapView.tsx'
import { OverflowMenu } from './OverflowMenu.tsx'
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
  subject: LatLon | null
  onSubjectChange: (at: LatLon) => void
  onLongPress: (at: LatLon) => void
  tapMode: TapMode
  onTapMode: (next: TapMode) => void
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
  onGenerate: () => void
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
  subject,
  onSubjectChange,
  onLongPress,
  tapMode,
  onTapMode,
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
  onGenerate,
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
        subject={subject}
        onSubjectChange={onSubjectChange}
        mode={tapMode}
        plan={visiblePlan}
        conePlan={conePlan}
        onPositionMove={onPositionMove}
        onLongPress={onLongPress}
        sunAzimuth={sun === null ? null : sun.azimuth}
        sunOverlay={sunOverlay}
        showSun={showSun}
        showArc={showArc}
        selectedId={selectedId}
        onSelect={onSelect}
        onPitchChange={setPitch}
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
      <header className="hud">
        <div className="hud__row">
          {/* The single control that reveals sun and tide detail. */}
          <button type="button" className="mode" onClick={() => openWith('conditions')}>
            Conditions
          </button>
          <ConePicker
            plan={plan}
            coneMode={coneMode}
            onConeMode={onConeMode}
            lensFilters={lensFilters}
            onLensFilters={onLensFilters}
            isolatedId={isolatedId}
            onClearIsolate={onClearIsolate}
          />
          <OverflowMenu
            mode={tapMode}
            onMode={onTapMode}
            showArc={showArc}
            onShowArc={onShowArc}
          />
        </div>
      </header>

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
              * ONE LOUD ACTION. Generate is what this screen is for, so it is
              * the full width primary in signal white and nothing else on the
              * screen competes with it. The other two are real actions, not
              * links, but they are secondary and they sit underneath: preparing
              * a pack and walking out of the door are both things you do AFTER
              * there is a plan to do them to.
              */}
            <button
              type="button"
              className="btn btn--primary peek__go"
              onClick={onGenerate}
              disabled={generation.status === 'working'}
            >
              {generation.status === 'working' ? 'Working' : 'Generate'}
            </button>

            <div className="peek__second">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={onPreparePack}
                disabled={plan.length === 0 || packState.status === 'working'}
              >
                {packState.status === 'working'
                  ? `Packing ${packState.done}/${packState.total}`
                  : packIsCurrent
                    ? 'Pack again'
                    : 'Prepare field pack'}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={onGoToField}
                disabled={goToFieldBlocked !== null}
                title={goToFieldBlocked ?? undefined}
              >
                Go to field
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
            />
          </>
        ) : (
          <>
            <PlanStatus
              generation={generation}
              planCoverage={planCoverage}
              siteNote={siteNote}
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
