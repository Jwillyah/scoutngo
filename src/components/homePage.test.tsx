import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Landing } from './Landing.tsx'

/* The landing's own parts: src/components/landingAndDevice.test.tsx (board E, Batch CORE Section 6). */
describe('the landing', () => {
  const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)
  it('every example value is said, none is a dash, and nothing says safe or clear', () => {
    for (const v of ['2–3 ft', '4:21 PM', '11 kt', 'Low 3:36 PM', '8 kt NW']) expect(html).toContain(v)
    expect(html).not.toMatch(/class="land__num[^"]*">—</)
    expect(html).not.toMatch(/\bsafe\b|\bclear\b/i)
  })
})

describe('the build', async () => {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { existsSync: (p: string) => boolean; readFileSync: (p: string, e: string) => string }
  it('ships no home photograph: the file is gone and nothing names it', () => {
    expect(fs.existsSync('public/home-hero.webp')).toBe(false)
    expect(fs.readFileSync('src/sw/shellRoutes.ts', 'utf8')).not.toContain('home-hero')
  })
})
