import { renderToStaticMarkup } from 'react-dom/server'
import { NumeralsProvider } from '../lib/numerals.tsx'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { CALIBRATION_VENUE, resolveWindow } from '../lib/venue.ts'
import { SunReadout } from './SunReadout.tsx'
import { ReachSlider } from './ReachSlider.tsx'

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
   * ONE PIN, ONE SLIDER, ONE UNIT. The reach is a labelled slider in step 3,
   * in the shooter's own unit only (27 Oct: "no m and ft side by side").
   */
  it('states the reach on a labelled slider in one unit', () => {
    const feet = renderToStaticMarkup(<ReachSlider meters={400} onChange={() => {}} unit="ft" />)
    expect(feet).toContain('How far can you walk?')
    expect(feet).toContain('type="range"')
    expect(feet).toContain('1,312 ft')
    expect(feet).not.toContain('400 m')
    const metres = renderToStaticMarkup(<ReachSlider meters={400} onChange={() => {}} unit="m" />)
    expect(metres).toContain('400 m')
    expect(metres).not.toContain('1,312')
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
   * SETUP IS THREE SHORT STEPS (27 Oct): Where, When, How, one small card at
   * a time over a full-screen map, progress dots, Back and Next. A cold
   * start opens on step 1, and the brief box, the shot list, Saved and
   * Settings are not in it (the menu and the Call sheet have them).
   */
  it('opens on step 1 of 3, Where, over the map', () => {
    expect(html).toContain('aria-label="Setup, step 1 of 3"')
    expect(html).toContain('>Where<')
    expect(html).toContain('Find the venue, or tap the map.')
    expect(html).toContain('aria-label="Step 1 of 3"')
  })

  it('keeps the old long sheet out of it', () => {
    expect(html).not.toContain('Paste a client brief')
    expect(html).not.toContain('Paste a shot list')
    expect(html).not.toContain('setup__link')
    expect(html).not.toContain('class="drawer"')
    expect(html).not.toContain('class="pills"')
  })

  /*
   * NEXT IS NOT A WAY PAST A MISSING PIN, and "Setup done · Plan" never
   * shows before a venue is set (27 Oct). Blocked is still not disabled: a
   * disabled button swallows the press.
   */
  it('holds Next until there is a pin, and never offers Plan before one', () => {
    expect(html).toMatch(/aria-disabled="true"[^>]*>Next</)
    expect(html).not.toMatch(/wiz__next[^>]*\sdisabled[\s=>]/)
    expect(html).not.toContain('Setup done · Plan')
    expect(html).not.toContain('Same as last time')
  })

  /*
   * The calibration venue is a developer shortcut behind ?calibration=1, so a
   * cold start has no venue at all.
   */
  it('hides the calibration shortcut and starts empty', () => {
    expect(html).not.toContain('Load calibration venue')
    expect(html).not.toContain('Salisbury')
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
