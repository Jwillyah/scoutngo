import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LayerMarker } from './LayerMarker.tsx'
import { stationParts, windLines } from '../core/markerReadout.ts'

/* Batch 3D, Section 4.3: the card's markup keeps the station's name apart from its reading and age, and the css cuts only the name. */
const html = renderToStaticMarkup(
  <LayerMarker
    map={null}
    at={{ lat: 36.8, lon: -76 }}
    layer="wind"
    atSpot
    lines={[...windLines(5, 22.5, 6, 'kt', 'cross').map((text, i) => (i === 0 ? text : { text, tone: 'third' as const })), stationParts('Cape Henry', 14, 20, 'kt', '14 min ago')]}
  />,
)
describe('the readout card markup', () => {
  it('three lines of words: the value, the side, the station', () => {
    expect(html.match(/class="lmark__line /g)?.length).toBe(3)
    expect(html).toContain('>5 kt NNE · g6</p>')
    expect(html).toContain('>cross-shore</p>')
  })
  it('the station name and its reading with the age are separate spans, read as one line', () => {
    expect(html).toContain('<span class="lmark__name">Cape Henry</span> <span class="lmark__rest">14 kt NNE · 14 min ago</span>')
    expect(html.replace(/<[^>]+>/g, '')).toContain('Cape Henry 14 kt NNE · 14 min ago')
  })
  it('the css cuts the name with an ellipsis and never the reading', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync: (p: string, e: string) => string }
    const css = fs.readFileSync('src/styles/timeline.css', 'utf8')
    expect(css).toMatch(/\.lmark__name \{[^}]*text-overflow: ellipsis/)
    expect(css).toMatch(/\.lmark__rest \{[^}]*flex: none;[^}]*white-space: nowrap/)
    /* Only the long second line may wrap when the card is narrowed; the value, the side and the water never do. */
    expect(css).toMatch(/\[data-tight='1'\] \.lmark__line--second \{/)
    expect(css).not.toMatch(/\[data-tight='1'\] \.lmark__line \{/)
  })
})
