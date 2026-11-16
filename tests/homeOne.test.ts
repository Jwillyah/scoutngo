import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHARED_FOR_MS, shareSkyWordNow, skyWordNowFor } from '../src/lib/skyWordNow.ts'

/* Batch CORE, Section 4 (15 Nov 5:46 PM, inland VB). */
describe('4.1 one sky word now', () => {
  it('the home\'s word for now is the strip\'s at now, for 10 min', () => {
    const at = { lat: 36.8, lon: -76.1 }
    shareSkyWordNow(at, 'Overcast', 1000)
    expect(skyWordNowFor(at, 1000 + 60_000)).toBe('Overcast')
    expect(skyWordNowFor({ lat: 36.9, lon: -76.1 }, 1000)).toBeNull()
    expect(skyWordNowFor(at, 1000 + SHARED_FOR_MS + 1)).toBeNull()
  })
})

describe('4.3 to 4.5 the home cards', () => {
  it('the hourly strip\'s "Now" is the headline\'s own reading, at this minute', () => {
    expect(readFileSync('src/components/HomeHours.tsx', 'utf8')).toMatch(/const t = i === 0 \? now : new Date\(h\.getTime\(\) \+ 1_800_000\)/)
  })
  it('at short heights a chart goes whole, its words with it: no "3.4 ft" or "now" left alone', () => {
    const css = readFileSync('src/styles/home-d.css', 'utf8')
    expect(css).toMatch(/\.hcards--many \.hcard--tide \.hcard__chartbox,\s*\n\s*\.hcard--small \.hcard__chartbox \{\s*display: none/)
  })
  it('"Next:" holds tonight\'s colour while it is on, and after dark waits for it to be over', () => {
    const home = readFileSync('src/components/Home.tsx', 'utf8')
    expect(home).toMatch(/items\.unshift\(\{ what: NEXT_WORD\.shoot, from: now \}\)/)
    expect(home).toMatch(/now\.getTime\(\) > colourOver\(day\.events\.sunset, day\.reads\.sunset\)\.getTime\(\)/)
  })
})
