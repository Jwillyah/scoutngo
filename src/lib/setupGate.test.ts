import { describe, expect, it, vi } from 'vitest'
import { ringNode, setupGap, SETUP_FIELD_TARGET } from './mode.ts'
import {
  defaultVenue,
  hasErrors,
  resolveWindow,
  validateVenue,
  withCoordinates,
  type VenueDraft,
  type VenueField,
} from './venue.ts'

const now = new Date(2026, 8, 21, 9, 0)
const PIN = { lat: 38.364236, lon: -75.605912 }
/* Exactly what dragging the pin produces: a coordinate, and no name. */
const dragged = withCoordinates(defaultVenue(now), PIN)

/*
 * THE BUG. Dragging the pin wrote latitude and longitude and never a name, the
 * name was required, and there was no name input on screen. The forward button
 * stayed blocked and said "Drop a pin on the venue" over a dropped pin.
 */
describe('a dragged pin with no name', () => {
  it('is a complete venue', () => {
    /* The name is a cache now: absent until it resolves for THIS pin. */
    expect(dragged.name).toBeNull()
    expect(validateVenue(dragged)).toEqual({})
    expect(setupGap(validateVenue(dragged))).toBeNull()
  })

  it('resolves to a window, so sun, tide and the rest can run', () => {
    expect(resolveWindow(dragged)).not.toBeNull()
  })
})

/*
 * Drafts that break each thing validateVenue can complain about. Used to prove
 * the forward button only ever names a field that was actually flagged.
 */
const BROKEN: VenueDraft[] = [
  defaultVenue(now),
  { ...dragged, latitude: '' },
  { ...dragged, longitude: 'east' },
  { ...dragged, latitude: '91' },
  { ...dragged, date: '' },
  { ...dragged, date: '2026-02-31x' },
  { ...dragged, startTime: '' },
  { ...dragged, endTime: '' },
  { ...dragged, startTime: '18:00', endTime: '09:00' },
  { ...dragged, name: null, eventDescription: '', desiredOutcome: '' },
]

describe('setupGap', () => {
  it('names a field validateVenue actually returned, or nothing when it returned none', () => {
    for (const draft of BROKEN) {
      const errors = validateVenue(draft)
      const gap = setupGap(errors)
      if (!hasErrors(errors)) {
        expect(gap).toBeNull()
        continue
      }
      expect(gap).not.toBeNull()
      expect(Object.keys(errors)).toContain(gap?.field)
      expect(gap?.target).toBe(SETUP_FIELD_TARGET[gap!.field])
    }
  })

  it('never blocks without saying why', () => {
    for (const draft of BROKEN) {
      const errors = validateVenue(draft)
      expect(hasErrors(errors)).toBe(setupGap(errors) !== null)
    }
  })

  it('points at the pin only when the pin is what is missing', () => {
    expect(setupGap(validateVenue(defaultVenue(now)))?.target).toBe('venue')
    const late = setupGap(validateVenue({ ...dragged, startTime: '18:00', endTime: '09:00' }))
    expect(late?.field).toBe('endTime')
    expect(late?.target).toBe('window')
    expect(late?.copy).not.toContain('pin')
    expect(late?.copy).toContain('End time must be after the start.')
  })

  /*
   * THE REQUIRED SET, AUDITED. Every field validateVenue can flag must have a
   * visible control to fix it, or the button is a dead end. The name and the
   * brief must never be flagged at all: nothing computes from them.
   */
  it('flags only fields with a control on screen', () => {
    const flagged = new Set<VenueField>()
    for (const draft of BROKEN) {
      for (const field of Object.keys(validateVenue(draft)) as VenueField[]) flagged.add(field)
    }
    for (const field of flagged) expect(SETUP_FIELD_TARGET[field]).not.toBeNull()
    expect(flagged.has('name')).toBe(false)
    expect(flagged.has('eventDescription')).toBe(false)
    expect(flagged.has('desiredOutcome')).toBe(false)
  })
})

describe('ringNode', () => {
  it('scrolls the field into view, rings it, and lets the ring go', () => {
    vi.useFakeTimers()
    const classes = new Set<string>()
    const node = {
      scrollIntoView: vi.fn(),
      classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    }
    ringNode(node, 1000)
    expect(node.scrollIntoView).toHaveBeenCalledOnce()
    expect(classes.has('is-wanted')).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(classes.has('is-wanted')).toBe(false)
    vi.useRealTimers()
  })

  it('clears the ring when cleaned up early', () => {
    const classes = new Set<string>()
    const cleanup = ringNode({
      scrollIntoView: () => {},
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    })
    cleanup()
    expect(classes.size).toBe(0)
  })
})
