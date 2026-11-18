import { ESRI_ATTRIBUTION } from '../lib/mapConstants.ts'
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { AirspaceAtPoint } from '../core/airspaceCard.ts'
import { LAANC_URL, openingLayers, sheetSummary, type AirspaceRead, type AirToggle } from '../core/droneAirRead.ts'
import { AIR_FOOT, AIR_SHEET } from '../core/safetyWords.ts'
import { GOES_MAX_TILE_ZOOM } from '../core/goes.ts'
import { atMarker, liveCollection, markerChips, type FaaArea, type FaaLayerId, type FaaLayers } from '../core/faaLive.ts'
import { tfrLine, tfrRead } from '../core/tfrLine.ts'
import type { LatLon } from '../core/geo.ts'
import { formatDayTime } from '../core/timezone.ts'
import { loadAirspaceOverlay, type AirspaceOverlay } from '../lib/airspaceOverlay.ts'
import { faaLayer, type LayerAnswer } from '../lib/faaLiveData.ts'
import { goesTileUrl } from '../lib/goesLayer.ts'
import { loadTile, PROTOCOL, viaProtocol } from '../lib/offlineCache.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from '../lib/offlineSources.ts'
import { searchVenues, type SearchHit } from '../lib/search.ts'
import { readToken } from '../lib/tokens.ts'
import { fetchRainMaps, frameFor, RAIN_MAX_ZOOM, RAIN_PROTOCOL, rainMaskProtocol, rainTileUrl } from '../lib/worldRain.ts'

/*
 * THE DRONE PAGE'S AIRSPACE TAB (Batch DRONE, Section 2.3; boards Drone_P3,
 * Drone_Layers). Map first: the search "Where do you want to fly?", the FAA
 * layers, a marker (tap the map to move it) and a sheet that says what is
 * over the marker, in facts.
 *
 *   baked     class airspace, the facility map grid with its heights,
 *             restricted and prohibited areas, national parks: in the app,
 *             nothing sent (src/lib/airspaceOverlay.ts)
 *   fetched   TFRs, national security UAS restrictions, FRIAs, heliports,
 *             warning, alert and military operations areas: whole national
 *             datasets, no place in the request, kept on the phone with
 *             their date (src/lib/faaLiveData.ts)
 *
 * NEVER LAANC, NEVER "CLEAR". The app does not issue LAANC: "Get LAANC in an
 * FAA app ›" opens the FAA's page of approved apps. The sheet says what is
 * there and where it came from; it never says a place is open or safe.
 *
 * One finger on the map pans it and a tap moves the marker (docs/gestures.md,
 * the 2D map). The map never tilts by hand; 3D tilts it from the layers sheet.
 */

/* MapView registers these too; the Drone page can open first, so here as well (the same handlers). */
maplibregl.addProtocol(PROTOCOL, loadTile)
maplibregl.addProtocol(RAIN_PROTOCOL, rainMaskProtocol)

const CHART_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
/* v2 (Batch FIX, Section 6.4): the slimmer defaults; v1 kept every layer on. */
const PREFS_KEY = 'scoutngo.droneMap.v2'

export type BaseMap = 'chart' | 'satellite' | '3d'
export type WeatherLayer = 'wind' | 'gusts' | 'clouds' | 'radar'
/** The sheet's toggles (board Drone_Layers). */
export type ToggleKey = AirToggle

const TOGGLES: readonly { key: ToggleKey; name: string; line: string; swatch: string }[] = [
  { key: 'grid', name: 'LAANC grids', line: 'Max height per square, from the FAA', swatch: 'grid' },
  { key: 'nofly', name: 'No-fly and security', line: 'Restricted, prohibited, national security', swatch: 'nofly' },
  { key: 'tfr', name: 'TFRs today', line: 'Temporary closures: events, VIPs, fires', swatch: 'tfr' },
  { key: 'sua', name: 'Special use', line: 'Military warning, alert and operations areas', swatch: 'sua' },
  { key: 'parks', name: 'National parks', line: 'National Park Service land (no state or city parks)', swatch: 'parks' },
  { key: 'fria', name: 'FRIAs', line: 'Fly without a Remote ID broadcast inside', swatch: 'fria' },
  { key: 'heliport', name: 'Heliports', line: 'Low helicopters, from the FAA’s airport data', swatch: 'heliport' },
]

