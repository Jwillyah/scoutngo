import { ScreenFailCard } from './ScreenBoundary.tsx'

/*
 * A PAGE WHOSE CODE DID NOT ARRIVE (Batch CORE, Section 7A; the offline walk,
 * 16 Nov): offline, before the phone had kept the Sky page's code, opening it
 * threw "Unable to preload CSS" and the whole app went blank. Each page loaded
 * on demand comes through src/lib/lazyPage.ts, which shows this instead.
 */
export function PageNotLoaded(props: { onClose?: () => void; onBack?: () => void }) {
  const back = props.onBack ?? props.onClose ?? (() => window.history.back())
  return <ScreenFailCard title="This page needs a signal" message="It has not been kept on this phone yet. Open it once with signal and it works offline after." onBack={back} />
}
