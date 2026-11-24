import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { followSurface, openSpotPick, spotPickShown, spotSurface, type SpotPick } from '../src/lib/spotPick.ts'

/*
 * BATCH SIMPLE-3, SECTION 0.4: BACK NEVER LANDS ON "FIND A SPOT". The search
 * is a modal of the screen it was opened over (src/lib/spotPick.ts): shown
 * only while that screen is up, gone for good the moment the screen changes,
 * never in the browser's history. Every back path, walked as App walks it:
 * each step a change of screen, the search following it (followSurface).
 */
type Up = { briefOpen: boolean; skyOpen: boolean; weatherOpen: boolean; droneOpen: boolean; fishOpen: boolean; bestSkyOpen: boolean; menuOpen: boolean; reportOpen: boolean; nowOpen: boolean; dayOpen: boolean; smn: boolean }
const HOME: Up = { briefOpen: true, skyOpen: false, weatherOpen: false, droneOpen: false, fishOpen: false, bestSkyOpen: false, menuOpen: false, reportOpen: false, nowOpen: false, dayOpen: false, smn: false }
const MAP: Up = { ...HOME, briefOpen: false }

/** Walk screens; at `openAt` the search is opened over the screen then up; returns whether it shows at each step. */
function walk(screens: Up[], openAt: number): boolean[] {
  let pick: SpotPick | null = null
  return screens.map((up, i) => {
    const surface = spotSurface(up)
    pick = followSurface(pick, surface)
    if (i === openAt) pick = openSpotPick(surface)
    return spotPickShown(pick, surface)
  })
}

describe('the spot search never comes back on a Back', () => {
  it('opened over the home, closed by its ×: the home', () => {
    let pick: SpotPick | null = openSpotPick(spotSurface(HOME))
    expect(spotPickShown(pick, spotSurface(HOME))).toBe(true)
    pick = null
    expect(spotPickShown(pick, spotSurface(HOME))).toBe(false)
  })
  const pages: [string, Up][] = [
    ['Sky', { ...HOME, skyOpen: true }],
    ['Weather', { ...HOME, weatherOpen: true }],
    ['Drone', { ...HOME, droneOpen: true }],
    ['Fish', { ...HOME, fishOpen: true }],
    ['Best sky', { ...HOME, bestSkyOpen: true }],
    ['the menu', { ...HOME, menuOpen: true }],
    ['Day sheet', { ...HOME, dayOpen: true }],
    ['Surf, Tide or Wind (the home closes for the map\'s page)', MAP],
  ]
  for (const [name, page] of pages) {
    it(`opened over the home, then ${name} up, then Back: the home, no search`, () => {
      expect(walk([HOME, page, HOME], 0)).toEqual([true, false, false])
    })
  }
  it('opened over the map, then the home comes back (Back to the home): no search, and none on the map after', () => {
    expect(walk([MAP, HOME, MAP], 0)).toEqual([true, false, false])
  })
  it('opened over a page over the home, the page closed by Back: the home, no search', () => {
    expect(walk([{ ...HOME, skyOpen: true }, HOME], 0)).toEqual([true, false])
  })
  it('opened again after: shown again (it is the tap that opens it, nothing else)', () => {
    expect(walk([HOME, MAP, HOME, HOME], 2)).toEqual([false, false, true, true])
  })
  it('App keeps it that way: no boolean of its own, never pushed to history, a popstate closes it, Escape closes it', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/const spotPickOpen = spotPickShown\(spotPick, surface\)/)
    expect(app).toMatch(/followSurface\(spotPick, surface\)/)
    expect(app).not.toMatch(/useState\(false\)[^\n]*\n?[^\n]*spotPickOpen/)
    expect(app).toMatch(/const onPop = \(\) => setSpotPick\(null\)/)
    const picker = readFileSync('src/components/SpotPicker.tsx', 'utf8')
    expect(picker).not.toMatch(/pushState|history\./)
    expect(picker).toMatch(/e\.key === 'Escape'\) onClose\(\)/)
  })
})
