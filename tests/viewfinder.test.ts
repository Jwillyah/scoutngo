import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  calibrationTarget,
  lensWiderThanPhone,
  PHONE_MAIN_LONG_SIDE_DEG,
  PHONE_ULTRA_LONG_SIDE_DEG,
} from '../src/core/arProjection.ts'
import { computeFOV, SENSORS } from '../src/core/fov.ts'
import { clampPhoneFov, ultraWideOf } from '../src/lib/phoneCamera.ts'

/*
 * THE VIEWFINDER, 29 Oct: black on an iPhone with the camera on, the "sees
 * wider" line once per body, controls over half the picture. The browser
 * proof is scripts/audit-viewfinder.mjs (WebKit, tab and standalone).
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const VF = strip(readFileSync('src/components/Viewfinder.tsx', 'utf8'))
const deg = (rad: number) => (rad * 180) / Math.PI

describe('the picture is attached once the <video> exists', () => {
  it('sets srcObject in an effect, not in a frame callback that can run before the element', () => {
    expect(VF).not.toMatch(/requestAnimationFrame\([\s\S]{0,200}srcObject/)
    const effect = VF.slice(VF.indexOf('useEffect(() => {\n    const el = video.current'), VF.indexOf('}, [phase.kind, stream])'))
    expect(effect).toContain('el.srcObject = stream')
    expect(effect).toMatch(/el\.setAttribute\('muted', ''\)/)
    expect(effect).toMatch(/el\.setAttribute\('playsinline', ''\)/)
    expect(effect).toMatch(/play\(\)\.catch/)
    expect(effect).toContain("addEventListener('loadedmetadata', start)")
    expect(effect).toContain('PICTURE_WAIT_MS')
  })
})

describe('the frame, against the phone camera', () => {
  it('a full-frame lens is 2·atan(18/f) across', () => {
    for (const f of [10, 16, 24, 28, 50, 200]) expect(computeFOV(f, SENSORS.fullFrame).hFOV).toBeCloseTo(deg(2 * Math.atan(18 / f)), 0)
  })

  it('the main camera is a 26 mm equivalent, 69°, and the ultra-wide 108°', () => {
    expect(PHONE_MAIN_LONG_SIDE_DEG).toBe(Math.round(deg(2 * Math.atan(18 / 26))))
    expect(PHONE_ULTRA_LONG_SIDE_DEG).toBe(Math.round(deg(2 * Math.atan(18 / 13))))
  })

  it('wider only when the lens sees more than the phone camera, not the cropped screen', () => {
    expect(lensWiderThanPhone(computeFOV(28, SENSORS.fullFrame).hFOV, PHONE_MAIN_LONG_SIDE_DEG)).toBe(false)
    expect(lensWiderThanPhone(computeFOV(24, SENSORS.fullFrame).hFOV, PHONE_MAIN_LONG_SIDE_DEG)).toBe(true)
    expect(lensWiderThanPhone(computeFOV(16, SENSORS.fullFrame).hFOV, PHONE_ULTRA_LONG_SIDE_DEG)).toBe(false)
  })

  it('draws one frame and says "wider" once, never once per body', () => {
    expect(VF).not.toMatch(/sees wider than this phone's camera/)
    expect(VF.match(/Wider than your phone's camera/g)).toHaveLength(1)
    expect(VF).not.toMatch(/bodies\.map\(\(body\) =>/)
  })

  it('finds the ultra-wide by its label, and only a listed one', () => {
    expect(ultraWideOf([{ kind: 'videoinput', deviceId: 'a', label: 'Back Camera' }, { kind: 'videoinput', deviceId: 'u', label: 'Back Ultra Wide Camera' }])).toBe('u')
    expect(ultraWideOf([{ kind: 'videoinput', deviceId: 'a', label: 'Back Camera' }])).toBeNull()
    expect(ultraWideOf([{ kind: 'videoinput', deviceId: '', label: 'Back Ultra Wide Camera' }])).toBeNull()
    expect(ultraWideOf([{ kind: 'audioinput', deviceId: 'm', label: 'Ultra Wide Mic' }])).toBeNull()
  })

  it('keeps a set phone field inside sense', () => {
    expect(clampPhoneFov(10)).toBe(40)
    expect(clampPhoneFov(400)).toBe(130)
    expect(clampPhoneFov(Number.NaN)).toBe(PHONE_MAIN_LONG_SIDE_DEG)
  })
})

describe('calibration', () => {
  it('on the sun when it is up, the moon when only it is, nothing when both are down', () => {
    expect(calibrationTarget(20, 40)).toBe('sun')
    expect(calibrationTarget(-10, 40)).toBe('moon')
    expect(calibrationTarget(-10, -5)).toBeNull()
  })

  it('both down is grey text, not a button', () => {
    expect(VF).toMatch(/target === null \? \(\s*<span className="vf__act vf__act--off">/)
  })
})

describe('controls', () => {
  it('the FOV assumption and the compass offset live only in the "i"', () => {
    const info = VF.slice(VF.indexOf('{info ? ('), VF.indexOf('<div className="vf__bar">'))
    expect(info).toContain('Assumes the phone camera sees about')
    expect(info).toContain('Compass offset')
    const rest = VF.replace(info, '')
    expect(rest).not.toContain('Compass offset')
    expect(rest).not.toContain('Assumes the phone camera')
  })
})
