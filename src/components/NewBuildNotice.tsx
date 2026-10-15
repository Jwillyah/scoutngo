import { BUILD_ID, type BuildCheck } from '../lib/build.ts'

interface NewBuildNoticeProps {
  check: BuildCheck
}

/**
 * A NEW BUILD ANNOUNCES ITSELF, AND OFFERS. It does not act.
 *
 * WHY IT IS AN OFFER. A reload throws away whatever is on screen, and the
 * person reading this may be standing on a dock halfway through setting up. So
 * it says a newer build exists, says which one is running, and waits. The only
 * way anything reloads is somebody pressing the button.
 *
 * Not hazard red. A newer build is not a problem, and dressing it as one would
 * make every deploy look like an incident. Saved spots and offline field packs
 * are in localStorage and survive the reload regardless, which is why this can
 * be as quiet as it is.
 */
export function NewBuildNotice({ check }: NewBuildNoticeProps) {
  if (check.status !== 'stale') return null

  return (
    <div className="newbuild" role="status">
      <p className="newbuild__text">
        A newer build is deployed. This one is{' '}
        <span className="num">{BUILD_ID}</span>, the server has{' '}
        <span className="num">{check.deployed}</span>.
      </p>
      <button
        type="button"
        className="newbuild__btn"
        /*
         * location.reload() alone can be answered from the cache that caused
         * this, so the document is re-requested by URL with a cache-busting
         * parameter. index.html names the hashed bundles, so getting a fresh
         * document is the whole fix.
         */
        onClick={() => {
          const url = new URL(window.location.href)
          url.searchParams.set('b', check.deployed)
          window.location.replace(url.toString())
        }}
      >
        Load it
      </button>
    </div>
  )
}
