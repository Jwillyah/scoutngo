interface OverflowMenuProps {
  showArc: boolean
  onShowArc: (next: boolean) => void
}

/**
 * The one map option that is a preference rather than an action.
 *
 * WHAT THIS USED TO BE. "Set venue by tap" and "Set subject by tap", which
 * existed because there were two pins and both could be moved. There is one pin
 * now: it is the thing being shot, and the only other thing on the map is a
 * position, which is moved by dragging it. Nothing here offers to move
 * anything, so the modes went with the second pin.
 */
export function OverflowMenu({ showArc, onShowArc }: OverflowMenuProps) {
  return (
    <button
      type="button"
      className={`mode${showArc ? ' mode--on' : ''}`}
      aria-pressed={showArc}
      onClick={() => onShowArc(!showArc)}
    >
      Sun arc
    </button>
  )
}
