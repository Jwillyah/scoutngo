import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/* About and Settings are full pages with a back arrow, never drag-up sheets (Batch E, Section 7). */
vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), createPortal: (node: unknown) => node }))
vi.stubGlobal('document', { body: {} })
const { Page } = await import('./Page.tsx')

describe('a page with a route of its own', () => {
  it('has a back arrow and no Close', () => {
    const html = renderToStaticMarkup(
      <Page title="About" back onClose={() => {}}>
        <p>hello</p>
      </Page>,
    )
    expect(html).toContain('aria-label="Back"')
    expect(html).not.toContain('page__close')
    expect(html).toContain('role="dialog"')
  })
  it('a page without one keeps Close', () => {
    const html = renderToStaticMarkup(
      <Page title="Tides" onClose={() => {}}>
        <p>hello</p>
      </Page>,
    )
    expect(html).toContain('page__close')
    expect(html).not.toContain('page__back')
  })
})
