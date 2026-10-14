import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THIS APP NEVER ASKS AN IP ADDRESS WHERE ITS USER IS.
 *
 * Not on load, not ever, not as a fallback when the browser's own geolocation
 * is refused. An approximate position derived from an IP address is user data
 * we do not want to hold even for one frame, and the way not to hold it is not
 * to ask for it.
 *
 * It is a source check because the thing being prevented is an ADDITION. There
 * is nothing to observe failing today; the risk is a later pass reaching for a
 * one line "sensible default" on a cold start, which is exactly how this sort
 * of call arrives. The named services below are the ones that come to hand.
 *
 * Each name is matched as part of a HOSTNAME rather than as a substring. A
 * plain substring search for "ipdata" finds stripDataUrl, and one for
 * "ipgeolocation" finds the name of this file in a comment, so the first
 * version of this check failed on four of its own explanations.
 *
 * Browser geolocation is a different thing and is allowed: it is asked for by
 * tap, the operating system puts the permission prompt in front of the user,
 * and nothing is stored. See src/lib/locateOnce.ts.
 */
const SERVICES = [
  'ipapi',
  'ip-api',
  'ipinfo',
  'ipgeolocation',
  'ipwho',
  'ipstack',
  'ipdata',
  'ipregistry',
  'freeipapi',
  'geoip',
  'geojs.io',
  'ipify',
  'maxmind',
  'db-ip',
  'ip2location',
  'telize',
  'extreme-ip-lookup',
  'geolocation-db',
]

/** Header names a server could read a location out of. */
const EDGE_HEADERS = [
  'x-vercel-ip-country',
  'x-vercel-ip-latitude',
  'x-vercel-ip-longitude',
  'x-vercel-ip-city',
  'x-vercel-ip-timezone',
  'cf-ipcountry',
  'cf-iplatitude',
  'cf-iplongitude',
  'x-geo-',
  'x-appengine-city',
  'x-country-code',
  'x-client-geo',
]

/** Paths that hand back a location without looking like a geolocation host. */
const SERVICE_PATHS = ['cdn-cgi/trace', 'cdn-cgi/geo', '/geoip', '/ipgeo']

const ROOTS = ['src', 'api', 'netlify']
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.jsx', '.html', '.json']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((ext) => full.endsWith(ext))) out.push(full)
  }
  return out
}

const FILES = ROOTS.flatMap((root) => walk(root))

/* This file names every service, so it would match itself. */
const SELF = 'tests/noIpGeolocation.test.ts'

/**
 * A real top level domain, listed rather than matched as "two to ten letters".
 * Matching loosely made `tests/noIpGeolocation.test.ts` look like a hostname,
 * because `.test` is shaped exactly like a TLD.
 */
const TLD =
  '(?:com|io|net|org|co|dev|me|info|app|xyz|cloud|tech|sh|gg|fyi|ai|uk|eu|de|fr|ca)'

/** The service name as part of a hostname: optional prefix and subdomains. */
function hostPattern(service: string): RegExp {
  const escaped = service.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:[a-z0-9-]+\\.)*[a-z0-9-]*${escaped}[a-z0-9-]*\\.${TLD}\\b`)
}

describe('no IP geolocation anywhere', () => {
  it('has files to check, so a passing run means something', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('calls no IP geolocation service', () => {
    const found: string[] = []
    for (const file of FILES) {
      if (file.endsWith(SELF)) continue
      const source = readFileSync(file, 'utf8').toLowerCase()
      for (const service of SERVICES) {
        if (hostPattern(service).test(source)) found.push(`${file}: ${service}`)
      }
    }
    expect(found).toEqual([])
  })

  /*
   * The check has to be able to fail, or it is decoration. These are the two
   * shapes a real call would take.
   */
  it('would catch one if it were added', () => {
    expect(hostPattern('ipapi').test(`fetch('https://ipapi.co/json/')`)).toBe(true)
    expect(hostPattern('ipinfo').test(`const url = "//ipinfo.io/json"`)).toBe(true)
    // And does not fire on the things that are not that.
    expect(hostPattern('ipdata').test('import { stripDataUrl } from "./x.ts"')).toBe(false)
    expect(hostPattern('ipgeolocation').test('see tests/noIpGeolocation.test.ts'.toLowerCase())).toBe(
      false,
    )
  })

  it('fetches no path that answers with a location', () => {
    const found: string[] = []
    for (const file of FILES) {
      if (file.endsWith(SELF)) continue
      const source = readFileSync(file, 'utf8').toLowerCase()
      for (const path of SERVICE_PATHS) {
        if (source.includes(path)) found.push(`${file}: ${path}`)
      }
    }
    expect(found).toEqual([])
  })

  /*
   * The server side matters as much as the client. A platform puts a guessed
   * city and coordinate on every request as headers, so reading one is the
   * same disclosure with none of the fetch code to notice.
   */
  it('reads no location header the platform attaches to a request', () => {
    const found: string[] = []
    for (const file of FILES) {
      if (file.endsWith(SELF)) continue
      const source = readFileSync(file, 'utf8').toLowerCase()
      for (const header of EDGE_HEADERS) {
        if (source.includes(header)) found.push(`${file}: ${header}`)
      }
    }
    expect(found).toEqual([])
  })

  /*
   * And the browser's own API is only ever asked ONE PLACE, so there is a
   * single thing to read when checking that it is tap triggered and stores
   * nothing. Two call sites is how one of them quietly becomes automatic.
   */
  it('touches navigator.geolocation in exactly the two modules that own it', () => {
    const callers = FILES.filter(
      (file) => !file.endsWith(SELF) && readFileSync(file, 'utf8').includes('navigator.geolocation'),
    ).sort()
    expect(callers).toEqual(['src/lib/locateOnce.ts', 'src/lib/useGeolocation.ts'])
  })
})
