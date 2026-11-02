import { formatClock } from '../core/timezone.ts'
import { buoyName, buoySea, buoySplit } from '../lib/buoyWords.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { Page } from './Page.tsx'

/*
 * WATER › BUOYS (Batch H, Section 3): the 2-3 nearest NDBC buoys on the water
 * the beach faces (src/lib/buoy.ts), each with the time it read, the whole
 * sea, and the swell and wind waves apart where its spectral file has them.
 */
export function BuoysPage({ data, timeZone, onClose }: { data: TideSheetData; timeZone: string; onClose: () => void }) {
  const list = data.buoys
  return (
    <Page title="Buoys" className="spage" onClose={onClose}>
      {list === null ? (
        <p className="spage__lead">Asking the nearest buoys…</p>
      ) : !list.some((b) => b.status === 'ok') ? (
        <p className="spage__lead">{list[0]?.status === 'none' ? list[0].reason : 'No buoy reading.'}</p>
      ) : (
        <section className="spage__src" aria-label="Buoys">
          <ul className="buoys">
            {list.map((b) =>
              b.status !== 'ok' ? null : (
                <li key={b.buoy.id} className="buoys__row">
                  <span className="buoys__name">{buoyName(b)}</span>
                  <span className="buoys__sea num">
                    {buoySea(b)} · {formatClock(b.at, timeZone)}
                  </span>
                  {buoySplit(b) === null ? null : <span className="buoys__split num">{buoySplit(b)}</span>}
                </li>
              ),
            )}
          </ul>
          <p className="spage__small">NDBC, each buoy's latest reading; the swell and wind waves from its spectral file. Only the buoys on the water this beach faces.</p>
        </section>
      )}
    </Page>
  )
}
