import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import handler from '../netlify/functions/generate.ts'

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
  new Request('https://example.test/.netlify/functions/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('generate function', () => {
  it('refuses anything but POST', async () => {
    const response = await handler(
      new Request('https://example.test/.netlify/functions/generate'),
    )
    expect(response.status).toBe(405)
  })

  it('says plainly when the key is missing, and names the fix', async () => {
    const response = await handler(post({ image: 'AAAA' }))
    expect(response.status).toBe(500)
    const body = (await response.json()) as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toContain('ANTHROPIC_API_KEY')
    expect(body.message).toContain('netlify dev')
  })

  it('rejects a request with no map image', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
    const response = await handler(post({ venueName: 'Somewhere' }))
    expect(response.status).toBe(400)
    const body = (await response.json()) as { message: string }
    expect(body.message).toContain('map image')
  })

  it('rejects a body that is not JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
    const response = await handler(
      new Request('https://example.test/.netlify/functions/generate', {
        method: 'POST',
        body: 'not json',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('never leaks the key into a response body', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-value'
    const response = await handler(post({ venueName: 'Somewhere' }))
    expect(await response.text()).not.toContain('sk-ant-secret-value')
  })
})
