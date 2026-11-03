import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../api/calendar.ts'
import { changeWords, noteCall } from '../src/core/callChange.ts'
import { formatClock } from '../src/core/timezone.ts'
import { feedIds } from '../src/lib/feedObs.ts'

/*
 * CALLS THAT CHANGE TELL YOU (Batch J, Section 6), on truth case #5: the
 * 2 Nov sunset went Maybe to Go at 4:52 PM on a station's report. The
 * calendar feed reads the stations in the hour before and its event says
 * the new call with the same UID and a higher SEQUENCE; the phone says
 * "Upgraded to Go at 4:52 PM from KNTU".
 */
const FIRE = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunset.json', 'utf8')) as { payload: unknown }
const ROWS = readFileSync('tests/data/truth5-2026-11-02-sunset/metars.csv', 'utf8')
  .split('\n')
  .filter((l) => /^[A-Z0-9]{3},2026/.test(l))
  .map((l) => {
    const f = l.split(',')
    return { id: `K${f[0]}`, at: new Date(`${f[1].replace(' ', 'T')}:00Z`), text: f.slice(4).join(',') }
  })
/* A minute inside the hour: the sunset is 22:06:00.2 Z. */
const T60 = new Date('2026-11-02T21:07:00Z')
const clock = (d: Date) => formatClock(d, 'America/New_York', 12)

/** aviationweather.gov's raw answer for the ids asked, as of `now`, newest first; `edit` rewrites a report. */
function stub(now: Date, asked: string[], edit: (id: string, text: string) => string = (_, t) => t) {
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    const u = new URL(url)
    if (u.hostname === 'aviationweather.gov') {
      const ids = (u.searchParams.get('ids') ?? '').split(',')
      const lines = ids.flatMap((id) => ROWS.filter((r) => r.id === id && r.at <= now).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 1).map((r) => edit(id, r.text)))
      return new Response(lines.join('\n'), { status: 200 })
    }
    return new Response(JSON.stringify(FIRE.payload), { status: 200 })
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the calendar feed in the hour before', () => {
  it('2 Nov sunset at T-60: "Sunset Go", from the stations, asked by station ids only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T60)
    const asked: string[] = []
    stub(T60, asked)
    const ics = await (await GET(new Request('http://x/api/calendar?lat=36.92&lon=-76.10'))).text()
    expect(ics).toContain('SUMMARY:Sunset Go')
    expect(ics).toMatch(/SEQUENCE:\d+/)
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics.replace(/\r\n /g, '')).toMatch(/The stations' call\\, from K(ORF|NTU)/)
    const avwx = asked.filter((u) => u.includes('aviationweather.gov'))
    expect(avwx).toHaveLength(1)
    expect(new URL(avwx[0]).searchParams.get('ids')).toMatch(/^[A-Z0-9,]+$/)
    expect(avwx[0]).not.toMatch(/36\.9|76\.1|lat|lon|bbox/)
  })

  it('the gap shut (every line station overcast): "Sunset Skip", kept, with no alarm', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T60)
    const { own } = feedIds({ lat: 36.92, lon: -76.1 }, new Date('2026-11-02T22:06:00Z'))
    stub(T60, [], (id, t) => (id === own ? t : t.replace(/ (CLR|FEW\d{3}|SCT\d{3}|BKN\d{3})( |$)/g, ' OVC100 ')))
    const ics = await (await GET(new Request('http://x/api/calendar?lat=36.92&lon=-76.10'))).text()
    expect(ics).toContain('SUMMARY:Sunset Skip')
    expect(ics).not.toContain('BEGIN:VALARM')
  })

  it('further out it reads the models only, and asks no station', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const early = new Date('2026-11-02T19:30:00Z')
    vi.setSystemTime(early)
    const asked: string[] = []
    stub(early, asked)
    const ics = await (await GET(new Request('http://x/api/calendar?lat=36.92&lon=-76.10'))).text()
    expect(ics).not.toContain('SUMMARY:Sunset Go')
    expect(asked.some((u) => u.includes('aviationweather.gov'))).toBe(false)
  })
})

describe('the phone says the change', () => {
  it('Maybe at 4:28, Go at 4:52 from KNTU: "Upgraded to Go at 4:52 PM from KNTU"; the same call again changes nothing', () => {
    const t428 = new Date('2026-11-02T21:28:00Z').getTime()
    const t452 = new Date('2026-11-02T21:52:00Z').getTime()
    const a = noteCall(null, null, 'Maybe', null, t428)
    expect(a.change).toBeNull()
    const b = noteCall(a.seen, a.change, 'Go', 'KNTU', t452)
    expect(changeWords(b.change!, clock)).toBe('Upgraded to Go at 4:52 PM from KNTU')
    const c = noteCall(b.seen, b.change, 'Go', 'KNTU', t452 + 600_000)
    expect(c.change).toEqual(b.change)
    const d = noteCall(c.seen, c.change, 'Skip', 'KNTU', t452 + 900_000)
    expect(changeWords(d.change!, clock)).toBe('Down to Skip at 5:07 PM from KNTU')
  })
})
