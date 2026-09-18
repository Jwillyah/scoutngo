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

  it('renders the shell', () => {
    expect(html).toContain('class="shell shell--setup"')
  })

  /*
   * THREE MODES ON A TIME AXIS, not five parallel tabs. The old shell offered
   * Plan, Shots, Conditions, Kit and Spots as equals, though Kit is configured a
   * week before Shots is read.
   */
  it('opens in SETUP and offers three ordered modes', () => {
    for (const step of ['Setup', 'Plan', 'Field']) {
      expect(html).toContain(`class="rail__label">${step}</span>`)
    }
    expect(html).toContain('rail__step--now')
    // The five tab shell is gone.
    expect(html).not.toContain('class="nav__item')
  })

  it('starts in setup, because that is the first step', () => {
    expect(html).toContain('shell shell--setup')
    expect(html).toContain('Venue and window')
  })

  /*
   * FIELD cannot be entered before there is a plan to walk to. That gating is
   * what makes the rail a sequence rather than a channel selector.
   */
  it('locks the field step until a plan exists', () => {
    expect(html).toContain('rail__step--locked')
  })

  /*
   * ONE reveal mechanism. The accordions are gone: every setup block renders
   * open, so nothing is folded inside something that is itself folded.
   */
  it('renders setup blocks open, with no accordion toggles', () => {
    expect(html).toContain('section__banner--static')
    expect(html).not.toContain('aria-expanded')
    expect(html).toContain('Kit and style')
    expect(html).toContain('Saved setups')
  })

  /* The map and its chrome belong to PLAN, so none of it renders in SETUP. */
  it('shows no map chrome in setup', () => {
    expect(html).not.toContain('class="map__canvas"')
    expect(html).not.toContain('Search for a venue')
    expect(html).not.toContain('class="cones"')
    expect(html).not.toContain('class="sheet')
  })

  it('shows no stale brief warning when the venue matches the brief', () => {
    expect(html).not.toContain('class="stale"')
  })

  it('shows no validation errors before anything has been touched', () => {
    expect(html).not.toContain('field__error')
    expect(html).not.toContain('aria-invalid="true"')
  })

  /* Forward is one large action, not a tab tap. */
  it('offers a single forward action out of setup', () => {
    expect(html).toContain('forward__btn')
    expect(html).toContain('Setup done · Plan')
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
      <SunReadout venueWindow={resolveWindow(CALIBRATION_VENUE)} />,
    )
    // Due south at mid-window, southeast at the start, workable light.
    expect(html).toContain('180.6°')
    expect(html).toContain('134.4°')
    expect(html).toContain('workable')
  })

  it('shows the window in venue wall clock time and names the zone', () => {
    const html = renderToStaticMarkup(
      <SunReadout venueWindow={resolveWindow(CALIBRATION_VENUE)} />,
    )
    // The times entered in the form, read back at the venue: 11:00, 13:00, 15:00.
    expect(html).toContain('>11:00<')
    expect(html).toContain('>13:00<')
    expect(html).toContain('>15:00<')
    expect(html).toContain('EDT, UTC-4')
    expect(html).toContain('America/New_York')
  })
})
