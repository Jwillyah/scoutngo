import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { rankForShoot, type PlaceKind } from '../core/geocode.ts'
import {
  DEBOUNCE_MS,
  mapboxRetrieve,
  mapboxSuggest,
  MAPBOX_ATTRIBUTION,
  MIN_QUERY_CHARS,
  newSessionToken,
  type MapboxSuggestion,
} from '../lib/mapboxSearch.ts'
import {
  BIAS_HALF_SPAN_METERS,
  fromPhoton,
  markNominatim,
  msUntilNominatim,
  OSM_ATTRIBUTION,
  searchVenues,
  type SearchHit,
} from '../lib/search.ts'

interface SearchFieldProps {
  onPick: (at: LatLon, label: string) => void
  /** Placeholder and accessible name. SETUP asks a different question. */
  label?: string
  /** Where the map is looking. Nearby matches rank first. */
  bias?: LatLon | null
}

/** Nominatim returns one long display_name. The head is the name, the tail the address. */
function splitLabel(label: string): { name: string; address: string } {
  const comma = label.indexOf(',')
  if (comma === -1) return { name: label, address: '' }
  return { name: label.slice(0, comma), address: label.slice(comma + 1).trim() }
}

export function SearchField({ onPick, label = 'Search for a venue', bias = null }: SearchFieldProps) {
  /*
   * The bias is read through a ref rather than depended on.
   *
   * It is the map centre, so it changes on every pan. As an effect dependency it
   * would re-run the search each time the user nudged the map, which is both
   * useless and rude to a free service. What matters is where the map was when
   * the query was typed, which is exactly what the ref holds.
   */
  const biasRef = useRef(bias)
  useEffect(() => {
    biasRef.current = bias
  }, [bias])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  /*
   * Mapbox answers with labels first and coordinates only on retrieve, so the
   * two providers cannot share one list shape. These are the Mapbox labels; a
   * pick turns one into a real SearchHit.
   */
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([])
  /** Which gazetteer answered, so the credit line is never a guess. */
  const [answered, setAnswered] = useState<'mapbox' | 'osm' | 'both' | null>(null)
  /*
   * One session covers a whole typed query, because Mapbox bills per session
   * rather than per request. Minted on the first keystroke of a query and
   * retired when a result is picked.
   */
  const session = useRef(newSessionToken())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Bumped by submit to force a lookup without waiting out the debounce. */
  const [submitTick, setSubmitTick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_CHARS) return

    const controller = new AbortController()

    /*
     * MAPBOX FIRST, OSM ONLY IF THERE IS NO TOKEN.
     *
     * The OSM pair is good at addresses and poor at the names people use for
     * coastal places: measured, "First Street Jetty Virginia Beach" returns
     * zero results from Nominatim. Mapbox finds it. A search that cannot find
     * the venue is a search that does not work.
     *
     * The two have different rhythms and that is the point. Mapbox debounces at
     * 300ms and feels like a map app; Nominatim's published policy is one
     * request per second, so the fallback still waits it out rather than
     * abusing a free service.
     */
    /*
     * AND PHOTON BESIDE IT. Mapbox alone did not know the Atlantic Park surf
     * park at all; its only "Atlantic Park" was a neighbourhood 3 km inland,
     * and the pin went there. Photon (OpenStreetMap) has the venue. It has no
     * published rate rule, so it runs alongside Mapbox; Nominatim still only
     * runs as the fallback, under its one-a-second clock.
     */
    const run = async () => {
      setBusy(true)
      try {
        const osmBias =
          biasRef.current === null
            ? undefined
            : { centre: biasRef.current, halfSpanMeters: BIAS_HALF_SPAN_METERS }
        const [viaMapbox, viaPhoton] = await Promise.all([
          mapboxSuggest(trimmed, session.current, biasRef.current, controller.signal),
          fromPhoton(trimmed, osmBias, controller.signal).catch(() => [] as SearchHit[]),
        ])
        if (viaMapbox.status === 'ok') {
          setSuggestions(viaMapbox.suggestions)
          setHits(viaPhoton)
          setAnswered(viaPhoton.length > 0 ? 'both' : 'mapbox')
          setOpen(true)
          return
        }
        if (viaMapbox.status === 'error') {
          // A Mapbox failure is not a dead end: fall through to the OSM pair.
        }

        const gap = msUntilNominatim()
        if (gap > 0) await new Promise((r) => window.setTimeout(r, gap))
        if (controller.signal.aborted) return
        markNominatim()
        const results = await searchVenues(
          trimmed,
          controller.signal,
          biasRef.current === null
            ? undefined
            : { centre: biasRef.current, halfSpanMeters: BIAS_HALF_SPAN_METERS },
        )
        setHits(results)
        setSuggestions([])
        setAnswered('osm')
        setOpen(true)
      } catch {
        // Aborted or offline. The dropdown just stays as it was.
      } finally {
        setBusy(false)
      }
    }

    const wait = submitTick > 0 ? 0 : DEBOUNCE_MS
    const timer = window.setTimeout(() => void run(), wait)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, submitTick])

  const clear = () => {
    setQuery('')
    setHits([])
    setSuggestions([])
    setAnswered(null)
    setOpen(false)
    input.current?.focus()
  }

  /*
   * A Mapbox pick costs one retrieve, which is also what ENDS the billing
   * session, so a fresh token is minted for whatever is typed next.
   */
  const pickSuggestion = async (suggestion: MapboxSuggestion) => {
    setBusy(true)
    const hit = await mapboxRetrieve(suggestion.id, suggestion.label, session.current)
    session.current = newSessionToken()
    setBusy(false)
    if (hit === null) return
    setOpen(false)
    onPick({ lat: hit.lat, lon: hit.lon }, hit.label)
  }

  /*
   * ONE LIST, RANKED FOR A SHOOT. Mapbox labels (coordinate on pick) and OSM
   * hits (coordinate now), venues first, areas after, roads last. An OSM hit
   * with the same name and kind as a Mapbox one is the same place twice and
   * is dropped. See rankForShoot in src/core/geocode.ts.
   */
  const entries = useMemo(() => {
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const merged: { kind: PlaceKind; key: string; label: string; pick: () => void }[] = [
      ...suggestions.map((suggestion) => ({
        kind: suggestion.kind,
        key: suggestion.id,
        label: suggestion.label,
        pick: () => {
          void pickSuggestion(suggestion)
          setQuery('')
          setSuggestions([])
          setHits([])
        },
      })),
      ...hits
        .filter(
          (hit) =>
            !suggestions.some(
              (s) => same(s.name, splitLabel(hit.label).name) && s.kind === (hit.kind ?? 'other'),
            ),
        )
        .map((hit) => ({
          kind: hit.kind ?? ('other' as const),
          key: hit.id,
          label: hit.label,
          pick: () => {
            onPick({ lat: hit.lat, lon: hit.lon }, hit.label)
            setOpen(false)
            setQuery('')
            setHits([])
            setSuggestions([])
          },
        })),
    ]
    return rankForShoot(merged, query)
    // pickSuggestion and onPick are stable enough per render; the lists are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, suggestions, query])

  return (
    <div className="search">
      <form
        className="search__bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          // Honour the keyboard's search key without waiting for the debounce.
          if (query.trim().length >= 3) setSubmitTick((tick) => tick + 1)
          input.current?.blur()
        }}
      >
        <input
          ref={input}
          className="search__input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          placeholder={label}
          aria-label={label}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            if (next.trim().length < 3) {
              setHits([])
              setOpen(false)
            }
          }}
          onFocus={() => setOpen(hits.length > 0 || suggestions.length > 0)}
        />

        {busy ? (
          <span className="search__busy" aria-hidden="true">
            …
          </span>
        ) : null}

        {query === '' ? null : (
          <button type="button" className="search__clear" onClick={clear} aria-label="Clear search">
            ✕
          </button>
        )}
      </form>

      {/*
        * `open` is only set true once a search has COMPLETED, so this does not
        * need a second condition on the result count. Gating it on hits.length
        * meant the Mapbox path, whose results live in `suggestions`, could
        * never render at all.
        */}
      {open ? (
        <ul className="search__results">
          {entries.map((entry) => {
            const { name, address } = splitLabel(entry.label)
            return (
              <li key={entry.key}>
                <button type="button" className="search__hit" onClick={entry.pick}>
                  <span className="search__name">{name}</span>
                  {address === '' ? null : <span className="search__addr">{address}</span>}
                </button>
              </li>
            )
          })}
          {hits.length === 0 && suggestions.length === 0 ? (
            <li className="search__empty">
              Nothing found. Try the place name on its own, or drop the pin by hand.
            </li>
          ) : null}
          {/* Which gazetteer actually answered. Never a guess. */}
          <li className="search__credit">
            {answered === 'mapbox'
              ? MAPBOX_ATTRIBUTION
              : answered === 'both'
                ? `${MAPBOX_ATTRIBUTION} · ${OSM_ATTRIBUTION}`
                : OSM_ATTRIBUTION}
          </li>
        </ul>
      ) : null}
    </div>
  )
}
