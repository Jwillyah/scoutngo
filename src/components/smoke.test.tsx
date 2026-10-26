import { renderToStaticMarkup } from 'react-dom/server'
import { NumeralsProvider } from '../lib/numerals.tsx'
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
   * MAP, PLAN, FIELD. Three, and exactly three: a settings tab would spend a
   * permanent quarter of the primary navigation on a screen opened twice a
   * year, which is why settings is behind the venue bar's round button.
   */
  /*
   * NO TAB ROW. The stages and the rest are behind the top bar's menu button,
   * so the bottom of the screen is the map's and the sheet's.
   */
  it('has a menu button and no bottom tab row', () => {
    expect(html).toContain('aria-label="Menu"')
    expect(html).not.toContain('class="bnav')
  })

  it('starts in setup, because that is where the pin gets set', () => {
    expect(html).toContain('shell shell--setup')
  })

  /*
   * ANY STAGE FROM ANY STAGE. This test is the inverse of the one it replaced.
   *
   * The old assertion was `expect(html).toContain('rail__step--locked')` -- it
   * required that FIELD be disabled until a plan existed. That was the stepper
   * reading of the shell, and it was wrong: somebody standing in a car park
   * wanting to look at the map does not want to be told they have not finished
   * Setup. A screen with nothing to show says so in its own content.
   *
   * ASSERTED AS A POSITIVE PROPERTY -- no disabled attribute in the nav --
   * rather than as the absence of a class name, which is the guard rule in
   * docs/failure-modes.md: a check for a name you do not want passes the
   * moment somebody renames it. See shape C.
   */
  it('never disables the way to the other stages', () => {
    const menu = html.slice(html.indexOf('aria-label="Menu"') - 200, html.indexOf('aria-label="Menu"') + 50)
    expect(menu).toContain('topbar__btn')
    expect(menu).not.toContain('disabled')
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

  /*
   * ONE PIN, EVERYWHERE. Two near-identical white marks a few metres apart,
   * both unlabelled, could not be told apart by someone seeing the app for the
   * first time. The pin is the thing being shot; positions are where you shoot
   * from; there is no third thing.
   */
  it('shows one mark on the setup map and no second one anywhere', () => {
    expect(html).toContain('class="setup__map"')
    expect(html).not.toContain('reticle')
    expect(html).not.toContain('Move the subject')
    expect(html).not.toContain('Set subject')
  })

  /*
   * NO BRIEF BOX. "Paste a client brief" is gone: the chips say what the shoot
   * is, and Suggest is arithmetic that never read the brief.
   */
  it('offers the kit as chips and no brief box', () => {
    expect(html).not.toContain('id="describe-shoot"')
    expect(html).not.toContain('Paste a client brief')
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
    expect(pills).toBeLessThan(html.indexOf('Paste a shot list'))
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

  /* Setup has its own sheet now; what it must not have is the plan's chips and rail. */
  it('shows no PLAN chrome in setup', () => {
    expect(html).not.toContain('class="cones"')
    expect(html).not.toContain('class="chips2"')
    expect(html).not.toContain('class="rail2"')
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

  /*
   * WITH THE RECEIPTS ON, because that is what this test is about.
   *
   * The degrees are hidden by default now (src/core/numerals.ts). This test
   * exists to prove the solar core is actually wired to the readout rather
   * than a placeholder being printed, so it needs the numbers visible. The
   * separate question of what the switch hides is numerals.test.tsx.
   */
  it('renders real computed sun numbers, not placeholders', () => {
    const html = renderToStaticMarkup(
      <NumeralsProvider show>
        <SunReadout venueWindow={resolveWindow(CALIBRATION_VENUE)} />
      </NumeralsProvider>,
    )
    // Due south at mid-window, southeast at the start, sun well up.
    expect(html).toContain('180.6°')
    expect(html).toContain('134.4°')
    expect(html).toContain('open sun')
  })

  /*
   * A MIDDAY WINDOW SAYS NOTHING ABOUT NIGHT. The old readout printed "Sun is
   * below the horizon for part of this window. There is nothing to light a
   * position with." whenever any sample was at or under zero; this checks the
   * daytime case stays as quiet as it always was.
   */
  it('carries no night or sky line for a midday window', () => {
    const html = renderToStaticMarkup(
      <SunReadout venueWindow={resolveWindow(CALIBRATION_VENUE)} />,
    )
    expect(html).not.toContain('readout__night')
    expect(html).not.toContain('readout__sky')
    expect(html).not.toContain('nothing to light')
  })

  it('shows the window in venue wall clock time, 12 hour, and names the zone only away from home', () => {
    const window = resolveWindow(CALIBRATION_VENUE)!
    const html = renderToStaticMarkup(<SunReadout venueWindow={{ ...window, travelling: false }} />)
    // The times entered in the form, read back at the venue: 11:00, 13:00, 15:00.
    expect(html).toContain('>11:00 AM<')
    expect(html).toContain('>1:00 PM<')
    expect(html).toContain('>3:00 PM<')
    expect(html).not.toContain('EDT, UTC-4')
    const away = renderToStaticMarkup(<SunReadout venueWindow={{ ...window, travelling: true, deviceTimeZone: 'America/Los_Angeles' }} />)
    expect(away).toContain('EDT, UTC-4')
    expect(away).toContain('America/Los_Angeles')
  })
})
