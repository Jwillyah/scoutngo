import { useEffect, useState } from 'react'
import {
  buildLabel,
  buildStampLines,
  checkOrigin,
  type BuildCheck,
  THIS_BUILD,
  type OriginCheck,
} from '../lib/build.ts'

interface BuildStampProps {
  /** Whether a newer build is deployed than the one running. */
  deployed: BuildCheck
}

/**
 * WHICH BUILD THIS IS, AND WHETHER IT IS THE CURRENT ONE.
 *
 * WHAT THIS REPLACED. A hash and a sentence explaining that it was a hash.
 * That is a stamp somebody has to compare by hand against something they do
 * not have, and the outcome was exactly what you would expect: three days of
 * field reports made against a deployed build four commits behind, and a pass
 * spent re-fixing things that were already fixed.
 *
 *   "A stamp I have to compare by hand is a stamp I will not check, which is
 *    exactly what happened."
 *
 * So it does the comparing. Three separate questions, each answered in a
 * sentence rather than left as a number:
 *
 *   Was this built from a commit at all, or from a dirty tree?
 *   Is this phone holding a stale copy of what is deployed?
 *   Is what is deployed behind the repository?
 *
 * The third is the one that cost the three days, and it is the one no check
 * in the app could previously answer: everything agreed it was current,
 * because by its own measure it was.
 *
 * THE ORIGIN CHECK RUNS WHEN THIS IS OPENED, not on a timer. It is one request
 * about the repository and nothing about the shoot, and the place it belongs
 * is the moment somebody is asking the question.
 */
export function BuildStamp({ deployed }: BuildStampProps) {
  const [origin, setOrigin] = useState<OriginCheck | null>(null)

  useEffect(() => {
    let live = true
    void checkOrigin().then((result) => {
      if (live) setOrigin(result)
    })
    return () => {
      live = false
    }
  }, [])

  const lines = buildStampLines(THIS_BUILD, origin, deployed)

  return (
    <div className="build">
      <p className="build__head">
        <span className="build__label">Build</span>
        <span className="build__id num">{buildLabel()}</span>
      </p>

      {origin === null ? (
        <p className="build__line build__line--fact">Checking against origin…</p>
      ) : (
        lines.map((line) => (
          <p className={`build__line build__line--${line.tone}`} key={line.text}>
            {line.text}
          </p>
        ))
      )}

      <p className="build__note">
        The commit this was built from. Quote it with a screenshot and there is
        nothing to disagree about. Checking it asks GitHub for the newest commit
        on this repository: no coordinate, no plan, and the same request for
        everyone.
      </p>
    </div>
  )
}
