import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../core/contrast.ts'
import { DESIGN_TILES, GLYPH_INK, ICON_IDS, shippedTile, tileContrast } from '../lib/iconPalette.ts'
import { MENU_ITEMS, menuHome, OLD_PATHS, pathToMenuItem, type MenuItem } from '../lib/menu.ts'
import { Icon } from './Icon.tsx'
import { SideMenu } from './SideMenu.tsx'
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

describe('the side menu', () => {
  it('is eight items, gold to night blue, in the order asked for', () => {
    expect(MENU_ITEMS.map((m) => m.label)).toEqual(['Plan', 'Sky', 'Kit', 'Saved spots', 'Viewfinder', 'Call sheet', 'Settings', 'About'])
    expect(MENU_ITEMS.map((m) => m.icon)).toEqual(['plan', 'sky', 'kit', 'saved', 'viewfinder', 'callsheet', 'settings', 'about'])
  })

  it('folds Shoot setup and Field into Plan, and still offers both', () => {
    const plan = MENU_ITEMS.find((m) => m.id === 'plan')
    expect(plan?.subs?.map((s) => s.label)).toEqual(['Shoot setup', 'Field'])
    const html = renderToStaticMarkup(<SideMenu open current="field" onPick={() => {}} onClose={() => {}} />)
    expect(html.match(/class="icon"/g)?.length).toBe(8)
    expect(html).toContain('>Shoot setup<')
    expect(html).toContain('>Field<')
    /* Field is where you are, so Plan reads as the place you are in. */
    expect(html).toMatch(/sidemenu__item sidemenu__item--on[^]*?>Plan</)
  })

  it('every place is reachable: an item, a folded door, or Now on Sky', () => {
    const all: MenuItem[] = ['plan', 'setup', 'field', 'sky', 'kit', 'saved', 'now', 'viewfinder', 'callsheet', 'settings', 'about']
    const offered = new Set(MENU_ITEMS.flatMap((m) => [m.id, ...(m.subs ?? []).map((s) => s.id)]))
    for (const item of all) {
      if (item === 'now') expect(menuHome(item)).toBe('sky')
      else expect(offered.has(item), item).toBe(true)
    }
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
    for (const b of buttons) expect(b).toMatch(/aria-label="[^"]{4,}"/)
    expect([...html.matchAll(/data-icon="([a-z]+)"/g)].map((m) => m[1])).toEqual(['sunmoon', 'calendar', 'lens', 'layers', 'now'])
  })
})
