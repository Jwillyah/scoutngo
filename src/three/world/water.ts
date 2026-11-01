/*
 * WATER AND COASTLINE (Batch D, Section 3).
 */
import * as THREE from 'three'
import type { LatLon } from '../../core/geo.ts'
import type { SkyColours } from '../../core/skyLook.ts'
import type { CinemaInputs } from '../cinema.ts'
import type { Frame } from './sources.ts'

export function createWater(frame: Frame, onChange: () => void) {
  void frame
  const group = new THREE.Group()
  group.name = 'water'
  return {
    group,
    set: (inputs: CinemaInputs | null, venue: LatLon) => void [inputs, venue, onChange],
    setSun: (dir: THREE.Vector3, c: SkyColours) => void [dir, c],
    frame: (seconds: number, camera: THREE.Camera) => void [seconds, camera],
    animating: () => false,
    setLook: (look: string) => void look,
  }
}
