import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CREDITS } from '../core/credits.ts'
import { CreditsBody } from './CreditsPage.tsx'

/* Batch CORE, Section 0.4: the Data & credits page. */
describe('Data & credits page', () => {
  it('names each source and its credit, and the no-warranty line', () => {
    const html = renderToStaticMarkup(<CreditsBody />)
    for (const c of CREDITS) expect(html).toContain(c.name.replace(/&/g, '&amp;'))
    expect(html).toContain('without warranty')
    expect(html).toContain('Powered by Esri')
    expect(html).toContain('Open-Meteo.com (CC BY 4.0)')
  })
})
