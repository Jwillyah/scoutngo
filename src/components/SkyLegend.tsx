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
import { FORECAST_TRUST_NOTE } from '../core/skyTime.ts'
import type { SkyState } from '../lib/useSkyFrames.ts'

interface SkyLegendProps {
  band: GoesBand
  /** Whether the layer has detail at the current zoom, and what to say. */
  advice: ZoomAdvice
  /** Which source is answering for the scrubbed moment, and how far out. */
  sky: SkyState
  /** Renders an instant in the venue's own zone. */
  clock: (at: Date) => string
  /** Where the split between observed and modelled falls. */
  boundary: string | null
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
export function SkyLegend({ band, advice, sky, clock, boundary }: SkyLegendProps) {
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
      {/*
        * WHICH SOURCE, FIRST AND UNMISTAKABLY.
        *
        * There is no satellite image of the future, so past and now get a real
        * frame and the future gets a model. They never share a caption: a
        * model result under a label that says observed is the exact failure
        * this split exists to avoid.
        */}
      {sky.source.kind === 'satellite' ? (
        <p className="skykey__src skykey__src--obs">
          <span className="skykey__badge">Satellite</span>
          <span className="skykey__srcnote">
            Frame <span className="num">{clock(sky.source.frameAt)}</span>, observed.
            {sky.source.far
              ? ` Nearest frame is ${Math.round(
                  sky.source.offsetMinutes,
                )} min from where you are scrubbing.`
              : ''}
          </span>
        </p>
      ) : (
        <p className="skykey__src skykey__src--fc">
          <span className="skykey__badge skykey__badge--fc">Forecast</span>
          <span className="skykey__srcnote">
            {sky.source.hoursAhead < 1
              ? 'Just past now, so this is a model and not a picture.'
              : `${Math.round(sky.source.hoursAhead)} h ahead. A model, not a picture.`}{' '}
            {FORECAST_TRUST_NOTE[sky.source.trust]}
          </span>
        </p>
      )}

      {boundary === null ? null : <p className="skykey__boundary">{boundary}</p>}

      {sky.forecastProblem === null ? null : (
        <p className="skykey__grey">{sky.forecastProblem}</p>
      )}

      {/*
        * The band and its colour key only describe the SATELLITE. A forecast
        * grid is white squares shaded by cover and has nothing to do with
        * brightness temperature, so showing the ramp beside it would key the
        * wrong picture.
        */}
      {sky.source.kind !== 'satellite' ? null : (
        <p className="skykey__band">
          <span className="skykey__label">{GOES_BAND_LABEL[band]}</span>
          <span className="skykey__note">{GOES_BAND_NOTE[band]}</span>
        </p>
      )}

      {/*
        * TOO CLOSE IS ITS OWN STATE, and it comes first: a key for colours
        * that are a flat wash is not the thing to read next.
        */}
      {advice.readable || sky.source.kind !== 'satellite' ? null : (
        <p className="skykey__wash">
          {advice.message}
          {advice.zoomOutTo === null ? null : (
            <span className="skykey__zoomto num"> Zoom {advice.zoomOutTo} or wider.</span>
          )}
        </p>
      )}

      {sky.source.kind !== 'satellite' ? (
        <p className="skykey__grey">
          Shaded squares are cloud cover from the Open-Meteo forecast, one cell per model
          point. Coarse and hard edged on purpose: it is a model, not a photograph.
        </p>
      ) : band === 'visible' ? (
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
