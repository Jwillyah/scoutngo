import type { Building } from '../lib/buildings.ts'
import { useScan } from '../lib/lidar/useScan.ts'

/*
 * THE 3D SCAN, OFFERED WHERE IT IS NEEDED (29 Oct: the Light map said
 * "Download it in the 3D view (the i), then come back here"). A card that
 * needs the scan carries the button that fetches it, not directions to
 * another screen: shape D in docs/failure-modes.md, a message naming a
 * missing capability carries the control that supplies it.
 *
 * Nothing downloads until the tap. The same offer and the same download as
 * the 3D view's "i" (src/lib/lidar/useScan.ts); a finished scan reaches every
 * card that was waiting for it through SCAN_EVENT.
 */
interface ScanOfferProps {
  venue: { lat: number; lon: number } | null
  buildings: readonly Building[]
  /** What the card does with a scan, in a few words: "The light map is worked out from it." */
  why: string
}

const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1_000_000))

export function ScanOffer({ venue, buildings, why }: ScanOfferProps) {
  const flow = useScan(venue, buildings)
  const state = flow.state
  if (state.status === 'kept') return <p className="pf__prompt">The scan is on this phone; working it out…</p>
  if (state.status === 'none') return <p className="pf__prompt">No public 3D scan covers this place, so there is nothing to work this out from.</p>
  if (state.status === 'checking') return <p className="pf__prompt">Looking for a 3D scan of this place…</p>
  if (state.status === 'fetching-overture') return <p className="pf__prompt">Looking for a scan of this place…</p>
  if (state.status === 'downloading') {
    const p = state.progress
    return <p className="pf__prompt num">Downloading the 3D scan{p === null ? '…' : `: ${p.done} of ${p.total} parts, ${mb(p.bytes)} MB`}</p>
  }
  const offer = state.offer
  return (
    <div className="scanoffer">
      <p className="pf__prompt">{why}</p>
      {state.status === 'failed' ? <p className="pf__prompt scanoffer__fail">The scan didn't download: {state.reason}</p> : null}
      <button type="button" className="btn btn--primary scanoffer__go" onClick={() => void flow.download(offer)}>
        Download 3D scan (≈ {mb(offer.bytes)} MB)
      </button>
    </div>
  )
}
