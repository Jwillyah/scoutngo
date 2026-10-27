import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TopBar } from './TopBar.tsx'

/*
 * ONE STATUS, NEVER OVER THE DATE. On 27 Oct the word OFFLINE sat on top of
 * the pill's date and read "OTUE|27". Offline is a dot on the pill's edge.
 */
const bar = (online: boolean) =>
  renderToStaticMarkup(
    <TopBar
      onMenu={() => {}}
      menuOpen={false}
      pill={<span className="pill-venue__date">TUE 27</span>}
      onAdd={null}
      adding={false}
      onLocate={null}
      locating={false}
      locateNote={null}
      online={online}
    />,
  )

describe('the top bar status', () => {
  it('offline is a dot with no words over the date', () => {
    const html = bar(false)
    const mark = html.match(/<span class="topbar__offline"[^>]*>([^<]*)<\/span>/)
    expect(mark).not.toBeNull()
    expect(mark?.[1]).toBe('')
    expect(html).toContain('aria-label="No connection"')
    expect(html).not.toMatch(/>offline</i)
  })

  it('online shows nothing', () => {
    expect(bar(true)).not.toContain('topbar__offline')
  })
})
