import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { afterContextLoss, firstRingCount, firstUseful, MAX_CONTEXT_REBUILDS, NEAR_FIRST_RING, nearTileOrder, tileRing } from '../src/core/firstView3d.ts'
import { labs3DOn } from '../src/core/lite3d.ts'

/*
 * BATCH SIMPLE-1, SECTION 4 (Jwilly's phone, Settings › Debug, 18 Nov on
 * 3db2f29): 13 "3D not shown in 10 s", 5 "Fly not open in 3 s", 4 "The page
 * reloaded while this was open", and no shader or context error. The view was
 * shown only when every tile was in (src/three/world/scene.ts `loaded()`,
 * some 900 requests); nothing cancelled a closed view's downloads; a lost
 * context was rebuilt with no limit; and 3D was off by default on iOS.
 */

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const tick = () => new Promise((r) => setTimeout(r, 0))
const settle = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await tick()
}

describe('the first useful frame', () => {
  it('the first ring is the middle 4 x 4 of the 16 x 16 near square, and those tiles are fetched first', () => {
    expect(NEAR_FIRST_RING).toBe(1)
    expect(firstRingCount(16)).toBe(16)
    expect(firstRingCount(16, 0)).toBe(4)
    /* Never more than the square. */
    expect(firstRingCount(2, 3)).toBe(4)
    const order = nearTileOrder(16)
    expect(order).toHaveLength(256)
    expect(new Set(order.map((t) => `${t.i},${t.j}`)).size).toBe(256)
    /* The first 16 are exactly rings 0 and 1, the middle 2 x 2 first. */
    expect(order.slice(0, 4).every((t) => tileRing(t.i, t.j, 16) === 0)).toBe(true)
    expect(order.slice(0, 16).every((t) => t.i >= 6 && t.i <= 9 && t.j >= 6 && t.j <= 9)).toBe(true)
    expect(tileRing(16 + 1, 0, 16)).toBeGreaterThan(1)
    /* Rings never go backwards along the order. */
    for (let k = 1; k < order.length; k += 1) expect(tileRing(order[k].i, order[k].j, 16)).toBeGreaterThanOrEqual(tileRing(order[k - 1].i, order[k - 1].j, 16))
  })

  it('shown needs the near square built AND its first ring settled; not every tile', () => {
    expect(firstUseful({ nearBuilt: true, firstRingSettled: 16, firstRingCount: 16 })).toBe(true)
    expect(firstUseful({ nearBuilt: true, firstRingSettled: 15, firstRingCount: 16 })).toBe(false)
    expect(firstUseful({ nearBuilt: false, firstRingSettled: 16, firstRingCount: 16 })).toBe(false)
  })

  it('the scene is shown on the ground\'s first useful frame, and loaded() still means everything in', () => {
    const scene = strip(readFileSync('src/three/world/scene.ts', 'utf8'))
    const shown = scene.slice(scene.indexOf('const shown = new Promise'), scene.indexOf('const settled ='))
    expect(shown).toMatch(/quiet = ground\.firstUseful\(\) \? quiet \+ 1 : 0/)
    expect(shown).not.toMatch(/loaded\(\)|pending\.n/)
    expect(scene).toMatch(/const loaded = \(\) => pending\.n === 0 && ground\.ready\(\)/)
  })

  it('the 10 s card and Fly\'s 3 s both measure against that first useful frame', () => {
    const clay = strip(readFileSync('src/components/Clay3D.tsx', 'utf8'))
    /* `shown` is set by whenShown, which is the first useful frame. */
    expect(clay).toMatch(/made\.whenShown\(\)\.then\(\(\) => \{\s*if \(!cancelled\) setShown\(true\)/)
    expect(clay).toMatch(/setLate\(false\)\s*if \(shown\) return/)
    expect(clay).toMatch(/flyGate\(\{ failed, lost: [^}]*, shown, groundRead: /)
  })
})

describe('closing 3D cancels its tile downloads', () => {
  type Call = { url: string; signal: AbortSignal | undefined; answer: () => void }
  let calls: Call[] = []
  let answerNow: (url: string) => boolean = () => true
  const zoomOf = (url: string) => {
    const t = /\/terrarium\/(\d+)\//.exec(url)
    if (t !== null) return { kind: 'terrain', z: Number(t[1]) }
    const i = /\/tile\/(\d+)\//.exec(url)
    if (i !== null) return { kind: 'imagery', z: Number(i[1]) }
    return { kind: 'other', z: -1 }
  }
  const tileCalls = () => calls.filter((c) => zoomOf(c.url).kind !== 'other')

  beforeEach(() => {
    vi.resetModules()
    calls = []
    answerNow = () => true
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      return new Promise<Response>((resolve, reject) => {
        const call: Call = { url, signal: init?.signal ?? undefined, answer: () => resolve(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })) }
        calls.push(call)
        if (init?.signal?.aborted === true) reject(new DOMException('aborted', 'AbortError'))
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        if (answerNow(url)) setTimeout(call.answer, 0)
      })
    })
    vi.stubGlobal('createImageBitmap', async () => ({ width: 256, height: 256, close: () => {} }))
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number
        height: number
        constructor(w: number, h: number) {
          this.width = w
          this.height = h
        }
        getContext() {
          return null
        }
      },
    )
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('in flight: aborted when the view closes; after: nothing asked; a cancelled tile is asked again by the next view', async () => {
    const s = await import('../src/three/world/sources.ts')
    answerNow = () => false
    const scope = s.openDownloads()
    const terrain = s.terrainTile(100, 200, 10)
    const picture = s.pictureOrParent(300, 400, 12, null, 3)
    await settle()
    expect(tileCalls()).toHaveLength(2)
    expect(tileCalls().every((c) => c.signal !== undefined && !c.signal.aborted)).toBe(true)
    s.closeDownloads(scope)
    /* Every request in flight is aborted, and the tiles come back as nothing. */
    expect(tileCalls().every((c) => c.signal?.aborted === true)).toBe(true)
    expect(await terrain).toBeNull()
    /* No parent climbed to after the abort. */
    expect(await picture).toBeNull()
    await settle()
    const n = calls.length
    /* Asked after the close (a job still running): no request. */
    expect(await s.terrainTile(101, 200, 10)).toBeNull()
    expect(await s.pictureOrParent(301, 400, 12, null, 3)).toBeNull()
    expect(await s.heightAt(36.84, -75.97)).toBeNull()
    await settle()
    expect(calls.length).toBe(n)
    expect(s.pending.n).toBe(0)
    /* The next view: the cancelled tile is not kept as an answer, it is asked again. */
    answerNow = () => true
    s.openDownloads()
    void s.terrainTile(100, 200, 10)
    await settle()
    expect(calls.slice(n).filter((c) => c.url.includes('/terrarium/10/100/200'))).toHaveLength(1)
  })

  it('the ground: rings wait for the first useful frame, then stream; dispose stops every job, aborts what is in flight and asks nothing more', async () => {
    const s = await import('../src/three/world/sources.ts')
    const { createGround, NEAR_Z, MID_Z, FAR_Z } = await import('../src/three/world/ground.ts')
    const isRing = (url: string) => {
      const t = zoomOf(url)
      return (t.kind === 'terrain' && (t.z === 11 || t.z === 13)) || (t.kind === 'imagery' && (t.z === FAR_Z || t.z === MID_Z))
    }
    /* Phase 1: the near square's sharp tiles held. */
    answerNow = (url) => zoomOf(url).z !== NEAR_Z
    const scope = s.openDownloads()
    const ground = createGround({ lat: 36.84, lon: -75.97 }, null, { flatTiles: 0 }, () => {}, { make: (map) => new THREE.MeshBasicMaterial({ map }) })
    await settle(60)
    expect(ground.kept().pieces).toBe(1)
    expect(calls.some((c) => zoomOf(c.url).z === NEAR_Z)).toBe(true)
    expect(ground.firstUseful()).toBe(false)
    expect(calls.filter((c) => isRing(c.url))).toHaveLength(0)

    /* Phase 2: the sharp tiles answer; the ring's terrain is held in flight. */
    answerNow = (url) => !isRing(url)
    for (const c of calls) if (zoomOf(c.url).z === NEAR_Z) c.answer()
    await settle(200)
    expect(ground.firstUseful()).toBe(true)
    const ring = calls.filter((c) => isRing(c.url))
    expect(ring.length).toBeGreaterThan(0)
    expect(ring.every((c) => c.signal?.aborted === false)).toBe(true)
    const pieces = ground.kept().pieces

    /* Phase 3: the view closes (scene.ts destroyNow: the scope, then the ground). */
    s.closeDownloads(scope)
    ground.dispose()
    expect(ring.every((c) => c.signal?.aborted === true)).toBe(true)
    const n = calls.length
    answerNow = () => true
    await settle(100)
    expect(calls.length).toBe(n)
    /* No ring piece built for the gone view, and none kept. */
    expect(ground.kept().pieces).toBe(0)
    expect(pieces).toBeGreaterThan(0)
    expect(s.pending.n).toBe(0)
  })

  it('the scene opens its scope before the ground and closes it first when destroyed', () => {
    const scene = strip(readFileSync('src/three/world/scene.ts', 'utf8'))
    expect(scene.indexOf('const downloads = openDownloads()')).toBeGreaterThan(-1)
    expect(scene.indexOf('const downloads = openDownloads()')).toBeLessThan(scene.indexOf('createGround('))
    expect(scene).toMatch(/destroyed = true\s*closeDownloads\(downloads\)/)
  })
})

