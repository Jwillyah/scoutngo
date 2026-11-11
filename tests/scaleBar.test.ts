import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch Polish, Section 2: the scale bar hides while a sheet is open (half or full); read from the stylesheet. */
describe('the scale bar under an open sheet', () => {
  it('hidden at half and full, kept at peek', () => {
    expect(readFileSync('src/styles/look-d.css', 'utf8')).toMatch(/\.mode-plan:has\(\.sheet\[data-detent='half'\], \.sheet\[data-detent='full'\]\) \.maplibregl-ctrl-scale \{\s*display: none;/)
  })
})
