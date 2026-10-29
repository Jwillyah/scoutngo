import { useEffect, useState } from 'react'
import { BUILD_CHECK_INTERVAL_MS, BUILD_RETRY_MS, checkForNewBuild, type BuildCheck } from './build.ts'
import { adoptChoice, adoptUrl, browserAdoptDeps } from './adoptBuild.ts'

/**
 * Watches for a newer build being deployed.
 *
 * ON LAUNCH, ON A TIMER, AND EVERY WAY A PAGE COMES BACK TO THE FRONT. The
 * timer catches a build pushed while the app is open. Coming back is the far
 * more common case, a phone that has been in a pocket since yesterday, and a
 * home-screen app says so in more than one way: visibilitychange, pageshow
 * from the back-forward cache, focus, and online when the signal returns.
 * Each one looks; looking twice costs one small request.
 *
 * A CHECK THAT COULD NOT ASK IS RETRIED (BUILD_RETRY_MS), not left until the
 * timer: on a resume the radio is often still waking, and one failed check
 * used to mean the old build until the next quarter-hour (29 Oct).
 *
 * Each look also asks the browser to fetch /sw.js again, so the new shell is
 * cached for the next launch with no signal.
 *
 * A COLD, UNTOUCHED LOAD ADOPTS A NEWER BUILD; ANYTHING ELSE IS THE PILL.
 * Seconds after launch, before anything is touched, there is nothing on
 * screen to lose. Once a finger has been down, or the session is under way,
 * it waits for "Reload". The decision is src/lib/adoptBuild.ts.
 */
export function useNewBuild(): BuildCheck {
  const [state, setState] = useState<BuildCheck>({ status: 'unknown' })

  useEffect(() => {
    let live = true
    let retry: number | undefined
    let tries = 0

    const look = () => {
      window.clearTimeout(retry)
      void navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => undefined)
      void checkForNewBuild().then((next) => {
        /*
         * Once stale, always stale. A later check that comes back 'unknown'
         * because the signal dropped must not retract a notice that is true:
         * the deployed build really did change.
         */
        if (!live) return
        setState((current) => (current.status === 'stale' ? current : next))

        if (next.status === 'unknown') {
          const wait = BUILD_RETRY_MS[tries]
          tries += 1
          if (wait !== undefined && document.visibilityState === 'visible') retry = window.setTimeout(look, wait)
          return
        }
        tries = 0
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

    /* A fresh return gets a fresh set of retries. */
    const back = () => {
      if (document.visibilityState !== 'visible') return
      tries = 0
      look()
    }

    look()
    const timer = window.setInterval(look, BUILD_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', back)
    window.addEventListener('pageshow', back)
    window.addEventListener('focus', back)
    window.addEventListener('online', back)

    return () => {
      live = false
      window.clearInterval(timer)
      window.clearTimeout(retry)
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('pageshow', back)
      window.removeEventListener('focus', back)
      window.removeEventListener('online', back)
    }
  }, [])

  return state
}
