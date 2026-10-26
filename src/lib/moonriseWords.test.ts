import { describe, expect, it, vi } from 'vitest'
import { runTool, type ToolContext } from '../core/callSheetTools.ts'
import { moonrisePlan, type MoonriseInput } from '../core/moonrisePlan.ts'
import { writeCallSheet } from './callSheet.ts'
import { moonriseToolContext, MOONRISE_PROMPT, shotListText } from './moonriseWords.ts'
import { DEFAULT_UNITS } from './units.ts'

const TZ = 'America/New_York'
const VB = { lat: 36.85, lon: -75.975 }
const INPUT: MoonriseInput = {
  venue: VB,
  timeZone: TZ,
  from: new Date('2026-10-25T16:00:00Z'),
  lenses: [
    { id: 'sony-10-18', name: 'Sony 10-18 f4', minFocalLength: 10, maxFocalLength: 18 },
    { id: 'sony-70-200', name: 'Sony 70-200 f2.8 GM II', minFocalLength: 70, maxFocalLength: 200 },
    { id: 'sony-200-600', name: 'Sony 200-600', minFocalLength: 200, maxFocalLength: 600 },
  ],
  drone: 'DJI Air 3S',
  droneCeiling: { feet: 200 },
  target: { at: { lat: 36.8466, lon: -75.9737 }, heightMeters: 15 },
}
const r = moonrisePlan(INPUT)
if (r.status !== 'ok') throw new Error('expected a plan')
const plan = r.plan
const text = shotListText(plan, DEFAULT_UNITS)

describe('the shot list in words, with no key', () => {
  it('reads in the shooter’s clock, all four shots, the strobe and the restrictions line', () => {
    expect(text).toContain('Sun, Oct 25, 100% lit.')
    expect(text).toContain('Moonrise 5:41 PM')
    for (const title of ['1. Wide opener', '2. Line-up', '3. Mid', '4. Drone']) expect(text).toContain(title)
    expect(text).toContain('Anti-collision strobe on from sunset (14 CFR 107.29)')
    expect(text).toContain("Check today's flight restrictions at tfr.faa.gov.")
    expect(text).toContain('ISO 100, f/11, 1/125, a starting point, not an answer.')
  })

  it('says where to stand as a distance and a compass point, no em dash, no coordinate', () => {
    expect(text).toMatch(/Stand \d[\d,]* ft [a-z-]+ of the target at \d{1,2}:\d{2} [AP]M/)
    expect(text).toMatch(/3°: \d[\d,]* ft [a-z-]+ of it, a \d[\d,]* ft walk in\./)
    expect(text).not.toContain('—')
    expect(text).not.toContain('36.8')
    expect(text).not.toContain('75.9')
  })
})

describe('worded by the call sheet model, on the shooter’s key', () => {
  const ctx: ToolContext = {
    venue: VB,
    timeZone: TZ,
    window: { start: new Date('2026-10-25T21:00:00Z'), end: new Date('2026-10-25T23:00:00Z') },
    positions: [],
    bag: { bodies: [], lenses: [], drones: [] },
    conditions: { lowCloudPercent: null, windKnots: null, lowTide: null },
    playbook: '',
    units: 'ft',
    moonrise: moonriseToolContext(plan, DEFAULT_UNITS),
  }

  it('the tool gives the plan and never the place', () => {
    const out = JSON.stringify(runTool('moonrise_plan', {}, ctx))
    expect(out).toContain('5:41 PM')
    expect(out).not.toContain('36.8')
    expect(out).not.toContain('75.9')
  })

  it('an invented moonrise is replaced with the app’s', async () => {
    let turn = 0
    const fetchImpl = vi.fn(async () => {
      turn += 1
      const body =
        turn === 1
          ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'moonrise_plan', input: {} }] }
          : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Moonrise 5:58 PM, be ready.' }] }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch
    const out = await writeCallSheet(MOONRISE_PROMPT, 'sk-test', ctx, fetchImpl)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.text).toContain('Moonrise 5:41 PM')
    expect(out.text).not.toContain('5:58')
  })
})
