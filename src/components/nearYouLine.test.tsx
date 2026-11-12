import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NearYou } from './NearYou.tsx'

/* Batch TRUTH, Section 5: "Near you in the next 24 h" in one line. */
describe('"Near you in the next 24 h" in one line', () => {
  const item = { line: 'Iridescence near Fort Story at 3:20 PM', at: new Date('2026-11-12T20:20:00Z'), place: { at: { lat: 36.92, lon: -76.01 } } }
  it('the first item, +n, Show me and Not now; no list', () => {
    const html = renderToStaticMarkup(<NearYou items={[item, item, item] as never} onGo={() => {}} onNotNow={() => {}} />)
    expect(html).toContain('Iridescence near Fort Story at 3:20 PM')
    expect(html).toContain('+2')
    expect(html).toContain('Show me')
    expect(html).toContain('Not now')
    expect(html).not.toContain('<ul')
  })
})
