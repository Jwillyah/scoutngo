import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as streetview from '../api/streetview.ts'

const original = process.env.GOOGLE_MAPS_API_KEY

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY
})

afterEach(() => {
  if (original === undefined) delete process.env.GOOGLE_MAPS_API_KEY
  else process.env.GOOGLE_MAPS_API_KEY = original
})

const get = (query: string) =>
  streetview.GET(new Request(`https://example.test/api/streetview?${query}`))

describe('streetview function', () => {
  /* Same reasoning as generate: the export surface is the part that is ours. */
  it('exposes GET and nothing else', () => {
    expect(typeof streetview.GET).toBe('function')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(streetview).not.toHaveProperty(method)
    }
    expect(streetview).not.toHaveProperty('default')
  })

  it('reports a missing key as a state, not a failure', async () => {
    const response = await get('lat=38.36&lon=-75.60&heading=180&fov=30')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status: string; message: string }
    expect(body.status).toBe('no-key')
    expect(body.message).toContain('Google Maps key')
  })

  it('rejects a request with no coordinate', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'unused'
    expect((await get('heading=180')).status).toBe(400)
  })

  it('never leaks the key', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'AIza-secret-value'
    const response = await get('lat=38.36&lon=-75.60')
    expect(await response.text()).not.toContain('AIza-secret-value')
  })

  it('never returns a generated image, only a real one or a stated reason', async () => {
    // No key, so no imagery. The contract is that the response carries a status
    // the UI explains, never a synthesised picture standing in for real coverage.
    const body = (await (await get('lat=38.36&lon=-75.60')).json()) as {
      status: string
      image?: string
    }
    expect(body.image).toBeUndefined()
    expect(['no-key', 'no-coverage', 'error']).toContain(body.status)
  })
})
