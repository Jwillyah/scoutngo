import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { goldenChip } from '../lib/goldenChip.ts'
import { ChipRow } from './ChipRow.tsx'

/* The colour itself, amber and never red, is held by scripts/audit-colors.mjs: vitest reads CSS as ''. */
describe('the golden chip', () => {
  it('reads 47 m starting soon in amber, never the hazard red', () => {
    const chip = goldenChip(47)
    expect(chip.value).toBe('47 m')
    expect(chip.soon).toBe(true)
    expect(chip.urgent).toBeUndefined()
    const html = renderToStaticMarkup(<ChipRow chips={[chip]} active={null} onOpen={() => {}} />)
    expect(html).toContain('chip2--soon')
    expect(html).not.toContain('chip2--urgent')
  })

  it('is plain with more than an hour left, and when it is past', () => {
    expect(goldenChip(61).soon).toBe(false)
    expect(goldenChip(0)).toMatchObject({ value: 'past', soon: false })
    expect(goldenChip(null)).toMatchObject({ value: null, soon: false })
  })

})
