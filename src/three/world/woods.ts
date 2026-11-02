/*
 * TREES OVER THE WOODS (Batch D, Section 5b).
 *
 * A woodland polygon says trees are there, not where each one stands or how
 * tall it is (src/lib/trees.ts kept them out for that reason). Seen from 400
 * ft the photo's woods were a flat green carpet; the flight-sim look wants
 * them standing. So inside the map's `landcover` wood polygons near the
 * venue, trees are drawn on a jittered grid at a nominal height, and the
 * view's "i" says so: WOODS_NOTE, like the clouds. They are picture only:
 * nothing picks against them, nothing measures them, and the mapped trees'
 * count (Clay3D.tsx) does not include them.
 *
 * Deterministic: the same venue draws the same trees every time (a hash of
 * the grid cell, never Math.random), so a before/after pair compares.
 */
import * as THREE from 'three'
import type { LatLon } from '../../core/geo.ts'
import { hash2 } from '../../core/cloudField.ts'
import { heightAt, latOf, lonOf, tileX, tileY, working, type Frame } from './sources.ts'
import { polygonMaskFor } from './waterMask.ts'

export const WOODS_NOTE = 'Trees in woods illustrative'
/** How far round the venue woods are filled, metres. */
export const WOODS_REACH_M = 1400
/** Grid spacing, metres: about one crown every 9 m. */
export const WOODS_SPACING_M = 9
/** The most drawn, so a forest venue cannot cost a phone its frame rate. */
export const WOODS_MAX = 12_000
/** The nominal height, metres, give or take a quarter. */
export const WOODS_HEIGHT_M = 13
const WOOD_Z = 14

export interface Woods {
  group: THREE.Group
  count(): number
  setLook(look: 'real' | 'animated'): void
}

/** The grid points inside the mask: pure, so it is tested without a browser. */
export function woodPoints(venue: LatLon, inWood: (lat: number, lon: number) => boolean, reachM = WOODS_REACH_M, spacingM = WOODS_SPACING_M, max = WOODS_MAX): { lat: number; lon: number; h: number }[] {
  const mLat = 111_320
  const mLon = 111_320 * Math.cos((venue.lat * Math.PI) / 180)
  const n = Math.floor(reachM / spacingM)
  const out: { lat: number; lon: number; h: number }[] = []
  for (let i = -n; i <= n && out.length < max; i += 1) {
    for (let j = -n; j <= n && out.length < max; j += 1) {
      if (i * i + j * j > n * n) continue
      const jx = (hash2(i * 1.7 + 3.1, j * 2.3) - 0.5) * spacingM * 0.8
      const jz = (hash2(i * 0.9, j * 1.3 + 7.7) - 0.5) * spacingM * 0.8
      const lat = venue.lat + (j * spacingM + jz) / mLat
      const lon = venue.lon + (i * spacingM + jx) / mLon
      if (!inWood(lat, lon)) continue
      out.push({ lat, lon, h: WOODS_HEIGHT_M * (0.75 + 0.5 * hash2(i + 11.0, j - 5.0)) })
    }
  }
  return out
}

export function createWoods(frame: Frame, venue: LatLon, onChange: () => void): Woods {
  const group = new THREE.Group()
  group.name = 'woods'
  let n = 0
  const real = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.06, 0.12, 0.045, THREE.LinearSRGBColorSpace) })
  const toon = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.12, 0.3, 0.1, THREE.LinearSRGBColorSpace), flatShading: true, emissive: new THREE.Color().setRGB(0.03, 0.08, 0.025, THREE.LinearSRGBColorSpace) })
  let mesh: THREE.InstancedMesh | null = null
  void working(async () => {
    const dLat = WOODS_REACH_M / 111_320
    const dLon = WOODS_REACH_M / (111_320 * Math.cos((venue.lat * Math.PI) / 180))
    /* The mask at whole z14 tiles, so the box always contains whole polygons' tiles. */
    const north = latOf(Math.floor(tileY(venue.lat + dLat, WOOD_Z)), WOOD_Z)
    const south = latOf(Math.floor(tileY(venue.lat - dLat, WOOD_Z)) + 1, WOOD_Z)
    const west = lonOf(Math.floor(tileX(venue.lon - dLon, WOOD_Z)), WOOD_Z)
    const east = lonOf(Math.floor(tileX(venue.lon + dLon, WOOD_Z)) + 1, WOOD_Z)
    const mask = await polygonMaskFor({ layer: 'landcover', keep: (p) => p.class === 'wood' }, north, south, west, east, WOOD_Z)
    const pts = woodPoints(venue, mask.inWater)
    if (pts.length === 0) return
    /* A crown: a squat low-poly ball on a short trunk, one geometry. */
    const crown = new THREE.IcosahedronGeometry(1, 0)
    const ground = await Promise.all(pts.map((p) => heightAt(p.lat, p.lon)))
    mesh = new THREE.InstancedMesh(crown, real, pts.length)
    mesh.name = 'woods'
    mesh.castShadow = true
    mesh.receiveShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    pts.forEach((p, k) => {
      const g = ground[k] ?? 0
      const r = p.h * 0.36
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(p.lat * 1e5, p.lon * 1e5) * 6.283)
      m.compose(new THREE.Vector3(frame.x(p.lon), g + p.h * 0.6, frame.z(p.lat)), q, new THREE.Vector3(r, p.h * 0.42, r))
      mesh?.setMatrixAt(k, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
    n = pts.length
    onChange()
  })
  return {
    group,
    count: () => n,
    setLook: (look) => {
      if (mesh !== null) mesh.material = look === 'animated' ? toon : real
      onChange()
    },
  }
}
