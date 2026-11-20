import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CamAt, CamEntry } from '../core/camPick.ts'
import type { RangeHour } from '../lib/surfPageData.ts'
import { surfBars } from '../lib/surfTapIn.ts'
import { CamBig, CamList } from './SurfCams.tsx'
import { SurfBars } from './SurfTapIn.tsx'

const H = 3_600_000
const NOW = new Date(Date.UTC(2026, 10, 19, 15, 10))
const SERIES = Array.from({ length: 30 }, (_, k) => ({ at: new Date(Date.UTC(2026, 10, 19, 14, 30) + k * H), centerFt: 1 + (k % 4), clean: k >= 4 && k <= 6 }) as RangeHour)
const entry = (id: string, embed: boolean): CamEntry => ({ id, name: `Cam ${id}`, lat: 0, lon: 0, source: 's', operator: 'The Owner', url: `https://owner.example/${id}`, access: 'free', tags: ['surf'], facing: null, facingIs: null, embed })
const LIST: CamAt[] = [
  { cam: entry('a', false), km: 2.2 },
  { cam: entry('b', true), km: 5.1 },
]

describe('SurfBars', () => {
  const { from, to, bars } = surfBars(SERIES, NOW)
  const h = renderToStaticMarkup(<SurfBars bars={bars} from={from} to={to} now={NOW} timeZone="America/New_York" />)
  it('draws 24 bars, the clean ones lit, and says which hours', () => {
    expect((h.match(/data-bar=/g) ?? []).length).toBe(24)
    expect((h.match(/sbars__bar--clean/g) ?? []).length).toBe(3)
    expect(h).toContain('data-surf-clean')
    expect(h).toContain('>clean 1p–4p<')
  })
  it('has a now line and no band when nothing is clean', () => {
    expect(h).toContain('sbars__now')
    const none = surfBars(SERIES.map((x) => ({ ...x, clean: false })), NOW)
    expect(renderToStaticMarkup(<SurfBars bars={none.bars} from={none.from} to={none.to} now={NOW} timeZone="America/New_York" />)).not.toContain('data-surf-clean')
  })
})

describe('the cams', () => {
  it('a cam the app may not show is a link out to the owner’s own page, in a new tab, with no referrer', () => {
    const h = renderToStaticMarkup(<CamBig cam={LIST[0]} yours={false} />)
    expect(h).toContain('href="https://owner.example/a"')
    expect(h).toContain('rel="noreferrer noopener"')
    expect(h).not.toContain('<iframe')
  })
  it('a cam the owner lets the app show plays in a sandboxed frame of the owner’s page', () => {
    const h = renderToStaticMarkup(<CamBig cam={LIST[1]} yours />)
    expect(h).toContain('<iframe')
    expect(h).toContain('src="https://owner.example/b"')
    expect(h).toContain('sandbox=')
    expect(h).toContain('referrerPolicy="no-referrer"')
  })
  it('the list says how far, whose cam, and "link out ↗" or "plays here", and marks the shown one', () => {
    const h = renderToStaticMarkup(<CamList list={LIST} picked="b" onPick={() => {}} miles />)
    expect(h).toContain('1.4 mi · The Owner · link out ↗')
    expect(h).toContain('3.2 mi · The Owner · plays here')
    expect(h).toContain('✓')
    expect(h.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
  it('never carries a Surfline or Surfchex mark', () => {
    const h = renderToStaticMarkup(<CamList list={LIST} picked={null} onPick={() => {}} miles />) + renderToStaticMarkup(<CamBig cam={LIST[0]} yours={false} />)
    expect(h).not.toMatch(/surfline|surfchex/i)
  })
})
