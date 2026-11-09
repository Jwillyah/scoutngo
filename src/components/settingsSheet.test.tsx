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

  /* Batch Map, Section 6 (board SettingsV2): seven groups in this order, the version at the foot, Debug behind a long press. */
  it('has its groups in the board\'s order, and nothing it moved out', () => {
    const html = page()
    const titles = [...html.matchAll(/class="set2__title">([^<]+)</g)].map((m) => m[1])
    expect(titles).toEqual(['What I do', 'My spot', 'Units', 'My gear', 'Alerts', 'My data · on this phone only'])
    for (const gone of ['Last venue', 'Coast &amp; inland', 'Kept when space runs short', 'Imagery', 'Terrain', 'Wind map', 'Debug', 'Show the numbers']) expect(html).not.toContain(`>${gone}<`)
    expect(html).toMatch(/class="set2__version"/)
  })

  it('what I do: the five activities, each a coloured tile and a real switch, no emoji', () => {
    const html = page()
    for (const a of ['surf', 'shoot', 'drone', 'fish', 'weather']) expect(html).toContain(`set2__tile--${a}`)
    expect(html.match(/role="switch"/g)?.length).toBeGreaterThanOrEqual(7)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('units: wind kt / mph / km/h (m/s under More), height ft / m, temp °F / °C, time 12 h / 24 h', () => {
    const html = page()
    for (const label of ['>kt<', '>mph<', '>km/h<', '>ft<', '>m<', '°F', '°C', '>12 h<', '>24 h<']) expect(html).toContain(label)
    expect(html).not.toContain('>m/s<')
    expect(html).toMatch(/aria-checked="true"[^>]*>12 h</)
  })

  it('my spot, my gear and my data say what they are; no "safe" anywhere', () => {
    const html = page()
    expect(html).toContain('Home spot')
    expect(html).toContain('Use my location')
    expect(html).toContain('Camera + lenses')
    expect(html).toMatch(/Drone<\/span><\/span><span class="set2__value">None</)
    expect(html).toContain('Back up to a file')
    expect(html).toContain('What leaves my phone')
    expect(html).toMatch(/>More<\/span><span class="set2__sub">restore, export, clear, storage, AI key/)
    expect(html).not.toMatch(/\bsafe\b/i)
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
