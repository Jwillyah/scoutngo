import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { AboutSheet } from './AboutSheet.tsx'
import type { BuildCheck } from '../lib/build.ts'

/* The page draws into document.body through a portal; here, in place. */
vi.mock('./Page.tsx', () => ({ Page: ({ children }: { children: unknown }) => children }))
const { SettingsPage } = await import('./SettingsPage.tsx')

const page = () =>
  renderToStaticMarkup(
    <SettingsPage
      units={DEFAULT_UNITS}
      onUnits={() => {}}
      showNumbers={false}
      onShowNumbers={() => {}}
      venue={{ lat: 34.21, lon: -77.8, name: 'Wrightsville Beach' }}
      place="coast"
      drone={null}
      showTerrain={false}
      onShowTerrain={() => {}}
      showLabels
      onShowLabels={() => {}}
      newBuild={{ status: 'unknown' } as BuildCheck}
      onHow={() => {}}
      onAbout={() => {}}
      onShowHome={() => {}}
      onKit={() => {}}
      onExport={() => {}}
      onClose={() => {}}
    />,
  )

describe('Settings, a page of its own (30 Oct)', () => {
  /* Batch Map, Section 6 (board SettingsV2): seven groups in this order, the version at the foot, Debug behind a long press. */
  it('has its groups in the board\'s order, and nothing it moved out', () => {
    const html = page()
    const titles = [...html.matchAll(/class="set2__title">([^<]+)</g)].map((m) => m[1])
    expect(titles).toEqual(['What I do', 'My spot', 'Units', 'My gear', 'Alerts', 'Labs', 'My data · on this phone only'])
    /* Batch 3D, Section 0.3: Debug is a plain row now (src/components/labsDebug.test.tsx), its contents on a page of their own. */
    for (const gone of ['Last venue', 'Coast &amp; inland', 'Kept when space runs short', 'Imagery', 'Terrain', 'Wind map', 'Touch log', 'Show the numbers']) expect(html).not.toContain(`>${gone}<`)
    expect(html).toMatch(/class="set2__version"/)
  })

  /* Batch SIMPLE-2, Section 2: one persona; a row is a tap that makes it first (src/lib/persona.ts), not five switches. */
  it('what I do: the five, each a coloured tile and a tap that makes it first, no emoji', () => {
    const html = page()
    for (const a of ['surf', 'shoot', 'drone', 'fish', 'weather']) expect(html).toContain(`set2__tile--${a}`)
    const what = html.slice(html.indexOf('>What I do<'), html.indexOf('>My spot<'))
    expect(what.match(/<button[^>]*set2__row--tap/g)?.length).toBe(5)
    expect(what).not.toContain('role="switch"')
    expect(html.match(/role="switch"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('units: wind kt / mph / km/h (m/s under More), height ft / m, temp °F / °C, time 12 h / 24 h', () => {
    const html = page()
    for (const label of ['>kt<', '>mph<', '>km/h<', '>ft<', '>m<', '°F', '°C', '>12 h<', '>24 h<']) expect(html).toContain(label)
    expect(html).not.toContain('>m/s<')
    expect(html).toMatch(/aria-checked="true"[^>]*>12 h</)
  })

  it('my spot, my gear and my data say what they are; no "safe" anywhere', () => {
    const html = page()
    expect(html).toContain('Home spot')
    expect(html).toContain('Use my location')
    expect(html).toContain('Camera + lenses')
    expect(html).toMatch(/Drone<\/span><\/span><span class="set2__value">None</)
    expect(html).toContain('Back up to a file')
    expect(html).toContain('What leaves my phone')
    expect(html).toMatch(/>More<\/span><span class="set2__sub">restore, export, clear, storage, AI key/)
    expect(html).not.toMatch(/\bsafe\b/i)
  })

  /* Batch Beach, Section 6: the calendar row in one line, the detail behind How it works. */
  it('sky calls in my calendar: one line of what it does and what it sends, then How it works', () => {
    const t = page().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(t).toContain('Sky calls in my calendar Puts sunrise/sunset calls in your calendar · sends your spot rounded to ~0.7 mi')
    expect(t).toContain('How it works')
    expect(page()).not.toContain('data-feed-how')
    expect(t).not.toContain('Vercel’s own request logs')
  })

  it('and the units have left About', () => {
    const html = renderToStaticMarkup(
      <AboutSheet onHow={() => {}} />,
    )
    expect(html).not.toContain('Wind units')
    expect(html).not.toContain('Distance units')
  })
})

/*
 * ABOUT, THE STORY (Batch DRONE, Section 5; docs/mockups/About_Story.png):
 * the headline, the story word for word, four "how it's different" lines,
 * three rows and the foot; no key, no backup, no file input, and never "no
 * account".
 */
describe('About, the story', () => {
  const html = renderToStaticMarkup(<AboutSheet onHow={() => {}} />)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ')
  it('says the board, in its order', () => {
    const order = [
      'One check before you go outside.',
      "I'm a photographer and surfer in Virginia Beach. Every morning I flipped through nine apps to answer one question: is it worth going out, and where? ScoutNGo puts it in one look: the best sunset spot near you from the real clouds, wind at 400 ft and your airspace ceiling, plus surf, tide and wind.",
      'How it’s different',
      'Where, not just whether. It names the spot and the direction to look.',
      'It checks itself. Every call is compared to what really happened. Hits and misses are public.',
      'All in one. Surf, light, drone, tide and wind from the same data.',
      'Free and open source. No ads, no tracking. Your spots stay on your phone.',
      'How we got this · our hit rate',
      'Data & credits',
      'Source code',
      'Made in Virginia Beach · Privacy',
    ]
    const at = order.map((t) => text.indexOf(t))
    expect(at.every((i) => i >= 0), JSON.stringify(order.filter((_, i) => at[i] < 0))).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('never says "no account"; carries no key, no backup and no file input', () => {
    expect(text.toLowerCase()).not.toMatch(/no account/)
    expect(html).not.toMatch(/type="file"/)
    expect(text).not.toMatch(/API key|Back ?up|Restore|Import|Choose File|clearing Safari|Safari erase/i)
  })
})

describe('the hit rate the About row opens (Batch DRONE, Section 5)', () => {
  it('the How page says where each score is, and for how many days', async () => {
    const { HowPage } = await import('./HowPage.tsx')
    const t = renderToStaticMarkup(<HowPage onBack={() => {}} />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(t).toContain('Our hit rate')
    expect(t).toMatch(/nearest airport station over the last 30 days/)
    expect(t).toMatch(/nearest buoy over the last 30 days/)
  })
})

describe('the Go alert says it needs the app open (Batch DRONE, Section 6.8; docs/go-alert.md)', () => {
  it('"Keep ScoutNGo open for Go alerts" right under the toggle', () => {
    const html = page()
    const row = html.indexOf('aria-label="Go alert"')
    const note = html.indexOf('Keep ScoutNGo open for Go alerts')
    expect(row).toBeGreaterThan(0)
    expect(note).toBeGreaterThan(row)
    expect(html.slice(row, note)).not.toMatch(/Live sky/)
  })
})
