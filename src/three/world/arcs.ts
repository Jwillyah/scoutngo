/*
 * THE SUN AND MOON ARCS AND THEIR HOUR PILLS (Batch D, Section 9).
 *
 * The sun's arc is its path above the horizon, so its pills are the daylight
 * hours only. The moon's arc and its pills show only while Sky's Moon page is
 * open (setMoonShown). And no pill is drawn where it would land on another
 * pill or on a control over the map (the chips, the top bar, the 3D view's
 * line, the fly screen's HUD): each frame, nearest the camera first, a pill
 * that would overlap one already placed or a control is dropped (Batch E,
 * 1 Nov: "12 AM, 1 AM, 3 AM" and "9 AM 10 AM 7..." stacked over the chips).
 */
import * as THREE from 'three'
import { FLOATING_CHROME_SELECTORS, floatingChromeNodes } from '../../lib/floatingChrome.ts'
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
  /* The pills drawn last frame, in canvas pixels: for checks. */
  let drawnRects: { text: string; l: number; t: number; r: number; b: number }[] = []
  let why = { behind: 0, off: 0, blocked: 0, frames: 0 }
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
          s.userData.text = `${arc.body} ${hour(h.at)}`
          s.position.copy(place(h))
          group.add(s)
          labels.push({ sprite: s, body: arc.body })
        }
      }
      visible()
      onChange()
    },
    pills: () => (shown ? drawnRects : []),
    debug: () => ({ shown, moonShown, labels: labels.length, sun: labels.filter((l) => l.body === 'sun').length, why }),
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
    frame: (camera: THREE.Camera, canvas: HTMLCanvasElement) => {
      if (!shown) return
      /* This frame's camera, not the last one's: it is projected against before the render updates it. */
      camera.updateMatrixWorld()
      const box = canvas.getBoundingClientRect()
      /* The controls over the map, in canvas pixels. */
      const blocked = floatingChromeNodes(document, [...FLOATING_CHROME_SELECTORS, '.chips2', '.topbar', '.clay__legend', '.fly__top', '.fly__hud', '.sheet'])
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top }))
      const placed: { l: number; t: number; r: number; b: number }[] = []
      drawnRects = []
      why = { behind: 0, off: 0, blocked: 0, frames: why.frames + 1 }
      const v = new THREE.Vector3()
      const order = labels
        .filter((l) => l.body === 'sun' || moonShown)
        .map((l) => ({ l, d: l.sprite.position.distanceTo(camera.position) }))
        .sort((a, b) => a.d - b.d)
      for (const { l } of order) {
        v.copy(l.sprite.position).project(camera)
        if (v.z > 1 || v.z < -1) {
          why.behind += 1
          l.sprite.visible = false
          continue
        }
        const x = ((v.x + 1) / 2) * box.width
        const y = ((1 - v.y) / 2) * box.height
        if (x < 0 || y < 0 || x > box.width || y > box.height) {
          why.off += 1
          l.sprite.visible = false
          continue
        }
        /* The pill's size on screen: its scale is a share of the view's height. */
        const h = l.sprite.scale.y * box.height
        const w = l.sprite.scale.x * box.height
        const r = { l: x - w / 2 - 2, t: y - h / 2 - 2, r: x + w / 2 + 2, b: y + h / 2 + 2 }
        const hit = (q: { l: number; t: number; r: number; b: number }) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t
        const ok = !placed.some(hit) && !blocked.some(hit)
        l.sprite.visible = ok
        if (!ok) why.blocked += 1
        if (ok) {
          placed.push(r)
          drawnRects.push({ text: String(l.sprite.userData.text ?? ''), l: r.l + box.left, t: r.t + box.top, r: r.r + box.left, b: r.b + box.top })
        }
      }
    },
  }
}
