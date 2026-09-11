import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import handler from '../netlify/functions/generate.ts'
import { MAX_POSITIONS, parsePlanResponse } from '../src/lib/parsePlan.ts'
import { DEFAULT_KIT } from '../src/core/kit.ts'
import { defaultSelection } from '../src/lib/kitSelection.ts'
import { buildGenerateBody, droneAvailable, selectedLenses } from '../src/lib/planRequest.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

/*
 * THE ONE TEST THAT SPENDS MONEY, so it does not run by default.
 *
 *   RUN_LIVE_API=1 npx vitest run tests/generate.live.test.ts
 *
 * It exists because everything else about the model is mocked or asserted against
 * a fixture, and the question that actually matters after changing the model, the
 * token cap, or the prompt is whether the real thing still comes back as JSON this
 * app can read, inside the caps it promises. That cannot be answered offline.
 *
 * Run it after any change to MODEL, MAX_TOKENS, EFFORT, or SYSTEM_PROMPT in
 * netlify/functions/generate.ts. One call, a few cents.
 */

const live = process.env.RUN_LIVE_API === '1' && process.env.ANTHROPIC_API_KEY

/*
 * A synthetic overhead view: land, a river running southwest to northeast, and a
 * pier. Enough for the model to have somewhere to stand and somewhere it must not,
 * without committing a binary fixture. What is under test is the response shape and
 * the caps, not the quality of the placements, which needs a human and real imagery.
 */
function syntheticMapPng(size = 512): string {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance from the diagonal x - y = 0, which runs southwest to northeast.
      const fromRiver = Math.abs(x - y) / Math.SQRT2
      const onPier = x > size * 0.3 && x < size * 0.36 && fromRiver < size * 0.14
      const inWater = fromRiver < size * 0.14 && !onPier

      const [r, g, b] = inWater ? [38, 66, 92] : onPier ? [120, 116, 108] : [58, 74, 46]
      const offset = (y * size + x) * 4
      pixels[offset] = r
      pixels[offset + 1] = g
      pixels[offset + 2] = b
      pixels[offset + 3] = 255
    }
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buffer: Buffer): number => {
    let c = 0xffffffff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

describe.skipIf(!live)('generate against the real model', () => {
  const kit = defaultSelection(DEFAULT_KIT)
  const body = buildGenerateBody(
    CALIBRATION_VENUE,
    kit,
    {
      dataUrl: `data:image/png;base64,${syntheticMapPng()}`,
      bounds: { west: -75.611, south: 38.361, east: -75.601, north: 38.368 },
      mediaType: 'image/png',
    },
    undefined,
    'EDT, UTC-4',
  )

  it('returns a plan the app can parse, inside every cap', async () => {
    const started = Date.now()
    const response = await handler(
      new Request('https://example.test/.netlify/functions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    const elapsed = Date.now() - started

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      status: string
      raw: string
      stopReason: string | null
      usage: { input: number; output: number }
    }
    expect(payload.status).toBe('ok')

    // Truncation is the failure mode the token cap exists to prevent. If this is
    // 'max_tokens', MAX_TOKENS is too low for the thinking budget plus the plan.
    expect(payload.stopReason).toBe('end_turn')

    const parsed = parsePlanResponse(payload.raw, selectedLenses(kit), droneAvailable(kit))
    if (!parsed.ok) {
      throw new Error(`${parsed.reason}\n---\n${parsed.raw}`)
    }

    expect(parsed.positions.length).toBeGreaterThan(0)
    expect(parsed.positions.length).toBeLessThanOrEqual(MAX_POSITIONS)

    const lensIds = new Set(selectedLenses(kit).map((lens) => lens.id))
    for (const position of parsed.positions) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(1)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(1)
      expect(lensIds.has(position.lensId)).toBe(true)
      expect(position.shot.split(/\s+/).length).toBeLessThanOrEqual(26)
      expect(position.risk.split(/\s+/).length).toBeLessThanOrEqual(16)
      expect(position.altitudeFeet).toBeLessThanOrEqual(400)
    }

    // Printed rather than asserted: these are observations about a live service,
    // and turning them into thresholds would make the suite fail on someone else's
    // slow morning. They are here so a regression in cost or latency is visible.
    console.log(
      `[live] ${elapsed}ms · ${payload.usage.input} in / ${payload.usage.output} out · ` +
        `${parsed.positions.length} positions, ${parsed.dropped} dropped`,
    )
  }, 120_000)
})
