import type { NearItem } from '../lib/nearMe.ts'

/*
 * "NEAR YOU IN THE NEXT 24 H" (src/lib/nearMe.ts): up to three lines, each a
 * tap to that spot and time, and "Not now", which hides it until tomorrow.
 * One card, over the map, until it is answered.
 */
export function NearYou({ items, onGo, onNotNow }: { items: readonly NearItem[]; onGo: (item: NearItem) => void; onNotNow: () => void }) {
  return (
    <section className="nearyou" aria-label="Near you in the next 24 hours">
      <p className="nearyou__title">Near you in the next 24 h</p>
      <ul className="nearyou__list">
        {items.map((item) => (
          <li key={`${item.line}-${item.at.getTime()}`}>
            <button type="button" className="nearyou__item" onClick={() => onGo(item)}>
              {item.line}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="nearyou__not" onClick={onNotNow}>
        Not now
      </button>
    </section>
  )
}
