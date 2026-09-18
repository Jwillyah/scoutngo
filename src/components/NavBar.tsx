/*
 * 'conditions' was 'sun'. The tab held only the solar readout when it was named;
 * it now carries sun, tide and the window's light together, and "Sun" had
 * stopped describing it.
 */
export type Tab = 'plan' | 'shots' | 'conditions' | 'kit' | 'spots'

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'shots', label: 'Shots' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'kit', label: 'Kit' },
  { id: 'spots', label: 'Spots' },
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
