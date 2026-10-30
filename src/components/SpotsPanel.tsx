import { useRef, useState } from 'react'
import { OnThisDevice } from './OnThisDevice.tsx'
import { buildScoutFile, readScoutFile, saveScoutFile, scoutFilename } from '../lib/scoutFile.ts'
import { shareLink } from '../lib/planShare.ts'
import {
  type Spot,
} from '../lib/spots.ts'
import { deletePack, onPacksChanged, packBytes, packFor } from '../lib/venuePack.ts'
import { formatBytes } from '../lib/offlineCache.ts'
import { useEffect } from 'react'

interface SpotsPanelProps {
  spots: Spot[]
  onSave: (name: string) => void
  onLoad: (spot: Spot) => void
  onDelete: (id: string) => void
  onImport: (spots: Spot[]) => void
  /** Name suggested for a new save, usually the current venue. */
  suggestedName: string
  canSave: boolean
  /** The plan on screen now, as a spot, for the file and the link. Null with no venue yet. */
  currentPlan: () => Spot | null
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
  currentPlan,
}: SpotsPanelProps) {
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /* Offline-ready venues, read again whenever a pack is saved or deleted. */
  const [, setPackTick] = useState(0)
  /* Two taps, the second naming the size: a deleted pack comes back only by downloading it again. */
  const [confirmPack, setConfirmPack] = useState<string | null>(null)
  useEffect(() => onPacksChanged(() => setPackTick((n) => n + 1)), [])
  const packOf = (spot: Spot) => {
    const lat = Number(spot.venue.latitude)
    const lon = Number(spot.venue.longitude)
    return Number.isFinite(lat) && Number.isFinite(lon) ? packFor({ lat, lon }) : null
  }

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

  /*
   * THE SAME FILE AS THE BACKUP, CARRYING ONLY SPOTS. One format: the reader
   * in src/lib/scoutFile.ts takes this, a full backup, and the older spots-only
   * files alike. This is also what a plan shared as a file will be.
   */
  const exportSpots = () => {
    saveScoutFile(buildScoutFile({ spots }), scoutFilename('spots'))
    setNote(`Exported ${spots.length} spots.`)
  }

  /* THE PLAN ON SCREEN, as a file and as a link. One format: a ScoutNGo file. */
  const savePlanFile = () => {
    const plan = currentPlan()
    if (plan === null) return
    saveScoutFile(buildScoutFile({ plan }), scoutFilename('plan'))
    setNote(`Saved "${plan.name}" as a file.`)
  }

  /*
   * THE LINK CARRIES THE PLAN AFTER THE #, which no request ever includes:
   * whoever opens it fetches the app and nothing about the shoot reaches a
   * server. Sent only when the shooter taps this, to whoever they pick.
   */
  const sharePlan = async () => {
    const plan = currentPlan()
    if (plan === null) return
    const link = await shareLink(window.location.href, plan)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: plan.name, url: link })
        setNote('Shared.')
        return
      }
      await navigator.clipboard.writeText(link)
      setNote('Link copied. The plan is inside the link itself; no server holds it.')
    } catch {
      setNote('Not shared.')
    }
  }

  const importSpots = (file: File) => {
    file
      .text()
      .then((text) => {
        const result = readScoutFile(text)
        if (!result.ok) {
          setNote(result.reason)
          return
        }
        if (result.file.plan !== null) {
          onLoad(result.file.plan)
          setNote(`Opened the plan "${result.file.plan.name}".`)
          return
        }
        if (result.file.spots.length === 0) {
          setNote('That file has no spots. A kit or units in it import from About, under Backup.')
          return
        }
        onImport(result.file.spots)
        const extra =
          result.file.kit !== null || result.file.units !== null
            ? ' Its kit and units were left alone; import those from About, under Backup.'
            : ''
        setNote(
          `Imported ${result.file.spots.length} spots${result.file.skippedSpots > 0 ? `, skipped ${result.file.skippedSpots} unreadable` : ''}.${extra}`,
        )
      })
      .catch(() => setNote('Could not read that file.'))
  }

  return (
    <div className="spots">
      <OnThisDevice what="saved spots" />

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
        <button type="button" className="btn btn--small btn--primary" onClick={save} disabled={!canSave}>
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

      <div className="field">
        <p className="field__label">This plan</p>
        <div className="btn-row">
          <button type="button" className="btn btn--small" onClick={savePlanFile} disabled={!canSave}>
            Save plan to a file
          </button>
          <button type="button" className="btn btn--small" onClick={() => void sharePlan()} disabled={!canSave}>
            Share plan link
          </button>
        </div>
        <p className="field__hint">A plan file opens with Import JSON.</p>
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
                {(() => {
                  const pack = packOf(spot)
                  return pack === null ? null : (
                    <span className="spot__offline num">Offline-ready · {formatBytes(packBytes(pack))}</span>
                  )
                })()}
              </button>
              {packOf(spot) === null ? null : (
                <button
                  type="button"
                  className={`btn btn--small spot__unpack${confirmPack === spot.id ? '' : ' btn--quiet'}`}
                  onClick={() => {
                    const pack = packOf(spot)
                    if (pack === null) return
                    if (confirmPack !== spot.id) {
                      setConfirmPack(spot.id)
                      return
                    }
                    setConfirmPack(null)
                    void deletePack(pack.id).then(() => setNote(`Offline copy of "${spot.name}" deleted. The spot is kept.`))
                  }}
                >
                  {confirmPack === spot.id ? `Delete ${formatBytes(packBytes(packOf(spot) as NonNullable<ReturnType<typeof packOf>>))}` : 'Delete offline copy'}
                </button>
              )}
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
