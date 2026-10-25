import { describe, expect, it } from 'vitest'
import { readShareHash, shareLink, SHARE_PREFIX } from './planShare.ts'
import type { Spot } from './spots.ts'
import { EMPTY_VENUE, withLaanc } from './venue.ts'

const venue = withLaanc({ ...EMPTY_VENUE, latitude: '36.846580', longitude: '-75.976660', date: '2026-10-25', eventDescription: 'Atlantic Park surf' }, true)
const spot: Spot = {
  id: 'spot-1',
  name: 'Atlantic Park',
  savedAt: '2026-10-25T12:00:00.000Z',
  venue,
  kit: { bodyIds: ['a7iv'], lensIds: ['sony-70-200'], droneIds: [] } as unknown as Spot['kit'],
  positions: [],
  marks: [],
}

describe('a plan as a link', () => {
  it('puts nothing in the part of the URL a server sees', async () => {
    const link = await shareLink('https://scoutngo.vercel.app/?calibration=1#old', spot)
    const url = new URL(link)
    /* What a request carries: origin and path. The plan is only in the fragment. */
    expect(`${url.origin}${url.pathname}${url.search}`).toBe('https://scoutngo.vercel.app/')
    expect(url.hash.startsWith(SHARE_PREFIX)).toBe(true)
    for (const leak of ['36.84', 'Atlantic', '2026-10-25']) expect(url.origin + url.pathname + url.search).not.toContain(leak)
  })

  it('opens to the same plan, under a new id', async () => {
    const back = await readShareHash(new URL(await shareLink('https://scoutngo.vercel.app/', spot)).hash)
    expect(back?.name).toBe('Atlantic Park')
    expect(back?.venue.latitude).toBe('36.846580')
    expect(back?.venue.eventDescription).toBe('Atlantic Park surf')
    expect(back?.id).not.toBe('spot-1')
  })

  it("never carries the sender's LAANC switch", async () => {
    const link = await shareLink('https://scoutngo.vercel.app/', spot)
    expect((await readShareHash(new URL(link).hash))?.venue.laanc).toBeUndefined()
  })

  it('reads nothing from a link that is not a plan, or is damaged', async () => {
    expect(await readShareHash('')).toBeNull()
    expect(await readShareHash('#other')).toBeNull()
    expect(await readShareHash(`${SHARE_PREFIX}not-a-plan`)).toBeNull()
  })
})
