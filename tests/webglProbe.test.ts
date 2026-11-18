import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { firstFailure, reportText, runSteps, stepLine, type ProbeStep, type StepResult } from '../src/lib/probeSteps.ts'
import { PROBE_BUILTINS, PROBE_MATERIALS } from '../src/three/probeMaterials.ts'
import * as look from '../src/three/world/look.ts'
import * as sky from '../src/three/world/sky.ts'
import * as clouds from '../src/three/world/clouds.ts'
import * as water from '../src/three/world/water.ts'
import * as buildings from '../src/three/world/buildings.ts'

/*
 * THE WEBGL PROBE (Batch 3D, Section 1.1): /?probe=webgl runs its steps in
 * order and stops at the first failure, and it compiles every shader the 3D
 * view and Fly draw with, so a new one cannot be missed.
 */

const step = (name: string, run: () => string | Promise<string>, note = false): ProbeStep => ({ name, run, note })

describe('the probe runs its steps in order and stops at the first failure', () => {
  it('runs each once, in order, and every step after a failure is not run', async () => {
    const ran: string[] = []
    const results = await runSteps([
      step('context', () => (ran.push('context'), 'WebGL 2.0')),
      step('shader: sky', () => {
        ran.push('sky')
        throw new Error('ERROR: 0:12: loop index cannot be compared with non-constant expression')
      }),
      step('textures', () => (ran.push('textures'), 'ok')),
    ])
    expect(ran).toEqual(['context', 'sky'])
    expect(results.map((r) => r.status)).toEqual(['pass', 'fail', 'not run'])
    expect(results[1].detail).toBe('Error: ERROR: 0:12: loop index cannot be compared with non-constant expression')
    expect(firstFailure(results)?.name).toBe('shader: sky')
  })

  it('a note step says what it found and never stops the run, even when it throws', async () => {
    const results = await runSteps([step('float target', () => {
      throw new Error('incomplete')
    }, true), step('render', () => 'drawn')])
    expect(results.map((r) => r.status)).toEqual(['note', 'pass'])
    expect(firstFailure(results)).toBeNull()
  })

  it('says which step is running before it runs, so a page that dies mid-step shows where', async () => {
    const seen: string[][] = []
    await runSteps([step('a', () => 'ok'), step('b', () => 'ok')], (rs) => seen.push(rs.map((r) => r.status)))
    expect(seen[0]).toEqual(['running', 'not run'])
    expect(seen[1]).toEqual(['pass', 'not run'])
    expect(seen[2]).toEqual(['pass', 'running'])
    expect(seen.at(-1)).toEqual(['pass', 'pass'])
  })

  it('awaits a step that takes time, and times each one', async () => {
    let t = 0
    const results = await runSteps([step('slow', async () => {
      t += 250
      return 'done'
    })], () => {}, () => t)
    expect(results[0]).toEqual({ name: 'slow', status: 'pass', detail: 'done', ms: 250 })
  })

  it('the text has the build, the agent, the verdict, then one line a step', () => {
    const results: StepResult[] = [
      { name: 'WebGL 2 context', status: 'pass', detail: 'WebGL 2.0', ms: 3 },
      { name: 'Shader: sky', status: 'fail', detail: 'fragment shader: ERROR', ms: 40 },
      { name: 'Textures', status: 'not run', detail: '', ms: 0 },
    ]
    const text = reportText({ build: 'abc1234', ua: 'Mozilla/5.0 (iPhone)', at: '2026-11-17T22:00:00.000Z' }, results)
    expect(text.split('\n')).toEqual([
      'ScoutNGo WebGL probe · build abc1234 · 2026-11-17T22:00:00.000Z',
      'Mozilla/5.0 (iPhone)',
      'STOPPED AT: Shader: sky: fragment shader: ERROR',
      '',
      '1. PASS  WebGL 2 context (3 ms): WebGL 2.0',
      '2. FAIL  Shader: sky (40 ms): fragment shader: ERROR',
      '3. not run  Textures',
    ])
    expect(reportText({ build: 'b', ua: 'u', at: 'a' }, [results[0]]).split('\n')[2]).toBe('ALL PASSED')
    expect(stepLine({ name: 'x', status: 'running', detail: '', ms: 0 }, 0)).toBe('1. RUNNING  x')
  })
})

/* ------------------------------------------------ every shader is probed */

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, (c) => (c === '/* glsl */' ? c : '')).replace(/^\s*\/\/[^\n]*/gm, '')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
const SOURCES = walk('src/three').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('probeMaterials.ts'))
const EXPORTS: Record<string, unknown> = { ...look, ...sky, ...clouds, ...water, ...buildings }

