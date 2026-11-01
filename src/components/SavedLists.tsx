import { useEffect, useState } from 'react'
import { formatBytes } from '../lib/offlineCache.ts'
import { dayWords, shootLine } from '../lib/savedWords.ts'
import { readTruthLog, type TruthEntry } from '../lib/truthLog.ts'
import { deletePack, loadPacks, onPacksChanged, packBytes, type VenuePack } from '../lib/venuePack.ts'

/*
 * SAVED: THE OFFLINE PACKS AND THE PAST SHOOTS, UNDER THE SPOTS (Batch C2).
 *
 * The menu item said "Spots, offline packs, past shoots" and showed only the
 * spots. The packs are what "Save for offline" kept (src/lib/venuePack.ts):
 * each with its size, the day it was saved for and when, and Delete, which
 * asks once more on the same button rather than in a dialog. The past shoots
 * are the truth loop's entries (src/lib/truthLog.ts): the photos you checked
 * the forecast against, newest first. Everything here is on this phone only.
 */
export function SavedLists() {
  const [packs, setPacks] = useState<VenuePack[]>(loadPacks)
  const [shoots] = useState<TruthEntry[]>(() => {
    try {
      return [...readTruthLog()].sort((a, b) => b.at.localeCompare(a.at))
    } catch {
      return []
    }
  })
  const [confirm, setConfirm] = useState<string | null>(null)
  useEffect(() => onPacksChanged(() => setPacks(loadPacks())), [])

  return (
    <div className="saved">
      <h3 className="saved__head">Offline packs</h3>
      {packs.length === 0 ? (
        <p className="saved__none">None yet. Save a venue for offline from its map.</p>
      ) : (
        <ul className="saved__list">
          {packs.map((p) => (
            <li key={p.id} className="saved__row">
              <span className="saved__what">
                <span className="saved__name">{p.name}</span>
                <span className="saved__meta">
                  {formatBytes(packBytes(p))} · for {dayWords(p.day)} · saved {dayWords(p.savedAt)}
                </span>
              </span>
              <button
                type="button"
                className="saved__del"
                onClick={() => {
                  if (confirm !== p.id) return setConfirm(p.id)
                  setConfirm(null)
                  void deletePack(p.id)
                }}
              >
                {confirm === p.id ? 'Delete it' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="saved__head">Past shoots</h3>
      {shoots.length === 0 ? (
        <p className="saved__none">None yet. Pick photos under Sky › Sky fire › After the shoot, and each is listed here.</p>
      ) : (
        <ul className="saved__list">
          {shoots.slice(0, 50).map((e) => (
            <li key={e.id} className="saved__row">
              <span className="saved__what">
                <span className="saved__name">{e.camera ?? 'A photo'}</span>
                <span className="saved__meta">{shootLine(e)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
