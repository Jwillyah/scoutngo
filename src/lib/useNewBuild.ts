import { useEffect, useState } from 'react'
import { BUILD_CHECK_INTERVAL_MS, checkForNewBuild, type BuildCheck } from './build.ts'
import { adoptChoice, adoptUrl, browserAdoptDeps } from './adoptBuild.ts'

/**
 * Watches for a newer build being deployed.
 *
 * ON A TIMER AND ON RETURN TO THE FOREGROUND. The timer catches a build pushed
 * while the app is open; the visibility change catches the far more common
 * case, a phone that has been in a pocket since yesterday and is now being
 * looked at again. iOS suspends timers in a backgrounded tab, so without the
 * second trigger the interval alone would fire late or not at all.
 *
 * A COLD LOAD ADOPTS A NEWER BUILD; ANYTHING LATER IS AN OFFER.
 *
 * This used to only ever report. That was right about the dangerous case and
 * wrong about the common one: if nobody pressed the button, the next launch
 * loaded the same stale document and offered the same button again, and a
 * phone could sit a week behind while the server had the fix the whole time.
 *
 * Seconds after launch there is nothing on screen to lose, so it just takes
 * the new build. Twenty minutes in, somebody may be standing on a dock
 * halfway through setting up, and it goes back to offering. The decision is
 * in src/lib/adoptBuild.ts, on its own, because the way it can be wrong --
 * reloading mid-shoot, or reloading in a loop -- is not something a render
 * test would catch.
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

        if (next.status !== 'stale') return
        const choice = adoptChoice(next.deployed, browserAdoptDeps())
        if (choice.act === 'reload') {
          /*
           * replace, not assign: the stale document should not be left in
           * the back stack for a swipe-back to land on.
           */
          window.location.replace(adoptUrl(window.location.href, choice.to))
        }
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
