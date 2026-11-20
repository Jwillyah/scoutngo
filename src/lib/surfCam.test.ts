import { beforeEach, describe, expect, it } from 'vitest'
import type { CamAt, CamEntry } from '../core/camPick.ts'
import { bigCam, camLine, keepSurfCam, readSurfCam, SURF_CAM_KEY } from './surfCam.ts'

const entry = (id: string, embed: boolean): CamEntry => ({ id, name: id, lat: 0, lon: 0, source: 's', operator: 'o', url: 'https://example.org', access: 'free', tags: ['surf'], facing: null, facingIs: null, embed })
const LIST: CamAt[] = [
  { cam: entry('a', false), km: 2.2 },
  { cam: entry('b', true), km: 5.1 },
]
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } })
})

describe('the remembered surf cam', () => {
  it('is one id on the phone, nothing else', () => {
    expect(readSurfCam()).toBeNull()
    keepSurfCam('b')
    expect(readSurfCam()).toBe('b')
    expect([...store.keys()]).toEqual([SURF_CAM_KEY])
  })
  it('is big when still in reach, else the nearest', () => {
    expect(bigCam(LIST, 'b')).toMatchObject({ yours: true, cam: { cam: { id: 'b' } } })
    expect(bigCam(LIST, 'gone')).toMatchObject({ yours: false, cam: { cam: { id: 'a' } } })
    expect(bigCam(LIST, null)?.cam.cam.id).toBe('a')
    expect(bigCam([], 'a')).toBeNull()
  })
  it('says how far and whether it plays here', () => {
    expect(camLine(LIST[0], true)).toBe('1.4 mi · o · link out')
    expect(camLine(LIST[1], false)).toBe('5.1 km · o · plays here')
  })
  it('says whose cam, so two cams under one name are told apart (Virginia Beach Pier: Surfchex and Surfline)', () => {
    const pier = (operator: string, access: 'free' | 'paid'): CamAt => ({ cam: { ...entry(operator, false), name: 'Virginia Beach Pier', operator, access }, km: 0 })
    expect(camLine(pier('Surfchex', 'free'), true)).toBe('0.0 mi · Surfchex · link out')
    expect(camLine(pier('Surfline', 'paid'), true)).toBe('0.0 mi · Surfline, paid · link out')
  })
  it('survives storage that throws', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } } })
    expect(readSurfCam()).toBeNull()
    expect(() => keepSurfCam('a')).not.toThrow()
  })
})
