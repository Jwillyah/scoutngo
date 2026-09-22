import { describe, expect, it } from 'vitest'
import { APP_SOURCES, appLayerIdsIn } from './captureLayers.ts'

/*
 * THE LEAK THIS LOCKS SHUT.
 *
 * capture() reads the WebGL canvas, and the canvas holds every layer this app
 * draws as well as the satellite tiles. Every generate from the first one sent
 * the model a photograph with our annotations burned into it: a full height
 * dashed sun axis through the subject, the sun and shadow rays, and the cone of
 * any isolated position. The model was then told it was looking at a satellite
 * view and asked to read the terrain.
 */
const STYLE = [
  { id: 'esri-imagery', source: 'esri' },
  { id: 'radius-fill', source: 'reach-radius' },
  { id: 'radius-line', source: 'reach-radius' },
  { id: 'cone-fill', source: 'fov-cones' },
  { id: 'cone-line', source: 'fov-cones' },
  { id: 'cone-line-air', source: 'fov-cones' },
  { id: 'sun-line', source: 'sun-axis' },
  { id: 'ray-casing', source: 'sun-rays' },
  { id: 'ray-line', source: 'sun-rays' },
  { id: 'background', source: undefined },
]

describe('appLayerIdsIn', () => {
  it('names every layer this app draws', () => {
    expect(appLayerIdsIn(STYLE)).toEqual([
      'radius-fill', 'radius-line',
      'cone-fill', 'cone-line', 'cone-line-air',
      'sun-line', 'ray-casing', 'ray-line',
    ])
  })

  /* Hiding the basemap would capture a blank rectangle and send THAT instead. */
  it('never touches the imagery or a source-less layer', () => {
    const hidden = appLayerIdsIn(STYLE)
    expect(hidden).not.toContain('esri-imagery')
    expect(hidden).not.toContain('background')
  })

  /*
   * Derived from SOURCES, not from a list of layer ids, so a new layer added to
   * an existing source is covered without anyone remembering to update a list.
   * That drift is exactly how this bug survived two weeks.
   */
  it('covers a layer added later to a source we already draw with', () => {
    const withNewLayer = [...STYLE, { id: 'cone-label', source: 'fov-cones' }]
    expect(appLayerIdsIn(withNewLayer)).toContain('cone-label')
  })

  it('knows the four sources this app owns', () => {
    expect([...APP_SOURCES].sort()).toEqual(
      ['fov-cones', 'reach-radius', 'sun-axis', 'sun-rays'],
    )
  })

  it('returns nothing for a style with no app layers at all', () => {
    expect(appLayerIdsIn([{ id: 'esri-imagery', source: 'esri' }])).toEqual([])
    expect(appLayerIdsIn([])).toEqual([])
  })
})
