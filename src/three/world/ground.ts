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
 */
import * as THREE from 'three'
import type { ImagerySource } from '../../data/imagerySources.ts'
import { frameAt, heightAt, latOf, lonOf, pictureOnly, pictureOrParent, sampleTile, terrainTile, tileX, tileY, TERRAIN_MAX_Z, type Frame } from './sources.ts'

export const NEAR_Z = 18
export const NEAR_TILES = 16
export const ATLAS_PX = NEAR_TILES * 256
export const MID_Z = 15
export const FAR_Z = 12
export const MID_HALF_M = 4500
export const FAR_HALF_M = 24_000
export const RECENTRE_M = 450
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
async function heightsFor(north: number, south: number, west: number, east: number, z: number, status: GroundStatus, onFlat: () => void) {
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
    return t == null ? 0 : seaFloor(sampleTile(t, x, y, z, lat, lon))
  }
}

export interface GroundMaterialHook {
  /** The material every ground mesh wears, given its texture: the look decides (Section 6). */
  make(map: THREE.Texture): THREE.Material
}

export interface Ground {
  group: THREE.Group
  /** Re-centre on the ground point under the camera; `ahead` (metres per second, x and z) prefetches along the flight. */
  follow(x: number, z: number, ahead?: { vx: number; vz: number }): void
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
        void (async () => {
          const h = await heightsFor(north, south, west, east, terrainZ, status, onChange)
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
        })()
      }
    }
  }
  ring(FAR_Z, FAR_HALF_M, 8, FAR_DROP_M, Math.min(FAR_Z - 1, 11), -2)
  ring(MID_Z, MID_HALF_M, 16, MID_DROP_M, 13, -1)

  /* ------------------------------------------------- the near square */
  let near: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cx: number; cz: number; box: { west: number; east: number; north: number; south: number }; born: number } | null = null
  let building: { cx: number; cz: number } | null = null
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
      const h = await heightsFor(box.north, box.south, box.west, box.east, TERRAIN_MAX_Z, status, onChange)
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
      clearInterval(flush)
      tex.needsUpdate = true
      onChange()
    } finally {
      building = null
    }
  }
  void nearSquare(0, 0)

  const follow = (x: number, z: number, ahead?: { vx: number; vz: number }) => {
    const tx = x + (ahead?.vx ?? 0) * 6
    const tz = z + (ahead?.vz ?? 0) * 6
    if (near === null) return
    if (Math.hypot(tx - near.cx, tz - near.cz) > RECENTRE_M) void nearSquare(tx, tz)
  }

  return {
    group,
    follow,
    atlas: () => (near === null ? null : { texture: near.tex, ...near.box }),
    ready: () => near !== null,
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
