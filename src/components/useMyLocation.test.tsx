import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar.tsx'

/* The locate button lives in the top bar now. */
const bar = (note: string | null = null) =>
  renderToStaticMarkup(
    <TopBar
      onMenu={() => {}}
      menuOpen={false}
      pill={null}
      onAdd={null}
      adding={false}
      onLocate={() => {}}
      locating={false}
      locateNote={note}
      online
    />,
  )

/*
 * NOT ON LOAD. The whole point of this control is that the question is asked
 * because somebody asked for it, so rendering it must touch nothing.
 */
const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

afterEach(() => {
  if (original === undefined) delete (globalThis as { navigator?: unknown }).navigator
  else Object.defineProperty(globalThis, 'navigator', original)
})

describe('Use my location', () => {
  it('asks for nothing while rendering', () => {
    const getCurrentPosition = vi.fn()
    const watchPosition = vi.fn()
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: { getCurrentPosition, watchPosition } },
      configurable: true,
    })

    const html = bar()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(watchPosition).not.toHaveBeenCalled()
    expect(html).toContain('Go to where I am')
  })

  it('offers the control and no message until something has been tried', () => {
    expect(bar()).toContain('Go to where I am')
    expect(bar()).not.toContain('topbar__note')
    /* And a refusal is one plain sentence where the control is. */
    expect(bar('Location was not allowed.')).toContain('Location was not allowed.')
  })
})
