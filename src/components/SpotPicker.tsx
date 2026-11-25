import '../styles/search.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { nearSpots, roundToKm } from '../core/knownSpots.ts'
import type { LatLon } from '../core/geo.ts'
import { askKey, geoAsk, GROUP_TITLE, localPool, ownSpots, parseQuery, rankResults, type Group, type Result } from '../core/spotSearch.ts'
import type { SpotIn } from '../core/bestSky.ts'
import { keptOsmSpots } from '../lib/bestSkyOsm.ts'
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import { geocodeAsk, PICKER_KNOWN as KNOWN, PICKER_SPOTS as OWN, type GeoAnswer } from '../lib/spotSearchData.ts'
import { Chip } from './ui.tsx'
import { distanceWords } from '../core/cloudLayerName.ts'

/*
 * WHERE DO YOU SHOOT? (Batch I, Section 1; board "BATCH I · first run").
 *
 * The first run, and the spot switcher at the top of Today: no map and no
 * pin. Search a town, a beach or a zip; or use the phone's location once,
 * rounded to about a kilometre before it is kept (on this phone only); then
 * the spots the app knows near there, each with the way it faces. One tap
 * and Today is that spot's.
 */
/* KNOWN (the cams, a place once) and OWN (our spots) live in src/lib/spotSearchData.ts, so the address test searches the same lists. */
const CHIPS: readonly { id: 'all' | Group; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spot', label: 'Spots' },
  { id: 'beach', label: 'Beaches' },
  { id: 'town', label: 'Towns' },
]
/* Batch SIMPLE-3, Section 3.3: in miles (the app's default), through src/core/cloudLayerName.ts; "here" within a mile. */
const miles = (km: number | null) => (km === null ? '' : km < 1.6 ? 'here' : distanceWords(km, true))

interface SpotPickerProps {
  title: string
  /** The spots kept on this phone, offered first when switching. */
  saved: readonly { id: string; name: string; at: LatLon }[]
  /** Where to look for known spots before anything is searched (the current venue), or null. */
  around: LatLon | null
  /** Words already in the search box (a test renders the picker with them). */
  initialQuery?: string
  onPick: (at: LatLon, label: string) => void
  onClose?: () => void
}

