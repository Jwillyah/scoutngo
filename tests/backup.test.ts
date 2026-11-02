import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backupDue, backupLine, buildBackup, crc32, isYours, markBackedUp, markReminded, restoreBackup, unzip, YOURS_CHANGED, zip } from '../src/lib/backup.ts'
import { FIRST_ENTRY, readFireLog, withEntry, writeFireLog } from '../src/lib/fireLog.ts'
import { entryFromPhoto, readTruthLog, writeTruthLog, type TruthEntry } from '../src/lib/truthLog.ts'
import { SPOTS_STORAGE_KEY } from '../src/lib/spots.ts'
import { KIT_STORAGE_KEY } from '../src/lib/kitSelection.ts'

/* Batch E, Section 6: where your things are kept, and a copy you hold. */
function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
    map: m,
  }
}
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP8='
const PHONE = {
  'scoutngo.spots.v1': JSON.stringify([{ name: 'Rudee Inlet', lat: 36.83 }]),
  'scoutngo.fireLog.v1': JSON.stringify([{ id: 'a', photo: JPEG }]),
  'scoutngo.settings': JSON.stringify({ units: { wind: 'kt' } }),
  'scoutngo.anthropicKey.v1': 'sk-ant-secret',
  'scoutngo.forecast.v1': '{"big":"cache"}',
  'unrelated.key': 'x',
}

describe('the zip', () => {
  it('a known CRC', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })
  it('round-trips, and a real unzip reads it', () => {
    const files = [{ name: 'backup.json', bytes: new TextEncoder().encode('{"a":1}') }, { name: 'thumbnails/1.jpg', bytes: new Uint8Array([255, 216, 255]) }]
    const z = zip(files)
    expect(unzip(z)?.map((e) => [e.name, [...e.bytes]])).toEqual(files.map((e) => [e.name, [...e.bytes]]))
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    writeFileSync(join(dir, 'b.zip'), z)
    const listed = execFileSync('unzip', ['-l', join(dir, 'b.zip')]).toString()
    expect(listed).toContain('backup.json')
    expect(listed).toContain('thumbnails/1.jpg')
    expect(execFileSync('unzip', ['-t', join(dir, 'b.zip')]).toString()).toContain('No errors')
  })
})

describe('the backup', () => {
  it('carries what is yours, never the key or the caches', () => {
    expect(isYours('scoutngo.spots.v1')).toBe(true)
    expect(isYours('scoutngo.anthropicKey.v1')).toBe(false)
    expect(isYours('scoutngo.forecast.v1')).toBe(false)
    expect(isYours('unrelated.key')).toBe(false)
    const entries = buildBackup(memory(PHONE), new Date('2026-11-01T15:00:00Z'))
    const file = JSON.parse(new TextDecoder().decode(entries[0].bytes))
    expect(entries[0].name).toBe('backup.json')
    expect(Object.keys(file.keys).sort()).toEqual(['scoutngo.fireLog.v1', 'scoutngo.settings', 'scoutngo.spots.v1'])
    expect(JSON.stringify(file)).not.toContain('sk-ant-secret')
  })

  it('takes the thumbnails out as JPEG files and puts them back on restore', () => {
    const entries = buildBackup(memory(PHONE))
    expect(entries.map((e) => e.name)).toEqual(['backup.json', 'thumbnails/1.jpg'])
    expect(new TextDecoder().decode(entries[0].bytes)).not.toContain('base64')
    const fresh = memory()
    const got = restoreBackup(zip(entries), fresh)
    expect(got).toMatchObject({ ok: true, keys: 3, thumbs: 1 })
    expect(fresh.getItem('scoutngo.fireLog.v1')).toBe(PHONE['scoutngo.fireLog.v1'])
    expect(fresh.getItem('scoutngo.spots.v1')).toBe(PHONE['scoutngo.spots.v1'])
    expect(fresh.getItem('scoutngo.anthropicKey.v1')).toBeNull()
  })

  it('restores a bare backup.json too, and refuses anything else', () => {
    const json = buildBackup(memory({ 'scoutngo.spots.v1': '[1]' }))[0].bytes
    expect(restoreBackup(json, memory())).toMatchObject({ ok: true, keys: 1 })
    expect(restoreBackup(new TextEncoder().encode('{"hello":1}'), memory())).toMatchObject({ ok: false })
    expect(restoreBackup(new TextEncoder().encode('not json'), memory())).toMatchObject({ ok: false })
  })
})

