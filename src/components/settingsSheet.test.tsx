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

  it('has its ten sections in the order asked for, Debug last and folded', () => {
    const html = page()
    const titles = [...html.matchAll(/class="set__title">([^<]+)</g)].map((m) => m[1])
    expect(titles).toEqual(['Units', 'Location', 'Offline', 'Coast &amp; inland', 'Alerts', 'Drone', 'Map', 'Privacy &amp; data', 'About', 'Debug'])
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

  it('and the units have left About', () => {
    const html = renderToStaticMarkup(
      <AboutSheet onHow={() => {}} onKit={() => {}} onSpots={() => {}} onApiKey={() => {}} kitLine="" spotsLine="" apiKeyLine="" onExport={() => {}} onImport={() => ''} />,
    )
    expect(html).not.toContain('Wind units')
    expect(html).not.toContain('Distance units')
  })
})
