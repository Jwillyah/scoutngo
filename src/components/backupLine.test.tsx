import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChipRow } from './ChipRow.tsx'

/* The monthly backup reminder is the one status line, with two buttons, never a box over the map (Batch E). */
describe('the backup reminder line', () => {
  it('says it once, with Back up and Not now', () => {
    const html = renderToStaticMarkup(
      <ChipRow chips={[]} active={null} onOpen={() => {}} status="No backup in 30 days: a file is the only copy off this phone" statusAction={{ label: 'Back up', onClick: () => {}, dismiss: { label: 'Not now', onClick: () => {} } }} />,
    )
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('No backup in 30 days')
    expect(html.match(/<button/g)?.length).toBe(2)
    expect(text).toContain('Back up')
    expect(text).toContain('Not now')
  })
})
