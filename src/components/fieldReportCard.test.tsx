import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FieldReport } from '../core/fieldReports.ts'
import { FieldReportCard } from './FieldReportCard.tsx'

/* Batch Beach, Section 3: the report card, from what the phone holds (fixtures). The report page is a portal; rendered in place here. */
vi.stubGlobal('document', { body: {} })
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), createPortal: (n: unknown) => n }))
const r = (at: number, size: FieldReport['size'] = '3-4'): FieldReport => ({ spot: 'k', name: 'S-Turns', at, size, rating: 'Good', buoyFt: 3 })
const html = (initial: FieldReport[], startOpen = true) => renderToStaticMarkup(<FieldReportCard spot="k" name="S-Turns" timeZone="America/New_York" buoyFt={3} now={() => Date.UTC(2026, 10, 10, 12)} initial={initial} startOpen={startOpen} />)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the field report card', () => {
  it('on the Surf page it is one row: the question and the count, the chips on their own page', () => {
    const h = html([r(1)], false)
    expect(h).not.toContain('drep__chip')
    expect(text(h)).toContain('What did you see?')
    expect(text(h)).toContain('1 report here · 1 with a buoy; 3 calibrate this spot')
  })

  it('sharing is off, and no public link is on the page until you save with it ticked', () => {
    const h = html([])
    expect(h).toMatch(/<input type="checkbox"(?![^>]*checked)/)
    expect(h).not.toContain('github.com')
    expect(text(h)).toContain('Your reports stay on this phone.')
    expect(h).toMatch(/class="drep__save" disabled/)
  })
  it('counts toward calibration, then says the spot’s factor from yours', () => {
    expect(text(html([r(1)]))).toContain('1 report here · 1 with a buoy; 3 calibrate this spot')
    expect(text(html([r(1), r(2, '2-3'), r(3, '4-6')]))).toContain('this spot breaks 1.17× the buoy, from yours')
  })
  it('never says safe or clear', () => {
    expect(text(html([r(1)]))).not.toMatch(/\b(safe|clear|all clear|no hazard)/i)
  })
})
