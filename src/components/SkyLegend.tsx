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
import {
  gridExtentLine,
  hasSatellite,
  SKY_LAYERS,
  SKY_LAYER_LABEL,
  WIND_BAND_LABEL,
  type SkyLayerKind,
} from '../core/skyLayer.ts'
import { windHeightLabel, type WindHeight } from '../core/windHeight.ts'

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
  /** Takes the map out to where the layer has something to show. */
  onZoomOut: (zoom: number) => void
  /** Which measure the layer paints, and the picker that changes it. */
  layer: SkyLayerKind
  onLayer: (next: SkyLayerKind) => void
  /** The height the wind layer reads at, and what it is measured against. */
  windHeight: WindHeight
  ratedWindMps: number | null
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
export function SkyLegend({
  band,
  advice,
  sky,
  clock,
  boundary,
  onZoomOut,
  layer,
  onLayer,
  windHeight,
  ratedWindMps,
}: SkyLegendProps) {
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

  /*
   * TOO CLOSE IS NOT A FOOTNOTE, IT IS THE WHOLE ANSWER.
   *
   * WHAT WAS REPORTED. "At venue zoom I turn it on and see no change and no
   * explanation." The explanation was there. Measured in the browser at the
   * venue zoom the app itself opens on:
   *
   *   .skykey rendered   true
   *   .skykey__wash      "Too close for the sky layer: one visible pixel
   *                       covers 2 screens. Zoom out to see cloud. Zoom 13 or
   *                       wider."
   *   skykey rect        top 430, 272x298, visible, opacity 1
   *
   * It was the FIFTH block in a 298px panel, under the source badge, the
   * boundary note, the band name and a sentence about what the band is. The
   * comment above it said "it comes first"; it did not. And the map behind it
   * showed nothing at all, which is what "nothing happened" looks like.
   *
   * So when the layer has nothing to show, this panel is ONLY that: the
   * reason, and a button that fixes it. A colour key for a flat wash is not
   * the next thing to read, and the band name is not either. Everything else
   * comes back the moment the layer is readable.
   */
  /*
   * THE ZOOM WARNING IS ABOUT THE SATELLITE PIXEL, so it only applies to the
   * layer that has one. The wind grid is 25 model points whatever the zoom is:
   * too close for it means too close to see the whole square, which the extent
   * line says instead.
   */
  if (!advice.readable && sky.source.kind === 'satellite' && hasSatellite(layer)) {
    return (
      <div className="skykey skykey--wash">
      {/*
        * ONE PICKER, IN THE SAME PLACE, for everything this layer can show.
        * Cloud decides whether there is light; wind decides whether the
        * aircraft leaves the bag. See src/core/skyLayer.ts for why those two
        * and not a longer list.
        */}
      <div className="skykey__pick" role="group" aria-label="What the sky layer shows">
        {SKY_LAYERS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`skykey__pick-btn${layer === kind ? ' skykey__pick-btn--on' : ''}`}
            aria-pressed={layer === kind}
            onClick={() => onLayer(kind)}
          >
            {SKY_LAYER_LABEL[kind]}
          </button>
        ))}
      </div>

        <p className="skykey__washhead">Nothing to show at this zoom</p>
        <p className="skykey__wash">{advice.message}</p>
        {advice.zoomOutTo === null ? null : (
          <button
            type="button"
            className="skykey__zoomout"
            onClick={() => onZoomOut(advice.zoomOutTo as number)}
          >
            Zoom out to <span className="num">{advice.zoomOutTo}</span>
          </button>
        )}
      </div>
    )
  }

  /*
   * WIND HAS NO PHOTOGRAPH, EVER. Not for the future and not for an hour that
   * has already happened: there is no satellite image of wind at 200 feet. So
   * the wind layer never borrows the word "observed" from the layer beside it,
   * and it says what height it is for, because a wind speed with no height is
   * meaningless.
   */
  if (layer === 'wind') {
    return (
      <div className="skykey">
      {/*
        * ONE PICKER, IN THE SAME PLACE, for everything this layer can show.
        * Cloud decides whether there is light; wind decides whether the
        * aircraft leaves the bag. See src/core/skyLayer.ts for why those two
        * and not a longer list.
        */}
      <div className="skykey__pick" role="group" aria-label="What the sky layer shows">
        {SKY_LAYERS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`skykey__pick-btn${layer === kind ? ' skykey__pick-btn--on' : ''}`}
            aria-pressed={layer === kind}
            onClick={() => onLayer(kind)}
          >
            {SKY_LAYER_LABEL[kind]}
          </button>
        ))}
      </div>

        <p className="skykey__src skykey__src--fc">
          <span className="skykey__badge skykey__badge--fc">Forecast</span>
          <span className="skykey__srcnote">
            Wind {windHeightLabel(windHeight)}, from the Open-Meteo model. There is no
            satellite picture of wind, so every hour of this is modelled, including the
            ones already past.
          </span>
        </p>

        {/*
          * WHY THERE IS NOTHING ON THE MAP, when there is nothing on the map.
          *
          * This was missing and it cost a long diagnosis: the grid came back
          * unavailable, the layer drew nothing, and the key carried on
          * describing bands that were not there. A layer that is empty for a
          * reason has to say the reason, or it is indistinguishable from a
          * layer that does not work. The cloud branch below always did this;
          * the wind branch was written without it.
          */}
        {sky.forecastProblem === null ? null : (
          <p className="skykey__grey">{sky.forecastProblem}</p>
        )}

        <ul className="skykey__ramp">
          {(['calm', 'workable', 'near-limit', 'over'] as const).map((band) => (
            <li className="skykey__stop" key={band}>
              <span className={`skykey__swatch skykey__swatch--${band}`} aria-hidden="true" />
              <span className="skykey__value">{WIND_BAND_LABEL[band]}</span>
            </li>
          ))}
        </ul>

        <p className="skykey__grey">
          {ratedWindMps === null
            ? 'No aircraft in the kit publishes a wind rating, so the cells are shaded by speed alone and the bands above do not apply. An invented limit is something somebody could fly on.'
            : `Measured against ${ratedWindMps} m/s, the published rating of the most limiting aircraft you have packed.`}
        </p>

        <p className="skykey__grey">{gridExtentLine()}</p>
      </div>
    )
  }

  return (
    <div className="skykey">
      {/*
        * ONE PICKER, IN THE SAME PLACE, for everything this layer can show.
        * Cloud decides whether there is light; wind decides whether the
        * aircraft leaves the bag. See src/core/skyLayer.ts for why those two
        * and not a longer list.
        */}
      <div className="skykey__pick" role="group" aria-label="What the sky layer shows">
        {SKY_LAYERS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`skykey__pick-btn${layer === kind ? ' skykey__pick-btn--on' : ''}`}
            aria-pressed={layer === kind}
            onClick={() => onLayer(kind)}
          >
            {SKY_LAYER_LABEL[kind]}
          </button>
        ))}
      </div>

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

      {sky.source.kind !== 'satellite' ? (
        <>
          <p className="skykey__grey">
            Shaded squares are cloud cover from the Open-Meteo forecast, one cell per model
            point. Coarse and hard edged on purpose: it is a model, not a photograph.
          </p>
          {/*
            * HOW BIG THE SQUARE IS. "At 50 mi the forecast cells cover a small
            * square around the venue with nothing around it, which reads as
            * broken." It is not broken; it was simply never told.
            */}
          <p className="skykey__grey">{gridExtentLine()}</p>
        </>
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
