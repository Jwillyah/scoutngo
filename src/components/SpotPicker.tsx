import { useEffect, useRef, useState } from 'react'
import { mergeSameSpots, nearSpots, roundToKm, sameSpot, searchKnownSpots, spotKind, type KnownSpot } from '../core/knownSpots.ts'
import type { LatLon } from '../core/geo.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import { searchPlacesUs, type PlaceSearch } from '../lib/search.ts'

/*
 * WHERE DO YOU SHOOT? (Batch I, Section 1; board "BATCH I · first run").
 *
 * The first run, and the spot switcher at the top of Today: no map and no
 * pin. Search a town, a beach or a zip; or use the phone's location once,
 * rounded to about a kilometre before it is kept (on this phone only); then
 * the spots the app knows near there, each with the way it faces. One tap
 * and Today is that spot's.
 */
const KNOWN: KnownSpot[] = COAST_CAMS.map((c) => ({ id: c.id, name: c.name, at: c.at, facing: c.facing, state: c.state }))

interface SpotPickerProps {
  title: string
  /** The spots kept on this phone, offered first when switching. */
  saved: readonly { id: string; name: string; at: LatLon }[]
  /** Where to look for known spots before anything is searched (the current venue), or null. */
  around: LatLon | null
  onPick: (at: LatLon, label: string) => void
  onClose?: () => void
}

export function SpotPicker({ title, saved, around, onPick, onClose }: SpotPickerProps) {
  const [query, setQuery] = useState('')
  /* The geocoder's answer, kept with the query it answers: an answer to an older query is not shown (E7). */
  const [online, setOnline] = useState<{ query: string; result: PlaceSearch | 'searching' } | null>(null)
  const [centre, setCentre] = useState<{ at: LatLon; label: string } | null>(around === null ? null : { at: around, label: 'here' })
  const [locating, setLocating] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Under three letters there is nothing to search: no list, derived rather than kept. */
  const searching = query.trim().length >= 3
  /* E7: the spots this app knows, by name, first: on the phone, instant, offline. */
  const known = searching ? searchKnownSpots(query, KNOWN, 4) : []
  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    if (!searching) return
    const q = query.trim()
    const ctl = new AbortController()
    timer.current = setTimeout(() => {
      setOnline({ query: q, result: 'searching' })
      /* Then any named place in the US, by the typed text alone: no location goes with it (src/lib/search.ts). */
      void searchPlacesUs(q, ctl.signal).then((result) => {
        if (result.status !== 'aborted') setOnline({ query: q, result })
      })
    }, 450)
    return () => ctl.abort()
  }, [query, searching])

  const askLocation = async () => {
    setLocating('Asking the phone once…')
    const r = await locateOnce()
    if (r.status !== 'ok') {
      setLocating(locateWords(r))
      return
    }
    setLocating(null)
    setCentre({ at: roundToKm(r.at), label: 'your location' })
  }

  const near = centre === null ? [] : nearSpots(centre.at, KNOWN)
  const answer = searching && online !== null && online.query === query.trim() ? online.result : null
  /* A place the geocoder found that is one of the known spots above is not a second row. */
  const places =
    answer !== null && answer !== 'searching' && answer.status === 'ok'
      ? mergeSameSpots(answer.hits.map((h) => ({ ...h, name: h.label.split(',')[0], at: { lat: h.lat, lon: h.lon } }))).filter((h) => !known.some((k) => sameSpot(k, h)))
      : []
  const stillLooking = searching && (answer === null || answer === 'searching')

  return (
    <div className="spick" role="dialog" aria-label={title}>
      <div className="spick__head">
        <p className="spick__title">{title}</p>
        {onClose === undefined ? null : (
          <button type="button" className="spick__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <input className="spick__search" type="search" inputMode="search" placeholder="Town, beach or zip" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Town, beach or zip" />
      <button type="button" className="spick__locate" onClick={() => void askLocation()}>
        Use my location once
      </button>
      {locating === null ? null : <p className="spick__note">{locating}</p>}

      {known.length === 0 ? null : (
        <ul className="spick__list" aria-label="Known spots">
          {known.map((s) => (
            <li key={s.id}>
              <button type="button" className="spick__row" onClick={() => onPick(s.at, s.name)}>
                <span className="spick__name">{s.name}</span>
                <span className="spick__sub">
                  {spotKind(s.name)}
                  {s.state === undefined ? '' : ` · ${s.state}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {stillLooking && known.length === 0 ? <p className="spick__note">Searching…</p> : null}
      {answer !== null && answer !== 'searching' && answer.status === 'failed' && known.length === 0 ? (
        <p className="spick__note">The place search did not answer: no signal, or the service is busy.</p>
      ) : null}
      {answer !== null && answer !== 'searching' && answer.status === 'ok' && places.length === 0 && known.length === 0 ? (
        <p className="spick__note">Nothing found by that name.</p>
      ) : null}
      {places.length > 0 ? (
        <ul className="spick__list" aria-label="Places">
          {places.slice(0, 4).map((h) => (
            <li key={h.id}>
              <button type="button" className="spick__row" onClick={() => setCentre({ at: { lat: h.lat, lon: h.lon }, label: h.label.split(',')[0] })}>
                <span className="spick__name">{h.label.split(',')[0]}</span>
                <span className="spick__sub">{h.label.split(',').slice(1, 3).join(',').trim()}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {centre === null ? null : (
        <>
          <p className="spick__label">Spots near {centre.label}</p>
          <ul className="spick__list" aria-label="Spots">
            {near.map((s) => (
              <li key={s.spot.id}>
                <button type="button" className="spick__row" onClick={() => onPick(s.spot.at, s.spot.name)}>
                  <span className="spick__name">{s.spot.name}</span>
                  <span className="spick__sub">
                    {s.kind} · {s.km < 1 ? 'here' : `${Math.round(s.km * 0.621)} mi`}
                    {s.facingWord === null ? '' : ` · ${s.facingWord}`}
                  </span>
                </button>
              </li>
            ))}
            {centre.label === 'here' ? null : (
              <li>
                <button type="button" className="spick__row" onClick={() => onPick(centre.at, centre.label === 'your location' ? 'Near you' : centre.label)}>
                  <span className="spick__name">{centre.label === 'your location' ? 'Right here' : centre.label}</span>
                  <span className="spick__sub">{near.length === 0 ? 'no known spots within 25 mi' : 'the place itself'}</span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      {saved.length === 0 ? null : (
        <>
          <p className="spick__label">Your spots</p>
          <ul className="spick__list" aria-label="Your spots">
            {saved.slice(0, 5).map((s) => (
              <li key={s.id}>
                <button type="button" className="spick__row" onClick={() => onPick(s.at, s.name)}>
                  <span className="spick__name">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="spick__foot">Kept on this phone only. Forecasts are asked for the spot rounded to about a kilometre.</p>
    </div>
  )
}
