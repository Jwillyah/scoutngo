import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/* The skeleton is PageShell's portal; on the server the portal is its own node. */
vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), createPortal: (node: unknown) => node }))
vi.stubGlobal('document', { body: {} })
const { TapInPage } = await import('./TapInPage.tsx')

const BASE = {
  title: 'Sky',
  spot: 'Chic’s Beach',
  ground: 'night',
  kind: 'tipage--sky',
  onBack: () => {},
  how: <p>the method</p>,
  safety: 'Forecasts can be wrong · look first',
  hero: { eyebrow: 'Tonight · likely', value: 'Could fire', sub: 'Peak 4:52' },
}
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Row${i + 1}`, value: `v${i + 1}`, detail: `d${i + 1}` }))
const html = (props: Partial<Parameters<typeof TapInPage>[0]> = {}) => renderToStaticMarkup(<TapInPage {...BASE} {...props} />)

describe('the tap-in page', () => {
  it('has the round back button, the title and "<spot> · now"', () => {
    const h = html()
    expect(h).toContain('aria-label="Back"')
    expect(h).toContain('>Sky<')
    expect(h).toContain('Chic’s Beach · now')
  })
  it('the hero: eyebrow, one big value, one line', () => {
    const h = html()
    expect(h).toContain('tipage__eyebrow')
    expect(h).toContain('Tonight · likely')
    expect(h).toContain('Could fire')
    expect(h).toContain('Peak 4:52')
  })
  it('has no tabs unless it is given some', () => {
    expect(html()).not.toContain('role="tablist"')
  })
  it('tabs are the app’s pill (.ui-seg) and the page opens on initialTab', () => {
    const tabs = [
      { id: 'now', label: 'Now' },
      { id: 'tonight', label: 'Tonight' },
      { id: 'night', label: 'Night' },
    ]
    const h = html({ tabs, initialTab: 'tonight' })
    expect(h).toContain('class="ui-seg tipage__tabs"')
    expect(h.match(/role="tab"/g)).toHaveLength(3)
    expect(h).toMatch(/aria-selected="true" class="ui-seg__opt ui-seg__opt--on">Tonight</)
    expect(h).toMatch(/aria-selected="false" class="ui-seg__opt">Now</)
  })
  it('a tabbed page hands the open tab to its content', () => {
    const tabs = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]
    expect(html({ tabs, initialTab: 'b', children: (t: string) => <p>open:{t}</p> })).toContain('open:b')
    expect(html({ tabs, children: (t: string) => <p>open:{t}</p> })).toContain('open:a')
  })
  it('one chart card, when there is a chart', () => {
    expect(html({ chart: <svg data-x="1" /> })).toContain('tipage__chart')
    expect(html()).not.toContain('tipage__chart')
  })
  it('the rows card: label left, value and detail right', () => {
    const h = html({ rows: rows(3) })
    expect(h.match(/class="tipage__row"/g)).toHaveLength(3)
    expect(h).toContain('>Row1<')
    expect(h).toContain('<b>v1</b>')
    expect(h).toContain('d1')
  })
  it('holds at most five rows, whatever it is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = html({ rows: rows(7) })
    expect(h.match(/class="tipage__row"/g)).toHaveLength(5)
    expect(h).not.toContain('Row6')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
  it('a checklist page can raise the cap (Drone’s eight) on purpose', () => {
    expect(html({ rows: rows(8), maxRows: 8 }).match(/class="tipage__row"/g)).toHaveLength(8)
  })
  it('"More details ›" is the last row, and only with a place to go', () => {
    const h = html({ rows: rows(2), onMore: () => {} })
    expect(h).toContain('More details')
    expect(h.lastIndexOf('More details')).toBeGreaterThan(h.lastIndexOf('Row2'))
    expect(html({ rows: rows(2) })).not.toContain('More details')
  })
  it('a row with a place to go is a button with a chevron', () => {
    const h = html({ rows: [{ label: 'Airspace', value: 'Class C', onClick: () => {}, dot: 'caution' }] })
    expect(h).toContain('tipage__row--tap')
    expect(h).toContain('tipage__dot--caution')
  })
  it('action buttons, when given', () => {
    const h = html({ actions: [{ label: 'Best spot near me', onClick: () => {}, primary: true }, { label: 'Viewfinder', onClick: () => {} }] })
    expect(h).toContain('tipage__btn--primary')
    expect(h).toContain('Viewfinder')
  })
  it('the foot: "How we got this ›" left, the page’s safety line right', () => {
    const h = html()
    expect(h).toContain('How we got this ›')
    expect(h).toContain('Forecasts can be wrong · look first')
    expect(h.indexOf('How we got this')).toBeLessThan(h.indexOf('look first'))
  })
  it('says no "safe", "clear" or "legal"', () => {
    expect(html({ rows: rows(3), onMore: () => {} })).not.toMatch(/\b(safe|clear|legal)\b/i)
  })
})
