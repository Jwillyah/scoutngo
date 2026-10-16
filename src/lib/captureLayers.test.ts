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

  /*
   * EXHAUSTIVE ON PURPOSE. A new source has to be added here by hand, which is
   * the point: the original bug was app annotations burned into the image sent
   * to the model, and it survived because nothing forced anyone to notice a new
   * layer. The pilot line was added to this list because this test failed.
   */
  it('knows the eleven sources hidden before a capture', () => {
    expect([...APP_SOURCES].sort()).toEqual(
      [
        'cloud-forecast',
        'fov-cones',
        'goes-sky-infrared',
        'goes-sky-visible',
        'pilot-links',
        'reach-radius',
        'shot-footprints',
        /* The marked hazards, and the line being drawn. Our own drawings. */
        'site-mark-draft',
        'site-marks',
        'sun-axis',
        'sun-rays',
      ],
    )
  })

  /*
   * THE CLOUD LAYER IS HIDDEN FOR A DIFFERENT REASON FROM THE REST.
   *
   * Everything else here is annotation this app drew. GOES cloud is observed
   * weather, not a drawing, but the capture exists so a model can read the
   * GROUND and place positions on it, and a cloud layer over the imagery hides
   * the ground. The test is "does it stop the capture showing the ground",
   * not "did we draw it".
   */
  it('hides the cloud layer, which is not an annotation but still covers the ground', () => {
    /* The REAL source ids: each band has its own source, not a shared prefix. */
    const style = [
      { id: 'esri', source: 'esri' },
      { id: 'goes-sky-visible', source: 'goes-sky-visible' },
      { id: 'goes-sky-infrared', source: 'goes-sky-infrared' },
    ]
    const hidden = appLayerIdsIn(style)
    expect(hidden).toContain('goes-sky-visible')
    expect(hidden).toContain('goes-sky-infrared')
    // And never the basemap, which would capture a blank rectangle.
    expect(hidden).not.toContain('esri')
  })

  it('returns nothing for a style with no app layers at all', () => {
    expect(appLayerIdsIn([{ id: 'esri-imagery', source: 'esri' }])).toEqual([])
    expect(appLayerIdsIn([])).toEqual([])
  })
})
