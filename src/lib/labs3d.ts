import { useEffect, useState } from 'react'
import { LABS_3D_KEY, labs3DOn } from '../core/lite3d.ts'
import { onIOS } from './quality3d.ts'
import { hasWebGL2 } from './webgl.ts'

/*
 * SETTINGS › LABS › "3D and Fly (testing)" (Batch 3D, Section 0.1). The rule is
 * labs3DOn in src/core/lite3d.ts; this keeps the choice on this phone and
 * tells the screens that ask. Off: the 3D button, Map style's 3D, Stand here,
 * Play in 3D and Fly it yourself are not shown; the Drone page's "Plan the
 * flight" stays, on the 2D map.
 */
const EVENT = 'scoutngo:labs3d'

/** Said where a way into 3D was asked for while it is switched off. */
export const LABS_OFF_NOTE = '3D and Fly are off on this phone while they are tested · Settings › Labs'

function stored(): string | null {
  try {
    return localStorage.getItem(LABS_3D_KEY)
  } catch {
    return null
  }
}

/** Whether 3D and Fly are switched on for this phone. */
export const readLabs3D = (): boolean => labs3DOn(onIOS(), stored())

/** Whether a 3D view may open now: switched on, and the browser has WebGL 2. */
export const threeDAllowed = (): boolean => readLabs3D() && hasWebGL2()

export function writeLabs3D(on: boolean): void {
  try {
    localStorage.setItem(LABS_3D_KEY, on ? 'on' : 'off')
  } catch {
    /* Not kept: the default again next time. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export function useLabs3D(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readLabs3D)
  useEffect(() => {
    const f = () => setOn(readLabs3D())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  return [on, writeLabs3D]
}
