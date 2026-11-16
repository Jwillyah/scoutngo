import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nowHeadline } from '../src/core/skyNow.ts'
import { GOD_RAYS_SUN_MAX } from '../src/core/specialLight.ts'

/* Batch CORE, Section 5: the Sky page (LIVE S2's leftovers). */
describe('5 the Sky page', () => {
  it('5.1 the Now headline names the thing', () => {
    expect(nowHeadline([{ kind: 'texture', line: 'texture: broken cloud with gaps gives the sky shape' }, { kind: 'rays', line: 'rays: x' }])).toEqual({ head: 'Textured clouds now', why: 'Broken cloud with gaps gives the sky shape · and light rays.' })
    expect(nowHeadline([])).toBeNull()
  })
  it('5.2 no lone bulleted line under it', () => {
    expect(readFileSync('src/components/SkyNowView.tsx', 'utf8')).not.toMatch(/spage__nowlist/)
  })
  it('5.3 light rays need the sun at 15° or lower', () => {
    expect(GOD_RAYS_SUN_MAX).toBe(15)
  })
})