describe('the nudge, after a change (Batch G)', () => {
  const now = Date.parse('2026-11-02T15:00:00Z')
  it('only with something to lose, or a kit change', () => {
    expect(backupDue(memory({}), now)).toBe(false)
    expect(backupDue(memory({ 'scoutngo.spots.v1': '[]' }), now)).toBe(false)
    expect(backupDue(memory({ 'scoutngo.spots.v1': '[{"a":1}]' }), now)).toBe(true)
    expect(backupDue(memory({}), now, true)).toBe(true)
  })
  it('when the last backup is over 7 days old, and Not now hides it for 7 days', () => {
    const s = memory({ 'scoutngo.fireLog.v1': '[{"a":1}]' })
    markBackedUp(s, new Date(now - 3 * 86_400_000))
    expect(backupDue(s, now)).toBe(false)
    markBackedUp(s, new Date(now - 8 * 86_400_000))
    expect(backupDue(s, now)).toBe(true)
    markReminded(s, new Date(now))
    expect(backupDue(s, now + 6 * 86_400_000)).toBe(false)
    expect(backupDue(s, now + 8 * 86_400_000)).toBe(true)
  })
  it('says the last backup in one line: never, or its day', () => {
    expect(backupLine(memory({}))).toBe('Back up? Last backup: never')
    const s = memory({})
    markBackedUp(s, new Date('2026-10-12T15:00:00Z'))
    expect(backupLine(s, 'America/New_York')).toBe('Back up? Last backup: 12 Oct')
  })
  it('a new log entry or truth-loop result is a change the app hears', () => {
    const heard: string[] = []
    const target = new EventTarget()
    const was = globalThis.window
    ;(globalThis as { window?: unknown }).window = { dispatchEvent: (e: Event) => target.dispatchEvent(e) }
    target.addEventListener(YOURS_CHANGED, () => heard.push('changed'))
    try {
      writeFireLog([FIRST_ENTRY], memory())
      writeTruthLog([], memory())
    } finally {
      ;(globalThis as { window?: unknown }).window = was
    }
    expect(heard).toEqual(['changed', 'changed'])
  })
})

describe('the round trip: everything that is yours comes back', () => {
  it('the log, truth-loop results, spots, kit and settings', () => {
    const phone = memory()
    const fire = withEntry([FIRST_ENTRY], { id: 'b', date: '2026-11-02', event: 'sunrise', place: 'Virginia Beach Fishing Pier', outcome: 'fired', forecast: 'Fire likely', photo: JPEG })
    writeFireLog(fire, phone)
    const truth = entryFromPhoto(
      { make: 'DJI', model: 'Air 3S', takenLocal: null, offset: null, focalMm: null, focal35: null, width: null, height: null, lat: null, lon: null, aboveTakeoffM: null, gimbalYaw: null, gimbalPitch: null, gimbalRoll: null, software: null, stitched: false, crop: null },
      'America/New_York',
      fire,
      'IMG_2831.jpeg',
      { place: { at: { lat: 36.8435575, lon: -75.9713104 }, from: 'venue' }, day: { date: '2026-11-02', event: 'sunrise' } },
    ) as TruthEntry
    writeTruthLog([{ ...truth, outcome: 'fired', sky: { cloud: 0.4, lit: 0.25, saturation: 0.5, hue: 20, suggest: 'fired' }, thumb: JPEG }], phone)
    phone.setItem(SPOTS_STORAGE_KEY, JSON.stringify([{ id: 's1', name: 'Rudee Inlet', lat: 36.83, lon: -75.97 }]))
    phone.setItem(KIT_STORAGE_KEY, JSON.stringify({ bodyIds: ['a7iv'], lensIds: ['24-70'], droneIds: ['dji-air-3s'] }))
    phone.setItem('scoutngo.settings', JSON.stringify({ units: { wind: 'kt', height: 'ft' }, showLabels: true }))
    phone.setItem('scoutngo.anthropicKey.v1', 'sk-ant-secret')
    const before = new Map(phone.map)

    const fresh = memory()
    const got = restoreBackup(zip(buildBackup(phone)), fresh)
    expect(got).toMatchObject({ ok: true, keys: 5, thumbs: 2 })
    for (const k of ['scoutngo.fireLog.v1', 'scoutngo.truthLog.v1', SPOTS_STORAGE_KEY, KIT_STORAGE_KEY, 'scoutngo.settings']) expect(fresh.getItem(k)).toBe(before.get(k))
    /* And read back by the app's own readers, not only as text. */
    expect(readFireLog(fresh).map((e) => e.outcome)).toEqual(['fired', 'fired'])
    const back = readTruthLog(fresh)[0]
    expect(back).toMatchObject({ placeFrom: 'venue', timeFrom: 'asked', outcome: 'fired', thumb: JPEG })
    expect(back.sky?.suggest).toBe('fired')
    expect(fresh.getItem('scoutngo.anthropicKey.v1')).toBeNull()
  })
})
