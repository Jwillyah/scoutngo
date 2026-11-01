import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backupDue, buildBackup, crc32, isYours, markBackedUp, markReminded, restoreBackup, unzip, zip } from '../src/lib/backup.ts'

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

describe('the monthly reminder', () => {
  const now = Date.parse('2026-11-01T15:00:00Z')
  it('only with something to lose', () => {
    expect(backupDue(memory({}), now)).toBe(false)
    expect(backupDue(memory({ 'scoutngo.spots.v1': '[]' }), now)).toBe(false)
    expect(backupDue(memory({ 'scoutngo.spots.v1': '[{"a":1}]' }), now)).toBe(true)
  })
  it('not after a backup in the last 30 days, nor twice in 30 days', () => {
    const s = memory({ 'scoutngo.spots.v1': '[{"a":1}]' })
    markBackedUp(s, new Date(now - 10 * 86_400_000))
    expect(backupDue(s, now)).toBe(false)
    markBackedUp(s, new Date(now - 40 * 86_400_000))
    expect(backupDue(s, now)).toBe(true)
    markReminded(s, new Date(now))
    expect(backupDue(s, now + 86_400_000)).toBe(false)
    expect(backupDue(s, now + 31 * 86_400_000)).toBe(true)
  })
})
