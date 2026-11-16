import { CREDITS } from '../core/credits.ts'
import { versionLine } from '../lib/build.ts'
import { Page } from './Page.tsx'

/*
 * DATA & CREDITS (Batch CORE, Section 0.4): who the app's data comes from,
 * under what licence, and the credit each asks for. Drawn from
 * src/core/credits.ts, the same list as docs/sources-licenses.md.
 */
export function CreditsPage({ onClose }: { onClose: () => void }) {
  return (
    <Page title="Data & credits" className="credits" onClose={onClose}>
      <CreditsBody />
    </Page>
  )
}

export function CreditsBody() {
  return (
    <div className="credits__body">
      <p className="credits__lead">ScoutNGo is free and open source (MIT licence), provided as is, without warranty. Forecasts can be wrong: look before you go in. Not an official FAA source: check B4UFLY or LAANC before you fly.</p>
      <ul className="credits__list">
        {CREDITS.map((c) => (
          <li key={c.name} className="credits__row">
            <p className="credits__name">{c.name}</p>
            <p className="credits__use">{c.use}</p>
            <p className="credits__lic">{c.license}</p>
            {c.attribution === null ? null : <p className="credits__attr">{c.attribution}</p>}
            <a className="credits__link" href={c.link} target="_blank" rel="noreferrer noopener">
              Terms ›
            </a>
          </li>
        ))}
      </ul>
      <p className="credits__build num">{versionLine()}</p>
    </div>
  )
}
