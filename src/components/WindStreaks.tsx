import { useEffect, useMemo, useRef } from 'react'
import type * as maplibregl from 'maplibre-gl'
import type { ForecastCell } from '../core/cloudGrid.ts'
import { flowAt, step, streakColour, toVector, windField, type WindDraw } from '../core/windStreaks.ts'
import { windAtHeight } from '../core/windProfile.ts'

/*
 * THE WIND MAP OVERLAY (Batch F, Section 3; board "WIND · map overlay").
 * Streaks of air moving the way the wind goes, over whatever part of the
 * forecast grid is on screen, from the shared weather store's grid at the
 * time bar's hour (the same cells the wind layer shades). Or, for a slow
 * phone, one arrow per cell, drawn once. The arithmetic is
 * src/core/windStreaks.ts; this only paints.
 */
interface Props {
  map: maplibregl.Map | null
  cells: readonly ForecastCell[]
  heightM: number
  ratedMps: number | null
  draw: WindDraw
  visible: boolean
}

/*
 * How fast a streak crosses the screen, at any zoom: 20 px a second plus 6
 * for every m/s, so a light breeze still draws a line you can see and a
 * stronger wind is always faster. The speed itself is the colour.
 */
const PX_PER_S_BASE = 20
const PX_PER_S_PER_MPS = 6
const MAX_AGE_S = 3.5
const PARTICLES_PER_MEGAPIXEL = 1600

export function WindStreaks({ map, cells, heightM, ratedMps, draw, visible }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const field = useMemo(() => (visible ? windField(cells, heightM) : null), [visible, cells, heightM])

  useEffect(() => {
    const c = canvas.current
    const g = c?.getContext('2d') ?? null
    if (c === null || g === null) return
    c.dataset.streaks = '0'
    c.dataset.arrows = '0'
    if (map === null || field === null) {
      g.clearRect(0, 0, c.width, c.height)
      return
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const fit = () => {
      const r = map.getContainer().getBoundingClientRect()
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      c.style.width = `${r.width}px`
      c.style.height = `${r.height}px`
    }
    fit()
    /* Metres a pixel at the map's centre, for moving a streak a given number of pixels' worth of air. */
    const metresPerPx = () => (40_075_016 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom())
    const offset = (lat: number, lon: number, east: number, north: number): [number, number] => [lon + east / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + north / 110_574]

    if (draw === 'arrows') {
      const paint = () => {
        fit()
        g.clearRect(0, 0, c.width, c.height)
        let n = 0
        for (const cell of cells) {
          const w = windAtHeight(cell.wind ?? [], heightM)
          if (w.speedMps === null || w.fromDegrees === null) continue
          const f = toVector(w.fromDegrees, w.speedMps)
          const a = map.project([cell.at.lon, cell.at.lat])
          const tip = map.project(offset(cell.at.lat, cell.at.lon, f.u, f.v))
          const len = 14 + Math.min(26, w.speedMps * 2)
          const dx = tip.x - a.x
          const dy = tip.y - a.y
          const k = Math.hypot(dx, dy) || 1
          const ux = dx / k
          const uy = dy / k
          const x0 = (a.x - (ux * len) / 2) * dpr
          const y0 = (a.y - (uy * len) / 2) * dpr
          const x1 = (a.x + (ux * len) / 2) * dpr
          const y1 = (a.y + (uy * len) / 2) * dpr
          g.strokeStyle = streakColour(w.speedMps, ratedMps)
          g.lineWidth = 2.5 * dpr
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(x0, y0)
          g.lineTo(x1, y1)
          g.moveTo(x1, y1)
          g.lineTo(x1 - (ux * 8 - uy * 5) * dpr, y1 - (uy * 8 + ux * 5) * dpr)
          g.moveTo(x1, y1)
          g.lineTo(x1 - (ux * 8 + uy * 5) * dpr, y1 - (uy * 8 - ux * 5) * dpr)
          g.stroke()
          n += 1
        }
        c.dataset.arrows = String(n)
      }
      paint()
      map.on('move', paint)
      map.on('resize', paint)
      return () => {
        map.off('move', paint)
        map.off('resize', paint)
        g.clearRect(0, 0, c.width, c.height)
      }
    }

    /* Streaks: heads scattered over the screen, carried by the air, each leaving a fading tail. */
    type Head = { lon: number; lat: number; age: number }
    const heads: Head[] = []
    const count = () => Math.round(((c.width / dpr) * (c.height / dpr) * PARTICLES_PER_MEGAPIXEL) / 1_000_000)
    const spawn = (h: Head) => {
      const p = map.unproject([Math.random() * (c.width / dpr), Math.random() * (c.height / dpr)])
      h.lon = p.lng
      h.lat = p.lat
      h.age = Math.random() * MAX_AGE_S
    }
    for (let i = 0; i < count(); i += 1) {
      const h = { lon: 0, lat: 0, age: 0 }
      spawn(h)
      heads.push(h)
    }
    let raf = 0
    let last = performance.now()
    let drawn = 0
    const clear = () => g.clearRect(0, 0, c.width, c.height)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      /* The tails fade: what was drawn keeps 93% a frame. */
      g.globalCompositeOperation = 'destination-in'
      g.fillStyle = 'rgba(0,0,0,0.93)'
      g.fillRect(0, 0, c.width, c.height)
      g.globalCompositeOperation = 'source-over'
      g.lineWidth = 1.6 * dpr
      g.lineCap = 'round'
      const mpp = metresPerPx()
      drawn = 0
      for (const h of heads) {
        h.age += dt
        const f = flowAt(field, h.lat, h.lon)
        if (f === null || h.age > MAX_AGE_S) {
          spawn(h)
          continue
        }
        const k = f.speed > 0 ? (PX_PER_S_BASE + PX_PER_S_PER_MPS * f.speed) / f.speed : 0
        const s = step(f, dt * k * mpp)
        const a = map.project([h.lon, h.lat])
        const [lon, lat] = offset(h.lat, h.lon, s.east, s.north)
        h.lon = lon
        h.lat = lat
        const b = map.project([lon, lat])
        if (b.x < 0 || b.y < 0 || b.x > c.width / dpr || b.y > c.height / dpr) {
          spawn(h)
          continue
        }
        g.strokeStyle = streakColour(f.speed, ratedMps)
        g.beginPath()
        g.moveTo(a.x * dpr, a.y * dpr)
        g.lineTo(b.x * dpr, b.y * dpr)
        g.stroke()
        drawn += 1
      }
      c.dataset.streaks = String(drawn)
    }
    raf = requestAnimationFrame(frame)
    /* A moved map leaves no smeared tails. */
    const moved = () => {
      fit()
      clear()
    }
    map.on('move', moved)
    map.on('resize', moved)
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', moved)
      map.off('resize', moved)
      clear()
    }
  }, [map, field, cells, heightM, ratedMps, draw])

  return <canvas ref={canvas} className="windstreaks" aria-hidden="true" hidden={!visible || field === null} />
}
