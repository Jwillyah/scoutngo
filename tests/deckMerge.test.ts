import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { describe, expect, it, vi } from 'vitest'
import { mergeable } from '../src/three/world/decks.ts'

/* Batch Beach, Section 4: the 3D console's "mergeGeometries() failed" on a pier: a box, a piling and an extruded outline. */
describe('pier pieces merge into one mesh', () => {
  const pieces = () => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4, 0), new THREE.Vector2(4, 2), new THREE.Vector2(0, 2)])
    return [new THREE.BoxGeometry(10, 0.5, 3), new THREE.CylinderGeometry(0.2, 0.2, 4, 6), new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })]
  }
  it('as they come, three refuses them and says so on the console', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(mergeGeometries(pieces(), false)).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
  it('made alike, they merge, with every triangle kept and nothing on the console', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ready = mergeable(pieces())
    const merged = mergeGeometries(ready, false)
    expect(merged).not.toBeNull()
    expect(merged?.getAttribute('position').count).toBe(ready.reduce((n, g) => n + g.getAttribute('position').count, 0))
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
