/*
 * THE LOOK: Real (the photo, lit by our sun) or Animated (Section 6, a
 * stylised render made by the materials themselves, never a filter laid over
 * the picture). One switch for the ground, the buildings and the water.
 */
import * as THREE from 'three'
import type { SkyColours } from '../../core/skyLook.ts'
import type { Ground, GroundMaterialHook } from './ground.ts'

export type WorldLook = 'real' | 'animated'

interface Restyle {
  setLook(look: WorldLook): void
}

export interface LookControl {
  groundHook(): GroundMaterialHook
  set(look: WorldLook, ground: Ground, buildings: Restyle, water: Restyle): void
  setSun(dir: THREE.Vector3, c: SkyColours): void
  frame(seconds: number): void
  now(): WorldLook
}

/*
 * THE PHOTO IS ALREADY LIT. A satellite picture carries the light of the day
 * it was flown; lit again by the scene's sun it went dark and muddy (first
 * shots, 1 Nov). So the ground wears the photo unlit, tinted by the hour's
 * daylight (src/core/skyLook.ts): full at day, warm and dimmer at sunset,
 * blue and dark at night. Shadows still fall on it (Section 1's sun).
 */
export function daylightTint(c: SkyColours): THREE.Color {
  const k = Math.min(1, 0.12 + 0.28 * c.lightIntensity + 0.25 * c.ambientIntensity)
  const warm = c.light
  return new THREE.Color().setRGB(k * (0.75 + 0.25 * warm[0]), k * (0.75 + 0.25 * warm[1]), k * (0.75 + 0.25 * warm[2]), THREE.LinearSRGBColorSpace)
}

export function createWorldLook(): LookControl {
  let current: WorldLook = 'real'
  const tint = new THREE.Color(1, 1, 1)
  const made: THREE.MeshLambertMaterial[] = []
  const real: GroundMaterialHook = {
    make: (map) => {
      /* Lambert with the photo as its own light (emissive), the sun's shadows darkening it where they fall. */
      const m = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: tint, emissiveMap: map, map })
      m.color.setRGB(0.25, 0.25, 0.25)
      made.push(m)
      return m
    },
  }
  return {
    groundHook: () => real,
    set: (look, ground, buildings, water) => {
      if (look === current) return
      current = look
      ground.setMaterial(real)
      buildings.setLook(look)
      water.setLook(look)
    },
    setSun: (_dir, c) => {
      tint.copy(daylightTint(c))
      for (const m of made) m.emissive.copy(tint)
    },
    frame: () => {},
    now: () => current,
  }
}
