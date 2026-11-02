/*
 * THE GROUND, ONE CLEAN SURFACE (Batch D, Section 2).
 *
 * The old view was a patchwork of zoom levels with hard diagonal seams, and
 * blurry under the drone (1 Nov). Here:
 *
 *   NEAR   a square NEAR_HALF either side of the camera's ground point, ONE
 *          picture: a single atlas texture built from zoom NEAR_Z tiles,
 *          each drawn over its parent (zoom 13 and up) first, so the square
 *          is never holed and neighbours always match. One texture, one
 *          mesh: there is no seam inside it to see. Rebuilt round the camera
 *          when it has gone RECENTRE_M, the new one fading in over the old.
 *   MID    zoom MID_Z tiles out to MID_HALF, each its own mesh with skirts
 *   FAR    zoom FAR_Z tiles out to FAR_HALF, the horizon's land
 *
 * Heights are the terrarium tiles read from their bytes (sources.ts), the
 * sea floor taken below any tide so the water (water.ts) covers it. Every
 * mesh carries skirts at its edges, so no crack shows between levels. The
 * coarser rings sit a metre lower and are drawn behind the near square.
 *
 * PREFETCH. Moving, the next square is built ahead of the camera along its
 * direction (prefetch), so it is there when the camera arrives.
 *
 *   FINE   (Batch G, Section 9: at 200 ft the ground under the drone was a
 *          blur of zoom 18) when the camera is under FINE_BELOW_M above
 *          where it looks, a small square FINE_TILES across at the
 *          imagery's own top zoom (FINE_Z, at most 20), drawn just over the
 *          near square, started from the near picture so it is never holed,
 *          rebuilt when the camera has gone FINE_RECENTRE_M.
 */
import * as THREE from 'three'
import type { ImagerySource } from '../../data/imagerySources.ts'
import { waterMaskFor } from './waterMask.ts'
import { working, frameAt, heightAt, latOf, lonOf, pictureOnly, pictureOrParent, sampleTile, terrainTile, tileX, tileY, TERRAIN_MAX_Z, type Frame } from './sources.ts'

export const NEAR_Z = 18
export const NEAR_TILES = 16
export const ATLAS_PX = NEAR_TILES * 256
export const MID_Z = 15
export const FAR_Z = 12
export const MID_HALF_M = 4500
export const FAR_HALF_M = 24_000
export const RECENTRE_M = 450
export const FINE_Z = 20
export const FINE_TILES = 8
export const FINE_BELOW_M = 160
export const FINE_RECENTRE_M = 70

/** The fine square's tiles round a point: the first tile's x and y, and its box, at zoom z. */
export function finePatch(lat: number, lon: number, z: number, n = FINE_TILES): { tx0: number; ty0: number; west: number; east: number; north: number; south: number } {
  const tx0 = Math.round(tileX(lon, z) - n / 2)
  const ty0 = Math.round(tileY(lat, z) - n / 2)
  return { tx0, ty0, west: lonOf(tx0, z), east: lonOf(tx0 + n, z), north: latOf(ty0, z), south: latOf(ty0 + n, z) }
}
/* Under the near square and each other, so the finer level wins where they overlap. */
const MID_DROP_M = 1.2
const FAR_DROP_M = 3
const SKIRT_M = 40

export interface GroundStatus {
  /** Tiles of elevation that could not be had (offline and not saved), drawn flat. */
  flatTiles: number
}

/** Below the lowest tide: the sea floor where the photo shows water, so the water surface covers it. */
const seaFloor = (h: number) => (h < 0.3 ? Math.min(h, -1.5) : h)
/* Under the map's water, below any tide the water level can reach (the fixture's low tide sat below -2.5 m). */
export const CARVE_M = -6
/* The beach: land within BEACH_M of water slopes to WATERLINE_M at the water (Batch I, Section 6). */
export const BEACH_M = 40
export const BEACH_STEP_M = 8
export const WATERLINE_M = 0.3
/** The ground at `d` metres from the water: the land's own height eased to the waterline, never raised. */
export function beachHeight(h: number, d: number): number {
  if (h <= WATERLINE_M) return h
  const t = Math.min(1, Math.max(0, d / BEACH_M))
  const s = t * t * (3 - 2 * t)
  return WATERLINE_M + (h - WATERLINE_M) * s
}

