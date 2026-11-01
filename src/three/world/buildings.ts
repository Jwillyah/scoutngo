/*
 * BUILDINGS AND TREES (Batch D, Section 4).
 */
import * as THREE from 'three'
import { NOMINAL_DRAW_HEIGHT } from '../../core/buildingHeight.ts'
import type { Building } from '../../lib/buildings.ts'
import type { LatLon } from '../../core/geo.ts'
import type { Ground } from './ground.ts'
import { heightAt, type Frame } from './sources.ts'

export interface TreeIn {
  at: LatLon
  height: number
  known: boolean
}

export function createBuildings(frame: Frame, ground: Ground, onChange: () => void) {
  void ground
  const group = new THREE.Group()
  group.name = 'buildings'
  let list: readonly Building[] = []
  const clay = new THREE.MeshStandardMaterial({ color: 0xcdbfa9, roughness: 0.9 })
  const set = (buildings: readonly Building[]) => {
    list = buildings
    for (const c of [...group.children]) group.remove(c)
    const base = heightAt(frame.venue.lat, frame.venue.lon)
    void base.then((g) => {
      for (const b of buildings) {
        if (b.ring.length < 4) continue
        const shape = new THREE.Shape(b.ring.map(([lon, lat]) => new THREE.Vector2(frame.x(lon), -frame.z(lat))))
        const h = b.height.metres ?? NOMINAL_DRAW_HEIGHT
        const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
        geo.rotateX(-Math.PI / 2)
        const m = new THREE.Mesh(geo, clay)
        m.position.y = g ?? 0
        m.castShadow = b.height.metres !== null
        m.receiveShadow = true
        group.add(m)
      }
      onChange()
    })
  }
  return {
    group,
    set,
    setTrees: (trees: readonly TreeIn[]) => void trees,
    list: () => list,
    follow: (x: number, z: number) => void [x, z],
    setLook: (look: string) => void look,
  }
}
