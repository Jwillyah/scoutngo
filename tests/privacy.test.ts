import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOSTS } from '../src/lib/hosts.ts'
import { hostOf, listed } from '../src/lib/privacy.ts'

/*
 * THE PRIVACY PAGE AND THE ALLOWLIST CANNOT DISAGREE (29 Oct).
 *
 * Every https host written in the app's source is either one the app asks
 * (and so on src/lib/hosts.ts, and so on the page) or one it only links to,
 * a page a person opens themselves, named below with the reason. A new host
 * in the code that is neither fails here; so does a host on the list no code asks. The page's
 * rows are held to the list in src/components/privacyPage.test.tsx.
 */
const LINK_ONLY: Readonly<Record<string, string>> = {
  'scoutngo.vercel.app': 'this app’s own address, in links it makes',
  'surfchex.com': 'a surf cam page, opened by you',
  'www.surfline.com': 'a surf cam page, opened by you',
  'www.fishingunlimited.net': 'a pier cam page, opened by you',
  'nagsheadpier.com': 'a pier cam page, opened by you',
  'avalonpier.com': 'a pier cam page, opened by you',
  'drivenc.gov': 'a traffic cam page, opened by you',
  'deldot.gov': 'a traffic cam page, opened by you',
  'chart.maryland.gov': 'a traffic cam page, opened by you',
  '511.vdot.virginia.gov': 'a traffic cam page, opened by you',
  'tfr.faa.gov': 'the FAA’s TFR page, opened by you',
  'faadronezone.faa.gov': 'the FAA’s drone zone, opened by you',
  'github.com': 'the source code, opened by you',
  'raw.githubusercontent.com': 'where a baked data file came from, in a comment',
  'services1.arcgis.com': 'where baked restriction data came from, in a comment',
  'services6.arcgis.com': 'where baked airspace data came from, in a comment',
  'www.ndbc.noaa.gov': 'NOAA’s buoy pages, linked; the app reads buoys through /api/buoy',
  'example.com': 'the placeholder contact address',
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('the privacy page', () => {
  const hostsInCode = new Set(files('src').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)].map((m) => m[1])))

  it('names every host the app’s code can ask, or the host is a link with a reason', () => {
    const unexplained = [...hostsInCode].filter((h) => listed(h) === undefined && LINK_ONLY[h] === undefined)
    expect(unexplained).toEqual([])
  })

  it('lists no link-only host as one the app asks, and no listed host is stale', () => {
    for (const h of HOSTS) expect(LINK_ONLY[h.host], h.host).toBeUndefined()
    const own = HOSTS.filter((h) => !h.host.startsWith('this app'))
    /* A host on the list that no line of code asks is a list that has drifted. */
    for (const h of own) expect(hostsInCode.has(h.host) || h.host === 'overpass-api.de', h.host).toBe(true)
  })

  it('reads the live check’s hosts as the list names them', () => {
    expect(hostOf('https://api.open-meteo.com/v1/forecast?x=1', 'https://scoutngo.vercel.app')).toBe('api.open-meteo.com')
    expect(hostOf('https://scoutngo.vercel.app/api/metar', 'https://scoutngo.vercel.app')).toBe('this app (/api/metar)')
    expect(hostOf('https://scoutngo.vercel.app/assets/x.js', 'https://scoutngo.vercel.app')).toBeNull()
    expect(listed('overpass.kumi.systems')?.host).toBe('overpass-api.de')
    expect(listed('tracker.example.net')).toBeUndefined()
  })
})
