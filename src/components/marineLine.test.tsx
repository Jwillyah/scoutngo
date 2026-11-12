import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/* Batch Polish 2, Section 2: the routine NWS marine forecast, one line on the Weather and Surf pages; the period's text in full on a tap. Fixture text, not a forecast. */
const marine = { period: 'Tonight', text: 'NE winds 10 to 15 kt. Seas 2 to 3 ft. Wave detail: E 2 ft at 7 seconds.', zone: 'ANZ656' }
let said: typeof marine | null = marine
vi.mock('../lib/coastData.ts', () => ({ useCoast: () => ({ coast: said === null ? null : { marine: said }, tropics: null }) }))
const { MarineLine } = await import('./MarineLine.tsx')
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('the NWS marine line', () => {
  it('one line: who says it and which period, nothing of the text until opened', () => {
    const h = renderToStaticMarkup(<MarineLine venue={{ lat: 36.84, lon: -75.97 }} />)
    expect(text(h)).toBe('NWS marine · Tonight ›')
    expect(h).not.toContain('Seas 2 to 3 ft')
  })
  it('opened: the period’s text as written, and where it is from', () => {
    const h = text(renderToStaticMarkup(<MarineLine venue={{ lat: 36.84, lon: -75.97 }} startOpen />))
    expect(h).toContain('NE winds 10 to 15 kt. Seas 2 to 3 ft.')
    expect(h).toContain('ANZ656, as issued by the National Weather Service.')
  })
  it('no marine zone here: nothing at all', () => {
    said = null
    expect(renderToStaticMarkup(<MarineLine venue={{ lat: 38.5, lon: -78.4 }} />)).toBe('')
    said = marine
  })
})
