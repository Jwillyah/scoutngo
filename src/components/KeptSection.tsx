import { useEffect, useState } from 'react'
import { askToPersist, backupNow, lastBackup, restoreBackup, whatIsKept, type Kept } from '../lib/backup.ts'
import { formatBytes } from '../lib/offlineCache.ts'
import { dayWords } from '../lib/savedWords.ts'
import { readScoutFile, type ReadFile } from '../lib/scoutFile.ts'

/*
 * SETTINGS › PRIVACY & DATA: WHERE YOUR THINGS ARE, AND A COPY YOU HOLD
 * (Batch E, 1 Nov; src/lib/backup.ts). How much is kept and where, whether
 * the browser agreed to keep it, Back up to a file, Restore from a file, and
 * the plain words on what deletes it.
 */
export function KeptSection({ onImportScout }: { onImportScout?: (file: ReadFile) => string } = {}) {
  const [kept, setKept] = useState<Kept | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [last, setLast] = useState<Date | null>(() => {
    try {
      return lastBackup(localStorage)
    } catch {
      return null
    }
  })
  const look = () => void whatIsKept(localStorage).then(setKept).catch(() => setKept(null))
  useEffect(look, [])

  const restore = async (file: File | undefined) => {
    if (file === undefined) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const got = restoreBackup(bytes, localStorage)
    /* Not a backup: perhaps an older "Export everything" file, read as About used to (Batch G: restore lives here only). */
    const scout = got.ok || onImportScout === undefined ? null : readScoutFile(new TextDecoder().decode(bytes))
    setNote(got.ok ? `Restored ${got.keys} items${got.thumbs > 0 ? ` and ${got.thumbs} thumbnails` : ''} from the backup of ${dayWords(got.savedAt)}. Reopen the app to see them.` : scout?.ok === true && onImportScout !== undefined ? onImportScout(scout.file) : got.reason)
    look()
  }

  /* Rows, as the rest of Settings (Batch G): a label on the left, the value on the right; the long words are in the section's "i". */
  return (
    <>
      <div className="set__row">
        <span className="set__label">On this phone</span>
        <span className="set__value">
          {kept === null ? '…' : `yours ${formatBytes(kept.yoursBytes)}${kept.usage == null ? '' : ` · ${formatBytes(kept.usage)} in all`}`}
        </span>
      </div>
      <div className="set__row">
        <span className="set__label">Kept when space runs short</span>
        <span className="set__value">
          {kept?.persisted === true ? 'Yes' : kept?.persisted === false ? 'Not agreed' : 'Not said'}
          {kept?.persisted === true ? null : (
            <>
              {' '}
              <button type="button" className="set__btn" onClick={() => void askToPersist().then(look)}>
                Ask again
              </button>
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        className="set__row"
        onClick={() => {
          const name = backupNow()
          setLast(new Date())
          setNote(`Saved ${name}. Keep it somewhere off this phone.`)
        }}
      >
        <span className="set__label">Back up to a file</span>
        <span className="set__value">
          {last === null ? 'Never backed up' : `Last ${dayWords(last.toISOString())}`}
          <span className="set__chev" aria-hidden="true">›</span>
        </span>
      </button>
      <label className="set__row kept__restore">
        <span className="set__label">Restore from a file</span>
        <span className="set__value">
          <span className="set__chev" aria-hidden="true">›</span>
        </span>
        <input type="file" accept=".zip,.json,application/zip,application/json" className="kept__file" onChange={(e) => void restore(e.target.files?.[0])} />
      </label>
      {note === null ? null : (
        <p className="set__note" role="status">
          {note}
        </p>
      )}
    </>
  )
}

/*
 * WHERE IT IS, AND WHAT DELETES IT: Settings › Privacy & data's "i" (Batch
 * G: the long words behind an "i"; About's Safari-clearing paragraph moved
 * here).
 */
export function KeptExplained() {
  return (
    <>
      <p>
        Everything you save is in this phone’s browser storage, nowhere else: spots, kit, settings and logs in its local storage, saved forecasts in its database, offline maps in its cache. Photos are never kept, only the numbers read from them and a small thumbnail.
      </p>
      <p>
        The Safari tab and the home-screen app keep separate storage. Deleting the app, or clearing Safari’s website data (Settings › Safari › Advanced › Website Data), deletes it. A backup file is the only copy outside the phone. Not in it: your Anthropic key and the offline maps, which you save again.
      </p>
    </>
  )
}
