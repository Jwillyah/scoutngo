import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../core/contrast.ts'
import type { CardKind } from '../core/homeDay.ts'
import { DESIGN_TILES, GLYPH_INK, ICON_IDS, shippedTile, tileContrast } from '../lib/iconPalette.ts'
import { MENU_ITEMS, menuHome, OLD_PATHS, pathToMenuItem } from '../lib/menu.ts'
import { Icon } from './Icon.tsx'
import { Menu } from './Menu.tsx'
import { ToolDock } from './ToolDock.tsx'

describe('the golden bubble tiles', () => {
  it('white reaches 3:1 on the middle of every tile the app paints', () => {
    expect(ICON_IDS.length).toBeGreaterThan(0)
    for (const id of ICON_IDS) expect(contrastRatio(GLYPH_INK, shippedTile(id).middle), id).toBeGreaterThanOrEqual(3)
  })

  it('keeps the design where it already passed, and only ever touches the middle stop', () => {
    for (const id of ICON_IDS) {
      const c = tileContrast(id)
      expect(c.deepened, id).toBe(c.designRatio < 3)
      expect(shippedTile(id).light).toBe(DESIGN_TILES[id].light)
      expect(shippedTile(id).dark).toBe(DESIGN_TILES[id].dark)
    }
  })

  it('a deepened middle is the least change that passes, not a jump to the dark stop', () => {
    for (const id of ICON_IDS) {
      const c = tileContrast(id)
      if (c.deepened) expect(c.shippedRatio, id).toBeLessThan(3.2)
    }
  })

  it('draws as inline SVG on a CSS tile, with no image file and nothing for a screen reader', () => {
    const html = renderToStaticMarkup(<Icon glyph="plan" size={42} />)
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/<img|url\(/)
    expect(html).toMatch(/^<span[^>]*aria-hidden="true"/)
    expect(html).toContain(`--icon-middle:${shippedTile('plan').middle}`)
  })
})

describe('the menu (Batch H, Section 3: it replaced the side menu)', () => {
  const units = { wind: 'kt', distance: 'ft', clock: 12, temperature: 'F' } as const
  const rows = { plan: 'Set up a shoot', kit: 'a7 IV · 28-75', saved: '3 spots · 1 offline', settings: 'backup 3 days ago' }
  const HOME: CardKind[] = ['surf', 'wind', 'tide', 'sky', 'moon', 'drone']
  const render = (drone: { name: string; maxWindMps: number | null } | null, inland = false, more: { order?: CardKind[]; photoTools?: boolean; droneTools?: boolean } = {}) =>
    renderToStaticMarkup(<Menu open venue={null} placeShort="VB Pier" timeZone="America/New_York" units={units} drone={drone} inland={inland} rows={rows} order={more.order ?? HOME} photoTools={more.photoTools ?? true} droneTools={more.droneTools ?? true} now={new Date('2026-11-02T14:00:00Z')} onPick={() => {}} onClose={() => {}} />)
  const labelsOf = (html: string) => [...html.matchAll(/class="[^"]*sidemenu__label[^"]*">([^<]+)</g)].map((m) => m[1])

  /* Batch Flow, Section 8 (board D_Menu): the spot once; Weather, then the home's cards in its order (no Moon); five rows. */
  it('the spot once, Weather then the home in its order, and the rows, in the Stage nav the audits walk', () => {
    const html = render({ name: 'Air 3S', maxWindMps: 12 })
    expect(html).toContain('aria-label="Stage"')
    expect(labelsOf(html)).toEqual(['VB Pier', 'Weather', 'Surf', 'Wind', 'Tide', 'Sky', 'Drone', 'Plan a shoot', 'Calendar', 'Kit', 'Saved', 'Settings'])
    for (const v of [rows.kit, rows.saved, rows.settings]) expect(html).toContain(v)
    expect(html.split('VB Pier').length - 1).toBe(2) /* the title, and the header's own label for a screen reader */
  })

  /* Batch J, Section 7: the Water card everywhere, inland too, for a named surf beach. */
  it('the Drone card only with drone tools; Plan a shoot only with Shoot; Sky always', () => {
    expect(labelsOf(render(null))).toContain('Drone')
    expect(labelsOf(render(null, false, { droneTools: false }))).not.toContain('Drone')
    expect(labelsOf(render(null, false, { photoTools: false }))).not.toContain('Plan a shoot')
    expect(labelsOf(render(null, false, { order: ['surf', 'wind', 'tide'] })).slice(1, 3)).toEqual(['Weather', 'Sky'])
  })

  it('every place is still reachable: a card, a row, a tab inside a group, or its own address', () => {
    /* The ids the old menu offered, and where each lives now (docs/navigation.md). */
    const now: Record<string, string> = {
      plan: 'the home › Map', setup: 'Plan a shoot', field: '/field', sky: 'card', water: 'card', land: 'card', terrain: 'Land tab', tides: 'Water tab', surf: 'Water tab', wind: 'Water tab',
      exposure: 'Kit', kit: 'row', saved: 'row', now: 'Sky › Now', viewfinder: 'Sky › Viewfinder', preflight: 'card', callsheet: 'Plan › Call sheet', settings: 'row', about: 'Settings › About', today: 'card',
    }
    for (const item of MENU_ITEMS) expect(now[item.id], item.id).toBeDefined()
    expect(pathToMenuItem('/field')).toBe('field')
    expect(menuHome('setup')).toBe('plan')
  })

  it('old paths land on their place, and nothing else is claimed', () => {
    expect(pathToMenuItem('/field')).toBe('field')
    expect(pathToMenuItem('/setup/')).toBe('setup')
    expect(pathToMenuItem('/Now')).toBe('now')
    expect(pathToMenuItem('/')).toBeNull()
    expect(pathToMenuItem('/how')).toBeNull()
    expect(Object.keys(OLD_PATHS)).toEqual(expect.arrayContaining(['/setup', '/field', '/now']))
  })
})

describe('the tool dock', () => {
  it('five tiles in blue hour colours, every button labelled in words', () => {
    const html = renderToStaticMarkup(
      <ToolDock moon={false} onMoon={() => {}} onCalendar={() => {}} lens onLens={() => {}} layersOpen={false} onLayers={() => {}} onReset={() => {}} />,
    )
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBe(5)
    /* Batch I: with the Viewfinder's door, a camera makes six. */
    const six = renderToStaticMarkup(
      <ToolDock moon={false} onMoon={() => {}} onCalendar={() => {}} lens onLens={() => {}} layersOpen={false} onLayers={() => {}} onReset={() => {}} onViewfinder={() => {}} />,
    )
    expect(six.match(/<button[^>]*>/g)?.length).toBe(6)
    expect(six).toContain('aria-label="Viewfinder: point your phone, see the shot"')
    for (const b of buttons) expect(b).toMatch(/aria-label="[^"]{4,}"/)
    expect([...html.matchAll(/data-icon="([a-z]+)"/g)].map((m) => m[1])).toEqual(['sunmoon', 'calendar', 'lens', 'layers', 'now'])
  })
})
