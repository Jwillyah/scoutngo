import { useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { useCoast } from '../lib/coastData.ts'

/*
 * THE ROUTINE NWS MARINE FORECAST, ONE LINE (Batch Polish 2, Section 2): on
 * the Weather page and the Surf page, off the home. "NWS marine · Tonight ›";
 * a tap opens the period's text in full, as written, over the page, so the
 * page itself still fits one screen. Nothing when the spot has no marine zone.
 */
export function MarineLine({ venue }: { venue: LatLon | null }) {
  const marine = useCoast(venue, null, 'mi', venue !== null).coast?.marine ?? null
  const [open, setOpen] = useState(false)
  if (marine === null) return null
  return (
    <>
      <button type="button" className="dmarine" aria-expanded={open} onClick={() => setOpen(true)}>
        <b>NWS marine</b> · {marine.period} ›
      </button>
      {open ? (
        <div className="dmarine__full" role="dialog" aria-label={`NWS marine forecast, ${marine.period}`}>
          <div className="dmarine__card">
            <p className="dmarine__head">
              <b>NWS marine · {marine.period}</b>
              <button type="button" className="dmarine__x" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </p>
            <p className="dmarine__text">{marine.text}</p>
            <p className="dmarine__src">{marine.zone}, as issued by the National Weather Service.</p>
          </div>
        </div>
      ) : null}
    </>
  )
}
