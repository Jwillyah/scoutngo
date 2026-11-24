import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * BATCH SIMPLE-3, SECTION 0.3: ONE SURF STORY, WHO READS IT. The window itself,
 * the chart's words and the card are held by src/components/oneSurfStory.test.tsx;
 * here, that the Surf page's Best row and the home's card read that window and
 * nothing of their own.
 */
describe('the Surf page and the home read the one surf window', () => {
  it('the Best row says the window (the Surf page reads surfWindow)', () => {
    const src = readFileSync('src/components/SurfTapIn.tsx', 'utf8')
    expect(src).toMatch(/const best = surfWindow\(read\.series, now, daylight\)/)
    expect(src).toMatch(/value: best === null \? '—' : stretchWords\(best, now, timeZone\)/)
    expect(src).not.toMatch(/bestStretch\(/)
  })

  it('the home builds its card from that window, never the glassy rule over the briefing\'s wind', () => {
    const src = readFileSync('src/components/TileHome.tsx', 'utf8')
    expect(src).toMatch(/const surfWin = surfWindow\(surf\.series, now, daylight\)/)
    expect(src).toMatch(/cleanMoment\(/)
    expect(src).not.toMatch(/glassyMoment\(/)
  })

})
