import '../styles/search.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { nearSpots, roundToKm, spotKind, type KnownSpot } from '../core/knownSpots.ts'
import type { LatLon } from '../core/geo.ts'
import { GROUP_TITLE, ownSpots, parseQuery, rankResults, type Group, type Result } from '../core/spotSearch.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { SURF_SPOTS, type SurfSpot } from '../data/surfSpots.ts'
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import { geocodeWords, type GeoAnswer } from '../lib/spotSearchData.ts'
import { Chip } from './ui.tsx'

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
/* Batch Map, Section 2: our own spots to search, the surf spots with their aliases first, then the cams' beaches and piers. */
const OWN: SurfSpot[] = [
  ...SURF_SPOTS,
  ...KNOWN.filter((k) => !SURF_SPOTS.some((s) => Math.abs(s.at.lat - k.at.lat) < 0.003 && Math.abs(s.at.lon - k.at.lon) < 0.003)).map((k) => ({ id: k.id, name: k.name.split(',')[0].trim(), aliases: [k.name], town: k.name.split(',')[1]?.trim() ?? '', state: k.state ?? '', at: k.at, facing: k.facing ?? 90, kind: spotKind(k.name) === 'pier' ? ('pier' as const) : ('surf' as const) })),
]
const CHIPS: readonly { id: 'all' | Group; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spot', label: 'Surf spots' },
  { id: 'beach', label: 'Beaches' },
  { id: 'town', label: 'Towns' },
]
const miles = (km: number | null) => (km === null ? '' : km < 1.6 ? 'here' : `${Math.round(km / 1.609344)} mi`)

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
  const own = useMemo(() => (searching ? ownSpots(q, from, OWN) : []), [searching, q, from])
  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    if (!searching || q.geocoderText === '') return
    const text = q.geocoderText
    const ctl = new AbortController()
    timer.current = setTimeout(() => {
      setOnline({ text, result: 'searching' })
      /* Only the typed words go out: no location, no bias (src/lib/spotSearchData.ts). */
      void geocodeWords(text, ctl.signal).then((result) => {
        if (result.status !== 'aborted') setOnline({ text, result })
      })
    }, 450)
    return () => ctl.abort()
  }, [q.geocoderText, searching])

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
  const answer = searching && online !== null && online.text === q.geocoderText ? online.result : null
  const rows = answer !== null && answer !== 'searching' && answer.status === 'ok' ? answer.rows : []
  const results: Result[] = searching ? rankResults(q, own, rows, from) : []
  const shown = results.filter((r) => chip === 'all' || r.group === chip)
  const groups = (['spot', 'beach', 'town', 'business'] as const).map((g) => ({ g, list: shown.filter((r) => r.group === g).slice(0, g === 'spot' ? 6 : 4) })).filter((x) => x.list.length > 0)
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
      <input className="spick__search" type="search" inputMode="search" placeholder="Search a beach, town or spot" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search a beach, town or spot" />
      <button type="button" className="spick__locate" onClick={() => void askLocation()}>
        Use my location once
      </button>
      {locating === null ? null : <p className="spick__note">{locating}</p>}

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
      {searching ? <p className="spick__foot">Only the words you type are sent. Results are sorted by distance on your phone. Businesses hidden unless you search for one.</p> : null}

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

function TileGlyph({ group }: { group: Group }) {
  return (
    <svg viewBox="0 0 24 24" className="spick__glyph" aria-hidden="true">
      {group === 'spot' ? <path d="M3 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M4 10c3-5 9-6 13-3-3-1-6 0-7 3" /> : group === 'beach' ? <path d="M12 4v16M5 10a7 7 0 0 1 14 0zM3 20h18" /> : group === 'town' ? <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> : <path d="M4 9h16l-1 11H5zM8 9V6a4 4 0 0 1 8 0v3" />}
    </svg>
  )
}
