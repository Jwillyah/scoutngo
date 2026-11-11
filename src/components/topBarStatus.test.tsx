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

  /* Batch Beach, Section 6: the four map icons on the 24-unit grid, one stroke. */
  it('back, menu, plus and locate: 24-unit grid, one stroke width', () => {
    const html = renderToStaticMarkup(
      <TopBar onMenu={() => {}} menuOpen={false} pill={null} onAdd={() => {}} adding={false} onLocate={() => {}} locating={false} locateNote={null} online onBack={() => {}} />,
    )
    const svgs = html.match(/<svg[^>]*>/g) ?? []
    expect(svgs.length).toBe(4)
    for (const s of svgs) {
      expect(s).toContain('viewBox="0 0 24 24"')
      expect(s).toContain('stroke-width="2"')
    }
    expect(html).not.toMatch(/<path[^>]*stroke-width/)
  })

  /* Batch Polish, Section 2: the map's top bar is back · spot · locate (the menu is the home's, the + in the Map sheet's tools). */
  it('on the map: back, the spot pill and locate; no menu, no +', () => {
    const html = renderToStaticMarkup(
      <TopBar onMenu={() => {}} menuOpen={false} pill={<span>Spot</span>} onAdd={() => {}} adding={false} addHidden menuHidden onLocate={() => {}} locating={false} locateNote={null} online onBack={() => {}} />,
    )
    expect(html).toContain('aria-label="Back to the home"')
    expect(html).toContain('Go to where I am')
    expect(html).not.toContain('aria-label="Menu"')
    expect(html).not.toContain('topbar__btn--add')
  })
})
