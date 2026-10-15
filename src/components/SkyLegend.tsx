import { useEffect, useState } from 'react'
import {
  GOES_ATTRIBUTION,
  GOES_BAND_LABEL,
  GOES_BAND_NOTE,
  type GoesBand,
} from '../core/goes.ts'
import { thinLegend, VISIBLE_LEGEND_NOTE } from '../core/goesLegend.ts'
import { fetchGoesLegend, type ColormapResult } from '../lib/goesColormap.ts'
import type { ZoomAdvice } from '../core/goes.ts'

interface SkyLegendProps {
  band: GoesBand
  /** Whether the layer has detail at the current zoom, and what to say. */
  advice: ZoomAdvice
}

/**
 * WHAT THE COLOURS MEAN, AND WHICH BAND IS SHOWING.
 *
 * There was no key at all: purple, green, blue and white with nothing saying
 * what any of it was. The band changes with the sun, so the same colour means
 * different things at different times of day, which makes naming the band part
 * of the legend rather than a nicety.
 *
 * NOTHING HERE IS WRITTEN FROM MEMORY. The ramp and its temperatures are
 * parsed from the colour table NASA GIBS publishes for the layer, linked from
 * its own capabilities. A legend invented from recollection is a confident
 * wrong answer about somebody else's data. If the table cannot be fetched the
 * key says so and shows no ramp, because a plausible ramp is worse than none.
 *
 * The visible band has no table and GIBS publishes none, so it gets a sentence
 * about what greyscale reflectance is instead of a fabricated scale.
 */
export function SkyLegend({ band, advice }: SkyLegendProps) {
  const [table, setTable] = useState<ColormapResult | null>(null)

  useEffect(() => {
    let live = true
    void fetchGoesLegend(band).then((result) => {
      if (live) setTable(result)
    })
    return () => {
      live = false
    }
  }, [band])

  const stops = table?.status === 'ok' ? thinLegend(table.legend) : []

  return (
    <div className="skykey">
      <p className="skykey__band">
        <span className="skykey__label">{GOES_BAND_LABEL[band]}</span>
        <span className="skykey__note">{GOES_BAND_NOTE[band]}</span>
      </p>

      {/*
        * TOO CLOSE IS ITS OWN STATE, and it comes first: a key for colours
        * that are a flat wash is not the thing to read next.
        */}
      {advice.readable ? null : (
        <p className="skykey__wash">
          {advice.message}
          {advice.zoomOutTo === null ? null : (
            <span className="skykey__zoomto num"> Zoom {advice.zoomOutTo} or wider.</span>
          )}
        </p>
      )}

      {band === 'visible' ? (
        <p className="skykey__grey">{VISIBLE_LEGEND_NOTE}</p>
      ) : table === null ? (
        <p className="skykey__grey">Reading the colour table from NASA GIBS…</p>
      ) : table.status === 'ok' ? (
        <>
          <p className="skykey__title">
            {table.legend.title}
            {table.legend.units === '' ? '' : ` (${table.legend.units})`}
          </p>
          <ul className="skykey__ramp">
            {stops.map((stop) => (
              <li className="skykey__stop" key={`${stop.from}`}>
                <span
                  className="skykey__swatch"
                  style={{ background: stop.color }}
                  aria-hidden="true"
                />
                <span className="skykey__value num">{Math.round(stop.from)}</span>
              </li>
            ))}
          </ul>
          <p className="skykey__grey">
            Colder cloud tops are higher cloud. {stops.length} of{' '}
            <span className="num">{table.legend.stops.length}</span> steps shown, from the
            table NASA GIBS publishes for this layer.
          </p>
        </>
      ) : (
        /*
         * NO TABLE MEANS NO RAMP. Showing a plausible one would be worse than
         * showing none: it would be a confident claim about data this app did
         * not get to read.
         */
        <p className="skykey__grey">
          No colour key:{' '}
          {table.status === 'unavailable' ? table.reason : 'this band publishes none.'} The
          layer is still the real imagery; only the scale is missing.
        </p>
      )}

      <p className="skykey__credit">{GOES_ATTRIBUTION}</p>
    </div>
  )
}
