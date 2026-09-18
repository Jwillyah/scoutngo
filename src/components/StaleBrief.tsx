interface StaleBriefProps {
  staleBrief: boolean
  drift: string
  onClearBrief: () => void
  onKeepBrief: () => void
}

/**
 * The brief is text about one specific place. Moving the venue does not make it
 * wrong automatically, but it does make it suspect, and only the shooter can
 * say which. So this blocks Generate until it is answered, and never edits the
 * text on its own.
 *
 * Lives in SETUP because that is where the brief is written.
 */
export function StaleBrief({ staleBrief, drift, onClearBrief, onKeepBrief }: StaleBriefProps) {
  if (!staleBrief) return null

  return (
    <div className="stale">
      <p className="stale__head">This brief may be about somewhere else</p>
      <p className="stale__body">
        The venue has moved <span className="num">{drift}</span> from where this event
        description was written. Generating now would plan the old event at the new
        place.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn--small btn--primary" onClick={onClearBrief}>
          Clear the brief
        </button>
        <button type="button" className="btn btn--small" onClick={onKeepBrief}>
          Keep it, still applies
        </button>
      </div>
    </div>
  )
}