/**
 * A grid of (n+1)² vertices over a lat/lon box, heights from `height`, with
 * a skirt hanging SKIRT_M below each edge. UVs run over the box (v down from
 * the north edge, as an image).
 */
export function gridGeometry(frame: Frame, north: number, south: number, west: number, east: number, n: number, height: (lat: number, lon: number) => number, drop = 0): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const row = n + 1
  /* Rows by Mercator v, so the picture lands where the tile's own pixels are. */
  const yN = tileY(north, 0)
  const yS = tileY(south, 0)
  for (let j = 0; j <= n; j += 1) {
    const lat = latOf(yN + ((yS - yN) * j) / n, 0)
    for (let i = 0; i <= n; i += 1) {
      const lon = west + ((east - west) * i) / n
      pos.push(frame.x(lon), height(lat, lon) - drop, frame.z(lat))
      uv.push(i / n, 1 - j / n)
    }
  }
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * row + i
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  }
  /* The skirt: each edge's vertices again, SKIRT_M lower, joined to the edge. */
  const edge = (list: number[]) => {
    const base = pos.length / 3
    for (const v of list) {
      pos.push(pos[v * 3], pos[v * 3 + 1] - SKIRT_M, pos[v * 3 + 2])
      uv.push(uv[v * 2], uv[v * 2 + 1])
    }
    for (let k = 0; k + 1 < list.length; k += 1) {
      const a = list[k]
      const b = list[k + 1]
      idx.push(a, base + k, b, b, base + k, base + k + 1)
      idx.push(a, b, base + k, b, base + k + 1, base + k)
    }
  }
  edge(Array.from({ length: row }, (_, i) => i))
  edge(Array.from({ length: row }, (_, i) => n * row + i))
  edge(Array.from({ length: row }, (_, j) => j * row))
  edge(Array.from({ length: row }, (_, j) => j * row + n))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A height function over the terrarium tiles at `z` covering a box, loaded first; flat (0) where a tile is missing. */
async function heightsFor(north: number, south: number, west: number, east: number, z: number, status: GroundStatus, onFlat: () => void, waterZ: number | null = null, reachDeg = 0) {
  /* Under the map's water the ground goes below any tide, so the water surface covers the photo's sea (waterMask.ts). */
  const mask = waterZ === null ? null : await waterMaskFor(north, south, west, east, waterZ)
  const x0 = Math.floor(tileX(west, z))
  const x1 = Math.floor(tileX(east, z))
  const y0 = Math.floor(tileY(north, z))
  const y1 = Math.floor(tileY(south, z))
  const tiles = new Map<string, Awaited<ReturnType<typeof terrainTile>>>()
  await Promise.all(
    Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, k) => {
      const x = x0 + (k % (x1 - x0 + 1))
      const y = y0 + Math.floor(k / (x1 - x0 + 1))
      return terrainTile(x, y, z).then((t) => {
        if (t === null) {
          status.flatTiles += 1
          onFlat()
        }
        tiles.set(`${x}/${y}`, t)
      })
    }),
  )
  return (lat: number, lon: number) => {
    const x = Math.min(x1, Math.max(x0, Math.floor(tileX(lon, z))))
    const y = Math.min(y1, Math.max(y0, Math.floor(tileY(lat, z))))
    const t = tiles.get(`${x}/${y}`)
    const h = t == null ? 0 : seaFloor(sampleTile(t, x, y, z, lat, lon))
    if (mask === null) return h
    /*
     * On the coarse rings a vertex goes under if water is within half a cell
     * of it: between a sea vertex and a land one the ground ramps across the
     * whole cell, and that ramp stood above the water for hundreds of metres
     * (Wrightsville, 1 Nov). There the water's edge wins.
     */
    const wet = mask.inWater(lat, lon) || (reachDeg > 0 && [[reachDeg, 0], [-reachDeg, 0], [0, reachDeg], [0, -reachDeg]].some(([a, b]) => mask.inWater(lat + a, lon + b)))
    if (wet) return Math.min(h, CARVE_M)
    /*
     * THE BEACH (Batch I, Section 6): dry land within BEACH_M of the map's
     * water eases down to the waterline, so a beach slopes from dry sand to
     * the water instead of the land standing straight up out of the sea.
     */
    const d = shoreDistanceM(mask, lat, lon)
    return d === null ? h : beachHeight(h, d)
  }
}

