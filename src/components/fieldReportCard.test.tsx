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
    /* Batch LIVE, Section 9B: said as progress. */
    expect(text(h)).toContain('1 of 3 reports needed to tune this spot')
  })

  it('sharing is off, and no public link is on the page until you save with it ticked', () => {
    const h = html([])
    /* Batch LIVE, Section 9B: the app's toggle, off. */
    expect(h).toMatch(/role="switch" aria-checked="false" aria-label="Also share publicly"/)
    expect(h).not.toContain('github.com')
    expect(text(h)).toContain('Your reports stay on this phone.')
    expect(h).toMatch(/class="drep__save" disabled/)
  })
  it('counts toward calibration, then says the spot’s factor from yours', () => {
    expect(text(html([r(1)]))).toContain('1 of 3 reports needed to tune this spot')
    expect(text(html([r(1), r(2, '2-3'), r(3, '4-6')]))).toContain('this spot breaks 1.17× the buoy, from yours')
  })
  /* Batch Polish, Section 6: a photo prefills the time and the spot; the recent list is every spot's, newest first. */
  it('offers Add a photo (not kept, not sent) and lists the recent reports of every spot', () => {
    const page = renderToStaticMarkup(<FieldReportCard spot="k" name="S-Turns" at={{ lat: 35.6085, lon: -75.4655 }} timeZone="America/New_York" buoyFt={3} now={() => Date.UTC(2026, 10, 10, 12)} initial={[r(1), { ...r(2), spot: 'm', name: 'Mirlo Beach' }]} startOpen />)
    const t = text(page)
    expect(page).toContain('type="file"')
    expect(t).toContain('The photo’s time and place fill this in. The photo isn’t kept or sent.')
    expect(t.indexOf('Mirlo Beach ·')).toBeLessThan(t.indexOf('S-Turns · 3–4 ft'))
  })
  /* Batch LIVE, Section 9B (14 Nov 3:17 PM: a Croatan report saved as "Virginia Beach"): which spot, the nearest picked; an old report moved to it. */
  it('the nearest surf spots as chips, the nearest picked; a report elsewhere can be moved to it', () => {
    const croatan = { lat: 36.8172, lon: -75.9725 }
    const vb = { at: Date.UTC(2026, 10, 14, 20, 17), spot: 'vb', name: 'Virginia Beach', size: '1-2' as const, rating: 'Fair' as const, buoyFt: null }
    const page = renderToStaticMarkup(<FieldReportCard spot="vb" name="Virginia Beach" at={croatan} timeZone="America/New_York" buoyFt={null} now={() => Date.UTC(2026, 10, 14, 20, 30)} initial={[vb]} startOpen />)
    const chips = [...page.matchAll(/data-report-spot="([^"]+)"/g)].map((m) => m[1])
    expect(chips[0]).toBe('Croatan')
    expect(chips).toEqual(expect.arrayContaining(['1st Street Jetty', 'Virginia Beach Pier', 'North End']))
    expect(page).toMatch(/aria-checked="true"[^>]*data-report-spot="Croatan"/)
    expect(text(page)).toContain('Move to Croatan')
  })
  it('the move keeps the report, under the chosen spot', async () => {
    const { retagReport } = await import('../lib/fieldReportStore.ts')
    const kept = new Map<string, string>()
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) }
    const { addReport } = await import('../lib/fieldReportStore.ts')
    addReport({ at: 1, spot: 'vb', name: 'Virginia Beach', size: '1-2', rating: 'Fair', buoyFt: null }, store)
    const after = retagReport(1, 'vb', { key: 'cr', name: 'Croatan' }, store)
    expect(after).toEqual([{ at: 1, spot: 'cr', name: 'Croatan', size: '1-2', rating: 'Fair', buoyFt: null }])
  })
  it('never says safe or clear', () => {
    expect(text(html([r(1)]))).not.toMatch(/\b(safe|clear|all clear|no hazard)/i)
  })
})
