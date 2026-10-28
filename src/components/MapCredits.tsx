/*
 * THE MAP'S CREDITS: A SMALL "i" THAT OPENS A SHEET, AND NEVER OPENS BY ITSELF.
 *
 * WHAT IT REPLACED. MapLibre's own compact attribution box. It mounts open,
 * and it opens again by itself whenever the map's sources change (a new
 * layer, the venue saved for offline, a terrain switch). On 27 Oct at
 * Virginia Beach it opened huge and covered the dock. The credits are
 * required, so they stay one tap away; they are only ever shown when asked.
 *
 * The lines are the sources the map has, read when the sheet opens, and the
 * data the app draws without a map source: the 3D buildings and the sea from
 * OpenFreeMap's tiles, the trees from Overpass.
 */
import { useEffect, useRef } from 'react'

/*
 * AND WHAT IS ON THE MAP, ABOVE THE CREDITS: the long lines that used to sit
 * over the map itself (the shadow legend's "flat ground", the scan year),
 * which now say one short line there and the rest here.
 */
export function CreditsSheet({ lines, notes = [], onClose }: { lines: readonly string[]; notes?: readonly string[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => close.current?.focus(), [])
  return (
    <div className="credits" role="dialog" aria-label="Map credits">
      <div className="credits__head">
        <p className="credits__title">Map credits</p>
        <button ref={close} type="button" className="credits__close" onClick={onClose} aria-label="Close the map credits">
          ×
        </button>
      </div>
      {notes.length === 0 ? null : (
        <ul className="credits__list credits__notes" aria-label="On the map">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <ul className="credits__list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
