import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch DRONE, Section 0.6 (docs/privacy-hosting.md): the functions on Vercel log nothing and read no client address. */
describe('the Vercel functions', () => {
  const files = readdirSync('api').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  it('write no log line', () => {
    for (const f of files) expect(readFileSync(`api/${f}`, 'utf8'), f).not.toMatch(/\bconsole\s*\.\s*\w+\s*\(/)
  })
  it('read no client IP or location header', () => {
    for (const f of files) expect(readFileSync(`api/${f}`, 'utf8'), f).not.toMatch(/x-forwarded-for|x-real-ip|x-vercel-ip|request\.ip\b|request\.geo\b/i)
  })
  it('there are functions to check', () => expect(files.length).toBeGreaterThanOrEqual(8))
})
