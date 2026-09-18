import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { CALIBRATION_VENUE, resolveWindow } from '../lib/venue.ts'
import { SunReadout } from './SunReadout.tsx'

/**
 * Render smoke tests. Not a substitute for looking at it on a phone, but they
 * catch a component that throws and they prove the UI is reading the real core.
 *
 * Solar numbers ARE asserted here now. They used to move with the timezone of
 * whoever ran the suite, because the form read times in the device zone; times are
 * resolved through the venue's own zone since, so 11:00 at the calibration venue is
 * one fixed instant everywhere. See src/core/timezone.ts.
 */
describe('render smoke', () => {
  const html = renderToStaticMarkup(<App />)

  it('renders the map shell with the map as the hero', () => {
    expect(html).toContain('class="shell"')
    expect(html).toContain('class="map__canvas"')
  })

  /*
   * Scoped to the nav label class on purpose. This used to assert a bare
   * `>Sun</span>`, which the HUD's own "Sun" readout label also satisfies, so the
   * check kept passing after the tab was renamed and was no longer testing the
   * nav at all.
   */
  it('carries the five tab shell with plan as the default', () => {
    for (const tab of ['Plan', 'Shots', 'Conditions', 'Kit', 'Spots']) {
      expect(html).toContain(`class="nav__label">${tab}</span>`)
    }
    expect(html).not.toContain('class="nav__label">Sun</span>')
    expect(html).toContain('nav__item nav__item--on')
    expect(html).toContain('Venue and window')
  })

  it('offers search, with the pin modes tucked into the overflow menu', () => {
    expect(html).toContain('Search for a venue')
    expect(html).toContain('More map options')
    // No tap mode is armed until it is chosen; long press is the normal path.
    expect(html).not.toContain('mode mode--on')
  })

  it('shows the sun overlay by default and the sunrise arc off', () => {
    expect(html).toContain('Hide the sun overlay')
  })

  it('has no cone filter row until there are positions to filter', () => {
    expect(html).not.toContain('class="cones"')
  })

  it('shows no stale brief warning when the venue matches the brief', () => {
    expect(html).not.toContain('class="stale"')
  })

  it('starts as a peek sheet: one summary line and the generate button', () => {
    expect(html).toContain('sheet sheet--peek')
    /*
     * The window carries its zone, and leads, because this line ellipsizes on a
     * phone and the zone must not be what gets cut. Bare "11:00 to 15:00" is the
     * old ambiguity.
     */
    expect(html).toContain('11:00–15:00 EDT · Brew River Dock Bar')
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

  /*
   * Salisbury MD is on EDT in September, so 11:00 there is 15:00 UTC whatever this
   * machine is set to. If this test starts depending on the runner's timezone
   * again, resolveWindow has gone back to reading the device clock.
   */
  it('resolves the window through the venue timezone, not the device one', () => {
    const venueWindow = resolveWindow(CALIBRATION_VENUE)!
    expect(venueWindow.timeZone).toBe('America/New_York')
    expect(venueWindow.timeZoneLabel).toBe('EDT, UTC-4')
    expect(venueWindow.start.toISOString()).toBe('2026-09-12T15:00:00.000Z')
    expect(venueWindow.end.toISOString()).toBe('2026-09-12T19:00:00.000Z')
    expect(venueWindow.timeZoneFallback).toBe(false)
  })

  it('renders real computed sun numbers, not placeholders', () => {
    const html = renderToStaticMarkup(
      <SunReadout open onToggle={() => {}} venueWindow={resolveWindow(CALIBRATION_VENUE)} />,
    )
    // Due south at mid-window, southeast at the start, workable light.
    expect(html).toContain('180.6°')
    expect(html).toContain('134.4°')
    expect(html).toContain('workable')
  })

  it('shows the window in venue wall clock time and names the zone', () => {
    const html = renderToStaticMarkup(
      <SunReadout open onToggle={() => {}} venueWindow={resolveWindow(CALIBRATION_VENUE)} />,
    )
    // The times entered in the form, read back at the venue: 11:00, 13:00, 15:00.
    expect(html).toContain('>11:00<')
    expect(html).toContain('>13:00<')
    expect(html).toContain('>15:00<')
    expect(html).toContain('EDT, UTC-4')
    expect(html).toContain('America/New_York')
  })
})
