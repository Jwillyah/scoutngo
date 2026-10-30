import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HOSTS, TRIGGER_WORD } from '../lib/hosts.ts'
import { PrivacyBody } from './PrivacyPage.tsx'

/* The page draws the allowlist and nothing else: one row per host (tests/privacy.test.ts holds the list to the code). */
describe('the privacy page', () => {
  it('draws one row per listed host, with what it learns and ALWAYS, ON PIN or IF YOU TAP', () => {
    const html = renderToStaticMarkup(<PrivacyBody />)
    const rows = [...html.matchAll(/<tr data-host="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    expect(rows).toEqual(HOSTS.map((h) => h.host))
    for (const h of HOSTS) expect(html).toContain(TRIGGER_WORD[h.trigger])
    expect(html).toMatch(/0<\/span> accounts/)
    expect(html).toMatch(/0<\/span> trackers or cookies/)
    expect(html).toMatch(/0<\/span> server copies of your spots/)
    expect(html).toMatch(/1 hour on Vercel’s Hobby plan and 1 day on Pro/)
    expect(html).toMatch(/placeholder/)
  })

})
