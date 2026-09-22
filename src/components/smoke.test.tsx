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
    expect(html).not.toContain('class="nav__item')
  })

  it('starts in setup, because that is the first step', () => {
    expect(html).toContain('shell shell--setup')
  })

  it('locks the field step until a plan exists', () => {
    expect(html).toContain('rail__step--locked')
  })

  /*
   * MAP FIRST. Setup used to be ten stacked fields that scrolled for more than
   * two screens; it is now one screen with the map at the top of it.
   */
  it('leads with the map and its own search', () => {
    expect(html).toContain('class="setup"')
    expect(html).toContain('class="setup__map"')
    // The apostrophe is HTML-escaped in the rendered markup.
    expect(html).toContain('the shoot?')
  })

  /*
   * THE PIN IS THE COORDINATE. Nobody sets a venue by typing decimal degrees,
   * and a latitude field here was only ever a form artefact.
   */
  it('has no latitude or longitude fields', () => {
    expect(html).not.toContain('>Latitude')
    expect(html).not.toContain('>Longitude')
    expect(html).not.toContain('placeholder="38.3648"')
  })

  /*
   * ONE PIN, ONE SLIDER. The setup map used to carry three things that did not
   * explain themselves: the venue pin, a white subject crosshair sitting on top
   * of it, and an unlabelled dot on the reach ring that was the only way to
   * change the reach.
   */
  it('states the reach on a labelled slider, not an unlabelled dot on a ring', () => {
    expect(html).toContain('How far can you get?')
    expect(html).toContain('type="range"')
    expect(html).toContain('400 m')
    expect(html).toContain('1,312 ft')
    // The handle is gone, and so is the reach readout that sat away from it.
    expect(html).not.toContain('reach-handle')
    expect(html).not.toContain('plate__reach')
  })

  it('shows one mark on the setup map, and says it can be moved', () => {
    expect(html).toContain('class="setup__map"')
    // The crosshair is a PLAN concept now; SETUP renders no subject marker.
    expect(html).not.toContain('reticle-mark')
  })

  it('offers one description input and the kit as chips', () => {
    expect(html).toContain('id="describe-shoot"')
    expect(html).toContain('class="kitrow__scroll"')
    expect(html).toContain('kitchip')
  })

  it('shows date and window as compact pills, not four stacked fields', () => {
    expect(html).toContain('class="pills"')
    expect(html).toContain('type="date"')
    expect(html).toContain('type="time"')
  })

  /*
   * REQUIRED THINGS FIRST, and the reason is a bug that shipped.
   *
   * Every zero-scroll check was run at 390x844. On a real iPhone in Safari the
   * bars leave about 390x660, and `overflow: hidden` silently ate the rest: the
   * pills and the kit were off the screen with no way to scroll to them, so the
   * date could not be set and the forward button stayed blocked on it.
   */
  it('puts the date and window above everything optional', () => {
    const pills = html.indexOf('class="pills"')
    expect(pills).toBeGreaterThan(-1)
    expect(pills).toBeLessThan(html.indexOf('id="describe-shoot"'))
    expect(pills).toBeLessThan(html.indexOf('class="kitrow'))
  })

  /* Nobody should meet a blocked button because of a field they cannot see. */
  it('opens with a real date and window, marked as defaults', () => {
    expect(html).toMatch(/type="date"[^>]*value="\d{4}-\d{2}-\d{2}"/)
    expect(html).toContain('>default<')
    expect(html.match(/>default</g)?.length).toBe(2)
  })

  /*
   * BLOCKED IS NOT DISABLED. A disabled button swallows the press, which left
   * the shooter with a dead control and a reason they could not act on. It is
   * pressable, and pressing it points at what is missing.
   */
  it('leaves the forward button pressable while it is blocked', () => {
    expect(html).toContain('forward__btn--blocked')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toMatch(/forward__btn[^>]*\sdisabled[\s=>]/)
  })

  it('names the one thing that is missing, not three', () => {
    expect(html).toContain('Drop a pin on the venue')
    expect(html).not.toContain('Set a venue, a date and a window first.')
  })

  /* Reference, not setup: these open OVER the screen rather than on it. */
  it('keeps kit detail, brief and saved setups behind affordances', () => {
    expect(html).toContain('Edit kit')
    expect(html).toContain('Paste a shot list')
    expect(html).toContain('Saved')
    expect(html).not.toContain('class="drawer"')
  })

  /*
   * The calibration venue is a developer shortcut behind ?calibration=1, so a
   * cold start has no venue at all.
   */
  it('hides the calibration shortcut and starts empty', () => {
    expect(html).not.toContain('Load calibration venue')
    expect(html).toContain('Drop a pin or search for the venue')
  })

  it('shows no PLAN chrome in setup', () => {
    expect(html).not.toContain('class="cones"')
    expect(html).not.toContain('class="sheet')
  })

  it('shows no stale brief warning on a cold start', () => {
    expect(html).not.toContain('class="stale"')
  })

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
