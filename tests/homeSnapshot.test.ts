import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { colorWords } from '../src/core/homeDay.ts'
import { skyMoment } from '../src/core/homeTiles.ts'
import { agoWords, choosePart, clearHomeSnapshots, heldFor, holdPart, HOME_PARTS, SAVED_MAX_MS, type HomePart, type Shown } from '../src/lib/homeSnapshot.ts'

/*
 * BATCH SIMPLE-3, SECTION 0.1: ONE RESOLVED SNAPSHOT PER SPOT.
 *
 * tests/data/home-2026-11-23/states.json holds the two states the home
 * flickered between at 5:10 PM on 23 Nov: A, the parts drawn before their
 * inputs had all answered (Sky "Possible", Surf "1–2 ft", Tide "—", no card)
 * and B, every input in (Sky "Likely", Surf "2–3 ft", Tide "High 8:58p",
 * "Color on now"). Each reload here is the home opened again: its parts'
 * inputs arrive in a random order, each part showing A's value until its own
 * inputs have all answered, then B's (src/components/TileHome.tsx through
 * src/lib/homeSnapshot.ts). Ten reloads, every frame looked at.
 */
const F = JSON.parse(readFileSync('tests/data/home-2026-11-23/states.json', 'utf8'))
const now = new Date(F.now)
const TZ = 'America/New_York'
const SPOT: string = F.spot

/** What the home draws from its shown parts: each tile's words, the card, whether a picture is there. */
function drawn(shown: Record<HomePart, Shown<unknown> | null>) {
  const tile = (k: HomePart) => {
    const p = shown[k]
    if (p === null) return 'skeleton'
    const d = p.data as { value?: { text: string } | null; turns?: { at: number; kind: string }[]; call?: string; tempC?: number } | null
    if (k === 'sky') return colorWords((d as { call: 'Go' | 'Maybe' | 'Skip' | null } | null)?.call ?? null) ?? '—'
    if (k === 'tide') {
      const next = d?.turns?.find((x) => x.at > now.getTime())
      return next === undefined ? '—' : `${next.kind} ${new Date(next.at).toISOString()}`
    }
    if (k === 'weather') return String(d?.tempC ?? '—')
    if (k === 'fish') return JSON.stringify(d)
    return d?.value?.text ?? '—'
  }
  const sky = shown.sky?.data as { kind: 'sunset'; event: number; call: 'Go' | 'Maybe'; from: number | null; to: number | null; lookDeg: number } | null | undefined
  const card = sky == null ? null : skyMoment({ ...sky, event: new Date(sky.event), from: sky.from === null ? null : new Date(sky.from), to: sky.to === null ? null : new Date(sky.to) }, now, TZ)
  const pics = HOME_PARTS.filter((k) => ((shown[k]?.data as { bars?: unknown[] } | null)?.bars?.length ?? 0) > 0)
  return { tiles: Object.fromEntries(HOME_PARTS.map((k) => [k, tile(k)])), card: card?.eyebrow ?? null, pics }
}

/** One open of the home: the parts settle one by one in `order`; every frame is drawn. */
function open(order: HomePart[], waited = false) {
  clearHomeSnapshots()
  const frames: ReturnType<typeof drawn>[] = []
  const settled = new Set<HomePart>()
  for (let step = 0; step <= order.length; step += 1) {
    if (step > 0) settled.add(order[step - 1])
    const held = heldFor(SPOT)
    const shown = Object.fromEntries(
      HOME_PARTS.map((k) => {
        const on = settled.has(k)
        const live = (on ? F.B : F.A)[k]
        return [k, choosePart(live, on, held[k], waited, now.getTime())]
      }),
    ) as Record<HomePart, Shown<unknown> | null>
    frames.push(drawn(shown))
    for (const k of settled) holdPart(SPOT, k, F.B[k], now.getTime())
  }
  return frames
}

