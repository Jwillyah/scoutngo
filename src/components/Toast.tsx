import { useEffect } from 'react'
import { dismissAfter } from '../lib/toast.ts'

/*
 * A SHORT MESSAGE THAT GOES AWAY ON ITS OWN.
 *
 * For a sentence that says what just happened and what to do about it, not
 * a state of the map: "Motion access was not allowed" once sat over the map
 * for good, a box nobody could close. A toast is one small line above the
 * dock, gone after TOAST_MS (src/lib/toast.ts) or at a tap, and it never takes the map's
 * touches except on itself.
 */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  /* A new message starts its own four seconds. */
  useEffect(() => dismissAfter(onDone), [message, onDone])
  return (
    <div className="toast" role="status">
      <button type="button" className="toast__btn" onClick={onDone} aria-label={`${message} Tap to close.`}>
        {message}
      </button>
    </div>
  )
}
