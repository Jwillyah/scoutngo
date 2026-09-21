import { useState } from 'react'
import type { TapMode } from './MapView.tsx'

interface OverflowMenuProps {
  mode: TapMode
  onMode: (next: TapMode) => void
  showArc: boolean
  onShowArc: (next: boolean) => void
}

/**
 * The explicit pin modes, kept for redoing one deliberately. The everyday path
 * is a long press on the map, so these do not need to sit on the map surface.
 *
 * THE SUBJECT LIVES HERE AND ONLY HERE. It used to be a second mark on the
 * SETUP map, sitting on top of the venue pin and explaining nothing. It defaults
 * to the venue, which is right for almost every shoot, and it is offered here
 * for the shoots where it is not: the pilings in the water in front of the deck,
 * the stage at the far end of the field, the boat rather than the dock.
 */
export function OverflowMenu({ mode, onMode, showArc, onShowArc }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow">
      <button
        type="button"
        className={`mode mode--icon${mode !== null ? ' mode--on' : ''}`}
        aria-expanded={open}
        aria-label="More map options"
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>

      {!open ? null : (
        <div className="overflow__menu" role="menu">
          <button
            type="button"
            className={`overflow__item${mode === 'venue' ? ' overflow__item--on' : ''}`}
            role="menuitemcheckbox"
            aria-checked={mode === 'venue'}
            onClick={() => {
              onMode(mode === 'venue' ? null : 'venue')
              setOpen(false)
            }}
          >
            Move the venue
          </button>
          <button
            type="button"
            className={`overflow__item${mode === 'subject' ? ' overflow__item--on' : ''}`}
            role="menuitemcheckbox"
            aria-checked={mode === 'subject'}
            onClick={() => {
              onMode(mode === 'subject' ? null : 'subject')
              setOpen(false)
            }}
          >
            Move the subject
          </button>
          <button
            type="button"
            className={`overflow__item${showArc ? ' overflow__item--on' : ''}`}
            role="menuitemcheckbox"
            aria-checked={showArc}
            onClick={() => {
              onShowArc(!showArc)
              setOpen(false)
            }}
          >
            Sunrise and sunset rays
          </button>
          <p className="overflow__hint">
            The subject is the venue unless you move it. Tap the map with a mode
            on, or long press it.
          </p>
        </div>
      )}
    </div>
  )
}
