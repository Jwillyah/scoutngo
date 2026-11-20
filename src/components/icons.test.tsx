import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../core/contrast.ts'
import type { CardKind } from '../core/homeDay.ts'
import { DESIGN_TILES, GLYPH_INK, ICON_IDS, shippedTile, tileContrast } from '../lib/iconPalette.ts'
import { OLD_PATHS, pathToMenuItem } from '../lib/menu.ts'
import { Icon } from './Icon.tsx'
import { Menu } from './Menu.tsx'

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

  /* Batch SIMPLE-2, Section 3 (board Home_Menu): eight rows, in the Stage nav the audits walk; the cards (Batch Flow, Section 8) are MENU_CARDS, off. */
  it('the eight rows of the ☰ menu, in order, in the Stage nav the audits walk', () => {
    const html = render({ name: 'Air 3S', maxWindMps: 12 })
    expect(html).toContain('aria-label="Stage"')
    expect(labelsOf(html)).toEqual(['Plan a shoot', 'Best sky near me', 'Viewfinder', 'Calendar', 'Saved spots', 'Field report', 'Settings', 'About'])
    expect(html).toContain(rows.saved)
    expect(html).toContain('Home answers · Map looks around · everything else lives here')
  })

  /* docs/batches/simple-audit.md, section 3: a page the home's tiles open has no second door here. */
  it('no home tile again in the menu, whatever is picked or in the kit', () => {
    for (const html of [render(null), render(null, true, { droneTools: false, photoTools: false }), render({ name: 'Air 3S', maxWindMps: 12 })]) {
      const labels = labelsOf(html)
      for (const tile of ['Weather', 'Surf', 'Wind', 'Tide', 'Sky', 'Drone', 'Kit', 'Cams', 'VB Pier']) expect(labels).not.toContain(tile)
      expect(labels).toHaveLength(8)
    }
  })

  it('old paths land on their place, and nothing else is claimed', () => {
    expect(pathToMenuItem('/field')).toBe('field')
    /* Batch SIMPLE-2, Section 0: an address never opens the planner (src/lib/planner.ts). */
    expect(pathToMenuItem('/setup/')).toBe('plan')
    expect(pathToMenuItem('/Now')).toBe('now')
    expect(pathToMenuItem('/')).toBeNull()
    expect(pathToMenuItem('/how')).toBeNull()
    expect(Object.keys(OLD_PATHS)).toEqual(expect.arrayContaining(['/setup', '/field', '/now']))
  })
})
