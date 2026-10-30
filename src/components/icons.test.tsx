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
  /* 30 Oct: seven items grouped by job (docs/ux-rules.md rule 24, docs/navigation.md). */
  it('is seven items, grouped by job, in the order asked for', () => {
    expect(MENU_ITEMS.map((m) => m.label)).toEqual(['Plan', 'Sky', 'Water', 'Fly', 'Kit', 'Saved', 'Settings'])
    expect(MENU_ITEMS.map((m) => m.icon)).toEqual(['plan', 'sky', 'tides', 'preflight', 'kit', 'saved', 'settings'])
    const subs = Object.fromEntries(MENU_ITEMS.map((m) => [m.label, (m.subs ?? []).map((s) => s.label)]))
    expect(subs).toEqual({ Plan: ['Shoot now', 'Setup', 'Call sheet'], Sky: [], Water: ['Tides', 'Surf', 'Wind'], Fly: ['Viewfinder'], Kit: ['Exposure'], Saved: [], Settings: ['About'] })
  })
  it('leaves Surf out where it is told to (inland on Auto)', () => {
    const html = renderToStaticMarkup(<SideMenu open current="plan" onPick={() => {}} onClose={() => {}} hidden={new Set(['surf'])} />)
    expect(html).not.toContain('>Surf<')
    expect(html).toContain('>Tides<')
  })

  it('marks the job you are in: Setup is part of Plan', () => {
    const html = renderToStaticMarkup(<SideMenu open current="setup" onPick={() => {}} onClose={() => {}} />)
    expect(html.match(/class="icon"/g)?.length).toBe(7)
    expect(html).not.toContain('>Field<')
    expect(html).toMatch(/sidemenu__item sidemenu__item--on[^]*?>Plan</)
  })

  it('every place is still reachable: an item, a place under one, or its own address', () => {
    const all: MenuItem[] = ['plan', 'setup', 'field', 'sky', 'water', 'tides', 'surf', 'wind', 'exposure', 'kit', 'saved', 'now', 'viewfinder', 'preflight', 'callsheet', 'settings', 'about']
    const offered = new Set(MENU_ITEMS.flatMap((m) => [m.id, ...(m.subs ?? []).map((s) => s.id)]))
    for (const item of all) {
      if (item === 'field') {
        expect(menuHome(item)).toBe('plan')
        expect(pathToMenuItem(`/${item}`)).toBe(item)
      } else expect(offered.has(item), item).toBe(true)
      /* Every place's home is a top item. */
      expect(MENU_ITEMS.map((m) => m.id)).toContain(menuHome(item))
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
