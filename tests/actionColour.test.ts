import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/core/contrast.ts'

/* Read as a file, not through Vite, which hands CSS to vitest as an empty string (docs/failure-modes.md, B). */
describe('the gold main action', () => {
  it('dark ink passes 4.5:1 on all three stops of the pill', () => {
    const tokens = readFileSync('src/styles/tokens.css', 'utf8')
    const value = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1] ?? null
    const ink = value('action-ink')
    const stops = ['action-light', 'action-mid', 'action-dark'].map(value)
    expect(ink).not.toBeNull()
    for (const stop of stops) {
      expect(stop).not.toBeNull()
      expect(contrastRatio(ink as string, stop as string), String(stop)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

