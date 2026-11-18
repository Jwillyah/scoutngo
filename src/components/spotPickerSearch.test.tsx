import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SpotPicker } from './SpotPicker.tsx'

/* Batch 3D, Section 2: the picker answers from the phone's own spots; fetch is spied and never called. */
describe('SpotPicker with "Chics beach" typed', () => {
  it('shows Chick’s Beach and The Back Deck from the phone, with no network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const chics = renderToStaticMarkup(<SpotPicker title="Find a spot" saved={[]} around={{ lat: 36.85, lon: -75.97 }} initialQuery="Chics beach" onPick={() => {}} />)
    expect(chics).toContain("Chick&#x27;s Beach")
    expect(chics).not.toContain('Nothing found by that name')
    const back = renderToStaticMarkup(<SpotPicker title="Find a spot" saved={[]} around={{ lat: 36.85, lon: -75.97 }} initialQuery="Backdeck" onPick={() => {}} />)
    expect(back).toContain('The Back Deck')
    expect(back).toContain('Lynnhaven Inlet, Shore Dr')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
