/*
 * BRIDGES AND PIERS IN 3D (Batch I, Section 6): OSM's bridge and pier ways
 * from the map's own vector tiles, as decks on pilings. The arithmetic is
 * src/core/decks.ts; this loads the tiles round the camera and builds the
 * meshes, one merged mesh for the decks and one for the pilings.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DECK_THICK_M, isDeck, PIER_DECK_M, pilings, segmentsOf, type DeckLine, type DeckSegment } from '../../core/decks.ts'
import { tilePointLonLat } from '../../core/seaTile.ts'
import { loadVectorTile, vectorExtent } from '../../lib/vectorTiles.ts'
import { tilesInBox } from '../../lib/tileRange.ts'
import { heightAt, type Frame } from './sources.ts'

export const DECKS_Z = 14
/** Ways loaded this far round the camera, and again when it has moved this far. */
export const DECKS_REACH_M = 1600
export const DECKS_RECENTRE_M = 900
const PIER_PILE_GRID_M = 12

export interface Decks {
  group: THREE.Group
  follow(x: number, z: number): void
  counts(): { bridges: number; piers: number; pilings: number }
  dispose(): void
}

const groundOrSea = async (lat: number, lon: number) => Math.max(-1.5, (await heightAt(lat, lon)) ?? 0)

function inRing(ring: readonly { x: number; z: number }[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

export function createDecks(frame: Frame, onChange: () => void): Decks {
  const group = new THREE.Group()
  group.name = 'decks'
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9, metalness: 0 })
  const timber = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.95, metalness: 0 })
  const loaded = new Set<string>()
  let centre: { x: number; z: number } | null = null
  let tally = { bridges: 0, piers: 0, pilings: 0 }
  const meshes: THREE.Mesh[] = []

  const add = (geoms: THREE.BufferGeometry[], material: THREE.Material) => {
    if (geoms.length === 0) return
    const merged = mergeGeometries(geoms, false)
    for (const g of geoms) g.dispose()
    if (merged === null) return
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    meshes.push(mesh)
  }

  const box = (s: DeckSegment) => {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)
    const g = new THREE.BoxGeometry(len, DECK_THICK_M, s.width)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((s.a.x + s.b.x) / 2, (s.topA + s.topB) / 2 - DECK_THICK_M / 2, (s.a.z + s.b.z) / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(s.b.z - s.a.z, s.b.x - s.a.x)),
      new THREE.Vector3(1, 1, 1),
    )
    g.applyMatrix4(m)
    return g
  }
  const pile = (p: { x: number; z: number; top: number; bottom: number }, r = 0.35) => {
    const h = Math.max(0.5, p.top - p.bottom)
    const g = new THREE.CylinderGeometry(r, r, h, 6)
    g.translate(p.x, p.bottom + h / 2, p.z)
    return g
  }

  async function loadAround(x: number, z: number) {
    const lat = frame.lat(z)
    const lon = frame.lon(x)
    const dLat = DECKS_REACH_M / frame.mLat
    const dLon = DECKS_REACH_M / frame.mLon
    const tiles = tilesInBox({ south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon }, DECKS_Z).filter((t) => !loaded.has(`${t.x}/${t.y}`))
    for (const t of tiles) loaded.add(`${t.x}/${t.y}`)
    const decks: THREE.BufferGeometry[] = []
    const piers: THREE.BufferGeometry[] = []
    const piles: THREE.BufferGeometry[] = []
    await Promise.all(
      tiles.map(async (t) => {
        const tile = await loadVectorTile({ z: t.z, x: t.x, y: t.y })
        const layer = tile?.layers.transportation
        if (tile == null || layer === undefined) return
        const ext = layer.extent || vectorExtent(tile)
        const at = (p: { x: number; y: number }) => {
          const ll = tilePointLonLat({ z: t.z, x: t.x, y: t.y }, p.x / ext, p.y / ext)
          return { x: frame.x(ll.lon), z: frame.z(ll.lat), lat: ll.lat, lon: ll.lon }
        }
        for (let i = 0; i < layer.length; i += 1) {
          const f = layer.feature(i)
          const tag = isDeck(f.properties as Record<string, unknown>)
          if (tag === null) continue
          if (f.type === 2) {
            for (const raw of f.loadGeometry()) {
              const pts = raw.map(at)
              if (pts.length < 2) continue
              const line: DeckLine = { ...tag, points: pts }
              const [ga, gb] = await Promise.all([groundOrSea(pts[0].lat, pts[0].lon), groundOrSea(pts[pts.length - 1].lat, pts[pts.length - 1].lon)])
              const segs = segmentsOf(line, ga, gb)
              for (const s of segs) (tag.kind === 'pier' ? piers : decks).push(box(s))
              /* Under a bridge the ground between its ends: straight between them, the sea's floor where it dips under (piers: the sea). */
              const total = segs.reduce((n, s) => n + Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), 0)
              let run = 0
              const along = segs.map((s) => {
                const r0 = run
                run += Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)
                return { s, r0 }
              })
              const groundUnder = (px: number, pz: number) => {
                if (tag.kind === 'pier') return -1.5
                const hit = along.find(({ s }) => Math.abs((s.b.x - s.a.x) * (pz - s.a.z) - (s.b.z - s.a.z) * (px - s.a.x)) < 1e-3 * Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) + 1e-6)
                const d = hit === undefined ? total / 2 : hit.r0 + Math.hypot(px - hit.s.a.x, pz - hit.s.a.z)
                const t01 = total === 0 ? 0.5 : d / total
                /* Mid-span the ground is the water's floor, the ends the land: a bridge crosses something. */
                return Math.min(ga + (gb - ga) * t01, -1.5 + Math.abs(t01 - 0.5) * 2 * (Math.max(ga, gb) + 1.5))
              }
              for (const p of pilings(segs, groundUnder)) piles.push(pile(p))
              if (tag.kind === 'pier') tally.piers += 1
              else tally.bridges += 1
            }
          } else if (f.type === 3 && tag.kind === 'pier') {
            for (const raw of f.loadGeometry()) {
              const ring = raw.map(at)
              if (ring.length < 3) continue
              const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.z)))
              const g = new THREE.ExtrudeGeometry(shape, { depth: DECK_THICK_M, bevelEnabled: false })
              g.rotateX(-Math.PI / 2)
              g.translate(0, PIER_DECK_M - DECK_THICK_M, 0)
              piers.push(g)
              const xs = ring.map((p) => p.x)
              const zs = ring.map((p) => p.z)
              for (let px = Math.min(...xs) + PIER_PILE_GRID_M / 2; px < Math.max(...xs); px += PIER_PILE_GRID_M) {
                for (let pz = Math.min(...zs) + PIER_PILE_GRID_M / 2; pz < Math.max(...zs); pz += PIER_PILE_GRID_M) {
                  if (inRing(ring, px, pz)) piles.push(pile({ x: px, z: pz, top: PIER_DECK_M - DECK_THICK_M, bottom: -3 }, 0.3))
                }
              }
              tally.piers += 1
            }
          }
        }
      }),
    )
    tally = { ...tally, pilings: tally.pilings + piles.length }
    add(decks, concrete)
    add(piers, timber)
    add(piles, concrete)
    onChange()
  }

  return {
    group,
    follow(x, z) {
      if (centre !== null && Math.hypot(x - centre.x, z - centre.z) < DECKS_RECENTRE_M) return
      centre = { x, z }
      void loadAround(x, z)
    },
    counts: () => tally,
    dispose() {
      for (const m of meshes) m.geometry.dispose()
      concrete.dispose()
      timber.dispose()
    },
  }
}
