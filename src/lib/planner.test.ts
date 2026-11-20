import { describe, expect, it } from 'vitest'
import { OLD_PATHS, pathToMenuItem } from './menu.ts'
import { startMode } from './mode.ts'
import { askPlanner, doorOpen, EXTRA_DOORS, FIELD, FIRST_PIN, isAsk, MAP, plannerOnMap, PLANNER_DOORS, setupFor, shownMode, spent, startView, type PlannerAsk, type View } from './planner.ts'

/*
 * Batch SIMPLE-2, Section 0: the planner opens on a tap and nothing else.
 * Replayed below: the first-run path that left setup under the home.
 */
describe('the planner is a tap, not a word', () => {
  it('only askPlanner makes an ask; nothing parsed or written by hand is one', () => {
    const ask = askPlanner('menu')
    expect(ask).not.toBeNull()
    expect(isAsk(ask)).toBe(true)
    /* What storage or a URL could hold: the same shape, parsed. */
    const revived = JSON.parse(JSON.stringify(ask)) as unknown
    expect(revived).toEqual({ door: 'menu' })
    expect(isAsk(revived)).toBe(false)
    expect(isAsk({ door: 'menu' })).toBe(false)
    expect(isAsk(null)).toBe(false)
    expect(isAsk('setup')).toBe(false)
  })

  it('a forged setup view shows the map, a real one shows setup', () => {
    const forged = { mode: 'setup', ask: { door: 'menu' } as PlannerAsk } as View
    expect(shownMode(forged, true)).toBe('plan')
    const real = setupFor(askPlanner('menu'), MAP)
    expect(real.mode).toBe('setup')
    expect(shownMode(real, true)).toBe('setup')
    /* setupFor with no real ask leaves the view as it was. */
    expect(setupFor(null, MAP)).toBe(MAP)
    expect(setupFor({ door: 'menu' }, MAP)).toBe(MAP)
  })

  it('the batch keeps Menu and the explicit Plan buttons; the extra doors are shut by default', () => {
    for (const door of PLANNER_DOORS) expect(isAsk(askPlanner(door))).toBe(true)
    for (const door of EXTRA_DOORS) {
      expect(doorOpen(door)).toBe(false)
      expect(askPlanner(door)).toBeNull()
      /* Behind the flag, not deleted: on, each opens again. */
      expect(isAsk(askPlanner(door, true))).toBe(true)
    }
    expect(PLANNER_DOORS).toEqual(expect.arrayContaining(['menu', 'drone-preflight', 'sky-night']))
  })

  it('the first run: no place shows setup, the picked spot shows the map under the home', () => {
    /* The SIMPLE-1 leak, replayed: no place at launch was setup, and stayed setup under the home after a pick. */
    const first = startView(false)
    expect(first).toBe(FIRST_PIN)
    expect(shownMode(first, false)).toBe('setup')
    /* "Where do you go?" picked a spot: the same view now shows the map, whatever takes the home away. */
    expect(shownMode(first, true)).toBe('plan')
    expect(startView(true)).toBe(MAP)
    /* The map asked for by name (/plan) with no place is the map, as before. */
    expect(shownMode(MAP, false)).toBe('plan')
    /* startMode (src/lib/mode.ts) and the view agree. */
    for (const has of [true, false]) expect(shownMode(startView(has), has)).toBe(startMode(has))
  })

  it('the home over the planner spends the ask', () => {
    const inSetup = setupFor(askPlanner('menu'), MAP)
    expect(shownMode(spent(inSetup), true)).toBe('plan')
    const onMapAsked: View = { mode: 'plan', ask: askPlanner('menu') }
    expect(plannerOnMap(onMapAsked)).toBe(true)
    expect(plannerOnMap(spent(onMapAsked))).toBe(false)
    expect(spent(MAP)).toBe(MAP)
    expect(spent(FIELD)).toBe(FIELD)
  })

  it('the shoot card is on the map only on an ask carried from setup', () => {
    expect(plannerOnMap(MAP)).toBe(false)
    expect(plannerOnMap({ mode: 'plan', ask: { door: 'menu' } })).toBe(false)
    expect(plannerOnMap(FIELD)).toBe(false)
  })

  it('no address opens the planner', () => {
    for (const path of ['/setup', '/kit', '/saved', '/setup/', '/KIT']) expect(pathToMenuItem(path)).toBe('plan')
    const planner = new Set(['setup', 'kit', 'saved'])
    for (const [path, item] of Object.entries(OLD_PATHS)) expect(planner.has(item), path).toBe(false)
  })
})
