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

  it('says plainly when the key is missing, and names the fix', async () => {
    const response = await POST(post({ image: 'AAAA' }))
    expect(response.status).toBe(500)
    const body = (await response.json()) as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toContain('ANTHROPIC_API_KEY')
    expect(body.message).toContain('vercel dev')
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
