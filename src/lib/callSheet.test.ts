import { getTimes } from 'suncalc'
import { describe, expect, it, vi } from 'vitest'
import { CALL_SHEET_TOOLS, runTool, type ToolContext } from '../core/callSheetTools.ts'
import { formatClock } from '../core/timezone.ts'
import { ANTHROPIC_URL, writeCallSheet } from './callSheet.ts'
import { SEED_PLAYBOOK } from './playbook.ts'

/* Atlantic Park, 25 October 2026, 17:00 to 18:30 EDT. */
const ctx: ToolContext = {
  venue: { lat: 36.84658, lon: -75.97666 },
  timeZone: 'America/New_York',
  window: { start: new Date('2026-10-25T21:00:00Z'), end: new Date('2026-10-25T22:30:00Z') },
  positions: [
    { number: 1, platform: 'air', optic: 'Air 3S wide', focalMm: 24, altitudeFeet: 35, toSubjectMeters: 17.4, cameraBearing: 340, light: 'side light' },
  ],
  bag: { bodies: ['Sony a7IV'], lenses: ['Sony 70-200 f2.8 GM II'], drones: ['DJI Air 3S'] },
  conditions: { lowCloudPercent: 12, windKnots: 9, lowTide: null },
  playbook: SEED_PLAYBOOK,
  units: 'ft',
}
const sunset = formatClock(getTimes(new Date('2026-10-25T21:45:00Z'), ctx.venue.lat, ctx.venue.lon).sunset!, ctx.timeZone)

/* A scripted model: first asks for sun_times, then writes the sheet it is given. */
function scripted(finalText: string) {
  const calls: { url: string; init: RequestInit }[] = []
  let turn = 0
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    turn += 1
    const body =
      turn === 1
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'sun_times', input: {} }] }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: finalText }] }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

describe('the call sheet: the model proposes, code computes', () => {
  it('rejects an invented sunset and shows the code value in its place', async () => {
    const { fetchImpl } = scripted('Run of show\nSunset 7:12 PM: last drone push.')
    const out = await writeCallSheet('Surf contest, 3 athletes.', 'sk-test', ctx, fetchImpl)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.check.ok).toBe(false)
    expect(out.check.unknown.map((u) => u.text)).toContain('7:12 PM')
    expect(out.text).toContain(`Sunset ${sunset}`)
    expect(out.text).not.toContain('7:12')
    expect(out.repaired.replaced).toEqual([{ was: '7:12 PM', now: sunset, label: 'sunset' }])
  })

  it('passes a sheet whose numbers all came from the tools and the shooter', async () => {
    const { fetchImpl } = scripted(`Sunset ${sunset}. 3 athletes.`)
    const out = await writeCallSheet('Surf contest, 3 athletes.', 'sk-test', ctx, fetchImpl)
    expect(out.status === 'ok' && out.check.ok).toBe(true)
    expect(out.status === 'ok' && out.check.checked).toBe(2)
  })

  it('marks an invented number it has no code value for, rather than guessing', async () => {
    const { fetchImpl } = scripted('Bring 47 batteries.')
    const out = await writeCallSheet('Surf contest.', 'sk-test', ctx, fetchImpl)
    expect(out.status === 'ok' && out.text).toContain('[47, not from the app]')
  })

  it('calls Anthropic directly, with the key in a header and never in the URL', async () => {
    const { fetchImpl, calls } = scripted(`Sunset ${sunset}.`)
    await writeCallSheet('Surf contest.', 'sk-secret', ctx, fetchImpl)
    expect(calls.every((c) => c.url === ANTHROPIC_URL)).toBe(true)
    expect(calls.every((c) => !c.url.includes('sk-secret'))).toBe(true)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-secret')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('says why on a refused key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    const out = await writeCallSheet('x', 'bad', ctx, fetchImpl)
    expect(out.status === 'error' && out.reason).toMatch(/did not accept that key/)
  })
})

describe('the venue coordinate never leaves the phone', () => {
  it('appears in no tool answer, nor in anything sent', async () => {
    const coordinate = /36\.84|75\.97|36\.85|75\.98/
    for (const tool of CALL_SHEET_TOOLS) {
      const answer = JSON.stringify(runTool(tool.name, { sky: 'full-sun', mode: 'default', over_water: true }, ctx))
      expect(answer, tool.name).not.toMatch(coordinate)
    }
    const { fetchImpl, calls } = scripted('ok')
    await writeCallSheet('Surf contest.', 'k', ctx, fetchImpl)
    for (const c of calls) expect(String(c.init.body)).not.toMatch(coordinate)
  })
})
