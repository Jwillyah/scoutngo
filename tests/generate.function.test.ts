import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as generate from '../api/generate.ts'

const { POST } = generate

/**
 * Covers every path that does not spend money. The success path needs a real
 * key and a real request, so it is not exercised here.
 */

const originalKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalKey
})

const post = (body: unknown) =>
  new Request('https://example.test/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('generate function', () => {
  /*
   * The endpoint is POST only, but the 405 is the platform's now: Vercel routes by
   * method to the matching named export and rejects the rest before this module
   * runs, so there is no code of ours left to exercise with a GET. What IS ours is
   * the export surface, so that is what is asserted. Exporting a GET here by
   * accident is exactly how a POST-only endpoint would quietly start answering GETs.
   */
  it('exposes POST and nothing else, so every other method is refused', () => {
    expect(typeof generate.POST).toBe('function')
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(generate).not.toHaveProperty(method)
    }
    // A default export is not a Vercel Web Handler; it would simply never be routed.
    expect(generate).not.toHaveProperty('default')
  })

  /*
   * A MISSING KEY IS A STATE, NOT A FAILURE. This app is shared free and most
   * of it works with no keys at all, so an absent key means an optional feature
   * is off. It answers 200 with a status the UI renders as a plain line, rather
   * than a 500 the UI renders in hazard red beside real warnings.
   */
  it('reports a missing key as a state, not an error', async () => {
    const response = await POST(post({ image: 'AAAA' }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status: string; message: string }
    expect(body.status).toBe('no-key')
    expect(body.message).toMatch(/Anthropic key/i)
    // It names the feature that is off, not the environment variable.
    expect(body.message).not.toContain('ANTHROPIC_API_KEY')
  })

  it('rejects a request with no map image', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
    const response = await POST(post({ venueName: 'Somewhere' }))
    expect(response.status).toBe(400)
    const body = (await response.json()) as { message: string }
    expect(body.message).toContain('map image')
  })

  it('rejects a body that is not JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
    const response = await POST(
      new Request('https://example.test/api/generate', {
        method: 'POST',
        body: 'not json',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('never leaks the key into a response body', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-value'
    const response = await POST(post({ venueName: 'Somewhere' }))
    expect(await response.text()).not.toContain('sk-ant-secret-value')
  })
})
