import { describe, expect, it } from 'vitest'
import { CHART_CYCLE_DAYS, cycleNote, cycleState, parseEffective } from './chartCycle.ts'

describe('parsing the FAA effective stamp', () => {
  it('reads M/D/YYYY as UTC', () => {
    const at = parseEffective('10/1/2026')
    expect(at?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('reads a two-digit month and day', () => {
    expect(parseEffective('12/25/2026')?.toISOString()).toBe('2026-12-25T00:00:00.000Z')
  })

  /*
   * new Date('10/1/2026') resolves in LOCAL time, which moves this boundary by
   * a day depending on where the phone is. The parse is explicit and UTC so a
   * cycle boundary is the same instant everywhere.
   */
  it('does not depend on the device timezone', () => {
    const at = parseEffective('10/1/2026')
    expect(at?.getUTCHours()).toBe(0)
    expect(at?.getUTCDate()).toBe(1)
    expect(at?.getUTCMonth()).toBe(9)
  })

  it('rejects anything that is not that format', () => {
    for (const bad of ['', '2026-10-01', '10/1/26', 'October 1 2026', 'nonsense', '13/1/2026']) {
      expect(parseEffective(bad), bad).toBeNull()
    }
    expect(parseEffective(null)).toBeNull()
  })

  /* 2/31 would roll over to 3/3 and pass as a real date without the check. */
  it('rejects a day that does not exist in that month', () => {
    expect(parseEffective('2/31/2026')).toBeNull()
    expect(parseEffective('4/31/2026')).toBeNull()
  })
})

describe('the cycle state', () => {
  const at = (iso: string) => new Date(iso)

  it('is current inside the 56 days', () => {
    const state = cycleState('10/1/2026', at('2026-10-17T12:00:00Z'))
    expect(state.state).toBe('current')
    expect(state.state === 'current' && state.daysLeft).toBe(40)
  })

  it('is current on the effective day itself', () => {
    expect(cycleState('10/1/2026', at('2026-10-01T00:00:01Z')).state).toBe('current')
  })

  it('is superseded once the cycle has run out', () => {
    const state = cycleState('10/1/2026', at('2026-12-01T00:00:00Z'))
    expect(state.state).toBe('superseded')
    expect(state.state === 'superseded' && state.daysOver).toBe(5)
  })

  it('turns over exactly 56 days after the effective date', () => {
    const justBefore = new Date(Date.UTC(2026, 9, 1) + CHART_CYCLE_DAYS * 86_400_000 - 1000)
    const justAfter = new Date(Date.UTC(2026, 9, 1) + CHART_CYCLE_DAYS * 86_400_000 + 1000)
    expect(cycleState('10/1/2026', justBefore).state).toBe('current')
    expect(cycleState('10/1/2026', justAfter).state).toBe('superseded')
  })

  it('is unknown when the stamp cannot be read', () => {
    expect(cycleState(null, at('2026-10-17T00:00:00Z')).state).toBe('unknown')
    expect(cycleState('whenever', at('2026-10-17T00:00:00Z')).state).toBe('unknown')
  })
})

describe('the note', () => {
  it('says how long the current cycle has left', () => {
    const note = cycleNote(cycleState('10/1/2026', new Date('2026-10-17T12:00:00Z')))
    expect(note).toContain('2026-10-01')
    expect(note).toContain('40 more days')
  })

  /* A staleness notice that does not say what to do is just an apology. */
  it('says how to fix a superseded extract', () => {
    const note = cycleNote(cycleState('10/1/2026', new Date('2026-12-01T00:00:00Z')))
    expect(note).toContain('superseded')
    expect(note).toContain('node scripts/bake-faa.mjs')
  })

  it('says plainly when there is no date, rather than inventing one', () => {
    expect(cycleNote({ state: 'unknown' })).toContain('no readable chart date')
  })

  it('reports the shipped extract as current today', async () => {
    const { facilityEffective } = await import('../lib/uasfm.ts')
    const state = cycleState(facilityEffective, new Date())
    /* If this fails, the extract needs re-baking. That is the point of it. */
    expect(state.state).toBe('current')
  })
})
