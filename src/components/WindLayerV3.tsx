import { useEffect, useMemo, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { windToBeach } from '../core/coastFacing.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { fromUV, particleCount, PX_PER_S_PER_MPS, sampleField, windRgb, type Field } from '../core/windViewport.ts'
import { nearestStation, stationWind, type StationWind } from '../lib/stationNear.ts'
import { compass } from '../lib/tideWords.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
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
 *   crosshair  fixed in the middle; the card under the top bar reads the
 *              wind under it ("9 kt from W · gusts 14 · offshore here") and,
 *              with a station within 15 km, the station's own reading
 *   legend     the colour bar, in the time bar (src/components/WindTimeBar.tsx)
 *
 * It paints only; the arithmetic is in src/core. The frame rate is counted
 * into data-fps for the wind audit.
 */
const CELL_PX = 8
const FADE = 0.09
const MAX_AGE_FRAMES = 90

interface Props {
  map: maplibregl.Map | null
  field: Field | null
  unit: WindUnit
  /** The spot and its beach's facing: "offshore here" only within 3 km of it. */
  spot: LatLon | null
  facing: number | null
  status: 'off' | 'loading' | 'ok' | 'failed'
}

export function WindLayerV3({ map, field, unit, spot, facing, status }: Props) {
  const colour = useRef<HTMLCanvasElement>(null)
  const trails = useRef<HTMLCanvasElement>(null)
  /* The screen's velocity grid, rebuilt when the map settles: px/s east and down per CELL_PX cell. */
  const grid = useRef<{ cols: number; rows: number; vx: Float32Array; vy: Float32Array } | null>(null)
  const [centre, setCentre] = useState<LatLon | null>(null)

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
        k.width = Math.round(r.width * dpr)
        k.height = Math.round(r.height * dpr)
        k.style.width = `${r.width}px`
        k.style.height = `${r.height}px`
      }
      return r
    }

    /* The colour, and the velocity grid the particles read. */
    const paint = () => {
      const r = fit()
      const g = c.getContext('2d')
      if (g === null) return
      g.clearRect(0, 0, c.width, c.height)
      const cols = Math.ceil(r.width / CELL_PX) + 1
      const rows = Math.ceil(r.height / CELL_PX) + 1
      grid.current = null
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
      const small = document.createElement('canvas')
      small.width = cols
      small.height = rows
      small.getContext('2d')?.putImageData(img, 0, 0)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(small, 0, 0, cols * CELL_PX * dpr, rows * CELL_PX * dpr)
      grid.current = { cols, rows, vx, vy }
      const n = particleCount(r.width, r.height, map.getZoom())
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

    const readCentre = () => {
      const r = map.getContainer().getBoundingClientRect()
      const ll = map.unproject([r.width / 2, r.height / 2])
      setCentre({ lat: ll.lat, lon: ll.lng })
    }
    let throttle = 0
    const onMove = () => {
      moving = true
      const now = performance.now()
      if (now - throttle > 150) {
        throttle = now
        readCentre()
      }
    }
    const onEnd = () => {
      moving = false
      paint()
      readCentre()
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
    readCentre()
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      map.off('move', onMove)
      map.off('moveend', onEnd)
      map.off('resize', onEnd)
    }
  }, [map, field])

  /* The value under the crosshair, and the station near it. */
  const here = useMemo(() => {
    if (field === null || centre === null) return null
    const s = sampleField(field, centre.lat, centre.lon)
    if (s === null) return null
    const w = fromUV(s.u, s.v)
    return { ...w, gust: s.gust }
  }, [field, centre])
  const [station, setStation] = useState<{ id: string; w: StationWind | null } | null>(null)
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

  const say = (mps: number | null) => (mps === null ? '—' : `${Math.round(windIn(mps, unit) ?? 0)}`)
  const side = here === null || facing === null || spot === null || centre === null || distanceMeters(spot, centre) > 3000 ? null : windToBeach(here.fromDeg, facing)
  const stationSays = station?.w == null ? null : `${Math.round(windIn(station.w.kt / 1.9438444924406, unit) ?? 0)} ${windUnitLabel(unit)}${station.w.fromDeg === null ? ' variable' : ` ${compass(station.w.fromDeg)}`}`

  return (
    <>
      <canvas ref={colour} className="windv3__field" aria-hidden="true" />
      <canvas ref={trails} className="windv3__trails" aria-hidden="true" />
      <div className="windv3__cross" aria-hidden="true" />
      <div className="windv3__read" role="status" data-wind-readout>
        <svg className="windv3__arrow" viewBox="-12 -12 24 24" aria-hidden="true">
          <circle r="11" />
          {here === null ? null : <path d="M-6 0H6M2 -4L6 0L2 4" transform={`rotate(${(here.fromDeg + 90) % 360})`} />}
        </svg>
        <div className="windv3__words">
          <p className="windv3__big">
            {here === null ? (status === 'loading' ? 'Reading the wind…' : status === 'failed' ? 'The wind did not load · retrying' : 'No wind here') : (
              <>
                <span className="windv3__num">{say(here.speedMps)}</span> {windUnitLabel(unit)} <b>from {compass(here.fromDeg)}</b>
              </>
            )}
          </p>
          {here === null ? null : (
            <p className="windv3__line">
              {[here.gust === null ? null : `gusts ${say(here.gust)}`, side === null ? null : `${side === 'cross' ? 'cross-shore' : side} here`, 'at the crosshair'].filter((x) => x !== null).join(' · ')}
            </p>
          )}
        </div>
        {station === null || stationSays === null ? null : (
          <p className="windv3__station">
            {station.id} reads
            <b>{stationSays}</b>
          </p>
        )}
      </div>
    </>
  )
}
