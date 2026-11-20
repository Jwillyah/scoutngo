import { describe, expect, it } from 'vitest'
import { capRows, MAX_ROWS, openTab, swipeTarget, SWIPE_MIN_PX } from './tapIn.ts'

const TABS = [
  { id: 'now', label: 'Now' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'night', label: 'Night' },
]

describe('the tap-in page rules', () => {
  it('opens on the tab it is told to, else the first', () => {
    expect(openTab(TABS, 'tonight')).toBe('tonight')
    expect(openTab(TABS, undefined)).toBe('now')
    expect(openTab(TABS, 'nope')).toBe('now')
    expect(openTab(undefined, 'tonight')).toBe('')
  })
  it('a swipe left goes to the next tab and right to the one before', () => {
    expect(swipeTarget(TABS, 'now', -120, 4)).toBe('tonight')
    expect(swipeTarget(TABS, 'tonight', 120, 4)).toBe('now')
  })
  it('stops at the ends', () => {
    expect(swipeTarget(TABS, 'night', -120, 0)).toBeNull()
    expect(swipeTarget(TABS, 'now', 120, 0)).toBeNull()
  })
  it('a short or mostly-vertical drag is not a swipe (it is the scroll)', () => {
    expect(swipeTarget(TABS, 'now', -(SWIPE_MIN_PX - 1), 0)).toBeNull()
    expect(swipeTarget(TABS, 'now', -100, 80)).toBeNull()
    expect(swipeTarget(TABS, 'now', -100, 49)).toBe('tonight')
  })
  it('a page with no tabs, or one, never swipes', () => {
    expect(swipeTarget(undefined, '', -200, 0)).toBeNull()
    expect(swipeTarget([TABS[0]], 'now', -200, 0)).toBeNull()
  })
  it('the rows card holds five', () => {
    expect(MAX_ROWS).toBe(5)
    expect(capRows([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5])
    expect(capRows([1, 2, 3, 4, 5, 6, 7, 8], 8)).toHaveLength(8)
    expect(capRows([1, 2])).toEqual([1, 2])
  })
})
