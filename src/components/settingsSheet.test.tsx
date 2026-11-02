import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MENU_ITEMS } from '../lib/menu.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { AboutSheet } from './AboutSheet.tsx'
import type { BuildCheck } from '../lib/build.ts'

/* The page draws into document.body through a portal; here, in place. */
vi.mock('./Page.tsx', () => ({ Page: ({ children }: { children: unknown }) => children }))
const { SettingsPage } = await import('./SettingsPage.tsx')

const page = () =>
  renderToStaticMarkup(
    <SettingsPage
      units={DEFAULT_UNITS}
      onUnits={() => {}}
      showNumbers={false}
      onShowNumbers={() => {}}
      venue={{ lat: 34.21, lon: -77.8, name: 'Wrightsville Beach' }}
      place="coast"
      drone={null}
      showTerrain={false}
      onShowTerrain={() => {}}
      showLabels
      onShowLabels={() => {}}
      newBuild={{ status: 'unknown' } as BuildCheck}
      onHow={() => {}}
      onAbout={() => {}}
      onShowHome={() => {}}
      onKit={() => {}}
      onExport={() => {}}
      onClose={() => {}}
    />,
  )

describe('Settings, a page of its own (30 Oct)', () => {
  it('is the last menu item, with About under it', () => {
    const ids = MENU_ITEMS.map((m) => m.id)
    expect(ids[ids.length - 1]).toBe('settings')
    expect(MENU_ITEMS.find((m) => m.id === 'settings')?.subs?.map((s) => s.id)).toEqual(['about'])
  })

  it('has its eleven sections in the order asked for (Batch G), Debug last and folded', () => {
    const html = page()
    const titles = [...html.matchAll(/class="set__title">([^<]+)</g)].map((m) => m[1])
    expect(titles).toEqual(['Units', 'Location', 'Offline', 'Coast &amp; inland', 'Alerts', 'Drone', 'Map', 'Privacy &amp; data', 'AI key', 'About', 'Debug'])
    expect(html).toMatch(/<details class="set__debug"><summary/)
    expect(html).not.toMatch(/<details class="set__debug" open/)
  })

  it('units: time 12/24, distance ft/m, wind kt/mph/km/h, temperature °F/°C, 12 hour pressed by default', () => {
    const html = page()
    for (const label of ['12 hour', '24 hour', '>ft<', '>m<', '>kt<', '>mph<', '>km/h<', '°F', '°C']) expect(html).toContain(label)
    expect(html).toMatch(/aria-pressed="true"[^>]*>12 hour</)
  })

  it('every row has its current value on the right, and a drone not recorded is a dash, not a guess', () => {
    const html = page()
    expect(html).toContain('Wrightsville Beach')
    expect(html).toContain('None in the kit')
    expect(html).toContain('— (not recorded)')
    expect(html).not.toMatch(/\bsafe\b/i)
  })

  /*
   * iOS-STYLE (Batch G, Section 7): real switches, values in the normal
   * font, About one row to /about carrying "Version <hash> · <day> <Mon>",
   * the long words behind an "i", backup and the AI key here and only here.
   */
  it('is clean: real switches, no numbers font on values, About one row with the version', () => {
    const html = page()
    expect(html.match(/role="switch"/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).not.toMatch(/class="toggle__box"/)
    expect(html).not.toMatch(/class="set__value num"/)
    const about = html.slice(html.indexOf('aria-label="About"'), html.indexOf('class="set__debug"'))
    expect(about.match(/class="set__row"/g)?.length).toBe(1)
    expect(about).toMatch(/About ScoutNGo<\/span><span class="set__value">Version [0-9a-f]{7}\+? · \d{1,2} [A-Z][a-z]{2}/)
    expect(html).not.toContain('Could not check')
    expect(html).toContain('Back up to a file')
    expect(html).toContain('Anthropic API key')
    /* Long explanations behind an "i", not on the page. */
    expect(html.match(/<details class="set__info">/g)?.length).toBeGreaterThanOrEqual(5)
    for (const para of html.match(/<p class="set__note"[^>]*>[^<]*<\/p>/g) ?? []) expect(para.length).toBeLessThan(160)
  })

  it('and the units have left About', () => {
    const html = renderToStaticMarkup(
      <AboutSheet onHow={() => {}} />,
    )
    expect(html).not.toContain('Wind units')
    expect(html).not.toContain('Distance units')
  })
})

/*
 * ABOUT, SHORT (Batch G, Section 8): the story, How it works in three rows,
 * Version and Open source; no API key, no backup or import, no raw file
 * input, no Safari-clearing words (those are in Settings, once).
 */
describe('About, short', () => {
  const html = renderToStaticMarkup(<AboutSheet onHow={() => {}} />)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  it('has only the story, How it works, Version and Open source', () => {
    const eyebrows = [...html.matchAll(/class="about__eyebrow[^"]*">([^<]+)</g)].map((m) => m[1])
    expect(eyebrows).toEqual(['Why this exists', 'How it works', 'Version', 'Open source'])
    expect(html.match(/class="about__why"/g)?.length).toBe(2)
    for (const row of ['Every number is arithmetic', 'Privacy: what leaves your device', 'What it will not tell you']) expect(text).toContain(row)
  })
  it('carries no key, no backup, no file input and no Safari-clearing check', () => {
    expect(html).not.toMatch(/type="file"/)
    expect(text).not.toMatch(/API key|Back ?up|Restore|Import|Choose File|clearing Safari|Safari erase/i)
  })
})
