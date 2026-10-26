import { useEffect, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { localDate } from '../core/moonTimes.ts'
import { fetchBuildings, type Building } from '../lib/buildings.ts'
import { ensure3dOverview } from '../lib/offline3d.ts'
import { MIN_INTERVAL_MS } from '../lib/overpass.ts'
import { boxAround } from '../lib/tileRange.ts'
import { fetchTrees, type TreesResult } from '../lib/trees.ts'
import type { ClayScene, GroundStatus, Pin } from '../three/clayScene.ts'

/*
 * THE 3D VIEW: a clay model of the place, at the time on the time bar.
 *
 * It sits where the map is, under the same top bar, sheet and time bar, so
 * the plan's controls keep working on it. CesiumJS is only fetched when this
 * opens (the import below), and its files come from this app's own origin.

 */

declare const __CESIUM_BASE__: string


interface Clay3DProps {
  venue: LatLon
  /** For the saved overview's name in the offline list. */
  venueLabel: string
  at: Date
  timeZone: string
  pins: readonly Pin[]
}

/* 600 m around the venue for buildings: past that a clay box is a speck. */
const BUILDING_REACH_M = 600
/* Overpass can take most of a minute when it is busy; the 2D map's 12 s would give up. */
const BUILDING_WAIT_MS = 60_000

export const CLAY_NOTE = 'Clay model from map data. Real buildings may differ; unknown heights shown lighter.'

export function Clay3D({ venue, venueLabel, at, timeZone, pins }: Clay3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ClayScene | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<{ total: number; unknown: number } | { problem: string } | 'loading'>('loading')
  const [trees, setTrees] = useState<TreesResult | null>(null)
  const [flat, setFlat] = useState(0)
  const status = useRef<GroundStatus>({ flatTiles: 0 })

  /* Build the scene once, for this venue. */
  useEffect(() => {
    let cancelled = false
    let made: ClayScene | null = null
    ;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = __CESIUM_BASE__
    import('../three/clayScene.ts')
      .then(({ createClayScene }) => {
        if (cancelled || host.current === null) return
        made = createClayScene(host.current, venue, timeZone, status.current, () => setFlat(status.current.flatTiles))
        scene.current = made
        ;(window as unknown as { __clay?: ClayScene }).__clay = made
        setReady(true)
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)))
    return () => {
      cancelled = true
      made?.destroy()
      scene.current = null
    }
  }, [venue, timeZone])

  /*
   * THE BUILDINGS, THEN THE TREES, from the same Overpass the 2D map uses and
   * saved on the phone like 2D's. One at a time and politely spaced: Overpass
   * refuses a second call inside MIN_INTERVAL_MS, and the 2D map may have
   * just made one, and it is often busy, so a refusal is waited out and
   * tried again, four times, each wait twice the last.
   */
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const pause = (times = 1) => new Promise((resolve) => setTimeout(resolve, (MIN_INTERVAL_MS + 250) * times))
    void (async () => {
      let result = await fetchBuildings(boxAround(venue, BUILDING_REACH_M), BUILDING_WAIT_MS)
      for (let i = 0; i < 4 && result.status !== 'ok' && !cancelled; i += 1) {
        await pause(2 ** i)
        result = await fetchBuildings(boxAround(venue, BUILDING_REACH_M), BUILDING_WAIT_MS)
      }
      if (cancelled) return
      if (result.status === 'ok') {
        const list: readonly Building[] = result.buildings
        scene.current?.setBuildings(list)
        setBuildings({ total: list.length, unknown: list.filter((b) => b.height.metres === null).length })
      } else {
        setBuildings({ problem: result.reason })
      }
      await pause()
      if (cancelled) return
      const trees = await fetchTrees(venue)
      if (cancelled) return
      setTrees(trees)
      if (trees.status === 'drawn') scene.current?.setTrees(trees.trees)
    })()
    return () => {
      cancelled = true
    }
  }, [ready, venue])

  /* The coarse tiles the overview stands on, saved once per venue so 3D opens with no signal (src/lib/offline3d.ts). */
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    void ensure3dOverview(venue, venueLabel, controller.signal)
    return () => controller.abort()
  }, [ready, venue, venueLabel])

  useEffect(() => {
    if (ready) scene.current?.setPins(pins)
  }, [ready, pins])

  /* Cesium's clock and our light follow the time bar; the sky arcs are redrawn per day. */
  const day = localDate(at, timeZone)
  useEffect(() => {
    if (!ready) return
    const midnight = zonedTimeToUtc(day, '00:00', timeZone)
    if (midnight !== null) scene.current?.setSkyDay(midnight)
  }, [ready, day, timeZone])
  useEffect(() => {
    if (ready) scene.current?.setTime(at)
  }, [ready, at])


  return (
    <div className="clay">
      <div ref={host} className="clay__canvas" />
      <div className="clay__legend">
        <p className="clay__note">{CLAY_NOTE}</p>
        {failed !== null ? <p className="clay__line">3D could not start: {failed}</p> : null}
        {!ready && failed === null ? <p className="clay__line">Loading the 3D view…</p> : null}
        {buildings === 'loading' ? (
          ready ? <p className="clay__line">Loading buildings…</p> : null
        ) : 'problem' in buildings ? (
          <p className="clay__line">No buildings: {buildings.problem} None are saved for here.</p>
        ) : (
          <p className="clay__line num">
            {buildings.total} buildings
            {buildings.unknown > 0 ? (
              <>
                {' · '}
                <span className="clay__swatch clay__swatch--unknown" aria-hidden="true" />
                {buildings.unknown} height unknown, drawn lighter, no shadow
              </>
            ) : null}
          </p>
        )}
        {trees === null ? null : (
          <p className="clay__line num">
            {trees.status === 'drawn'
              ? `${trees.trees.length} mapped trees drawn`
              : trees.status === 'sparse'
                ? `Trees: none drawn, only ${trees.count} mapped here`
                : 'Trees: map data did not answer'}
          </p>
        )}
        {flat > 0 ? <p className="clay__line">Some ground has no saved elevation and is drawn flat.</p> : null}
      </div>
    </div>
  )
}

