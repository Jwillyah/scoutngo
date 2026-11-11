import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Batch Beach, Section 4: the 3D console's "Shader Error 0 - VALIDATE_STATUS
 * false" was src/three/world/water.ts declaring `attribute float out;`: `out`
 * is a GLSL 3.00 keyword, and three compiles for WebGL2 in 3.00. No shader
 * in src/three names an attribute, varying or uniform with a reserved word.
 */
const RESERVED = new Set(['in', 'out', 'inout', 'input', 'output', 'layout', 'centroid', 'flat', 'smooth', 'sample', 'patch', 'texture', 'filter', 'common', 'partition', 'active', 'sampler', 'buffer', 'shared', 'resource', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'goto', 'inline', 'noinline', 'public', 'static', 'extern', 'external', 'interface', 'long', 'short', 'double', 'half', 'fixed', 'unsigned', 'superp', 'cast', 'namespace', 'using', 'switch', 'case', 'default', 'volatile', 'coherent', 'restrict', 'readonly', 'writeonly', 'precise', 'invariant'])
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : /\.ts$/.test(e.name) ? [join(d, e.name)] : []))

describe('shader names are never GLSL keywords', () => {
  it('attribute, varying and uniform names in src/three', () => {
    const bad: string[] = []
    for (const f of files('src/three')) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\b(?:attribute|varying|uniform)\s+\w+\s+(\w+)\s*;/g)) if (RESERVED.has(m[1])) bad.push(`${f}: ${m[0]}`)
    }
    expect(bad).toEqual([])
  })
})