/** Metres to the nearest of the map's water within BEACH_M, looked for in eight directions; null when none is that near. */
function shoreDistanceM(mask: { inWater(lat: number, lon: number): boolean }, lat: number, lon: number): number | null {
  const mLat = 111_320
  const mLon = 111_320 * Math.cos((lat * Math.PI) / 180)
  for (let r = BEACH_STEP_M; r <= BEACH_M; r += BEACH_STEP_M) {
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4
      if (mask.inWater(lat + (Math.cos(a) * r) / mLat, lon + (Math.sin(a) * r) / mLon)) return r
    }
  }
  return null
}

export interface GroundMaterialHook {
  /** The material every ground mesh wears, given its texture: the look decides (Section 6). */
  make(map: THREE.Texture): THREE.Material
}

export interface Ground {
  group: THREE.Group
  /** Re-centre on the ground point under the camera; `ahead` (metres per second, x and z) prefetches along the flight. */
  follow(x: number, z: number, ahead?: { vx: number; vz: number }, heightM?: number): void
  /** The near atlas's canvas texture and its box in the frame, for roofs (Section 4). */
  atlas(): { texture: THREE.Texture; west: number; east: number; north: number; south: number } | null
  /** The near square is drawn (its parent picture at least). */
  ready(): boolean
  /** Swap every ground material (the Animated look). */
  setMaterial(hook: GroundMaterialHook): void
  /** Hide the picture's water under the sea (the coarse rings' sea floor is already low). */
  dispose(): void
}

