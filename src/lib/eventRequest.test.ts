import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventElement } from './eventLayout.ts'
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  readLayoutFile,
  requestEventPlace,
  requestEventRead,
} from './eventRequest.ts'

const LAYOUT = {
  data: 'QUJD',
  dataUrl: 'data:image/png;base64,QUJD',
  mediaType: 'image/png',
  name: 'course.png',
}

const ELEMENTS: EventElement[] = [
  { id: 'e1', type: 'course', shape: 'path', label: 'Race course', layoutPoints: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
  { id: 'e2', type: 'crowd', shape: 'area', label: 'North bank', layoutPoints: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }] },
]

const ok = () =>
  new Response(JSON.stringify({ status: 'ok', raw: '{"elements":[]}' }), {
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => vi.unstubAllGlobals())

describe('readLayoutFile', () => {
  it('accepts the image types a phone actually produces', () => {
    expect([...ACCEPTED_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp'])
  })

  it('refuses a PDF with a plain reason rather than failing later', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'course.pdf', { type: 'application/pdf' })
    const result = await readLayoutFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/PNG, JPEG or WebP/)
  })

  /* Rejected, not silently downscaled: the shooter picked a file and is owed
     an answer about it. */
  it('refuses an oversized file and says how big it was', async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.png', { type: 'image/png' })
    const result = await readLayoutFile(big)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/limit is 6MB/)
  })

  it('reads an accepted file into base64 and a data URL', async () => {
    const file = new File([new Uint8Array([65, 66, 67])], 'course.png', { type: 'image/png' })
    const result = await readLayoutFile(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.layout.dataUrl).not.toBe(result.layout.data)
    expect(result.layout.name).toBe('course.png')
  })
})

describe('the two calls', () => {
  /* STEP 1 IS THE ARTWORK ALONE. Sending the satellite view here would be
     paying for an image the question does not use. */
  it('sends only the artwork when reading', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => ok(),
    )
    vi.stubGlobal('fetch', fetchMock)
    await requestEventRead(LAYOUT)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.step).toBe('read')
    expect(body.layout).toBe('QUJD')
    expect(body.capture).toBeUndefined()
  })

  it('sends both images and the element list when placing', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => ok(),
    )
    vi.stubGlobal('fetch', fetchMock)
    await requestEventPlace(LAYOUT, { dataUrl: 'data:image/jpeg;base64,ZZZ', northBearing: 0 }, ELEMENTS)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.step).toBe('place')
    expect(body.layout).toBe('QUJD')
    // Stripped of its data URL prefix, which is what the API wants.
    expect(body.capture).toBe('ZZZ')
    expect(body.elements.map((e: { id: string }) => e.id)).toEqual(['e1', 'e2'])
  })

  /*
   * The placement request carries ids and shapes, never a shape the model could
   * mistake for an answer. It must not carry anything resembling a coordinate.
   */
  it('never puts a real coordinate in either request', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => ok(),
    )
    vi.stubGlobal('fetch', fetchMock)
    await requestEventPlace(LAYOUT, { dataUrl: 'data:image/jpeg;base64,ZZZ', northBearing: 12 }, ELEMENTS)
    const body = String(fetchMock.mock.calls[0][1]?.body)
    expect(body).not.toMatch(/"lat"|"lon"|latitude|longitude/)
  })

  it('explains a bare vite dev server instead of a dead end', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { status: 404 }))
    const result = await requestEventRead(LAYOUT)
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toMatch(/vercel dev/)
  })

  it('survives the function being unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const result = await requestEventRead(LAYOUT)
    expect(result.status).toBe('error')
  })
})
