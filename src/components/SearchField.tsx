import { useEffect, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import {
  BIAS_HALF_SPAN_METERS,
  MIN_INTERVAL_MS,
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
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Bumped by submit to force a lookup without waiting out the debounce. */
  const [submitTick, setSubmitTick] = useState(0)
  const lastRequestAt = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3) return

    /*
     * Nominatim's usage policy caps this at one request per second. A full
     * second after the last keystroke, and never less than a second after the
     * previous request actually went out.
     */
    const sinceLast = Date.now() - lastRequestAt.current
    const wait = submitTick > 0 ? 0 : Math.max(MIN_INTERVAL_MS, MIN_INTERVAL_MS - sinceLast)

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      lastRequestAt.current = Date.now()
      setBusy(true)
      searchVenues(
        trimmed,
        controller.signal,
        biasRef.current === null
          ? undefined
          : { centre: biasRef.current, halfSpanMeters: BIAS_HALF_SPAN_METERS },
      )
        .then((results) => {
          setHits(results)
          setOpen(true)
        })
        .catch(() => {
          // Aborted or offline. The dropdown just stays as it was.
        })
        .finally(() => setBusy(false))
    }, wait)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, submitTick])

  const clear = () => {
    setQuery('')
    setHits([])
    setOpen(false)
    input.current?.focus()
  }

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
          onFocus={() => setOpen(hits.length > 0)}
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

      {open && hits.length > 0 ? (
        <ul className="search__results">
          {hits.map((hit) => {
            const { name, address } = splitLabel(hit.label)
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  className="search__hit"
                  onClick={() => {
                    onPick({ lat: hit.lat, lon: hit.lon }, hit.label)
                    setOpen(false)
                    setQuery('')
                    setHits([])
                  }}
                >
                  <span className="search__name">{name}</span>
                  {address === '' ? null : <span className="search__addr">{address}</span>}
                </button>
              </li>
            )
          })}
          <li className="search__credit">{OSM_ATTRIBUTION}</li>
        </ul>
      ) : null}
    </div>
  )
}
