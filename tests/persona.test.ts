import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_ACTIVITIES_KEY, PERSONA_KEY, personaFromLegacy, readPersona, revivePersona, writePersona } from '../src/lib/persona.ts'
import { readActivities, writeActivities } from '../src/lib/activities.ts'

/* Batch SIMPLE-2, Section 2: one persona, on this phone only; Batch M's list read once as the migration. */
describe('the persona store', () => {
  let store: Record<string, string> = {}
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
  })

  it('never asked: null', () => {
    expect(readPersona()).toBeNull()
    expect(readActivities()).toBeNull()
  })
  it('a pick is kept under scoutngo.* and read back', () => {
    writePersona('fish')
    expect(store[PERSONA_KEY]).toBe('fish')
    expect(PERSONA_KEY.startsWith('scoutngo.')).toBe(true)
    expect(readPersona()).toBe('fish')
    expect(readActivities()).toEqual(['fish'])
  })
  it('migrates Batch M’s list: its first pick leads, and the list is never written', () => {
    store[LEGACY_ACTIVITIES_KEY] = JSON.stringify(['shoot', 'drone', 'surf'])
    expect(readPersona()).toBe('shoot')
    expect(store[PERSONA_KEY]).toBeUndefined()
    /* A pick made since wins over the old list. */
    writePersona('surf')
    expect(readPersona()).toBe('surf')
    expect(store[LEGACY_ACTIVITIES_KEY]).toBe(JSON.stringify(['shoot', 'drone', 'surf']))
  })
  it('the activities API writes the persona (one source)', () => {
    writeActivities(['drone', 'surf'])
    expect(readPersona()).toBe('drone')
    expect(store[LEGACY_ACTIVITIES_KEY]).toBeUndefined()
  })
  it('unreadable values are not a persona', () => {
    expect(revivePersona('kite')).toBeNull()
    expect(revivePersona('"surf"')).toBe('surf')
    expect(personaFromLegacy('not json')).toBeNull()
    expect(personaFromLegacy('[]')).toBeNull()
    expect(personaFromLegacy('["kite","fish"]')).toBe('fish')
  })
})
