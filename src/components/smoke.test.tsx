import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { CALIBRATION_VENUE, resolveWindow } from '../lib/venue.ts'
import { SunReadout } from './SunReadout.tsx'

/**
 * Render smoke tests. Not a substitute for looking at it on a phone, but they
 * catch a component that throws and they prove the UI is reading the real core.
 *
 * App level assertions avoid solar numbers on purpose: the form reads times in
 * the device timezone, so those values move with whoever runs the suite. The
 * SunReadout test below pins numbers using explicit offsets instead.
 */
describe('render smoke', () => {
  const html = renderToStaticMarkup(<App />)

  it('renders the map shell with the map as the hero', () => {
    expect(html).toContain('class="shell"')
    expect(html).toContain('class="map__canvas"')
  })

  it('carries the four tab shell with plan as the default', () => {
    expect(html).toContain('Shot list')
    expect(html).toContain('nav__item nav__item--on')
    expect(html).toContain('Venue and window')
  })

  it('offers search and both map tap modes, none of them on by default', () => {
    expect(html).toContain('Search for a venue')
    expect(html).not.toContain('mode mode--on')
  })

  it('starts as a peek sheet: one summary line and the generate button', () => {
    expect(html).toContain('sheet sheet--peek')
    expect(html).toContain('Brew River Dock Bar · 11:00 to 15:00')
    expect(html).toContain('Generate')
    expect(html).toContain('<div class="sheet__body" hidden=""')
  })

  it('shows no validation errors before anything has been touched', () => {
    expect(html).not.toContain('field__error')
    expect(html).not.toContain('aria-invalid="true"')
  })

  it('has no positions until generate has run', () => {
    expect(html).not.toContain('class="shooter')
  })
})

describe('SunReadout', () => {
  it('resolves the calibration venue into a usable window', () => {
    const venueWindow = resolveWindow(CALIBRATION_VENUE)
    expect(venueWindow).not.toBeNull()
    expect(venueWindow?.middle.getTime()).toBe(
      (venueWindow!.start.getTime() + venueWindow!.end.getTime()) / 2,
    )
  })

  it('renders real computed sun numbers, not placeholders', () => {
    // Built with explicit offsets rather than through resolveWindow, so the
    // numbers do not move with the timezone of whoever runs the suite.
    const html = renderToStaticMarkup(
      <SunReadout
        open
        onToggle={() => {}}
        venueWindow={{
          lat: 38.3648,
          lon: -75.6069,
          start: new Date('2026-09-12T11:00:00-04:00'),
          middle: new Date('2026-09-12T13:00:00-04:00'),
          end: new Date('2026-09-12T15:00:00-04:00'),
          timeZone: 'America/New_York',
        }}
      />,
    )
    // Due south at mid-window, southeast at the start, workable light.
    expect(html).toContain('180.6°')
    expect(html).toContain('134.4°')
    expect(html).toContain('workable')
  })
})
