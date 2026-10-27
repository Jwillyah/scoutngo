import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOSTS } from '../src/lib/hosts.ts'

/*
 * WHAT LEAVES THE DEVICE, SAID FOR EVERY HOST THE AUDITS ALLOW. The How page
 * lists src/lib/hosts.ts; the 3D network audit allows its own list. A host
 * the app may contact and the page does not name is a host nobody was told about.
 */
describe('the How page names every host', () => {
  it('covers each host the 3D network audit allows, and the scan hosts', () => {
    const audit = readFileSync(new URL('../scripts/audit-3d-network.mjs', import.meta.url), 'utf8')
    const allowed = [...(audit.match(/const ALLOWED = new Set\(\[([^\]]+)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(allowed.length).toBeGreaterThan(4)
    const named = HOSTS.map((h) => h.host)
    for (const host of allowed) {
      if (/^(127\.0\.0\.1|localhost)/.test(host)) continue
      /* The three Overpass servers are named as one: overpass-api.de "and two mirrors". */
      if (host.startsWith('overpass')) expect(named).toContain('overpass-api.de')
      else expect(named, host).toContain(host)
    }
    expect(named).toContain('s3-us-west-2.amazonaws.com')
    expect(HOSTS.find((h) => h.host === 's3-us-west-2.amazonaws.com')?.when).toMatch(/only after you tap/)
  })
})
