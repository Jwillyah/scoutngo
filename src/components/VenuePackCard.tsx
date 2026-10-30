import { useEffect, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { formatBytes } from '../lib/offlineCache.ts'
import {
  mayStart,
  measurePack,
  networkKind,
  onPacksChanged,
  packBytes,
  packFor,
  packMissing,
  packSizeLine,
  packSizeNote,
  saveVenuePack,
  savedClock,
  setWifiOnly,
  wifiOnly,
  type PackProgress,
  type PackSize,
  type VenuePack,
} from '../lib/venuePack.ts'

/*
 * SAVE FOR OFFLINE, ON THE SHOOT CARD (src/lib/venuePack.ts).
 *
 * One button, and nothing downloads until the size is on screen with a second
 * tap that names it. Wi-Fi first: when the phone says it is on cellular and
 * "Wi-Fi only" is on, the pack waits and says so; an iPhone never says which
 * network it is on, so there the button names the size and the choice is the
 * shooter's.
 */

type State =
  | { s: 'idle' }
  | { s: 'measuring' }
  | { s: 'measured'; size: PackSize }
  | { s: 'saving'; size: PackSize; progress: PackProgress | null }
  | { s: 'error'; reason: string }

interface Props {
  centre: LatLon | null
  name: string
  shootAt: Date | null
  timeZone: string | null
  online: boolean
  /** Whether a 3D scan of this patch is already on the phone. */
  hasScan?: (at: LatLon) => Promise<boolean>
}

export function VenuePackCard({ centre, name, shootAt, timeZone, online, hasScan }: Props) {
  const [pack, setPack] = useState<VenuePack | null>(() => packFor(centre))
  const [state, setState] = useState<State>({ s: 'idle' })
  const [onlyWifi, setOnlyWifi] = useState(wifiOnly)
  const abort = useRef<AbortController | null>(null)
  const lat = centre?.lat ?? null
  const lon = centre?.lon ?? null

  const [stateFor, setStateFor] = useState<string | null>(null)
  const place = lat === null || lon === null ? null : `${lat},${lon}`
  useEffect(() => onPacksChanged(() => setPack(packFor(lat === null || lon === null ? null : { lat, lon }))), [lat, lon])
  /* A new venue is a new question: whatever was measured was for the old one, and is not shown. */
  useEffect(() => () => abort.current?.abort(), [place])
  const shownPack = pack !== null && lat !== null && lon !== null && Math.abs(pack.lat - lat) < 1e-4 && Math.abs(pack.lon - lon) < 1e-4 ? pack : packFor(centre)
  const shown: State = stateFor === place ? state : { s: 'idle' }

  if (centre === null || shootAt === null || timeZone === null) return null

  const measure = async () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setStateFor(place)
    setState({ s: 'measuring' })
    const size = await measurePack(centre, controller.signal)
    if (!controller.signal.aborted) setState({ s: 'measured', size })
  }

  const save = async (size: PackSize) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setStateFor(place)
    setState({ s: 'saving', size, progress: null })
    const result = await saveVenuePack(
      { centre, name, shootAt, timeZone },
      controller.signal,
      (progress) => setState({ s: 'saving', size, progress }),
      hasScan,
    )
    if (result.status === 'ok') setState({ s: 'idle' })
    else if (result.status === 'cancelled') setState({ s: 'idle' })
    else setState({ s: 'error', reason: result.reason })
  }

  const cancel = () => {
    abort.current?.abort()
    setState({ s: 'idle' })
  }

  const kind = networkKind()
  const decision = mayStart(kind, onlyWifi)
  const missing = shownPack === null ? [] : packMissing(shownPack)

  return (
    <div className="vpack" data-pack={shownPack === null ? 'none' : 'saved'}>
      {shownPack !== null && shown.s === 'idle' ? (
        <>
          <p className="vpack__line num">
            Offline-ready · {formatBytes(packBytes(shownPack))}
          </p>
          <p className="vpack__note">
            Saved {savedClock(shownPack.savedAt)}.{' '}
            {missing.length === 0
              ? `Map, buildings, the day’s forecast, the sea and ${shownPack.data.tideDays} days of tides${shownPack.data.scan ? ', and the 3D scan' : ''}.`
              : `Not kept: ${missing.join(', ')}.`}
          </p>
          {online ? (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => void measure()}>
              Save again
            </button>
          ) : null}
        </>
      ) : null}

      {shownPack === null && shown.s === 'idle' ? (
        online ? (
          <button type="button" className="btn btn--small vpack__go" onClick={() => void measure()}>
            Save for offline
          </button>
        ) : (
          <p className="vpack__note">Save for offline needs a signal. Sun, moon and shadows work without one.</p>
        )
      ) : null}

      {shown.s === 'measuring' ? (
        <>
          <p className="vpack__note">Measuring. Nothing is downloaded yet.</p>
          <button type="button" className="btn btn--small btn--quiet" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : null}

      {shown.s === 'measured' ? (
        <>
          <p className="vpack__line num">{packSizeLine(shown.size)}</p>
          {packSizeNote(shown.size) === null ? null : <p className="vpack__note">{packSizeNote(shown.size)}</p>}
          <p className="vpack__note">The map 1.5 km round the pin in detail and 30 km round it, buildings, the day’s forecast, the sea and a week of tides.</p>
          {kind === 'unknown' ? (
            <p className="vpack__note">This phone does not say whether it is on Wi-Fi. Best saved on Wi-Fi.</p>
          ) : (
            <label className="vpack__wifi">
              <input
                type="checkbox"
                checked={onlyWifi}
                onChange={(e) => {
                  setOnlyWifi(e.target.checked)
                  setWifiOnly(e.target.checked)
                }}
              />{' '}
              Wi-Fi only
            </label>
          )}
          <div className="offl__acts">
            {shown.size.total === null || shown.size.sampled.tiles === shown.size.sampled.alreadySaved ? null : decision === 'wait' ? (
              <span className="vpack__wait">Waiting for Wi-Fi</span>
            ) : (
              <button type="button" className="btn btn--small vpack__go" onClick={() => void save(shown.size)}>
                Save {formatBytes(shown.size.total)}
              </button>
            )}
            <button type="button" className="btn btn--small btn--quiet" onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {shown.s === 'saving' ? (
        <>
          {shown.progress?.step === 'data' ? (
            <p className="vpack__note">Saving {shown.progress.what}…</p>
          ) : (
            <>
              <progress className="offl__bar" max={Math.max(1, shown.progress?.total ?? 1)} value={shown.progress?.done ?? 0} />
              <p className="vpack__note num">
                {shown.progress?.done ?? 0} of {shown.progress?.total ?? '…'} tiles · {formatBytes(shown.progress?.bytes ?? 0)}
              </p>
            </>
          )}
          <button type="button" className="btn btn--small btn--quiet" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : null}

      {shown.s === 'error' ? (
        <p className="vpack__note">
          Not saved: {shown.reason}{' '}
          <button type="button" className="offl__link" onClick={() => void measure()}>
            Try again
          </button>
        </p>
      ) : null}
    </div>
  )
}
