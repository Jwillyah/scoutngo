import { useRef, useState, type ReactNode } from 'react'
import { capRows, MAX_ROWS, openTab, swipeTarget, type TapInTab } from '../lib/tapIn.ts'
import { PageShell } from './PageShell.tsx'
import '../styles/tapin.css'

/*
 * THE ONE PAGE SKELETON (Batch SIMPLE-2, Section 1; boards Page_Tide,
 * Page_Weather, Page_Fish, Surf_Now, Sky_*, Drone_Preflight, Wind_Charts):
 * every page a home tile opens is this.
 *
 *   header   round back · the title · "<spot> · now"     (PageShell's own)
 *   tabs     optional pills, the app's .ui-seg; a sideways swipe on the page
 *            moves between them; the page opens on `initialTab`, its "should
 *            I go?" tab
 *   hero     an eyebrow ("NOW · POOR"), one big value, one line under it
 *   chart    one card, the page's picture
 *   rows     a card of at most MAX_ROWS rows (label left; value and a small
 *            detail right), then "More details ›": the page's existing detail
 *            screen, unchanged
 *   actions  optional buttons
 *   foot     "How we got this ›" left, the page's safety line right
 *
 * The shell is PageShell (the back button, Escape, safe areas, the
 * how-we-got-this sheet, the foot kept outside the scroll), so a page built
 * here behaves as the Weather and Sky pages do: it fits 390 x 664 with
 * nothing covered and scrolls its body when it needs to.
 *
 * ONE MEANING PER GESTURE: a sideways swipe moves the tab only when it starts
 * somewhere that has no sideways meaning of its own. A chart that scrubs
 * carries data-sideways (or data-no-swipe), and the swipe leaves it alone;
 * a mostly-vertical drag is the page's scroll and never a tab change.
 */

export interface TapInRow {
  label: string
  /** The number or word that answers. A dash when the source did not say. */
  value: string
  detail?: string
  /** A tap target: the row opens something (Drone: Airspace → its tab). */
  onClick?: () => void
  /** A status dot, for the Drone checks: the colour role (good = teal, caution = amber). */
  dot?: 'good' | 'caution'
  /** data-shared, so the one-number audit can read what the row says. */
  shared?: string
}

export interface TapInPageProps {
  /** The page's name: "Tide". */
  title: string
  /** The place, e.g. "Chic's Beach"; the line under the title reads "<spot> · now" (or `when`). */
  spot: string
  when?: string
  /** The home's ground (src/core/homeDay.ts groundOf). */
  ground: string
  /** The page's kind class: `tipage--tide` (and `dpage--tide`, for the audits that look for it). */
  kind: string
  onBack: () => void
  /** What "How we got this ›" opens. */
  how: ReactNode
  /** The page's safety line, right of "How we got this ›". */
  safety: string
  tabs?: readonly TapInTab[]
  initialTab?: string
  onTab?: (id: string) => void
  hero: { eyebrow: string; value: string; sub?: string; shared?: { key: string; value: string }; /** Extra data-* attributes for the sub line (an audit reads them). */ subData?: Record<string, string> }
  /** The chart card's content; leave out for a page with no picture. */
  chart?: ReactNode
  rows?: readonly TapInRow[]
  /** Rows beyond MAX_ROWS, for the pages that are a checklist (Drone's eight); say so in the page, it is the exception. */
  maxRows?: number
  /** "More details ›": opens the page's existing detail screen. */
  onMore?: () => void
  actions?: readonly { label: string; onClick: () => void; primary?: boolean }[]
  /** Content under the hero for a tabbed page: a function of the open tab; plain children for a page without tabs. */
  children?: ReactNode | ((tab: string) => ReactNode)
}

const warned = new Set<string>()

