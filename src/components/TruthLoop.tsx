import { useState } from 'react'
import { readPhotoMeta } from '../lib/compare/photoMeta.ts'
import { OUTCOME_LABEL, readFireLog, type FireOutcome } from '../lib/fireLog.ts'
import { saveText } from '../lib/saveText.ts'
import { entryFromPhoto, hitRate, readTruthLog, truthFile, withEntries, writeTruthLog, type TruthEntry } from '../lib/truthLog.ts'
import { formatClock } from '../core/timezone.ts'

/*
 * AFTER THE SHOOT (src/lib/truthLog.ts): pick the photos, and each is read on
 * the phone and set against what the app said for that minute and place; one
 * tap for how it went; your hit rate from this phone's log. Export it as a
 * file, or delete it (with Undo). The photos never leave the phone, and only
 * their numbers are kept.
 */
interface Props {
  timeZone: string
}

const LIGHT: Record<string, string> = { backlit: 'backlit', 'front-lit': 'front-lit', 'side-lit': 'side-lit' }

export function TruthLoop({ timeZone }: Props) {
  const [log, setLog] = useState<TruthEntry[]>(() => readTruthLog())
  const [batch, setBatch] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<TruthEntry[] | null>(null)

  const keep = (next: TruthEntry[]) => {
    setLog(next)
    if (!writeTruthLog(next)) setNote('Not kept: this phone’s storage is full.')
  }

  const add = async (files: FileList | null) => {
    if (files === null || files.length === 0) return
    const fires = readFireLog()
    const added: TruthEntry[] = []
    const skipped: string[] = []
    for (const file of Array.from(files)) {
      try {
        const e = entryFromPhoto(readPhotoMeta(await file.arrayBuffer()), timeZone, fires, file.name)
        if ('missing' in e) skipped.push(`${file.name}: no ${e.missing}`)
        else added.push(e)
      } catch {
        skipped.push(`${file.name}: could not be read`)
      }
    }
    keep(withEntries(log, added))
    setBatch(added.map((e) => e.id))
    setUndo(null)
    setNote(`${added.length} ${added.length === 1 ? 'photo' : 'photos'} read on this phone, none uploaded.${skipped.length === 0 ? '' : ` Left out: ${skipped.join('; ')}.`}`)
  }

  const rate = (o: FireOutcome) => {
    keep(log.map((e) => (batch.includes(e.id) ? { ...e, outcome: o } : e)))
    setNote(`Kept: ${OUTCOME_LABEL[o]}.`)
  }

  const r = hitRate(log)
  const shown = log.filter((e) => batch.includes(e.id)).slice(0, 4)

  return (
    <section className="truth" aria-label="After the shoot">
      <p className="fire__head">After the shoot</p>
      <label className="btn btn--small truth__pick">
        Pick photos
        <input type="file" accept="image/*" multiple className="truth__file" onChange={(e) => void add(e.target.files)} />
      </label>
      {shown.length === 0 ? null : (
        <>
          <ul className="truth__list num">
            {shown.map((e) => (
              <li key={e.id}>
                {formatClock(new Date(e.at), timeZone)} · {e.said.minutesFromEvent >= 0 ? `${e.said.minutesFromEvent} min after` : `${-e.said.minutesFromEvent} min before`} {e.said.event} · sun {Math.round(e.said.sunAltitude)}° up
                {e.said.light === null ? '' : `, ${LIGHT[e.said.light]}`}
                {e.said.golden ? ', golden hour' : ''}
                {e.said.fire === null ? ' · no Sky fire forecast shown' : ` · it said ${e.said.fire}`}
              </li>
            ))}
          </ul>
          <div className="btn-row" role="group" aria-label="How it went">
            {(['fired', 'meh', 'nothing'] as const).map((o) => (
              <button key={o} type="button" className="btn btn--small" onClick={() => rate(o)}>
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </>
      )}
      {note === null ? null : <p className="fire__note">{note}</p>}

      <p className="fire__head">Your hit rate</p>
      <p className="fire__note num">
        {r.shoots === 0
          ? 'No shoots logged yet. Pick the photos after a sunrise or sunset to start.'
          : `${r.shoots} ${r.shoots === 1 ? 'shoot' : 'shoots'} logged. ${r.firesaid === 0 ? 'Sky fire was not shown for any of them.' : `When Sky fire said possible or likely it fired ${r.firedWhenSaid} of ${r.firesaid} times.`}${r.unlikelySaid === 0 ? '' : ` When it said unlikely it fired ${r.firedWhenUnlikely} of ${r.unlikelySaid}.`} ${r.golden} of ${r.photos} photos in golden hour.`}
      </p>
      {log.length === 0 && undo === null ? null : (
        <div className="btn-row">
          {log.length === 0 ? null : (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => saveText(truthFile(log), 'application/json', 'scoutngo-truth-log.json')}>
              Export
            </button>
          )}
          {undo !== null ? (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                keep(undo)
                setUndo(null)
                setNote('Log restored.')
              }}
            >
              Undo delete
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--small btn--quiet"
              onClick={() => {
                setUndo(log)
                keep([])
                setBatch([])
                setNote('Log deleted from this phone.')
              }}
            >
              Delete log
            </button>
          )}
        </div>
      )}
    </section>
  )
}
