import { useEffect, useState } from 'react'
import { askToPersist, backupNow, lastBackup, restoreBackup, whatIsKept, type Kept } from '../lib/backup.ts'
import { formatBytes } from '../lib/offlineCache.ts'
import { dayWords } from '../lib/savedWords.ts'

/*
 * SETTINGS › PRIVACY & DATA: WHERE YOUR THINGS ARE, AND A COPY YOU HOLD
 * (Batch E, 1 Nov; src/lib/backup.ts). How much is kept and where, whether
 * the browser agreed to keep it, Back up to a file, Restore from a file, and
 * the plain words on what deletes it.
 */
export function KeptSection() {
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
    const got = restoreBackup(new Uint8Array(await file.arrayBuffer()), localStorage)
    setNote(got.ok ? `Restored ${got.keys} items${got.thumbs > 0 ? ` and ${got.thumbs} thumbnails` : ''} from the backup of ${dayWords(got.savedAt)}. Reopen the app to see them.` : got.reason)
    look()
  }

  return (
    <div className="kept">
      <p className="kept__line">
        On this phone: yours {kept === null ? '…' : formatBytes(kept.yoursBytes)}
        {kept === null || kept.cacheBytes === 0 ? '' : `, caches ${formatBytes(kept.cacheBytes)}`}
        {kept?.usage == null ? '' : `; everything this site keeps, map tiles and forecasts included, ${formatBytes(kept.usage)}${kept.quota == null ? '' : ` of the ${formatBytes(kept.quota)} the browser allows`}`}.
      </p>
      <p className="kept__line">
        {kept?.persisted === true
          ? 'The browser has agreed to keep this storage when space runs short.'
          : kept?.persisted === false
            ? 'The browser has not agreed to keep this storage; it may clear it when space runs short.'
            : 'This browser does not say whether it will keep this storage.'}
        {kept?.persisted === true ? null : (
          <>
            {' '}
            <button type="button" className="kept__ask" onClick={() => void askToPersist().then(look)}>
              Ask again
            </button>
          </>
        )}
      </p>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            const name = backupNow()
            setLast(new Date())
            setNote(`Saved ${name}: your spots, kit, settings, logs and thumbnails. Keep it somewhere off this phone.`)
          }}
        >
          Back up to a file
        </button>
        <label className="btn btn--small btn--quiet kept__restore">
          Restore from a file
          <input type="file" accept=".zip,.json,application/zip,application/json" className="kept__file" onChange={(e) => void restore(e.target.files?.[0])} />
        </label>
      </div>
      <p className="kept__line">Last backup: {last === null ? 'never' : dayWords(last.toISOString())}.</p>
      {note === null ? null : <p className="kept__note" role="status">{note}</p>}
      <p className="kept__plain">
        Everything you save is in this phone’s browser storage, nowhere else: spots, kit, settings and logs in its local storage, saved forecasts in its database, offline maps in its cache. Photos are never kept, only the numbers read from them and a small thumbnail. The Safari tab and the home-screen app keep separate storage. Deleting the app, or clearing Safari’s website data, deletes it. A backup file is the only copy outside the phone. Not in it: your Anthropic key and the offline maps, which you save again.
      </p>
    </div>
  )
}
