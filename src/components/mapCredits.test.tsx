import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CreditsSheet } from './MapCredits.tsx'
import { APP_CREDITS, creditLines } from '../lib/mapCredits.ts'

/*
 * THE CREDITS NEVER OPEN BY THEMSELVES. MapLibre's compact box opened huge
 * over the dock at Virginia Beach on 27 Oct, whenever the sources changed.
 */
describe('the map credits', () => {
  it('lists each source once, as plain text, then what the app draws itself', () => {
    const lines = creditLines(['Tiles by <a href="x">Esri</a>', 'Tiles by Esri', undefined, ''])
    expect(lines).toEqual(['Tiles by Esri', ...APP_CREDITS])
  })

  it('the sheet is a labelled dialog with a close', () => {
    const html = renderToStaticMarkup(<CreditsSheet lines={['Tiles by Esri']} onClose={() => {}} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Close the map credits"')
    expect(html).toContain('Tiles by Esri')
  })
})
