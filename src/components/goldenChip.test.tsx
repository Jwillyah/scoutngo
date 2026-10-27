import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { goldenChip } from '../lib/goldenChip.ts'
import { ChipRow } from './ChipRow.tsx'

/* The colour itself, amber and never red, is held by scripts/audit-colors.mjs: vitest reads CSS as ''. */
describe('the golden chip', () => {
  it('at 6:58 AM before a 7:23 golden start reads "in 25 m", amber, never the hazard red', () => {
    const chip = goldenChip({ kind: 'next', minutesUntil: 25 })
    expect(chip.value).toBe('in 25 m')
    expect(chip.soon).toBe(true)
    expect(chip.urgent).toBeUndefined()
    const html = renderToStaticMarkup(<ChipRow chips={[chip]} active={null} onOpen={() => {}} />)
    expect(html).toContain('chip2--soon')
    expect(html).not.toContain('chip2--urgent')
  })

  it('inside golden light says how long is left, and is amber', () => {
    expect(goldenChip({ kind: 'now', minutesLeft: 38 })).toMatchObject({ label: 'GOLDEN NOW', value: '38 m left', soon: true })
  })

  it('is plain more than an hour out, and says nothing when there is none or no venue', () => {
    expect(goldenChip({ kind: 'next', minutesUntil: 61 })).toMatchObject({ value: 'in 61 m', soon: false })
    /* Short enough for the chip: whole hours past 100 minutes. */
    expect(goldenChip({ kind: 'next', minutesUntil: 432 })).toMatchObject({ value: 'in 7 h', soon: false })
    expect(goldenChip({ kind: 'none' })).toMatchObject({ value: null, soon: false })
    expect(goldenChip(null)).toMatchObject({ value: null, soon: false })
  })
})