interface Prefs {
  base: BaseMap
  on: Record<ToggleKey, boolean>
  weather: WeatherLayer | null
}

/* The grid, no-fly and TFRs drawn; no-fly and TFRs on at every opening (src/core/droneAirRead.ts openingLayers). */
const DEFAULT_PREFS: Prefs = { base: 'chart', on: openingLayers(null), weather: null }

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    if (raw === null) return DEFAULT_PREFS
    return {
      base: raw.base === 'satellite' || raw.base === '3d' ? raw.base : 'chart',
      on: openingLayers(raw.on ?? null),
      weather: raw.weather === 'wind' || raw.weather === 'gusts' || raw.weather === 'clouds' || raw.weather === 'radar' ? raw.weather : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const LIVE_IDS: readonly FaaLayerId[] = ['tfr', 'nsufr', 'fria', 'heliport', 'sua']

interface DroneAirspaceProps {
  /** The spot the page opened on: ◎ brings the marker back to it. */
  spot: LatLon
  /** The page's point (Batch FIX, Section 6.1): the marker is it, and moving the marker moves the page. */
  marker: LatLon
  onMarker: (at: LatLon, name: string | null) => void
  /** The page's one airspace lookup for that point, and its read (src/core/droneAirRead.ts); null while reading. */
  here: AirspaceAtPoint | null
  read: AirspaceRead | null
  timeZone: string
  now: Date
  online: boolean
  todayIso: string
  /** "15 kt NNW at 400 ft" and "gusts 22 kt", for the Wind and Gusts weather chips. */
  windWords: string | null
  gustWords: string | null
  sunsetWords: string | null
  /** Saves the marker as a spot on this phone. */
  onSaveSpot?: (at: LatLon, name: string) => void
}

export function DroneAirspace({ spot, marker: markerAt, onMarker, here, read, timeZone, now, online, todayIso, windWords, gustWords, sunsetWords, onSaveSpot }: DroneAirspaceProps) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const pin = useRef<maplibregl.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [prefs, setPrefsRaw] = useState<Prefs>(readPrefs)
  const setPrefs = (p: Prefs) => {
    setPrefsRaw(p)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {
      /* kept for this visit only */
    }
  }
  const marker = { at: markerAt }
  const [named, setNamed] = useState<string | null>(null)
  /* The map's click handler is bound once: it calls the page's latest onMarker through this. */
  const onMarkerRef = useRef(onMarker)
  onMarkerRef.current = onMarker
  const setMarker = ({ at, name }: { at: LatLon; name: string | null }) => {
    setNamed(name)
    onMarkerRef.current(at, name)
  }
  const [layersOpen, setLayersOpen] = useState(false)
  /* Collapsed to two lines at first (board Drone_Slim_3); swipe up, or the handle, for the details. */
  const [compact, setCompact] = useState(true)
  const swipe = useRef<number | null>(null)
  const [overlay, setOverlay] = useState<AirspaceOverlay | null>(null)
  const [live, setLive] = useState<Partial<Record<FaaLayerId, LayerAnswer<unknown>>>>({})
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | 'searching' | 'none' | null>(null)
  const [saved, setSaved] = useState(false)

  /* The baked overlay, and the FAA's fetched layers, once. */
  useEffect(() => {
    let alive = true
    void loadAirspaceOverlay().then((o) => alive && setOverlay(() => o), () => undefined)
    for (const id of LIVE_IDS) void faaLayer(id, online).then((a) => alive && setLive((l) => ({ ...l, [id]: a })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* The map, built once. */
  useEffect(() => {
    if (box.current === null) return
    const el = box.current
    const tone = (name: string, fallback: string) => readToken(name, fallback, el)
    const m = new maplibregl.Map({
      container: el,
      center: [markerAt.lon, markerAt.lat],
      zoom: 12,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          chart: { type: 'raster', tiles: [CHART_TILES], tileSize: 256, maxzoom: 16, attribution: 'Powered by Esri. Esri, HERE, Garmin, © OpenStreetMap contributors' },
          sat: { type: 'raster', tiles: [viaProtocol(IMAGERY_TEMPLATE)], tileSize: 256, maxzoom: 19, attribution: ESRI_ATTRIBUTION },
          dem: { type: 'raster-dem', tiles: [viaProtocol(TERRAIN_TEMPLATE)], tileSize: 256, maxzoom: 15, encoding: 'terrarium' },
          baked: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          live: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': tone('--d-night-mid', '#131c46') } },
          { id: 'chart', type: 'raster', source: 'chart' },
          { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
          { id: 'cell-fill', type: 'fill', source: 'baked', filter: ['==', ['get', 'kind'], 'cell'], paint: { 'fill-color': tone('--d-drone', '#f4b259'), 'fill-opacity': ['interpolate', ['linear'], ['get', 'feet'], 0, 0.4, 400, 0.08] } },
          { id: 'cell-line', type: 'line', source: 'baked', filter: ['==', ['get', 'kind'], 'cell'], paint: { 'line-color': tone('--d-drone', '#f4b259'), 'line-width': 0.75, 'line-opacity': 0.6 } },
          { id: 'class-line', type: 'line', source: 'baked', filter: ['all', ['==', ['get', 'kind'], 'class'], ['==', ['get', 'draw'], 'line']], paint: { 'line-color': tone('--d-drone', '#f4b259'), 'line-width': 2.5 } },
          { id: 'closed-fill', type: 'fill', source: 'baked', filter: ['all', ['==', ['get', 'kind'], 'restricted'], ['==', ['get', 'draw'], 'fill']], paint: { 'fill-color': tone('--hazard', '#ff3b30'), 'fill-opacity': 0.18 } },
          { id: 'closed-line', type: 'line', source: 'baked', filter: ['all', ['==', ['get', 'kind'], 'restricted'], ['==', ['get', 'draw'], 'line']], paint: { 'line-color': tone('--hazard', '#ff3b30'), 'line-width': 2 } },
          { id: 'park-fill', type: 'fill', source: 'baked', filter: ['all', ['==', ['get', 'kind'], 'park'], ['==', ['get', 'draw'], 'fill']], paint: { 'fill-color': tone('--d-surf', '#5fe0c8'), 'fill-opacity': 0.15 } },
          { id: 'park-line', type: 'line', source: 'baked', filter: ['all', ['==', ['get', 'kind'], 'park'], ['==', ['get', 'draw'], 'line']], paint: { 'line-color': tone('--d-surf', '#5fe0c8'), 'line-width': 1.5 } },
          { id: 'sua-line', type: 'line', source: 'live', filter: ['==', ['get', 'kind'], 'sua'], paint: { 'line-color': tone('--d-tide', '#9ec9ff'), 'line-width': 1.5, 'line-dasharray': [3, 2] } },
          { id: 'fria-fill', type: 'fill', source: 'live', filter: ['==', ['get', 'kind'], 'fria'], paint: { 'fill-color': tone('--light-front', '#5fb98a'), 'fill-opacity': 0.3 } },
          { id: 'nsufr-fill', type: 'fill', source: 'live', filter: ['==', ['get', 'kind'], 'nsufr'], paint: { 'fill-color': tone('--hazard', '#ff3b30'), 'fill-opacity': 0.25 } },
          { id: 'nsufr-line', type: 'line', source: 'live', filter: ['==', ['get', 'kind'], 'nsufr'], paint: { 'line-color': tone('--hazard', '#ff3b30'), 'line-width': 1.5 } },
          { id: 'tfr-fill', type: 'fill', source: 'live', filter: ['==', ['get', 'kind'], 'tfr'], paint: { 'fill-color': tone('--moon', '#c4b5fd'), 'fill-opacity': 0.25 } },
          { id: 'tfr-line', type: 'line', source: 'live', filter: ['==', ['get', 'kind'], 'tfr'], paint: { 'line-color': tone('--moon', '#c4b5fd'), 'line-width': 2 } },
          { id: 'heli', type: 'circle', source: 'live', filter: ['==', ['get', 'kind'], 'heliport'], paint: { 'circle-radius': 6, 'circle-color': tone('--white', '#ffffff'), 'circle-stroke-color': tone('--sky-ink', '#141821'), 'circle-stroke-width': 2 } },
        ],
      },
    })
    m.touchZoomRotate.disableRotation()
    const dot = document.createElement('div')
    dot.className = 'drp__pin'
    dot.setAttribute('aria-hidden', 'true')
    pin.current = new maplibregl.Marker({ element: dot }).setLngLat([markerAt.lon, markerAt.lat]).addTo(m)
    m.on('click', (e) => setMarker({ at: { lat: e.lngLat.lat, lon: e.lngLat.lng }, name: null }))
    m.on('load', () => setReady(true))
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* The marker follows the state. */
  useEffect(() => {
    pin.current?.setLngLat([marker.at.lon, marker.at.lat])
  }, [marker.at.lat, marker.at.lon])

  /* The base map: chart, satellite, or satellite tilted over the ground's relief. */
  useEffect(() => {
    const m = map.current
    if (m === null || !ready) return
    m.setLayoutProperty('chart', 'visibility', prefs.base === 'chart' ? 'visible' : 'none')
    m.setLayoutProperty('sat', 'visibility', prefs.base === 'chart' ? 'none' : 'visible')
    if (prefs.base === '3d') {
      m.setTerrain({ source: 'dem', exaggeration: 1.3 })
      m.easeTo({ pitch: 60, duration: 300 })
    } else {
      m.setTerrain(null)
      m.easeTo({ pitch: 0, duration: 300 })
    }
  }, [prefs.base, ready])

  /* The weather layer: clouds from GOES, rain from LibreWXR; wind and gusts are words at the marker. */
  useEffect(() => {
    const m = map.current
    if (m === null || !ready) return
    let alive = true
    const clear = () => {
      if (m.getLayer('wx') !== undefined) m.removeLayer('wx')
      if (m.getSource('wx') !== undefined) m.removeSource('wx')
    }
    clear()
    const add = (tiles: string, maxzoom: number) => {
      if (!alive || map.current !== m) return
      clear()
      m.addSource('wx', { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom })
      m.addLayer({ id: 'wx', type: 'raster', source: 'wx', paint: { 'raster-opacity': 0.7 } }, 'cell-fill')
    }
    /* Infrared: cloud by day and by night (the visible band is black after dark). */
    if (prefs.weather === 'clouds') add(goesTileUrl('infrared'), GOES_MAX_TILE_ZOOM.infrared)
    if (prefs.weather === 'radar') void fetchRainMaps().then((maps) => maps !== null && add(rainTileUrl(maps, frameFor(maps, now)), RAIN_MAX_ZOOM))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.weather, ready])

  /* The shapes in view, drawn again whenever the view, the data or a toggle changes. */
  const layers: FaaLayers = {
    tfr: (live.tfr?.data as FaaLayers['tfr'] | undefined) ?? null,
    nsufr: (live.nsufr?.data as FaaLayers['nsufr'] | undefined) ?? null,
    fria: (live.fria?.data as FaaLayers['fria'] | undefined) ?? null,
    heliport: (live.heliport?.data as FaaLayers['heliport'] | undefined) ?? null,
    sua: (live.sua?.data as FaaLayers['sua'] | undefined) ?? null,
  }
  const tags = useRef<maplibregl.Marker[]>([])
  const drawRef = useRef<() => void>(() => undefined)
  drawRef.current = () => {
    const m = map.current
    if (m === null || !ready) return
    const b = m.getBounds()
    const view = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
    const on = prefs.on
    const baked = overlay === null ? null : overlay(view)
    const kept = baked === null ? [] : baked.collection.features.filter((f) => {
      const k = f.properties?.kind
      return k === 'cell' || k === 'class' ? on.grid : k === 'restricted' ? on.nofly : k === 'park' ? on.parks : false
    })
    ;(m.getSource('baked') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: kept })
    ;(m.getSource('live') as maplibregl.GeoJSONSource | undefined)?.setData(liveCollection(layers, view, { tfr: on.tfr, nsufr: on.nofly, fria: on.fria, heliport: on.heliport, sua: on.sua }, todayIso, { marker: markerAt, zoom: m.getZoom() }))
    /* The heights on the squares: markers, as on the main map (this style carries no glyphs); only when few enough to read. */
    for (const t of tags.current) t.remove()
    tags.current = []
    if (baked !== null && on.grid && !baked.gridTooDense && baked.gridLabels.length <= 120 && m.getZoom() >= 11) {
      for (const label of baked.gridLabels) {
        const tag = document.createElement('div')
        tag.className = 'drp__gridtag num'
        tag.setAttribute('aria-hidden', 'true')
        tag.textContent = String(label.feet)
        tags.current.push(new maplibregl.Marker({ element: tag }).setLngLat([label.at.lon, label.at.lat]).addTo(m))
      }
    }
  }
  useEffect(() => {
    const m = map.current
    if (m === null || !ready) return
    const draw = () => drawRef.current()
    draw()
    m.on('moveend', draw)
    return () => {
      m.off('moveend', draw)
    }
  }, [ready])
  useEffect(() => {
    drawRef.current()
  }, [overlay, live, prefs.on, markerAt.lat, markerAt.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (at: LatLon, name: string | null) => {
    setMarker({ at, name })
    map.current?.easeTo({ center: [at.lon, at.lat], zoom: Math.max(12, map.current.getZoom()), duration: 300 })
  }
  const search = async () => {
    const q = query.trim()
    if (q === '') return
    setHits('searching')
    const found = await searchVenues(q).catch(() => [])
    setHits(found.length === 0 ? 'none' : found.slice(0, 5))
  }

  /* The sheet. */
  const ceiling = read?.ceilingFt ?? null
  /* Class B, C, D and surface E are all controlled (14 CFR 107.41). */
  const controlled = read?.controlled ?? false
  const at = atMarker(layers, marker.at, todayIso)
  const lines: { text: string; tone: 'hazard' | 'note' }[] = []
  if (controlled) lines.push({ text: `Controlled airspace: flying here needs an FAA authorization${ceiling === null ? '' : `; LAANC can approve up to ${ceiling} ft at this square`}.`, tone: 'note' })
  if (read?.facility != null) lines.push({ text: `Facility map: ${read.facility}${read.icao === null ? '' : ` (${read.icao})`}.`, tone: 'note' })
  for (const a of here?.specialUse ?? []) lines.push({ text: `${a.name}: ${a.type === 'P' ? 'prohibited' : 'restricted'} area.`, tone: 'hazard' })
  for (const p of here?.parks ?? []) lines.push({ text: `${p.name}: no drone launch on National Park Service land.`, tone: 'hazard' })
  for (const a of at.nsufr ?? []) lines.push({ text: `National security UAS restriction: ${a.name}${a.detail === '' ? '' : ` (${a.detail})`}.`, tone: 'hazard' })
  for (const t of at.tfrsToday?.inside ?? []) lines.push({ text: `${t.name}: ${t.detail}.`, tone: 'hazard' })
  for (const a of at.sua ?? []) lines.push({ text: `${a.name}${a.detail === '' ? '' : `, ${a.detail}`}.`, tone: 'note' })
  if (here !== null && lines.length === 0) lines.push({ text: 'Nothing the app holds is marked at this point. That is not permission to fly.', tone: 'note' })
  /* Was the sheet's second disclaimer; a fact about what is checked, so it is a line of the details. */
  /* Batch SIMPLE-1, Section 1: one TFR truth, from the fetch itself (src/core/tfrLine.ts); the chip and the summary say the same, so the chip is not drawn twice. */
  const tfr = tfrRead((live.tfr as LayerAnswer<FaaArea[]> | undefined) ?? null, marker.at, todayIso)
  lines.push({ text: tfrLine(tfr, timeZone, now), tone: 'note' })
  lines.push({ text: 'Class airspace, facility maps and special use airspace are the FAA data this app holds.', tone: 'note' })
  const chips = markerChips(at, sunsetWords).filter((c) => !/TFR/.test(c.text))
  const keptAt = LIVE_IDS.map((id) => live[id]).filter((a): a is LayerAnswer<unknown> => a !== undefined && a.from === 'kept' && a.at !== null)
  const oldest = keptAt.length === 0 ? null : Math.min(...keptAt.map((a) => a.at as number))
  const wxWords = prefs.weather === 'wind' ? windWords : prefs.weather === 'gusts' ? gustWords : null

  return (
    <div className="drp__air">
      <div ref={box} className="drp__map" data-drone-map />
      <form
        className="drp__search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input className="drp__searchbox" type="search" enterKeyHint="search" placeholder="Where do you want to fly?" aria-label="Where do you want to fly?" value={query} onChange={(e) => setQuery(e.target.value)} />
        {hits === null ? null : (
          <ul className="drp__hits">
            {hits === 'searching' ? <li className="drp__hitnote">Searching…</li> : hits === 'none' ? <li className="drp__hitnote">No place found by that name.</li> : null}
            {Array.isArray(hits)
              ? hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="drp__hit"
                      onClick={() => {
                        setHits(null)
                        setQuery(h.label)
                        goTo({ lat: h.lat, lon: h.lon }, h.label)
                      }}
                    >
                      {h.label}
                    </button>
                  </li>
                ))
              : null}
          </ul>
        )}
      </form>
      <div className="drp__rail">
        <button type="button" className="drp__railbtn" aria-label="Back to the spot" onClick={() => goTo(spot, null)}>
          ◎
        </button>
        <button type="button" className="drp__railbtn" aria-expanded={layersOpen} onClick={() => setLayersOpen(true)}>
          Layers
        </button>
      </div>
      {wxWords === null ? null : <p className="drp__wxword">{wxWords}</p>}

      <section className={`drp__sheet${compact ? ' drp__sheet--compact' : ''}`} aria-label="What is over the marker" data-sheet={compact ? 'collapsed' : 'open'}>
        <div
          className="drp__sheettop"
          onTouchStart={(e) => {
            swipe.current = e.touches[0]?.clientY ?? null
          }}
          onTouchEnd={(e) => {
            const y0 = swipe.current
            const y1 = e.changedTouches[0]?.clientY ?? null
            swipe.current = null
            if (y0 === null || y1 === null || Math.abs(y1 - y0) < 24) return
            setCompact(y1 > y0)
          }}
        >
          <button type="button" className="drp__handle" aria-label={compact ? 'Show the details' : 'Show less'} aria-expanded={!compact} onClick={() => setCompact((c) => !c)}>
            <i />
          </button>
          <p className="drp__sheethead" data-marker-head>
            <span className={`drp__dot${read?.controlled === true ? '' : ' drp__dot--none'}`} aria-hidden="true" />
            {read === null ? 'Reading the airspace…' : read.headline}
          </p>
          <p className="drp__sheetsum" data-marker-sum>
            {sheetSummary(read, tfr.kind === 'checking' ? 'checking' : at.tfrsToday === null ? null : at.tfrsToday.inside.length, at.fria === 'unknown' ? 'unknown' : at.fria !== null)}
          </p>
        </div>
        {compact ? null : (
          <>
            <ul className="drp__lines">
              {lines.map((l) => (
                <li key={l.text} className={l.tone === 'hazard' ? 'drp__line--hazard' : undefined}>
                  {l.text}
                </li>
              ))}
            </ul>
            <ul className="drp__chips">
              {chips.map((c) => (
                <li key={c.text} className={`drp__chip2${c.tone === 'hazard' ? ' drp__chip2--hazard' : ''}`}>
                  {c.text}
                </li>
              ))}
            </ul>
            {oldest === null ? null : <p className="drp__age">FAA layers from {formatDayTime(new Date(oldest), timeZone)}, kept on this phone.</p>}
          </>
        )}
        <div className="drp__sheetbtns">
          <a className="btn btn--primary drp__laanc" href={LAANC_URL} target="_blank" rel="noopener noreferrer">
            Get LAANC ›
          </a>
          {onSaveSpot === undefined ? null : (
            <button
              type="button"
              className="btn drp__save"
              onClick={() => {
                onSaveSpot(marker.at, named ?? `${marker.at.lat.toFixed(4)}, ${marker.at.lon.toFixed(4)}`)
                setSaved(true)
              }}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
        {/* ONE disclaimer line (Batch FIX, Section 6.4; there were two). */}
        <p className="drp__faa1">{compact ? AIR_SHEET : AIR_FOOT}</p>
      </section>

      {layersOpen ? <button type="button" className="drp__layerscrim" aria-label="Close map layers" onClick={() => setLayersOpen(false)} /> : null}
      {layersOpen ? (
        <div className="drp__layers" role="dialog" aria-label="Map layers" data-half-sheet>
          <div className="drp__layershead">
            <p className="drp__layerstitle">Map layers</p>
            <button type="button" className="drp__x" aria-label="Close" onClick={() => setLayersOpen(false)}>
              ×
            </button>
          </div>
          <p className="dcard__label">Map</p>
          <div className="drp__bases">
            {(['chart', 'satellite', '3d'] as const).map((b) => (
              <button key={b} type="button" className={`drp__base drp__base--${b}${prefs.base === b ? ' drp__base--on' : ''}`} aria-pressed={prefs.base === b} onClick={() => setPrefs({ ...prefs, base: b })}>
                <span className={`drp__thumb drp__thumb--${b}`} aria-hidden="true" />
                <span className="drp__basek">{b === 'chart' ? 'Chart' : b === 'satellite' ? 'Satellite' : '3D'}</span>
              </button>
            ))}
          </div>
          <p className="dcard__label">Airspace</p>
          <ul className="drp__toggles">
            {TOGGLES.map((t) => {
              const id: FaaLayerId | null = t.key === 'tfr' ? 'tfr' : t.key === 'fria' ? 'fria' : t.key === 'heliport' ? 'heliport' : t.key === 'sua' ? 'sua' : null
              const missing = id !== null && live[id] !== undefined && live[id]?.data === null
              return (
                <li key={t.key} className="drp__toggle">
                  <span className={`drp__swatch drp__swatch--${t.swatch}`} aria-hidden="true" />
                  <span className="drp__togglewords">
                    <b>{t.name}</b>
                    <span>{missing ? 'Not received from the FAA yet' : t.line}</span>
                  </span>
                  <button type="button" role="switch" aria-checked={prefs.on[t.key]} aria-label={t.name} className={`ui-toggle${prefs.on[t.key] ? ' ui-toggle--on' : ''}`} onClick={() => setPrefs({ ...prefs, on: { ...prefs.on, [t.key]: !prefs.on[t.key] } })}>
                    <span className="ui-toggle__knob" />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="dcard__label">Weather</p>
          <div className="drp__wx">
            {(['wind', 'gusts', 'clouds', 'radar'] as const).map((w) => (
              <button key={w} type="button" className={`drp__wxchip${prefs.weather === w ? ' drp__wxchip--on' : ''}`} aria-pressed={prefs.weather === w} onClick={() => setPrefs({ ...prefs, weather: prefs.weather === w ? null : w })}>
                {w === 'wind' ? 'Wind at 400 ft' : w === 'gusts' ? 'Gusts' : w === 'clouds' ? 'Clouds' : 'Radar'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
