import { useEffect, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { MIN_INTERVAL_MS, OSM_ATTRIBUTION, searchVenues, type SearchHit } from '../lib/search.ts'

interface SearchFieldProps {
  onPick: (at: LatLon, label: string) => void
}

export function SearchField({ onPick }: SearchFieldProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastRequestAt = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    // Clearing is handled by the change handler that caused it, not here.
    if (trimmed.length < 3) return

    /*
     * Nominatim's usage policy caps this at one request per second. The wait is
     * a full second from the last keystroke, and never less than a second after
     * the previous request actually went out.
     */
    const sinceLast = Date.now() - lastRequestAt.current
    const wait = Math.max(MIN_INTERVAL_MS, MIN_INTERVAL_MS - sinceLast)

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      lastRequestAt.current = Date.now()
      setBusy(true)
      searchVenues(trimmed, controller.signal)
        .then((results) => {
          setHits(results)
          setOpen(true)
        })
        .catch(() => {
          // Aborted or offline. The field just shows nothing.
        })
        .finally(() => setBusy(false))
    }, wait)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <div className="search">
      <input
        className="search__input"
        type="search"
        value={query}
        placeholder="Search for a venue"
        aria-label="Search for a venue"
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
      {busy ? <span className="search__busy">…</span> : null}

      {open && hits.length > 0 ? (
        <ul className="search__results">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="search__hit"
                onClick={() => {
                  onPick({ lat: hit.lat, lon: hit.lon }, hit.label)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {hit.label}
              </button>
            </li>
          ))}
          <li className="search__credit">{OSM_ATTRIBUTION}</li>
        </ul>
      ) : null}
    </div>
  )
}
