import { useEffect, useMemo, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { windToBeach } from '../core/coastFacing.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { fadeEdges, fromUV, particleCount, PX_PER_S_PER_MPS, sampleField, windRgb, type Field } from '../core/windViewport.ts'
import { nearestStation, stationWind, type StationWind } from '../lib/stationNear.ts'
import { fetchMarine, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { forecastParts, swellOf } from '../core/surfReads.ts'
import { surfHourOf, useSurfNow } from '../lib/useSurfNow.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { venueTimeZone } from '../core/timezone.ts'
import { agoWords } from '../lib/nearWind.ts'
import { isFresh } from '../core/stationPick.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import { usePointWind, type WindLevel, type WindModelChip } from '../lib/useWindViewport.ts'
import { stationLine, surfCallLine, swellLine, windLine } from '../core/markerReadout.ts'
import { LayerMarker } from './LayerMarker.tsx'
import '../styles/wind.css'

/*
 * THE WIND LAYER v3 (Batch Map, Section 1; board docs/mockups/WindV3.png).
 *
 *   field      a smooth colour over the whole screen at every zoom: the
 *              field sampled every CELL_PX on screen, bilinear between grid
 *              points (src/core/windViewport.ts), drawn small and scaled up
 *              with smoothing, so there are no squares and no edges
 *   particles  thin white lines (1.2 px) with fading tails, speed in
 *              proportion to the wind, as many as the screen and zoom call
 *              for; paused while a finger is on the map or it is moving
 *   marker     Batch DRONE, Section 3: the one marker (the spot's, moved by
 *              holding anywhere; src/components/LayerMarker.tsx) with its
 *              readout beside it: "9 kt NNW · g13", the swell at sea, and
 *              the nearest station with its age. The crosshair fixed in the
 *              middle and the pill under the search are gone.
 *   legend     the timeline bar (src/components/LayerTimeline.tsx)
 *
 * It paints only; the arithmetic is in src/core. The frame rate is counted
 * into data-fps for the wind audit.
 */
const CELL_PX = 8
/** Cells over which the colour fades to where the field ends: 40 px. */
const EDGE_FADE_CELLS = 5
const FADE = 0.09
const MAX_AGE_FRAMES = 90

interface Props {
  map: maplibregl.Map | null
  field: Field | null
  unit: WindUnit
  /** The spot and its beach's facing: "offshore here" only within 3 km of it. */
  spot: LatLon | null
  /** Batch NOW, Section 2.1: the one wind now at the spot (the Wind page's headline, leaned to the station); the pill and the arrow say it within 3 km of the spot at now. */
  headline?: { mps: number; fromDeg: number | null; gustMps: number | null } | null
  facing: number | null
  status: 'off' | 'loading' | 'ok' | 'failed'
  /** The time on the bar, for the swell at the marker. */
  when?: Date | null
  /** Where the marker is (the spot unless it was moved by holding the map). */
  marker: LatLon | null
  /** The time the forecast's days must reach: the thumb's plus 24 h, held while a drag lasts. */
  fetchAt?: Date | null
  /** Ask the wind again after it failed to load. */
  onRetry?: () => void
  /** The model and height asked, for the marker's own fine-grid reading (usePointWind). */
  model?: WindModelChip
  level?: WindLevel
}

export function WindLayerV3({ map, field, unit, spot, facing, headline = null, status, when = null, marker, fetchAt = null, onRetry, model = 'blend', level = '10m' }: Props) {
  const colour = useRef<HTMLCanvasElement>(null)
  const trails = useRef<HTMLCanvasElement>(null)
  /* The screen's velocity grid, rebuilt when the map settles: px/s east and down per CELL_PX cell. */
  const grid = useRef<{ cols: number; rows: number; vx: Float32Array; vy: Float32Array } | null>(null)
  /* The marker's point is where everything below is read (it was the screen's centre, under a crosshair). */
  const centre = marker
  const [partial, setPartial] = useState(false)
  /*
   * A NEW HOUR IS A REPAINT, NOT A NEW LAYER (Batch DRONE, Section 3). The
   * field was a dependency of the effect below, so every hour under the
   * thumb tore down the frame loop and its listeners and built them again.
   * The field is read from a ref now; a new one repaints the colour alone.
   */
  const fieldRef = useRef<Field | null>(field)
  const repaint = useRef<() => void>(() => undefined)
  useEffect(() => {
    fieldRef.current = field
    repaint.current()
  }, [field])

  useEffect(() => {
    const c = colour.current
    const t = trails.current
    if (map === null || c === null || t === null) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let moving = false
    let touching = false
    let raf = 0
    let frames = 0
    let since = performance.now()
    let parts: { x: number; y: number; age: number }[] = []

    const fit = () => {
      const r = map.getContainer().getBoundingClientRect()
      for (const k of [c, t]) {
        /* Only when the size changed: setting a canvas's width clears it, trails and all. */
        const w = Math.round(r.width * dpr)
        const h = Math.round(r.height * dpr)
        if (k.width !== w) k.width = w
        if (k.height !== h) k.height = h
        k.style.width = `${r.width}px`
        k.style.height = `${r.height}px`
      }
      return r
    }

    /* The colour, and the velocity grid the particles read. */
    const paint = (scatter = true) => {
      const r = fit()
      const g = c.getContext('2d')
      if (g === null) return
      g.clearRect(0, 0, c.width, c.height)
      const cols = Math.ceil(r.width / CELL_PX) + 1
      const rows = Math.ceil(r.height / CELL_PX) + 1
      grid.current = null
      const field = fieldRef.current
      if (field === null) return
      const img = new ImageData(cols, rows)
      const vx = new Float32Array(cols * rows)
      const vy = new Float32Array(cols * rows)
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const ll = map.unproject([x * CELL_PX, y * CELL_PX])
          const s = sampleField(field, ll.lat, ll.lng)
          const k = y * cols + x
          if (s === null) continue
          const speed = Math.hypot(s.u, s.v)
          const [R, G, B] = windRgb(speed)
          img.data.set([R, G, B, 200], k * 4)
          vx[k] = s.u * PX_PER_S_PER_MPS
          vy[k] = -s.v * PX_PER_S_PER_MPS
        }
      }
      /*
       * THE EDGES FADE (Batch Polish 2, Section 1): zoomed out, the blocks the
       * view asked can stop short of the screen. The colour fades over
       * EDGE_FADE_CELLS to where the field ends, not a hard edge, and the
       * card says the wind is shown for this area.
       */
      const partial = fadeEdges(img.data, cols, rows, EDGE_FADE_CELLS)
      c.dataset.partial = partial ? '1' : '0'
      setPartial(partial)
      /* Particles are kept across hours: only a new view (or none yet) scatters them again. */
      const small = document.createElement('canvas')
      small.width = cols
      small.height = rows
      small.getContext('2d')?.putImageData(img, 0, 0)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(small, 0, 0, cols * CELL_PX * dpr, rows * CELL_PX * dpr)
      grid.current = { cols, rows, vx, vy }
      const n = particleCount(r.width, r.height, map.getZoom())
      if (!scatter && parts.length === n) {
        c.dataset.cells = String(cols * rows)
        return
      }
      parts = Array.from({ length: n }, () => ({ x: Math.random() * r.width, y: Math.random() * r.height, age: Math.floor(Math.random() * MAX_AGE_FRAMES) }))
      c.dataset.cells = String(cols * rows)
      t.dataset.particles = String(n)
    }

    const velocity = (x: number, y: number): [number, number] | null => {
      const gd = grid.current
      if (gd === null) return null
      const gx = x / CELL_PX
      const gy = y / CELL_PX
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      if (x0 < 0 || y0 < 0 || x0 >= gd.cols - 1 || y0 >= gd.rows - 1) return null
      const fx = gx - x0
      const fy = gy - y0
      const at = (a: Float32Array) => {
        const k = y0 * gd.cols + x0
        return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + gd.cols] * (1 - fx) + a[k + gd.cols + 1] * fx) * fy
      }
      return [at(gd.vx), at(gd.vy)]
    }

    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      frames += 1
      if (now - since >= 1000) {
        t.dataset.fps = String(Math.round((frames * 1000) / (now - since)))
        frames = 0
        since = now
      }
      const g = t.getContext('2d')
      if (g === null) return
      if (moving || touching || grid.current === null) {
        g.clearRect(0, 0, t.width, t.height)
        return
      }
      g.save()
      g.globalCompositeOperation = 'destination-out'
      g.fillStyle = `rgba(0,0,0,${FADE})`
      g.fillRect(0, 0, t.width, t.height)
      g.restore()
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 1.2 * dpr
      g.lineCap = 'round'
      g.beginPath()
      const w = t.width / dpr
      const h = t.height / dpr
      for (const p of parts) {
        const v = p.age > MAX_AGE_FRAMES ? null : velocity(p.x, p.y)
        if (v === null) {
          p.x = Math.random() * w
          p.y = Math.random() * h
          p.age = 0
          continue
        }
        const nx = p.x + v[0] * dt
        const ny = p.y + v[1] * dt
        g.moveTo(p.x * dpr, p.y * dpr)
        g.lineTo(nx * dpr, ny * dpr)
        p.x = nx
        p.y = ny
        p.age += 1
      }
      g.stroke()
    }

    const onMove = () => {
      moving = true
    }
    const onEnd = () => {
      moving = false
      paint()
    }
    const down = () => {
      touching = true
    }
    const up = () => {
      touching = false
    }
    const el = map.getCanvasContainer()
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    map.on('move', onMove)
    map.on('moveend', onEnd)
    map.on('resize', onEnd)
    paint()
    repaint.current = () => paint(false)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      repaint.current = () => undefined
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      map.off('move', onMove)
      map.off('moveend', onEnd)
      map.off('resize', onEnd)
    }
  }, [map])

  /* The value at the marker, and the station near it; at the spot at now, the one wind now. */
  /* The map hands a headline only while the bar is at now (src/components/PlanMode.tsx). */
  const point = usePointWind(centre, status !== 'off', model, when ?? new Date(), level, fetchAt ?? when ?? new Date())
  const atSpotNow = headline !== null && headline.fromDeg !== null && spot !== null && centre !== null && distanceMeters(spot, centre) <= 3000
  const here = useMemo(() => {
    if (atSpotNow && headline !== null && headline.fromDeg !== null) return { speedMps: headline.mps, fromDeg: headline.fromDeg, gust: headline.gustMps }
    if (field === null || centre === null) return null
    /* Batch LIVE, Section 1.1: the fine grid's reading at the marker when it has come, the same at every zoom; the view's grid until then. */
    const s = point ?? sampleField(field, centre.lat, centre.lon)
    if (s === null) return null
    const w = fromUV(s.u, s.v)
    return { ...w, gust: s.gust }
  }, [field, centre, point, atSpotNow, headline?.mps, headline?.fromDeg, headline?.gustMps]) // eslint-disable-line react-hooks/exhaustive-deps
  const [station, setStation] = useState<{ id: string; w: StationWind | null } | null>(null)
  const picked = useStationObs(spot)
  const ck = centre === null ? null : `${centre.lat.toFixed(2)},${centre.lon.toFixed(2)}`
  useEffect(() => {
    if (centre === null) return
    let live = true
    const t = setTimeout(() => {
      void nearestStation(centre).then(async (s) => {
        if (!live) return
        if (s === null) return setStation(null)
        const w = await stationWind(s.id).catch(() => null)
        if (live) setStation({ id: s.id, w })
      })
    }, 500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [ck]) // eslint-disable-line react-hooks/exhaustive-deps
  /*
   * THE SWELL AT THE MARKER, AT SEA (Batch TRUTH, Section 7): the forecast's
   * swell where the marker is, its height, period and the way it comes from;
   * on land the sea forecast answers nothing and no line is said. The marker
   * rounded to 2 decimals, as every forecast question.
   *
   * Batch DRONE, Section 1.6 (16 Nov 11:02: the map "swell 1.6 ft 4 s", the
   * Surf page "0.7 ft 12 s", same beach, same hour) read the Surf page's
   * parts at the spot at now; Batch FIX, Section 3.3 says the surf call there
   * instead, at any hour (below). Away from the spot, the forecast's parts at
   * the marker, named by period (src/core/surfReads.ts forecastParts).
   */
  /* Asked once per place, and read for the hour under the thumb without asking again (Batch DRONE, Section 3: no refetch while scrubbing). */
  const [sea, setSea] = useState<{ ck: string; h: Hourly | null } | null>(null)
  /*
   * Batch FIX, Section 3.3: at the spot, at any hour on the bar, the surf
   * call itself, from the one series the home, the Surf page and the week
   * read (src/lib/useSurfNow.ts surfHourOf), with the same station's wind
   * near now; asked only while the marker is on the spot.
   */
  const surfSpot = headline !== null && spot !== null && centre !== null && distanceMeters(spot, centre) <= 3000 ? spot : null
  const [nowMin, setNowMin] = useState(() => Math.floor(Date.now() / 60_000))
  useEffect(() => {
    if (surfSpot === null) return
    const t = setInterval(() => setNowMin(Math.floor(Date.now() / 60_000)), 60_000)
    return () => clearInterval(t)
  }, [surfSpot === null]) // eslint-disable-line react-hooks/exhaustive-deps
  const surfNow = useMemo(() => new Date(nowMin * 60_000), [nowMin])
  const surfZone = useMemo(() => (surfSpot === null ? 'UTC' : (venueTimeZone(surfSpot.lat, surfSpot.lon) ?? 'UTC')), [surfSpot?.lat, surfSpot?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const surfStation = useStationObs(surfSpot)
  const surf = useSurfNow(surfSpot, surfNow, surfZone, false, null, surfStation)
  useEffect(() => {
    if (centre === null || ck === null) return
    let live = true
    const t = setTimeout(() => {
      void fetchMarine({ lat: Number(centre.lat.toFixed(2)), lon: Number(centre.lon.toFixed(2)) })
        .then((m) => live && setSea({ ck, h: m?.value ?? null }))
        .catch(() => live && setSea({ ck, h: null }))
    }, 700)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [ck]) // eslint-disable-line react-hooks/exhaustive-deps
  const whenMs = when?.getTime() ?? null
  const markerSwell = useMemo(() => {
    const h = sea !== null && sea.ck === ck ? sea.h : null
    if (h === null) return null
    const at = whenMs === null ? new Date() : new Date(whenMs)
    return swellOf(forecastParts((n) => hourlyAt(h, n, at)))
  }, [sea, ck, whenMs])
  const surfHere = surfSpot === null ? null : surfHourOf(surf.series, whenMs === null ? surfNow : new Date(whenMs), 0)
  const swell = markerSwell === null || markerSwell.fromDeg === null ? null : { ft: markerSwell.ft, s: markerSwell.periodS, fromDeg: markerSwell.fromDeg }

  const say = (mps: number | null) => (mps === null ? null : windIn(mps, unit))
  const side = here === null || facing === null || spot === null || centre === null || distanceMeters(spot, centre) > 3000 ? null : windToBeach(here.fromDeg, facing)
  const u = windUnitLabel(unit)
  /*
   * Batch FIX, Section 1 (17 Nov 7:06: the readout said KNTU at 1 h 10 min
   * while Cape Henry had read 7 minutes before): within 3 km of the spot,
   * the one station every screen reads (src/lib/useStationObs.ts);
   * elsewhere the airport nearest the marker, and only while its report is
   * fresh by the same rule (src/core/stationPick.ts isFresh).
   */
  const nowAt = new Date()
  const nearSpot = spot !== null && centre !== null && distanceMeters(spot, centre) <= 3000
  const away = station?.w == null ? null : { id: station.id, at: new Date(station.w.at), kt: station.w.kt, fromDeg: station.w.fromDeg }
  const read = nearSpot
    ? picked === null
      ? null
      : { id: picked.label, at: picked.at, kt: picked.rawMps / 0.514444, fromDeg: picked.fromDeg }
    : away !== null && Number.isFinite(away.at.getTime()) && isFresh({ station: { id: away.id, kind: 'airport', km: 0 }, at: away.at, kt: away.kt, gustKt: null, fromDeg: away.fromDeg }, nowAt)
      ? away
      : null
  const stationText = read === null ? null : stationLine(read.id, say(read.kt / 1.9438444924406), read.fromDeg, u, agoWords(read.at, nowAt))
  /* "9 kt NNW · g13 · offshore here" / "swell 0.7 ft 12 s ENE" / "KNTU 13 kt N · 1 h ago" (board Map_Timeline_Wind). */
  const lines: string[] =
    here === null
      ? [status === 'loading' ? 'Reading the wind…' : status === 'failed' ? 'Wind didn’t load' : 'No wind here']
      : [
          [windLine(say(here.speedMps), here.fromDeg, say(here.gust), u), side === null ? null : `${side === 'cross' ? 'cross-shore' : side} here`].filter((x) => x !== null).join(' · '),
          surfHere !== null ? surfCallLine(surfHere.call) : swell === null ? null : swellLine(swell.ft, swell.s, swell.fromDeg),
          stationText,
        ].filter((x): x is string => x !== null)
  const atSpot = spot !== null && centre !== null && distanceMeters(spot, centre) < 30

  return (
    <>
      <canvas ref={colour} className="windv3__field" aria-hidden="true" data-partial={partial ? '1' : '0'} />
      <canvas ref={trails} className="windv3__trails" aria-hidden="true" />
      <LayerMarker map={map} at={centre} lines={lines} layer="wind" atSpot={atSpot}>
        {here === null && status === 'failed' ? (
          <button type="button" className="windv3__retry" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </LayerMarker>
    </>
  )
}
