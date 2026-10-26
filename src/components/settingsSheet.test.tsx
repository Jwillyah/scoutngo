import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MENU_ITEMS } from '../lib/menu.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { AboutSheet } from './AboutSheet.tsx'
import { SettingsSheet } from './SettingsSheet.tsx'

describe('Settings, in the menu', () => {
  it('is a menu item of its own, beside About', () => {
    const ids = MENU_ITEMS.map((m) => m.id)
    expect(ids).toContain('settings')
    expect(ids.indexOf('settings')).toBe(ids.indexOf('about') - 1)
  })

  it('holds the clock, the wind and the distance, 12 hour pressed by default', () => {
    const html = renderToStaticMarkup(<SettingsSheet units={DEFAULT_UNITS} onUnits={() => {}} />)
    for (const label of ['Clock', 'Wind', 'Distance', '12 hour', '24 hour', 'kt', 'mph', 'm/s']) expect(html).toContain(label)
    expect(html).toMatch(/aria-pressed="true"[^>]*>12 hour</)
  })

  it('and the units have left About', () => {
    const html = renderToStaticMarkup(
      <AboutSheet
        onHow={() => {}}
        onKit={() => {}}
        onSpots={() => {}}
        onApiKey={() => {}}
        kitLine=""
        spotsLine=""
        apiKeyLine=""
        onExport={() => {}}
        onImport={() => ''}
      />,
    )
    expect(html).not.toContain('Wind units')
    expect(html).not.toContain('Distance units')
  })
})
