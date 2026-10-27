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

export function CreditsSheet({ lines, onClose }: { lines: readonly string[]; onClose: () => void }) {
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
      <ul className="credits__list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