export function createGround(venue: { lat: number; lon: number }, source: ImagerySource | null, status: GroundStatus, onChange: () => void, hook: GroundMaterialHook): Ground {
  const frame = frameAt(venue)
  const group = new THREE.Group()
  group.name = 'ground'
  let materialHook = hook
  const textured: { mesh: THREE.Mesh; map: THREE.Texture }[] = []
  const wear = (mesh: THREE.Mesh, map: THREE.Texture) => {
    mesh.material = materialHook.make(map)
    textured.push({ mesh, map })
  }

  /* -------------------------------------------- far and mid, tile by tile */
  const ring = (z: number, half: number, segments: number, drop: number, terrainZ: number, order: number) => {
    const d = half / frame.mLat
    const dLon = half / frame.mLon
    const x0 = Math.floor(tileX(venue.lon - dLon, z))
    const x1 = Math.floor(tileX(venue.lon + dLon, z))
    const y0 = Math.floor(tileY(venue.lat + d, z))
    const y1 = Math.floor(tileY(venue.lat - d, z))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const north = latOf(y, z)
        const south = latOf(y + 1, z)
        const west = lonOf(x, z)
        const east = lonOf(x + 1, z)
        void working(async () => {
          const h = await heightsFor(north, south, west, east, terrainZ, status, onChange, 12, (north - south) / segments / 2)
          const pic = await pictureOrParent(x, y, z, z >= 14 ? source : null)
          const canvas = new OffscreenCanvas(256, 256)
          const ctx = canvas.getContext('2d')
          if (pic !== null && ctx !== null) ctx.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, 256, 256)
          const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          const mesh = new THREE.Mesh(gridGeometry(frame, north, south, west, east, segments, h, drop))
          mesh.renderOrder = order
          mesh.receiveShadow = true
          mesh.name = `ground z${z}`
          wear(mesh, tex)
          group.add(mesh)
          onChange()
        })
      }
    }
  }
  ring(FAR_Z, FAR_HALF_M, 32, FAR_DROP_M, Math.min(FAR_Z - 1, 11), -2)
  ring(MID_Z, MID_HALF_M, 32, MID_DROP_M, 13, -1)

  /* ------------------------------------------------- the near square */
  let near: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cx: number; cz: number; box: { west: number; east: number; north: number; south: number }; born: number } | null = null
  let building: { cx: number; cz: number } | null = null
  /* The sharp tiles of the current square still arriving: not "loaded" until they are. */
  let refining = false
  const nearSquare = async (cx: number, cz: number) => {
    if (building !== null) return
    building = { cx, cz }
    try {
      const lat = frame.lat(cz)
      const lon = frame.lon(cx)
      const tx0 = Math.round(tileX(lon, NEAR_Z) - NEAR_TILES / 2)
      const ty0 = Math.round(tileY(lat, NEAR_Z) - NEAR_TILES / 2)
      const box = { west: lonOf(tx0, NEAR_Z), east: lonOf(tx0 + NEAR_TILES, NEAR_Z), north: latOf(ty0, NEAR_Z), south: latOf(ty0 + NEAR_TILES, NEAR_Z) }
      const canvas = document.createElement('canvas')
      canvas.width = ATLAS_PX
      canvas.height = ATLAS_PX
      const ctx = canvas.getContext('2d')
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      /* The parent first, zoom 13 over the whole square: what the overview saved for offline. */
      const PZ = 13
      const s = 2 ** (NEAR_Z - PZ)
      const px0 = Math.floor(tx0 / s)
      const py0 = Math.floor(ty0 / s)
      const px1 = Math.floor((tx0 + NEAR_TILES - 1) / s)
      const py1 = Math.floor((ty0 + NEAR_TILES - 1) / s)
      const tilePx = 256 / s
      await Promise.all(
        Array.from({ length: (px1 - px0 + 1) * (py1 - py0 + 1) }, async (_, k) => {
          const px = px0 + (k % (px1 - px0 + 1))
          const py = py0 + Math.floor(k / (px1 - px0 + 1))
          const pic = await pictureOrParent(px, py, PZ, null, 4)
          if (pic === null || ctx === null) return
          const dx = (px * s - tx0) * 256
          const dy = (py * s - ty0) * 256
          ctx.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, dx, dy, s * 256, s * 256)
        }),
      )
      void tilePx
      const h = await heightsFor(box.north, box.south, box.west, box.east, TERRAIN_MAX_Z, status, onChange, 14)
      const mesh = new THREE.Mesh(gridGeometry(frame, box.north, box.south, box.west, box.east, 128, h, 0))
      mesh.receiveShadow = true
      mesh.renderOrder = 0
      mesh.name = 'ground near'
      wear(mesh, tex)
      const old = near
      near = { mesh, tex, cx, cz, box, born: performance.now() }
      group.add(mesh)
      /* The old square goes once the new one is in: the parent picture already covers every hole. */
      if (old !== null) {
        group.remove(old.mesh)
        old.mesh.geometry.dispose()
        old.tex.dispose()
      }
      tex.needsUpdate = true
      onChange()
      /* Then the sharp tiles, nearest the centre first, each over its parent as it arrives. */
      const order = Array.from({ length: NEAR_TILES * NEAR_TILES }, (_, k) => ({ i: k % NEAR_TILES, j: Math.floor(k / NEAR_TILES) })).sort(
        (a, b) => Math.hypot(a.i - NEAR_TILES / 2, a.j - NEAR_TILES / 2) - Math.hypot(b.i - NEAR_TILES / 2, b.j - NEAR_TILES / 2),
      )
      let dirty = false
      const flush = setInterval(() => {
        if (dirty) {
          tex.needsUpdate = true
          dirty = false
          onChange()
        }
      }, 250)
      const queue = [...order]
      refining = true
      const worker = async () => {
        while (queue.length > 0) {
          const t = queue.shift()
          if (t === undefined) break
          if (near === null || near.tex !== tex) return
          const img = await pictureOnly(tx0 + t.i, ty0 + t.j, NEAR_Z, source)
          if (img === null || ctx === null) continue
          ctx.drawImage(img, t.i * 256, t.j * 256, 256, 256)
          dirty = true
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      refining = false
      clearInterval(flush)
      tex.needsUpdate = true
      onChange()
    } finally {
      building = null
    }
  }
  void nearSquare(0, 0)

  /* ------------------------------------------------- the fine square */
  const fineZ = source === null ? null : Math.min(FINE_Z, source.maxZoom)
  let fine: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cx: number; cz: number } | null = null
  let fineBuilding = false
  const dropFine = () => {
    if (fine === null) return
    group.remove(fine.mesh)
    fine.mesh.geometry.dispose()
    fine.tex.dispose()
    const i = textured.findIndex((t) => t.mesh === fine?.mesh)
    if (i >= 0) textured.splice(i, 1)
    fine = null
    onChange()
  }
  const fineSquare = async (cx: number, cz: number) => {
    if (fineBuilding || fineZ === null || fineZ <= NEAR_Z || near === null) return
    fineBuilding = true
    try {
      const p = finePatch(frame.lat(cz), frame.lon(cx), fineZ)
      const px = FINE_TILES * 256
      const canvas = document.createElement('canvas')
      canvas.width = px
      canvas.height = px
      const ctx = canvas.getContext('2d')
      /* First the near square's own picture of the same ground, so nothing is ever a hole. */
      const nb = near.box
      const nearCanvas = near.tex.image as HTMLCanvasElement
      if (ctx !== null) {
        const nx = (lon: number) => ((tileX(lon, NEAR_Z) - tileX(nb.west, NEAR_Z)) / NEAR_TILES) * ATLAS_PX
        const ny = (lat: number) => ((tileY(lat, NEAR_Z) - tileY(nb.north, NEAR_Z)) / NEAR_TILES) * ATLAS_PX
        ctx.drawImage(nearCanvas, nx(p.west), ny(p.north), nx(p.east) - nx(p.west), ny(p.south) - ny(p.north), 0, 0, px, px)
      }
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      const h = await heightsFor(p.north, p.south, p.west, p.east, TERRAIN_MAX_Z, status, onChange, 15)
      /* A hair above the near square, drawn after it, so the sharper picture wins. */
      const mesh = new THREE.Mesh(gridGeometry(frame, p.north, p.south, p.west, p.east, 48, h, -0.15))
      mesh.receiveShadow = true
      mesh.renderOrder = 1
      mesh.name = 'ground fine'
      dropFine()
      wear(mesh, tex)
      group.add(mesh)
      fine = { mesh, tex, cx, cz }
      onChange()
      const order = Array.from({ length: FINE_TILES * FINE_TILES }, (_, k) => ({ i: k % FINE_TILES, j: Math.floor(k / FINE_TILES) })).sort(
        (a, b) => Math.hypot(a.i - FINE_TILES / 2, a.j - FINE_TILES / 2) - Math.hypot(b.i - FINE_TILES / 2, b.j - FINE_TILES / 2),
      )
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (order.length > 0) {
            const t = order.shift()
            if (t === undefined || fine?.tex !== tex) return
            const img = await pictureOnly(p.tx0 + t.i, p.ty0 + t.j, fineZ, source)
            if (img === null || ctx === null) continue
            ctx.drawImage(img, t.i * 256, t.j * 256, 256, 256)
            tex.needsUpdate = true
            onChange()
          }
        }),
      )
    } finally {
      fineBuilding = false
    }
  }

  const follow = (x: number, z: number, ahead?: { vx: number; vz: number }, heightM?: number) => {
    const tx = x + (ahead?.vx ?? 0) * 6
    const tz = z + (ahead?.vz ?? 0) * 6
    if (near === null) return
    if (Math.hypot(tx - near.cx, tz - near.cz) > RECENTRE_M) void nearSquare(tx, tz)
    /* Low over the ground: the fine square under it; high again, away with it. */
    if (heightM !== undefined && heightM < FINE_BELOW_M) {
      if (fine === null || Math.hypot(x - fine.cx, z - fine.cz) > FINE_RECENTRE_M) void fineSquare(x, z)
    } else if (fine !== null) dropFine()
  }

  return {
    group,
    follow,
    atlas: () => (near === null ? null : { texture: near.tex, ...near.box }),
    ready: () => near !== null && !refining && building === null,
    setMaterial: (h) => {
      materialHook = h
      for (const t of textured) {
        ;(t.mesh.material as THREE.Material).dispose()
        t.mesh.material = h.make(t.map)
      }
      onChange()
    },
    dispose: () => {
      for (const t of textured) {
        t.mesh.geometry.dispose()
        t.map.dispose()
        ;(t.mesh.material as THREE.Material).dispose()
      }
    },
  }
}

export { heightAt }
