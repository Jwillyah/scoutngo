import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NOTHING ABOUT A VENUE GOES IN AN /api URL.
 *
 * WHY. Vercel keeps the request path of every function call, query string
 * included, whatever the function itself logs. Search sent the typed place and
 * the map centre as ?q=&lat=&lon=, and Street View sent the spot as ?lat=&lon=,
 * so venue locations sat in Vercel's request logs. Both are POST with a JSON
 * body now, and this holds it:
 *
 *   every route in api/ exports POST and no GET, and never reads searchParams
 *   every client fetch of an /api endpoint passes the bare endpoint and POST
 *
 * The browser half -- the requests the running app actually makes -- is
 * scripts/audit-api-urls.mjs, in the commit gate.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\./.test(full)) out.push(full)
  }
  return out
}

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const ROUTES = readdirSync('api').filter((f) => f.endsWith('.ts'))
const CLIENT = walk('src')

/** The text of every fetch( ... ) call, balanced on parentheses. */
function fetchCalls(source: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const at = source.indexOf('fetch(', from)
    if (at === -1) return out
    let depth = 0
    let end = at + 5
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++
      else if (source[end] === ')' && --depth === 0) break
    }
    out.push(source.slice(at, end + 1))
    from = end
  }
}

/** Names of constants holding an /api path, in every client file. */
const ENDPOINTS = new Set(
  CLIENT.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/(?:export\s+)?const\s+([A-Z_]+)\s*=\s*['"`]\/api\//g)].map(
      (m) => m[1],
    ),
  ),
)

/** Every client call that reaches /api, as [file, call text]. */
const API_CALLS = CLIENT.flatMap((file) =>
  fetchCalls(withoutComments(readFileSync(file, 'utf8')))
    .filter((call) => call.includes('/api/') || [...ENDPOINTS].some((name) => call.includes(name)))
    .map((call) => [file, call] as const),
)

describe('the server side', () => {
  it('has routes to check', () => {
    expect(ROUTES.length).toBeGreaterThan(0)
  })

  for (const route of ROUTES) {
    it(`api/${route} takes POST and nothing in its URL`, () => {
      const source = withoutComments(readFileSync(join('api', route), 'utf8'))
      expect(source).toMatch(/export\s+async\s+function\s+POST\b/)
      expect(source).not.toMatch(/export\s+async\s+function\s+GET\b/)
      expect(source).not.toMatch(/new URL\(\s*request\.url/)
    })
  }
})

describe('the client side', () => {
  /* Zero calls examined is not a pass. */
  it('found the calls it is checking', () => {
    expect(ENDPOINTS.size).toBeGreaterThanOrEqual(2)
    expect(API_CALLS.length).toBeGreaterThanOrEqual(2)
  })

  it('posts every /api call to the bare endpoint, data in the body', () => {
    const bad: string[] = []
    for (const [file, call] of API_CALLS) {
      const first = call.slice('fetch('.length).split(',')[0].trim()
      const bare = ENDPOINTS.has(first) || /^['"]\/api\/[a-z-]+['"]$/.test(first)
      if (!bare) bad.push(`${file}: ${first} is not a bare endpoint`)
      if (!/method:\s*['"]POST['"]/.test(call)) bad.push(`${file}: not a POST: ${call.slice(0, 80)}`)
    }
    expect(bad).toEqual([])
  })

  /* The check has to be able to fail. */
  it('would catch a query string coming back', () => {
    const old = "fetch(`${MAPBOX_ENDPOINT}?${params.toString()}`, { signal })"
    const first = old.slice('fetch('.length).split(',')[0].trim()
    expect(ENDPOINTS.has(first)).toBe(false)
    expect(/method:\s*['"]POST['"]/.test(old)).toBe(false)
  })
})
