import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTION_REFUSED } from '../lib/heading.ts'
import { dismissAfter, TOAST_MS } from '../lib/toast.ts'
import { Toast } from './Toast.tsx'

describe('a toast', () => {
  afterEach(() => vi.useRealTimers())

  it('goes by itself after four seconds', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    dismissAfter(done)
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledTimes(1)
    expect(TOAST_MS).toBe(4000)
  })

  it('does not fire once it has gone another way (a tap, or a new message)', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const cancel = dismissAfter(done)
    cancel()
    vi.advanceTimersByTime(TOAST_MS * 2)
    expect(done).not.toHaveBeenCalled()
  })

  it('is one line you can tap, announced, and says how to get the compass back', () => {
    const html = renderToStaticMarkup(<Toast message={MOTION_REFUSED} onDone={() => undefined} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('<button type="button" class="toast__btn"')
    expect(html).toContain('Compass needs motion access. Reload and tap the compass again, then Allow.')
    expect(html).not.toContain('—')
  })
})
