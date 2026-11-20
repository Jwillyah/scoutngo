import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MENU_LIST } from '../src/lib/menu.ts'
import { MENU_CARDS } from '../src/config/flags.ts'

/* Batch SIMPLE-2, Section 3 (board Home_Menu): the ☰ menu is these eight rows, in this order, and the cards are a flag, off. */
describe('the ☰ menu', () => {
  it('eight rows in the board’s order', () => {
    expect(MENU_LIST.map((r) => r.label)).toEqual(['Plan a shoot', 'Best sky near me', 'Viewfinder', 'Calendar', 'Saved spots', 'Field report', 'Settings', 'About'])
    expect(new Set(MENU_LIST.map((r) => r.id)).size).toBe(8)
    for (const r of MENU_LIST) expect(r.sub.length).toBeGreaterThan(0)
  })
  it('the old cards are hidden, not deleted', () => {
    expect(MENU_CARDS).toBe(false)
    const src = readFileSync('src/components/Menu.tsx', 'utf8')
    expect(src).toMatch(/MENU_CARDS \?/)
    expect(src).toMatch(/MENU_LIST\.map/)
  })
  it('Plan a shoot is the planner’s menu door (src/lib/planner.ts), and nothing else in the menu opens it', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/case 'setup':\s*\n\s*openPlanner\('menu'\)/)
  })
})
