import { useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { locateOnce, LOCATE_MESSAGE, type LocateResult } from '../lib/locateOnce.ts'

interface UseMyLocationProps {
  /** Move the map here. The caller does not store it. */
  onLocated: (at: LatLon) => void
}

/**
 * One button, one question, asked only when it is pressed.
 *
 * WHY A BUTTON AND NOT A LOAD. Asking on load means the operating system puts
 * a permission prompt in front of somebody who has not yet seen what the app
 * is, which is both rude and the reason people tap Deny by reflex. Asking when
 * the button is pressed means the question was invited.
 *
 * AND NOTHING ELSE HAPPENS IF IT IS REFUSED. No IP lookup, no "approximate
 * location" from a header, no second try. It says so once and the map stays
 * wide, with the search field right above it. See src/lib/locateOnce.ts.
 */
export function UseMyLocation({ onLocated }: UseMyLocationProps) {
  const [result, setResult] = useState<LocateResult | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = async () => {
    setBusy(true)
    /*
     * The old message goes before the new question, not after the answer. A
     * refusal still showing while the prompt is open reads as if the tap did
     * nothing.
     */
    setResult(null)
    const next = await locateOnce()
    setBusy(false)
    setResult(next)
    if (next.status === 'ok') onLocated(next.at)
  }

  return (
    <div className="locate">
      <button
        type="button"
        className="locate__btn"
        onClick={() => void ask()}
        disabled={busy}
      >
        {busy ? 'Finding you…' : 'Use my location'}
      </button>

      {/*
        * SAID ONCE. The message is state, not a toast, so it stays readable
        * instead of vanishing on a timer, and it is replaced by the next
        * attempt rather than stacking up.
        */}
      {result === null || result.status === 'ok' ? null : (
        <p className="locate__note" role="status">
          {result.status === 'error' ? result.message : LOCATE_MESSAGE[result.status]}
        </p>
      )}
    </div>
  )
}
