/** Must match --nav-height in tokens.css. The sheet sizes itself against it. */
export const NAV_HEIGHT = 56

export type Tab = 'plan' | 'shots' | 'sun' | 'kit'

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'shots', label: 'Shot list' },
  { id: 'sun', label: 'Sun' },
  { id: 'kit', label: 'Kit' },
]

interface NavBarProps {
  tab: Tab
  onTab: (next: Tab) => void
  shotCount: number
}

export function NavBar({ tab, onTab, shotCount }: NavBarProps) {
  return (
    <nav className="nav" aria-label="Sections">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav__item${tab === item.id ? ' nav__item--on' : ''}`}
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => onTab(item.id)}
        >
          <span className="nav__label">{item.label}</span>
          {item.id === 'shots' && shotCount > 0 ? (
            <span className="nav__count num">{shotCount}</span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
