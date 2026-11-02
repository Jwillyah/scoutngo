import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChipRow } from './ChipRow.tsx'

/* The backup nudge is the one status line, with two buttons, never a box over the map (Batch E; Batch G's words). */
describe('the backup reminder line', () => {
  it('says it once, in one line that is the Back up button, with a × for Not now', () => {
    const html = renderToStaticMarkup(
      <ChipRow chips={[]} active={null} onOpen={() => {}} status="Back up? Last backup: never" statusAction={{ label: 'Back up', whole: true, onClick: () => {}, dismiss: { label: 'Not now', mark: '×', onClick: () => {} } }} />,
    )
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('Back up? Last backup: never')
    expect(html.match(/<button/g)?.length).toBe(2)
    /* The line is the button; Not now is a × with its name kept for screen readers. */
    expect(html).toContain('aria-label="Back up: Back up? Last backup: never"')
    expect(html).toContain('aria-label="Not now"')
    expect(text).toContain('×')
  })
})
