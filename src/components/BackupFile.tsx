import { useRef, useState } from 'react'
import { describeFile, readScoutFile, type ReadFile } from '../lib/scoutFile.ts'

/*
 * EXPORT AND IMPORT, ONE FILE.
 *
 * The backup for a browser whose data gets cleared. Export writes one
 * ScoutNGo file -- kit, shelved gear, units and every saved spot -- to Files.
 * Import reads one back, SAYS WHAT IT HOLDS AND WHAT IT WILL REPLACE, and
 * only then changes anything: a kit replaced by surprise is the same loss
 * this exists to prevent.
 *
 * Nothing leaves the device in either direction. See src/lib/scoutFile.ts.
 */
interface BackupFileProps {
  onExport: () => void
  /** Applies a read file: kit and units replace, spots are added. Returns what it did. */
  onImport: (file: ReadFile) => string
}

export function BackupFile({ onExport, onImport }: BackupFileProps) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ReadFile | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const pick = (file: File) => {
    void file.text().then((text) => {
      const result = readScoutFile(text)
      if (!result.ok) {
        setPending(null)
        setNote(result.reason)
        return
      }
      setNote(null)
      setPending(result.file)
    })
  }

  const replaces = (file: ReadFile): string => {
    const parts = [
      file.kit === null ? null : 'your kit',
      file.units === null ? null : 'your units',
    ].filter((p): p is string => p !== null)
    const adds = file.spots.length === 0 ? '' : `Adds ${file.spots.length} ${file.spots.length === 1 ? 'spot' : 'spots'}; a spot with the same id is replaced.`
    return [parts.length === 0 ? '' : `Replaces ${parts.join(' and ')}.`, adds]
      .filter((s) => s !== '')
      .join(' ')
  }

  return (
    <div className="backup">
      <p className="backup__what">
        One file with your kit, shelved gear, units and saved spots. Keep it in Files; clearing
        Safari&rsquo;s data cannot touch it. Nothing is uploaded either way.
      </p>
      <div className="backup__acts">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            onExport()
            setNote('Exported. On iPhone choose Save to Files.')
          }}
        >
          Export to a file
        </button>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => input.current?.click()}>
          Import a file
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="backup__input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file !== undefined) pick(file)
            event.target.value = ''
          }}
        />
      </div>

      {pending === null ? null : (
        <div className="backup__confirm">
          <p className="backup__holds">This file holds {describeFile(pending)}.</p>
          <p className="backup__what">{replaces(pending)}</p>
          <div className="backup__acts">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setNote(onImport(pending))
                setPending(null)
              }}
            >
              Import
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {note === null ? null : <p className="backup__note">{note}</p>}
    </div>
  )
}