const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('the home from one resolved snapshot per spot (23 Nov 5:10 PM, the two states recorded)', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
    clearHomeSnapshots()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('the fixture is the report: A and B differ where the field saw them differ', () => {
    const a = drawn(Object.fromEntries(HOME_PARTS.map((k) => [k, { data: F.A[k], at: 0, aged: false }])) as Record<HomePart, Shown<unknown>>)
    const b = drawn(Object.fromEntries(HOME_PARTS.map((k) => [k, { data: F.B[k], at: 0, aged: false }])) as Record<HomePart, Shown<unknown>>)
    expect([a.tiles.sky, a.tiles.surf, a.tiles.tide, a.card]).toEqual(['color possible', '1–2 ft', '—', null])
    expect([b.tiles.sky, b.tiles.surf, b.tiles.tide, b.card]).toEqual(['color likely', '2–3 ft', 'high 2026-11-24T01:58:00.000Z', 'Color on now'])
  })

  it('the first open on a phone with nothing kept: each part is a skeleton until its inputs are in, then B; never A, never a dash on the way', () => {
    const frames = open(shuffle(HOME_PARTS, 7))
    expect(frames.length).toBe(HOME_PARTS.length + 1)
    for (const f of frames) {
      for (const k of HOME_PARTS) expect(['skeleton', drawn(Object.fromEntries(HOME_PARTS.map((x) => [x, { data: F.B[x], at: 0, aged: false }])) as Record<HomePart, Shown<unknown>>).tiles[k]], `${k}`).toContain(f.tiles[k])
      expect(f.tiles.sky).not.toBe('color possible')
      expect(f.tiles.surf).not.toBe('1–2 ft')
      expect(f.tiles.tide).not.toBe('—')
    }
    expect(frames.at(-1)?.card).toBe('Color on now')
  })

  it('ten reloads, the parts arriving in a different order each time: identical tiles on every frame of every one', () => {
    open(HOME_PARTS as HomePart[])
    const seen = new Set<string>()
    for (let reload = 1; reload <= 10; reload += 1) {
      for (const f of open(shuffle(HOME_PARTS, reload * 31))) seen.add(JSON.stringify(f))
    }
    expect(seen.size).toBe(1)
    const [only] = [...seen].map((s) => JSON.parse(s))
    expect(only.tiles.sky).toBe('color likely')
    expect(only.tiles.surf).toBe('2–3 ft')
    expect(only.card).toBe('Color on now')
  })

  it('a picture once drawn stays drawn through every later frame', () => {
    open(HOME_PARTS as HomePart[])
    for (let reload = 1; reload <= 10; reload += 1) {
      let had = new Set<HomePart>()
      for (const f of open(shuffle(HOME_PARTS, reload * 17))) {
        for (const k of had) expect(f.pics, `reload ${reload}: ${k}'s picture went`).toContain(k)
        had = new Set(f.pics as HomePart[])
      }
    }
  })

  it('a part that never answers is shown as it is after the wait, its dash then true; a kept part says its age', () => {
    const never = choosePart(F.A.tide, false, undefined, true, now.getTime())
    expect(never?.data).toEqual({ turns: [] })
    expect(choosePart(F.A.tide, false, undefined, false, now.getTime())).toBeNull()
    const kept = choosePart(F.A.tide, false, { data: F.B.tide, at: now.getTime() - 2 * 3_600_000 }, false, now.getTime())
    expect(kept?.data).toEqual(F.B.tide)
    expect(kept?.aged).toBe(true)
    expect(agoWords(now.getTime() - (kept?.at ?? 0))).toBe('2 h ago')
    /* Too old to stand for now: the skeleton until the new one. */
    expect(choosePart(F.A.tide, false, { data: F.B.tide, at: now.getTime() - SAVED_MAX_MS - 1 }, false, now.getTime())).toBeNull()
    /* A kept value its own clock has ended (the tide turn passed) is not shown. */
    const passed = (d: { turns: { at: number; feet: number; kind: string }[] }, t: number) => d.turns.some((x) => x.at > t)
    expect(choosePart(F.A.tide, false, { data: { turns: [{ at: now.getTime() - 60_000, feet: 1, kind: 'low' }] }, at: now.getTime() - 60_000 }, false, now.getTime(), passed)).toBeNull()
  })

  it('the home is built on it: every tile from the shown parts, the card from the same shown parts', () => {
    const src = readFileSync('src/components/TileHome.tsx', 'utf8')
    expect(src).toMatch(/const shown = useHomeParts\(/)
    expect(src).toMatch(/const sky = shown\.sky === null/)
    expect(src).not.toMatch(/'…'/)
  })
})
