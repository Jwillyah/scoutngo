import { useRef, useState } from 'react'
import {
  exportFilename,
  parseSpotsFile,
  toFile,
  type Spot,
} from '../lib/spots.ts'

interface SpotsPanelProps {
  spots: Spot[]
  onSave: (name: string) => void
  onLoad: (spot: Spot) => void
  onDelete: (id: string) => void
  onImport: (spots: Spot[]) => void
  /** Name suggested for a new save, usually the current venue. */
  suggestedName: string
  canSave: boolean
}

const shortDate = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10)
}

/**
 * Saved spots live in localStorage on this device and nowhere else. Export and
 * import exist so the file is yours: there is no account to lose access to and
 * no server holding a copy.
 */
export function SpotsPanel({
  spots,
  onSave,
  onLoad,
  onDelete,
  onImport,
  suggestedName,
  canSave,
}: SpotsPanelProps) {
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const save = () => {
    const trimmed = name.trim() === '' ? suggestedName.trim() : name.trim()
    if (trimmed === '') {
      setNote('Give the spot a name first.')
      return
    }
    onSave(trimmed)
    setName('')
    setNote(`Saved "${trimmed}" to this device.`)
  }

  const exportSpots = () => {
    const blob = new Blob([JSON.stringify(toFile(spots), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportFilename()
    anchor.click()
    URL.revokeObjectURL(url)
    setNote(`Exported ${spots.length} spots.`)
  }

  const importSpots = (file: File) => {
    file
      .text()
      .then((text) => {
        const result = parseSpotsFile(text)
        if (!result.ok) {
          setNote(result.reason)
          return
        }
        onImport(result.spots)
        setNote(
          `Imported ${result.spots.length} spots${result.skipped > 0 ? `, skipped ${result.skipped} unreadable` : ''}.`,
        )
      })
      .catch(() => setNote('Could not read that file.'))
  }

  return (
    <div className="spots">
      <p className="section__note">
        Saved on this device only. Nothing is uploaded and there is no account.
        Export the file if you want a copy you control.
      </p>

      <div className="field">
        <label className="field__label" htmlFor="spot-name">
          Save this setup
        </label>
        <input
          id="spot-name"
          className="input"
          type="text"
          value={name}
          placeholder={suggestedName === '' ? 'Name this spot' : suggestedName}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn--small" onClick={save} disabled={!canSave}>
          Save spot
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={exportSpots}
          disabled={spots.length === 0}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => fileInput.current?.click()}
        >
          Import JSON
        </button>
        <input
          ref={fileInput}
          className="file-picker__input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.item(0)
            if (file !== null && file !== undefined) importSpots(file)
            event.target.value = ''
          }}
        />
      </div>

      {note === null ? null : <p className="notice">{note}</p>}

      {spots.length === 0 ? (
        <p className="empty">No saved spots yet.</p>
      ) : (
        <ul className="spot-list">
          {spots.map((spot) => (
            <li className="spot" key={spot.id}>
              <button type="button" className="spot__open" onClick={() => onLoad(spot)}>
                <span className="spot__name">{spot.name}</span>
                <span className="spot__meta num">
                  {shortDate(spot.savedAt)} · {spot.positions.length} positions
                </span>
              </button>
              <button
                type="button"
                className="spot__del"
                onClick={() => onDelete(spot.id)}
                aria-label={`Delete ${spot.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
