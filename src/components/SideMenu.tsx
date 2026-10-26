import { useEffect, useRef } from 'react'
import { MENU_ITEMS, menuHome, type MenuItem } from '../lib/menu.ts'
import { Icon } from './Icon.tsx'

/*
 * THE MENU, FROM THE LEFT.
 *
 * WHAT IT REPLACED. A row of tabs along the bottom -- MAP, PLAN, FIELD and a
 * NOW button -- which took the bottom of the screen for navigation that is
 * used a few times a shoot. The bottom belongs to the map and the sheet; the
 * places you go now live here, one tap behind the menu button.
 *
 * STILL `nav aria-label="Stage"`. The audits navigate by finding a button in
 * that nav by its words (scripts/preflight.mjs goToStage), and what a screen
 * reader announces is the same thing a test finds.
 */
interface SideMenuProps {
  open: boolean
  /** Which item is where you are now, so it reads as the current place. */
  current: MenuItem | null
  onPick: (item: MenuItem) => void
  onClose: () => void
}

export function SideMenu({ open, current, onPick, onClose }: SideMenuProps) {
  const first = useRef<HTMLButtonElement>(null)

  /* Focus moves into the menu when it opens, and Escape closes it. */
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sidemenu" role="presentation">
      <button type="button" className="sidemenu__scrim" aria-label="Close the menu" onClick={onClose} />
      <nav className="sidemenu__panel" aria-label="Stage">
        <p className="sidemenu__brand">ScoutNGo</p>
        {MENU_ITEMS.map((item, index) => {
          const here = current !== null && menuHome(current) === item.id
          return (
            <div key={item.id} className="sidemenu__group">
              <button
                type="button"
                ref={index === 0 ? first : undefined}
                className={`sidemenu__item${here ? ' sidemenu__item--on' : ''}`}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => {
                  onPick(item.id)
                  onClose()
                }}
              >
                <Icon glyph={item.icon} size={42} />
                <span className="sidemenu__words">
                  <span className="sidemenu__label">{item.label}</span>
                  <span className="sidemenu__note">{item.note}</span>
                </span>
              </button>
              {item.subs === undefined ? null : (
                <div className="sidemenu__subs">
                  {item.subs.map((sub) => (
                    <button
                      type="button"
                      key={sub.id}
                      className={`sidemenu__sub${current === sub.id ? ' sidemenu__sub--on' : ''}`}
                      aria-current={current === sub.id ? 'page' : undefined}
                      onClick={() => {
                        onPick(sub.id)
                        onClose()
                      }}
                    >
                      <span className="sidemenu__label">{sub.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