export function SpotPicker({ title, saved, around, initialQuery = '', onPick, onClose }: SpotPickerProps) {
  const [query, setQuery] = useState(initialQuery)
  /* Batch 3D, Section 2: the map's spots already kept on this phone, read once, searched by name; nothing is asked. */
  const [osm, setOsm] = useState<SpotIn[]>([])
  useEffect(() => {
    let live = true
    void keptOsmSpots().then((s) => {
      if (live) setOsm(s)
    })
    return () => {
      live = false
    }
  }, [])
  const searchBox = useRef<HTMLInputElement | null>(null)
  /* Batch SIMPLE-3, Section 0.4: a modal: Escape closes it, back to the screen it was opened over (src/lib/spotPick.ts); the first run's has no way out but a pick. */
  useEffect(() => {
    if (onClose === undefined) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  /* The geocoders' answer, kept with the words it answers: an answer to older words is not shown (E7). */
  const [online, setOnline] = useState<{ text: string; result: GeoAnswer | 'searching' } | null>(null)
  const [centre, setCentre] = useState<{ at: LatLon; label: string } | null>(around === null ? null : { at: around, label: 'here' })
  const [locating, setLocating] = useState<string | null>(null)
  const [chip, setChip] = useState<'all' | Group>('all')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Under three letters there is nothing to search: no list, derived rather than kept. */
  const searching = query.trim().length >= 3
  /* Batch Map, Section 2: the words normalised, the region a filter (src/core/spotSearch.ts). */
  const q = useMemo(() => parseQuery(query), [query])
  const from = around ?? centre?.at ?? null
  /* Batch 3D, Section 2: our spots first and on the phone: yours, the surf spots, the starter list, the map's cached spots; fuzzy, with aliases. */
  const own = useMemo(() => (searching ? ownSpots(q, from, OWN, localPool(saved, osm)) : []), [searching, q, from, saved, osm])
  /* Batch SIMPLE-1, Section 2: an address, when the words are one and nothing here matched them; the words otherwise. */
  const ownFound = own.length > 0
  const asked = useMemo(() => (searching ? geoAsk(query, ownFound) : null), [searching, query, ownFound])
  const key = asked === null ? '' : askKey(asked)
  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    if (asked === null) return
    const text = askKey(asked)
    const ctl = new AbortController()
    timer.current = setTimeout(() => {
      setOnline({ text, result: 'searching' })
      /* Only the typed words go out: no location, no bias (src/lib/spotSearchData.ts). */
      void geocodeAsk(asked, ctl.signal).then((result) => {
        if (result.status !== 'aborted') setOnline({ text, result })
      })
    }, 450)
    return () => ctl.abort()
    // `asked` is a new object on every keystroke; `key` is the question, and the same question is not asked twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

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
  const answer = searching && online !== null && online.text === key ? online.result : null
  const got = answer !== null && answer !== 'searching' && answer.status === 'ok' ? answer : null
  const results: Result[] = searching ? rankResults(q, own, got?.rows ?? [], from, got?.addresses ?? []) : []
  const shown = results.filter((r) => chip === 'all' || r.group === chip)
  const groups = (['address', 'spot', 'beach', 'town', 'place', 'business'] as const).map((g) => ({ g, list: shown.filter((r) => r.group === g).slice(0, g === 'spot' ? 6 : 4) })).filter((x) => x.list.length > 0)
  const firstRun = !searching && centre === null && saved.length === 0 && query === ''
  const stillLooking = searching && (answer === null || answer === 'searching')

  return (
    /* Batch DRONE, Section 6.6: the first run (nothing searched, saved or near): the block sits in the middle, not over an empty two-thirds. No "nearest" spots: with no location there is no nearest. */
    <div className={`spick${firstRun ? ' spick--first' : ''}`} role="dialog" aria-label={title}>
      <div className="spick__head">
        <p className="spick__title">{title}</p>
        {onClose === undefined ? null : (
          <button type="button" className="spick__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <input ref={searchBox} className="spick__search" type="search" inputMode="search" placeholder="Search a beach, town or spot" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search a beach, town or spot" />
      <button type="button" className="spick__locate" onClick={() => void askLocation()}>
        Use my location once
      </button>
      {locating === null ? null : <p className="spick__note">{locating}</p>}
      {/* Batch CORE, Section 6.5: the empty first page gets a start: a word in the search, the cursor after it for the town. */}
      {searching || centre !== null || saved.length > 0 || query !== '' ? null : (
        <div className="spick__chips spick__try" role="group" aria-label="Try">
          <span className="spick__tryword">Try</span>
          {(['Beach', 'Park', 'Lake'] as const).map((w) => (
            <Chip
              key={w}
              on={false}
              onClick={() => {
                setQuery(`${w.toLowerCase()} `)
                searchBox.current?.focus()
              }}
            >
              {w}
            </Chip>
          ))}
        </div>
      )}

      {!searching ? null : (
        <div className="spick__chips" role="group" aria-label="Show">
          {CHIPS.map((c) => (
            <Chip key={c.id} on={chip === c.id} onClick={() => setChip(c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      {groups.map(({ g, list }) => (
        <section key={g} className="spick__group" aria-label={GROUP_TITLE[g]}>
          <p className="spick__label">{GROUP_TITLE[g]}</p>
          <ul className="spick__list">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" className="spick__row" onClick={() => onPick(r.at, r.name)}>
                  <span className={`spick__tile spick__tile--${r.group}`} aria-hidden="true">
                    <TileGlyph group={r.group} />
                  </span>
                  <span className="spick__text">
                    <span className="spick__name">{r.name}</span>
                    <span className="spick__sub">{[r.where, r.note].filter((x) => x !== null && x !== '').join(' · ')}</span>
                  </span>
                  <span className="spick__far">{miles(r.km)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {stillLooking && results.length === 0 ? <p className="spick__note">Searching…</p> : null}
      {answer !== null && answer !== 'searching' && answer.status === 'failed' && results.length === 0 ? <p className="spick__note">The place search did not answer: no signal, or the service is busy.</p> : null}
      {searching && !stillLooking && results.length === 0 && (answer === null || answer === 'searching' || answer.status === 'ok') ? <p className="spick__note">Nothing found by that name.</p> : null}
      {searching ? <p className="spick__foot">Only the words you type are sent. Your own and our spots are found on your phone first. Businesses show when their name matches.</p> : null}

      {centre === null ? null : (
        <>
          <p className="spick__label">Spots near {centre.label}</p>
          <ul className="spick__list" aria-label="Spots">
            {near.map((s) => (
              <li key={s.spot.id}>
                <button type="button" className="spick__row" onClick={() => onPick(s.spot.at, s.spot.name)}>
                  <span className="spick__name">{s.spot.name}</span>
                  <span className="spick__sub">
                    {s.kind} · {miles(s.km)}
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
      <p className="spick__foot">Kept on this phone only. Forecasts are asked for the spot rounded to about 0.7 mi.</p>
    </div>
  )
}

function TileGlyph({ group }: { group: Group }) {
  return (
    <svg viewBox="0 0 24 24" className="spick__glyph" aria-hidden="true">
      {group === 'spot' ? <path d="M3 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M4 10c3-5 9-6 13-3-3-1-6 0-7 3" /> : group === 'beach' ? <path d="M12 4v16M5 10a7 7 0 0 1 14 0zM3 20h18" /> : group === 'town' || group === 'address' || group === 'place' ? <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> : <path d="M4 9h16l-1 11H5zM8 9V6a4 4 0 0 1 8 0v3" />}
    </svg>
  )
}