export function TapInPage({ title, spot, when = 'now', ground, kind, onBack, how, safety, tabs, initialTab, onTab, hero, chart, rows = [], maxRows = MAX_ROWS, onMore, actions = [], children }: TapInPageProps) {
  const [tab, setTab] = useState<string>(openTab(tabs, initialTab))
  const go = (id: string) => {
    setTab(id)
    onTab?.(id)
  }
  const start = useRef<{ x: number; y: number; ok: boolean } | null>(null)
  const shown = capRows(rows, maxRows)
  if (rows.length > maxRows && !warned.has(title)) {
    warned.add(title)
    console.warn(`TapInPage "${title}": ${rows.length} rows; the card holds ${maxRows}. The rest belong behind More details.`)
  }
  const swipe = (dx: number, dy: number) => {
    const next = swipeTarget(tabs, tab, dx, dy)
    if (next !== null) go(next)
  }
  const sub = spot === '' ? when : `${spot} · ${when}`
  return (
    <PageShell kind={`tipage ${kind}`} title={title} sub={sub} ground={ground} onBack={onBack} how={how} footNote={safety}>
      <div
        className="tipage__swipe"
        onTouchStart={(e) => {
          const t = e.touches[0]
          start.current = { x: t.clientX, y: t.clientY, ok: !(e.target as Element).closest('[data-sideways], [data-no-swipe], input') }
        }}
        onTouchEnd={(e) => {
          const s = start.current
          start.current = null
          const t = e.changedTouches[0]
          if (s === null || !s.ok || t === undefined) return
          swipe(t.clientX - s.x, t.clientY - s.y)
        }}
        onTouchCancel={() => {
          start.current = null
        }}
      >
        {tabs === undefined ? null : (
          <div className="ui-seg tipage__tabs" role="tablist" aria-label={`${title} views`}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ui-seg__opt${tab === t.id ? ' ui-seg__opt--on' : ''}`} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="tipage__hero" role={tabs === undefined ? undefined : 'tabpanel'}>
          <p className="tipage__eyebrow">{hero.eyebrow}</p>
          <p className="tipage__value" {...(hero.shared === undefined ? {} : { 'data-shared': hero.shared.key, 'data-value': hero.shared.value })}>
            {hero.value}
          </p>
          {hero.sub === undefined ? null : (
            <p className="tipage__sub" {...hero.subData}>
              {hero.sub}
            </p>
          )}
        </div>
        {typeof children === 'function' ? children(tab) : children}
        {chart === undefined ? null : <section className="tipage__card tipage__chart">{chart}</section>}
        {shown.length === 0 && onMore === undefined ? null : (
          <section className="tipage__card tipage__rows">
            {shown.map((r) => {
              const body = (
                <>
                  {r.dot === undefined ? null : <span className={`tipage__dot tipage__dot--${r.dot}`} aria-hidden="true" />}
                  <span className="tipage__label">{r.label}</span>
                  <span className="tipage__val">
                    <b {...(r.shared === undefined ? {} : { 'data-shared': r.shared })}>{r.value}</b>
                    {r.detail === undefined ? null : <span className="tipage__detail"> {r.detail}</span>}
                    {r.onClick === undefined ? null : <span aria-hidden="true"> ›</span>}
                  </span>
                </>
              )
              return r.onClick === undefined ? (
                <div key={r.label} className="tipage__row">
                  {body}
                </div>
              ) : (
                <button key={r.label} type="button" className="tipage__row tipage__row--tap" onClick={r.onClick}>
                  {body}
                </button>
              )
            })}
            {onMore === undefined ? null : (
              <button type="button" className="tipage__row tipage__row--tap tipage__more" onClick={onMore}>
                <span className="tipage__morelabel">More details</span>
                <span aria-hidden="true">›</span>
              </button>
            )}
          </section>
        )}
        {actions.length === 0 ? null : (
          <div className="tipage__actions">
            {actions.map((a) => (
              <button key={a.label} type="button" className={`tipage__btn${a.primary === true ? ' tipage__btn--primary' : ''}`} onClick={a.onClick}>
                {a.label} ›
              </button>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
