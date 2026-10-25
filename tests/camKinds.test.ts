import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAMS, camKind } from '../src/data/cams.ts'

/*
 * LIVE CAMS ARE LINKS, AND ONLY LINKS. Every file that reads the camera list
 * is read here: none may fetch, embed, proxy or picture a camera. Opening one
 * is the shooter visiting the operator; the app's part ends at the href.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}
const FORBIDDEN = /\bfetch\s*\(|XMLHttpRequest|<iframe|<img\b|<video\b|\bnew Image\(|\.m3u8|createElement\(\s*['"](iframe|img|video)/

describe("every file that reads the camera list links out", () => {
  const readers = files('src').filter((f) => readFileSync(f, 'utf8').includes('data/cams'))

  it('finds the files that read the camera list', () => {
    expect(readers).toEqual(expect.arrayContaining(['src/components/CamList.tsx', 'src/components/PlanMode.tsx']))
  })

  it('none of them fetches, embeds or pictures a camera', () => {
    for (const f of readers) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
      expect(FORBIDDEN.exec(code)?.[0] ?? null, f).toBeNull()
    }
  })

  it('every camera is an https link, and both kinds exist', () => {
    for (const cam of CAMS) expect(cam.url.startsWith('https://'), cam.id).toBe(true)
    expect(CAMS.some((c) => camKind(c) === 'coast')).toBe(true)
    expect(CAMS.some((c) => camKind(c) === 'road')).toBe(true)
  })

  it('would catch an embed', () => {
    expect(FORBIDDEN.test('<iframe src={cam.url} />')).toBe(true)
    expect(FORBIDDEN.test('await fetch(cam.url)')).toBe(true)
  })
})