describe('the probe compiles every shader the 3D view and Fly use', () => {
  it('found the shader sources to check (not a pass over nothing)', () => {
    const glsl = SOURCES.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/const (\w+) = \/\* glsl \*\//g)])
    expect(glsl.length).toBeGreaterThanOrEqual(14)
  })

  it('every GLSL string in src/three is exported and listed in PROBE_MATERIALS', () => {
    const listed = new Set(PROBE_MATERIALS.flatMap((m) => m.glsl))
    for (const f of SOURCES) {
      const src = readFileSync(f, 'utf8')
      for (const [, name] of src.matchAll(/const (\w+) = \/\* glsl \*\//g)) {
        expect(src, `${f}: ${name} is not exported, so the probe cannot compile it`).toMatch(new RegExp(`export const ${name} = /\\* glsl \\*/`))
        expect(listed.has(name), `${f}: ${name} is not in src/three/probeMaterials.ts`).toBe(true)
      }
    }
  })

  it('every custom material (ShaderMaterial, RawShaderMaterial, onBeforeCompile) has a probe entry from its own file', () => {
    let sites = 0
    for (const f of SOURCES) {
      const src = strip(readFileSync(f, 'utf8'))
      const here = (src.match(/new THREE\.(Raw)?ShaderMaterial\(|\.onBeforeCompile\s*=/g) ?? []).length
      sites += here
      const file = f.replace(/^src\/three\//, '')
      const entries = PROBE_MATERIALS.filter((m) => m.file === file && m.glsl.length > 0).length
      expect(entries, `${f} makes ${here} custom material(s); the probe lists ${entries}`).toBeGreaterThanOrEqual(here)
    }
    expect(sites).toBeGreaterThanOrEqual(7)
  })

  it("each entry's material carries its GLSL: the probe compiles the very source the scene does", () => {
    for (const m of PROBE_MATERIALS) {
      const mat = m.make()
      const sm = mat as Partial<THREE.ShaderMaterial>
      let vertex = sm.vertexShader ?? ''
      let fragment = sm.fragmentShader ?? ''
      if (m.glsl.length > 0 && !(mat instanceof THREE.ShaderMaterial)) {
        const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' }
        mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
        vertex = shader.vertexShader
        fragment = shader.fragmentShader
      }
      for (const name of m.glsl) {
        const value = EXPORTS[name]
        expect(typeof value, `${name} is exported as a string`).toBe('string')
        expect(vertex.includes(value as string) || fragment.includes(value as string), `${m.name}: ${name} is not in its shaders`).toBe(true)
      }
    }
  })

  it("every kind of three.js material the scene makes is probed", () => {
    const kinds = new Set(SOURCES.flatMap((f) => [...strip(readFileSync(f, 'utf8')).matchAll(/new THREE\.(\w+Material)\(/g)].map((x) => x[1])))
    kinds.delete('ShaderMaterial')
    kinds.delete('RawShaderMaterial')
    expect(kinds.size).toBeGreaterThanOrEqual(5)
    const probed = new Set(PROBE_BUILTINS.map((b) => b.kind))
    for (const k of kinds) expect(probed.has(k), `${k} is used in src/three but not in PROBE_BUILTINS`).toBe(true)
    for (const b of PROBE_BUILTINS) expect(b.make().type).toBe(b.kind)
  })

  it('the probe page has one shader step per entry, after the context and before the textures', async () => {
    const { probeSteps } = await import('../src/lib/webglProbePage.ts')
    const names = probeSteps({} as HTMLElement).map((s) => s.name)
    const shaders = names.filter((n) => n.startsWith('Shader: '))
    expect(shaders).toHaveLength(PROBE_MATERIALS.length + PROBE_BUILTINS.length)
    expect(names[0]).toMatch(/^WebGL 2 context/)
    expect(names.indexOf(shaders[0])).toBeLessThan(names.findIndex((n) => n.startsWith('Textures')))
    expect(names.slice(-6, -1)).toEqual(['One three.js scene drawn', '3D: the terrain only', '3D: + the buildings', '3D: + the sky, the water and raymarched clouds', 'The 3D view as the app opens it, then a Fly view'])
  })
})

describe('the probe is its own page', () => {
  const MAIN = readFileSync('src/main.tsx', 'utf8')
  it('/?probe=webgl branches before the app starts, and imports the probe only then', () => {
    expect(MAIN).toMatch(/get\('probe'\) === 'webgl'/)
    expect(MAIN).toMatch(/if \(probe\) void import\('\.\/lib\/webglProbePage\.ts'\)/)
    expect(MAIN).not.toMatch(/^import .*webglProbePage/m)
  })
  it('asks nothing about where the phone is: one fixed place, the pier the fixtures were recorded at', () => {
    const PAGE = readFileSync('src/lib/webglProbePage.ts', 'utf8')
    expect(PAGE).not.toMatch(/geolocation|getCurrentPosition|watchPosition/)
    expect(PAGE).toMatch(/PROBE_POINT: LatLon = \{ lat: 36\.8435575, lon: -75\.9713104 \}/)
  })
})
