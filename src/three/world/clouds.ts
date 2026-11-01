/*
 * CLOUDS IN THE WORLD (Batch D, Section 5).
 */
import * as THREE from 'three'
import type { SkyColours } from '../../core/skyLook.ts'
import type { CinemaInputs } from '../cinema.ts'

export function createClouds(onChange: () => void) {
  const group = new THREE.Group()
  group.name = 'clouds'
  return {
    group,
    set: (inputs: CinemaInputs | null) => void [inputs, onChange],
    setSun: (dir: THREE.Vector3, c: SkyColours) => void [dir, c],
    frame: (seconds: number, camera: THREE.Camera) => void [seconds, camera],
    animating: () => false,
    drawn: () => false,
    setQuality: (q: 'high' | 'battery') => void q,
  }
}
