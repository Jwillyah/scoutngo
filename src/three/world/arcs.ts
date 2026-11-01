/*
 * THE SUN AND MOON ARCS AND THEIR HOUR PILLS (Section 9 refines which show).
 */
import * as THREE from 'three'
import type { ArcSample, SkyArc } from '../../core/sky3d.ts'

export function createArcs(onChange: () => void) {
  const group = new THREE.Group()
  group.name = 'arcs'
  let shown = true
  let moonShown = false
  const labels: { sprite: THREE.Sprite; body: 'sun' | 'moon' }[] = []
  const lines: { line: THREE.Line; body: 'sun' | 'moon' }[] = []
  const pill = (text: string) => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 48
    const g = c.getContext('2d')
    if (g !== null) {
      g.fillStyle = 'rgba(10,11,9,0.82)'
      g.beginPath()
      g.roundRect(4, 6, 120, 36, 16)
      g.fill()
      g.fillStyle = '#fff'
      g.font = '600 24px ui-monospace, Menlo, monospace'
      g.textAlign = 'center'
      g.fillText(text, 64, 33)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, toneMapped: false, fog: false }))
    s.scale.set(0.09, 0.034, 1)
    s.renderOrder = 800
    return s
  }
  const visible = () => {
    group.visible = shown
    for (const l of labels) l.sprite.visible = l.body === 'sun' || moonShown
    for (const l of lines) l.line.visible = l.body === 'sun' || moonShown
  }
  return {
    group,
    set: (arcs: readonly SkyArc[], place: (s: ArcSample) => THREE.Vector3, hour: (at: Date) => string) => {
      for (const c of [...group.children]) group.remove(c)
      labels.length = 0
      lines.length = 0
      for (const arc of arcs) {
        const colour = arc.body === 'sun' ? 0xffd54a : 0xb4b4b4
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.path.map(place)), new THREE.LineBasicMaterial({ color: colour, fog: false, toneMapped: false, depthTest: false }))
        line.renderOrder = 790
        group.add(line)
        lines.push({ line, body: arc.body })
        for (const h of arc.hours) {
          const s = pill(hour(h.at))
          s.position.copy(place(h))
          group.add(s)
          labels.push({ sprite: s, body: arc.body })
        }
      }
      visible()
      onChange()
    },
    setShown: (show: boolean) => {
      shown = show
      visible()
      onChange()
    },
    setMoonShown: (show: boolean) => {
      moonShown = show
      visible()
      onChange()
    },
    frame: (camera: THREE.Camera, canvas: HTMLCanvasElement) => void [camera, canvas],
  }
}
