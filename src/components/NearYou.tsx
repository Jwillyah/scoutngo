import type { NearItem } from '../lib/nearMe.ts'

/*
 * "NEAR YOU IN THE NEXT 24 H" (src/lib/nearMe.ts): one line (Batch TRUTH,
 * Section 5: the card was three rows and a title over the map), the first
 * thing near, "+2" when there are more; "Show me" jumps the map and the time
 * to it; "Not now" hides it until tomorrow. Until it is answered.
 */
export function NearYou({ items, onGo, onNotNow }: { items: readonly NearItem[]; onGo: (item: NearItem) => void; onNotNow: () => void }) {
  const first = items[0]
  if (first === undefined) return null
  return (
    <section className="nearyou" aria-label="Near you in the next 24 hours">
      <p className="nearyou__line" title={items.map((i) => i.line).join(' · ')}>
        {first.line}
        {items.length > 1 ? <span className="nearyou__more"> +{items.length - 1}</span> : null}
      </p>
      <button type="button" className="nearyou__go" onClick={() => onGo(first)}>
        Show me
      </button>
      <button type="button" className="nearyou__not" onClick={onNotNow}>
        Not now
      </button>
    </section>
  )
}
