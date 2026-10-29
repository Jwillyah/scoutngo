import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILD_CHECK_INTERVAL_MS, BUILD_RETRY_MS, buildLabel, buildLabelWithDate } from '../src/lib/build.ts'

/*
 * THE HOME-SCREEN APP RAN AN OLD BUILD (29 Oct). The pinch fix worked in a
 * Safari private tab and not from the icon. A home-screen app is resumed far
 * more often than launched, the one check made on coming back failed while
 * the radio woke, and nothing asked again for fifteen minutes. The browser
 * proof is scripts/audit-sw-update.mjs, in WebKit with the standalone insets.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const HOOK = strip(readFileSync('src/lib/useNewBuild.ts', 'utf8'))
const VERCEL = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const cacheOf = (source: string) =>
  VERCEL.headers.find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value

describe('a home-screen app finds the new build', () => {
  it('retries a check that could not ask, soon, and more than once, before the timer', () => {
    expect(BUILD_RETRY_MS.length).toBeGreaterThanOrEqual(2)
    expect(BUILD_RETRY_MS[0]).toBeLessThanOrEqual(5_000)
    expect(BUILD_RETRY_MS.reduce((a, b) => a + b, 0)).toBeLessThan(BUILD_CHECK_INTERVAL_MS)
    expect(HOOK).toMatch(/next\.status === 'unknown'[\s\S]{0,200}BUILD_RETRY_MS\[tries\]/)
  })

  it('looks on every way a page comes back to the front', () => {
    for (const event of ["'visibilitychange'", "'pageshow'", "'focus'", "'online'"]) expect(HOOK).toContain(`addEventListener(${event}, back)`)
  })

  it('asks for the new worker on each look', () => {
    expect(HOOK).toMatch(/getRegistration\(\)\.then\(\(reg\) => reg\?\.update\(\)\)/)
  })

  it('serves the document and the worker no-cache, and only hashed files immutable', () => {
    for (const source of ['/', '/index.html', '/sw.js', '/manifest.json']) expect(cacheOf(source)).toBe('no-cache')
    expect(cacheOf('/assets/(.*)')).toMatch(/immutable/)
    const immutable = VERCEL.headers.filter((h) => h.headers.some((x) => /immutable/.test(x.value))).map((h) => h.source)
    expect(immutable).toEqual(['/assets/(.*)'])
  })
})

describe('the build, with its day', () => {
  it('reads "hash · YYYY-MM-DD"', () => {
    expect(buildLabelWithDate('2026-10-29T17:02:11.000Z')).toBe(`${buildLabel()} · 2026-10-29`)
  })

  it('says only the hash when there is no day, rather than a made-up one', () => {
    expect(buildLabelWithDate('')).toBe(buildLabel())
  })

  it('is shown in About, beside Debug touch in Settings, and in the debug log', () => {
    expect(readFileSync('src/components/AboutSheet.tsx', 'utf8')).toContain('{buildLabelWithDate()}')
    const settings = readFileSync('src/components/SettingsSheet.tsx', 'utf8')
    expect(settings.indexOf('Build {buildLabelWithDate()}')).toBeGreaterThan(settings.indexOf('Debug touch</span>'))
    expect(readFileSync('src/components/TouchDebug.tsx', 'utf8')).toMatch(/`build \$\{buildLabelWithDate\(\)\}`, \.\.\.lines/)
  })
})
