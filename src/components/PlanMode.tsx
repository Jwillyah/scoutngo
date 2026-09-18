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
import { ConeFilter, type ConeMode } from './ConeFilter.tsx'
import { FieldPackControl, type PackBuildState } from './FieldPackControl.tsx'
import { MapControls } from './MapControls.tsx'
import { MapView, type MapHandle, type TapMode } from './MapView.tsx'
import { OverflowMenu } from './OverflowMenu.tsx'
import { PlanStatus } from './PlanStatus.tsx'
import { PositionCard } from './PositionCard.tsx'
import { SearchField } from './SearchField.tsx'
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
  onSearchPick: (at: LatLon, label: string) => void
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
  onSearchPick,
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

      <header className="hud">
        <SearchField onPick={onSearchPick} />
        <div className="hud__row">
          {sun === null ? null : (
            <p className="hud__sun">
              <span className="hud__sun-label">Sun</span>
              <span className="num">{sun.azimuth.toFixed(1)}°</span>
              <span className="num">{sun.altitude.toFixed(1)}° alt</span>
            </p>
          )}
          {/* The single control that reveals sun and tide detail. */}
          <button type="button" className="mode" onClick={() => openWith('conditions')}>
            Conditions
          </button>
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
        onZoom={(delta) => handle.current?.zoomBy(delta)}
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

      <div className="dock" ref={measureDock}>
        <ConeFilter
          plan={plan}
          coneMode={coneMode}
          onConeMode={onConeMode}
          lensFilters={lensFilters}
          onLensFilters={onLensFilters}
          isolatedId={isolatedId}
          onClearIsolate={onClearIsolate}
        />

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
