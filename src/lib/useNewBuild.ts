import { useEffect, useState } from 'react'
import { BUILD_CHECK_INTERVAL_MS, checkForNewBuild, type BuildCheck } from './build.ts'

/**
 * Watches for a newer build being deployed.
 *
 * ON A TIMER AND ON RETURN TO THE FOREGROUND. The timer catches a build pushed
 * while the app is open; the visibility change catches the far more common
 * case, a phone that has been in a pocket since yesterday and is now being
 * looked at again. iOS suspends timers in a backgrounded tab, so without the
 * second trigger the interval alone would fire late or not at all.
 *
 * IT ONLY EVER REPORTS. Nothing here reloads anything. A forced reload would
 * discard whatever is on screen, and the person holding the phone may be
 * standing on a dock halfway through a shoot.
 */
export function useNewBuild(): BuildCheck {
  const [state, setState] = useState<BuildCheck>({ status: 'unknown' })

  useEffect(() => {
    let live = true

    const look = () => {
      void checkForNewBuild().then((next) => {
        /*
         * Once stale, always stale. A later check that comes back 'unknown'
         * because the signal dropped must not retract a notice that is true:
         * the deployed build really did change.
         */
        if (!live) return
        setState((current) => (current.status === 'stale' ? current : next))
      })
    }

    look()
    const timer = window.setInterval(look, BUILD_CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') look()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return state
}