describe('a lost context is rebuilt at most twice, then Back to 2D', () => {
  it('losses 1 and 2 rebuild; the third gives up', () => {
    expect(MAX_CONTEXT_REBUILDS).toBe(2)
    expect(afterContextLoss(1)).toBe('rebuild')
    expect(afterContextLoss(2)).toBe('rebuild')
    expect(afterContextLoss(3)).toBe('give-up')
    expect(afterContextLoss(9)).toBe('give-up')
  })

  it('Clay3D counts the losses, stops before the rebuild timer, lets the scene go, and offers Back to 2D', () => {
    const clay = strip(readFileSync('src/components/Clay3D.tsx', 'utf8'))
    const lost = clay.slice(clay.indexOf('lost: () => {'), clay.indexOf('restored: () => {'))
    expect(lost).toMatch(/losses\.current \+= 1\s*if \(afterContextLoss\(losses\.current\) === 'give-up'\) \{/)
    const giveUp = lost.slice(lost.indexOf("=== 'give-up'"), lost.indexOf('return'))
    expect(giveUp).toMatch(/made\?\.destroy\(\)/)
    expect(giveUp).toMatch(/setTrouble\(\{ kind: 'gave-up' \}\)/)
    expect(giveUp).not.toMatch(/setBuild|setTimeout/)
    /* The rebuild timer only after the check. */
    expect(lost.indexOf('afterContextLoss')).toBeLessThan(lost.indexOf('REBUILD_AFTER_MS'))
    /* A restore after giving up builds nothing. */
    expect(clay).toMatch(/restored: \(\) => \{\s*if \(losses\.current > MAX_CONTEXT_REBUILDS\) return/)
    /* The card: "3D didn't load" and a button that goes back to the 2D map. */
    const at = clay.indexOf("trouble.kind === 'gave-up' ? (")
    const card = clay.slice(at, clay.indexOf('<ClayError message={trouble.message}', at))
    expect(card).toMatch(/3D didn&rsquo;t load/)
    expect(card).toMatch(/onClick=\{onBack2D\}>\s*Back to 2D/)
    /* Fly gives up through its own no-graphics card, with Back. */
    expect(clay).toMatch(/lost: trouble\?\.kind === 'lost' \|\| trouble\?\.kind === 'gave-up'/)
    const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')
    expect(plan).toMatch(/onBack2D=\{\(\) => \{[\s\S]{0,400}setThreeD\(false\)/)
  })
})

describe('Labs on by default, and a failure lands on the 2D map', () => {
  it('3D and Fly on by default everywhere, iOS included; the Labs switch still turns them off', () => {
    expect(labs3DOn(true, null)).toBe(true)
    expect(labs3DOn(false, null)).toBe(true)
    expect(labs3DOn(true, 'off')).toBe(false)
    expect(labs3DOn(false, 'off')).toBe(false)
    expect(labs3DOn(true, 'on')).toBe(true)
    expect(labs3DOn(true, 'garbage')).toBe(true)
    expect(readFileSync('src/components/SettingsPage.tsx', 'utf8')).toMatch(/<Toggle on=\{labs3D\} label="3D and Fly \(testing\)" onChange=\{setLabs3D\} \/>/)
  })

  it('nothing reopens 3D or Fly after a reload: both start shut, and the marker is read once and cleared', async () => {
    const plan = strip(readFileSync('src/components/PlanMode.tsx', 'utf8'))
    expect(plan).toMatch(/const \[threeD, setThreeD\] = useState\(false\)/)
    expect(plan).toMatch(/const \[flySession, setFlySession\] = useState<FlySession \| null>\(null\)/)
    expect(plan).toMatch(/const \[pendingFly, setPendingFly\] = useState\(false\)/)
    /* Nothing kept on the phone says to open 3D or Fly: no storage read in the planner. */
    expect(plan).not.toMatch(/(sessionStorage|localStorage)\.getItem\([^)]*(3[dD]|[Ff]ly|screenOpen)/)
    const app = strip(readFileSync('src/App.tsx', 'utf8'))
    expect(app).toMatch(/kind: 'sky',\s*tick: 0,/)
    /* The marker only names the screen for the "didn't load" card over the map. */
    expect(app).toMatch(/<ScreenFailCard title=\{`\$\{died\} didn't load`\} message="The phone reloaded the app while it was open, most likely out of memory\. Back on the map\." onBack=\{\(\) => setDied\(null\)\} \/>/)

    /* And the marker: read once at start-up, then gone, so a second reload is a plain start. */
    const store = () => {
      let m: Record<string, string> = {}
      return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => void (m[k] = v), removeItem: (k: string) => void delete m[k], clear: () => void (m = {}) }
    }
    vi.stubGlobal('localStorage', store())
    vi.stubGlobal('sessionStorage', store())
    vi.resetModules()
    const first = await import('../src/lib/errorLog.ts')
    first.markScreenOpen('Fly')
    vi.resetModules()
    const reloaded = await import('../src/lib/errorLog.ts')
    expect(reloaded.diedIn()).toBe('Fly')
    expect(sessionStorage.getItem('scoutngo.screenOpen.v1')).toBeNull()
    vi.resetModules()
    const again = await import('../src/lib/errorLog.ts')
    expect(again.diedIn()).toBeNull()
    vi.unstubAllGlobals()
    vi.resetModules()
  })
})
