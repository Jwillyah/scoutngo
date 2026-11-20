/*
 * A DAYTIME CLOCK FOR THE AUDITS THAT NEED THE SUN UP.
 *
 * The projection and offline audits measure the sun and moon rays on the
 * map. They ran on this machine's clock, so between moonset and sunrise
 * there was no ray to measure and both failed: "no bearing lines drawn",
 * "no sun or shadow ray on the glass" (SIMPLE-2 run, 20 Nov, 2:15 to 6:50
 * AM; the moon set at 2:13 AM). That is shape B in docs/failure-modes.md:
 * an audit whose could-not-look state depended on the hour it was run.
 *
 * pinDaytime() shifts the page's clock to a fixed mid-morning instant and
 * lets it run on from there, so timers and "now" still move. Call it before
 * the first navigation; it applies to every document the tab loads.
 */
export const DAYTIME = '2026-11-02T15:30:00Z' // 10:30 AM at the coast, the a11y audit's instant

export async function pinDaytime(send, at = DAYTIME) {
  const target = new Date(at).getTime()
  if (!Number.isFinite(target)) throw new Error(`pinDaytime: bad instant ${at}`)
  const source = `(() => {
    const Real = Date
    const off = ${target} - Real.now()
    class Pinned extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + off); else super(...a) }
      static now() { return Real.now() + off }
    }
    globalThis.Date = Pinned
  })()`
  await send('Page.addScriptToEvaluateOnNewDocument', { source })
}
