import { useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import type { Units } from '../lib/units.ts'
import { Page } from './Page.tsx'
import { TideSheet } from './TideSheet.tsx'

/*
 * TIDES, A PAGE OF ITS OWN (29 Oct): in the menu after Sky, and from the
 * tide chip on the map. Simple first, Advanced a tab away. Its own day
 * timeline is the curve: drag along it to move the time (the time bar's
 * rules, src/lib/useSidewaysScrub.ts).
 */
interface TidesPageProps {
  tide: TideInfo
  at: Date
  timeZone: string
  venue: LatLon
  units: Units
  data: TideSheetData
  onAt: (at: Date) => void
  onJumpDay: (date: string, at: Date) => void
  onClose: () => void
  waterline?: { shown: boolean; scanKept: boolean; line: string; onShow: (on: boolean) => void }
}

export function TidesPage(props: TidesPageProps) {
  const [view, setView] = useState<'simple' | 'advanced'>('simple')
  return (
    <Page title="Tides" className="tpage" tabs={[{ id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }]} tab={view} onTab={(t) => setView(t as 'simple' | 'advanced')} onClose={props.onClose}>
      <TideSheet {...props} view={view} bare />
    </Page>
  )
}
