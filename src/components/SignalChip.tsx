import { connectivity } from '../lib/connectivity.ts'

/*
 * One chip at the top when offline or showing old data (src/core/signalChip.ts).
 * A tap looks for the signal now; with it back, the screens ask again by
 * themselves (src/lib/retrying.ts, the weather store's refresh behind a kept
 * answer), without a reload or a jump.
 */
/** The chip, in the home's date line's slot (Home.tsx): a tap looks for the signal now. */
export function SignalChip({ words }: { words: string }) {
  return (
    <button type="button" className="hwx__date sigchip" role="status" data-signal-chip="" onClick={() => connectivity.check()}>
      {words}
    </button>
  )
}
