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
            Set venue by tap
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
            Set subject by tap
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
          <p className="overflow__hint">Long press the map to drop a pin.</p>
        </div>
      )}
    </div>
  )
}
