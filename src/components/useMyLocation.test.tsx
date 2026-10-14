import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UseMyLocation } from './UseMyLocation.tsx'

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

    const html = renderToStaticMarkup(<UseMyLocation onLocated={() => {}} />)
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(watchPosition).not.toHaveBeenCalled()
    expect(html).toContain('Use my location')
  })

  it('offers the control and no message until something has been tried', () => {
    const html = renderToStaticMarkup(<UseMyLocation onLocated={() => {}} />)
    expect(html).toContain('locate__btn')
    expect(html).not.toContain('locate__note')
  })
})
