import { useEffect, useState } from 'react'
import type { FaaArea } from '../core/faaLive.ts'
import type { LatLon } from '../core/geo.ts'
import { tfrRead, type TfrRead } from '../core/tfrLine.ts'
import { faaLayer, type LayerAnswer } from './faaLiveData.ts'

/*
 * THE TFR FETCH, READ FOR ONE POINT (Batch SIMPLE-1, Section 1). One
 * request for the whole country, no place in it (src/lib/faaLiveData.ts); the
 * words are src/core/tfrLine.ts's. `on` false: not asked yet (a screen that is
 * not showing), and the read stays 'checking'.
 */
export function useTfrToday(at: LatLon | null, todayIso: string, online: boolean, on = true): TfrRead {
  const [answer, setAnswer] = useState<LayerAnswer<FaaArea[]> | null>(null)
  useEffect(() => {
    if (!on) return
    let live = true
    void faaLayer('tfr', online).then(
      (a) => live && setAnswer(a),
      () => live && setAnswer({ data: null, at: null, from: 'none' }),
    )
    return () => {
      live = false
    }
  }, [on, online])
  return at === null ? { kind: 'checking' } : tfrRead(answer, at, todayIso)
}
