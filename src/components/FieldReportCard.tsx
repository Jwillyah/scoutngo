import '../styles/report.css'
import { useState } from 'react'
import { REPORT_RATINGS, REPORT_SIZES, shareText, sizeOf, spotFactor, SPOT_FACTOR_MIN_REPORTS, type FieldReport, type ReportRating, type ReportSize } from '../core/fieldReports.ts'
import { readPhotoFacts } from '../core/exif.ts'
import type { LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import { SURF_SPOTS } from '../data/surfSpots.ts'
import { BUOY_WITHIN_MS, choice, photoPrefill, type PhotoPrefill, type SpotChoice } from '../lib/photoReport.ts'
import { reviveSpots, SPOTS_STORAGE_KEY } from '../lib/spots.ts'
import { venueLatLon } from '../lib/venue.ts'
import { addReport, readReports, removeReport } from '../lib/fieldReportStore.ts'
import { DCard } from './DetailShell.tsx'
import { PageGroup } from '../lib/pageGroup.ts'
import { Page } from './Page.tsx'

/*
 * WHAT DID YOU SEE (Batch Beach, Section 3). One tap after a session or a
 * look: the size and how it was. Kept on this phone; three with a buoy beside
 * them calibrate this spot (src/core/fieldReports.ts spotFactor). Sharing is
 * a separate tap, off until you make it, and opens a public form holding one
 * line (shareText) that you post yourself, or don't.
 */
export const SHARE_FORM = 'https://github.com/Jwillyah/scoutngo/issues/new'

export interface FieldReportCardProps {
  /** For tests: start with the report page open. */
  startOpen?: boolean
  spot: string
  name: string
  /** Batch Polish, Section 6: the spot's own point, for a photo's position to be matched against (never stored). */
  at?: LatLon
  timeZone: string
  /** The live buoy as faces here with the factor at 1; null when there is none. */
  buoyFt: number | null
  now: () => number
  /** For tests: what the phone holds. */
  initial?: FieldReport[]
}

export function FieldReportCard({ spot, name, at: spotAt, timeZone, buoyFt, now, initial, startOpen = false }: FieldReportCardProps) {
  const [reports, setReports] = useState<FieldReport[]>(() => initial ?? readReports())
  const [size, setSize] = useState<ReportSize | null>(null)
  const [rating, setRating] = useState<ReportRating | null>(null)
  const [share, setShare] = useState(false)
  const [saved, setSaved] = useState<FieldReport | null>(null)
  /* Batch Beach, Section 3: on the Surf page one row (the page fits one screen, nothing scrolls); the chips on a page of their own. */
  const [open, setOpen] = useState(startOpen)
  const here = reports.filter((r) => r.spot === spot)
  const withBuoy = here.filter((r) => r.buoyFt !== null).length
  const factor = spotFactor(reports, spot)

  /* Batch Polish, Section 6: a photo prefills the time and the spot; the photo itself is read here and dropped. */
  const [photo, setPhoto] = useState<PhotoPrefill | null>(null)
  const pickPhoto = async (file: File | undefined) => {
    if (file === undefined || spotAt === undefined) return
    const facts = readPhotoFacts(await file.slice(0, 256 * 1024).arrayBuffer())
    setPhoto(photoPrefill(facts, choice(name, spotAt), spotChoices(), timeZone))
  }
  const save = () => {
    if (size === null || rating === null) return
    const at = photo?.at ?? now()
    const target = photo?.spot ?? { key: spot, name }
    /* The live buoy stands beside a report about now, here; a photo from earlier, or of another spot, has none. */
    const buoy = target.key === spot && Math.abs(at - now()) <= BUOY_WITHIN_MS ? buoyFt : null
    const r: FieldReport = { spot: target.key, name: target.name, at, size, rating, buoyFt: buoy }
    setReports(addReport(r))
    setSaved(r)
    setSize(null)
    setRating(null)
    setPhoto(null)
  }

  const count =
    here.length === 0
      ? 'Your reports stay on this phone.'
      : factor === null
        ? `${here.length} ${here.length === 1 ? 'report' : 'reports'} here · ${withBuoy} with a buoy; ${SPOT_FACTOR_MIN_REPORTS} calibrate this spot`
        : `${here.length} reports here · this spot breaks ${factor.toFixed(2)}× the buoy, from yours`

  const row = (
    <DCard className="drep drep--row">
      <button type="button" className="drep__open" onClick={() => setOpen(true)}>
        <span className="drep__opentext">
          <b>What did you see?</b>
          <span className="drep__small" data-report-count>
            {count}
          </span>
        </span>
        <span className="drep__chev" aria-hidden="true">
          ›
        </span>
      </button>
    </DCard>
  )
  if (!open) return row

  return (
    <>
      {row}
      <PageGroup.Provider value={null}>
        <Page title="What did you see?" className="reportpage" back onClose={() => setOpen(false)}>
    <DCard label={name} className="drep">
      <div className="drep__row" role="group" aria-label="Size">
        {REPORT_SIZES.map((s) => (
          <button key={s.id} type="button" className={`drep__chip${size === s.id ? ' drep__chip--on' : ''}`} aria-pressed={size === s.id} onClick={() => setSize(s.id)}>
            {s.words.replace('Flat · ', '')}
          </button>
        ))}
      </div>
      <div className="drep__row drep__row--four" role="group" aria-label="How it was">
        {REPORT_RATINGS.map((x) => (
          <button key={x} type="button" className={`drep__chip${rating === x ? ' drep__chip--on' : ''}`} aria-pressed={rating === x} onClick={() => setRating(x)}>
            {x}
          </button>
        ))}
      </div>
      {spotAt === undefined ? null : (
        <label className="drep__photo">
          <input type="file" accept="image/*" onChange={(e) => {
            void pickPhoto(e.target.files?.[0])
            e.target.value = ''
          }} />
          <span className="drep__photobtn">Add a photo</span>
          <span>its time and place fill this in; the photo is not kept or sent</span>
        </label>
      )}
      {photo === null ? null : (
        <p className="drep__small" data-report-photo>
          {photo.note}
          {photo.at === null ? '' : ` ${formatClock(new Date(photo.at), timeZone)}`}
          {photo.spot === null ? '' : ` · ${photo.spot.name}`}
        </p>
      )}
      <label className="drep__share">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        <span>Also share publicly: the spot’s name, the hour, the size and the rating, nothing else. Off unless you tick it; you post it yourself.</span>
      </label>
      <button type="button" className="drep__save" disabled={size === null || rating === null} onClick={save}>
        Save on this phone
      </button>
      {saved === null ? null : (
        <p className="drep__small" data-report-saved>
          Saved: {sizeOf(saved.size).words}, {saved.rating.toLowerCase()} at {formatClock(new Date(saved.at), timeZone)}
          {saved.buoyFt === null ? ' · no buoy in hand, so it does not calibrate' : ''}
          {share ? (
            <>
              {' · '}
              <a href={`${SHARE_FORM}?title=${encodeURIComponent(`Field report: ${shareText(saved)}`)}&body=${encodeURIComponent(shareText(saved))}`} target="_blank" rel="noreferrer noopener">
                Open the public form ›
              </a>
            </>
          ) : null}
        </p>
      )}
      <p className="drep__small">{count}</p>
      {/* Batch Polish, Section 6: this phone's recent reports, every spot, newest first. */}
      {reports.length === 0 ? null : (
        <ul className="drep__list" aria-label="Your recent reports">
          {reports
            .slice(-8)
            .reverse()
            .map((r) => (
              <li key={`${r.spot}-${r.at}`}>
                <span>
                  {r.name} · {sizeOf(r.size).words} · {r.rating} · {formatClock(new Date(r.at), timeZone)}
                </span>
                <button type="button" className="drep__del" aria-label="Delete this report" onClick={() => setReports(removeReport(r.at, r.spot))}>
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}
    </DCard>
        </Page>
      </PageGroup.Provider>
    </>
  )
}

/** The spots a photo can be matched to: the surf spots and your saved ones (read here, never sent). */
function spotChoices(): SpotChoice[] {
  const out: SpotChoice[] = SURF_SPOTS.map((s) => choice(s.name, s.at))
  try {
    for (const sp of reviveSpots(JSON.parse(localStorage.getItem(SPOTS_STORAGE_KEY) ?? '[]'))) {
      const at = venueLatLon(sp.venue)
      if (at !== null) out.push(choice(sp.name, at))
    }
  } catch {
    /* No saved spots readable: the surf spots alone. */
  }
  return out
}
