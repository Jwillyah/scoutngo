import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { camsNear, lensFacing, type CamChip, type FacingCam } from '../core/skyCams.ts'
import { compass } from '../lib/tideWords.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { beachName } from '../lib/surfBeach.ts'

/*
 * "CAMS NEAR <SPOT>" (Batch N A4; board Lookcams). The home's Cams row opens
 * it. Chips: All · Surf · Sunset view · Roads (src/core/skyCams.ts camsNear).
 * Sunset view lists only cams whose recorded lens facing is within 45° of the
 * sunset's azimuth; the road cams (their facing is the lanes') only under
 * Roads and All. LINK OUT ONLY (docs/cams.md): a link, nothing fetched.
 */
const CHIPS: { id: CamChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'surf', label: 'Surf' },
  { id: 'sunset', label: 'Sunset view' },
  { id: 'roads', label: 'Roads' },
]

export function CamsSheet({ spot, venue, sunsetAzDeg, seaFacingDeg, onClose }: { spot: string; venue: { lat: number; lon: number }; sunsetAzDeg: number | null; seaFacingDeg: number | null; onClose: () => void }) {
  const [chip, setChip] = useState<CamChip>('all')
  const [roads, setRoads] = useState<readonly FacingCam[]>([])
  useEffect(() => {
    let live = true
    void import('../data/vdotCams.ts').then((m) => live && setRoads(m.VDOT_CAMS))
    return () => {
      live = false
    }
  }, [])
  const list = useMemo(() => camsNear(venue, chip, [...COAST_CAMS, ...roads], sunsetAzDeg, seaFacingDeg), [venue, chip, roads, sunsetAzDeg, seaFacingDeg])
  /* Over everything, the home's buttons included. */
  return createPortal(
    <div className="camsheet" role="dialog" aria-label={`Cams near ${spot}`}>
      <div className="camsheet__panel">
        <div className="camsheet__head">
          <p className="camsheet__title">Cams near {spot}</p>
          <button type="button" className="camsheet__x" aria-label="Close the cams" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="camsheet__chips" role="tablist">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={chip === c.id} className={`camsheet__chip${chip === c.id ? ' camsheet__chip--on' : ''}`} onClick={() => setChip(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="camsheet__none">{chip === 'sunset' ? 'No cam within 15 km is recorded facing the sunset.' : 'No cam within 15 km.'}</p>
        ) : (
          <ul className="camsheet__list">
            {list.map((c) => (
              <li key={c.cam.id}>
                <a href={c.cam.url} target="_blank" rel="noopener noreferrer" className="camsheet__row">
                  <span className="camsheet__name">{c.cam.facingIs === 'lanes' ? c.cam.name : beachName(c.cam.name)}</span>
                  <span className="camsheet__where">
                    {c.where}
                    {lensFacing(c.cam) === null ? '' : ` · faces ${compass(lensFacing(c.cam) as number)}`} · {c.cam.operator}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="camsheet__foot">Links open the cam’s own page · sorted by distance</p>
      </div>
    </div>,
    document.body,
  )
}
