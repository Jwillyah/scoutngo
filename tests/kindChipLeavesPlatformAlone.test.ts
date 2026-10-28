import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * THE TIME-OF-DAY CHIP DOES NOT TOUCH THE PLATFORM FILTER.
 *
 * WHAT WAS REPORTED. "I set it to Drone and got three ground positions." The
 * filter read GROUND 3 / AIR 0 and the button said "Add position" rather than
 * "Add air position". Measured in the browser, tapping Drone and then Daytime,
 * which is what a daytime aerial shoot looks like to tap:
 *
 *   after Drone     Both=false Ground=false Drone=true
 *   after Daytime   Both=true  Ground=false Drone=false
 *
 * The cause was one line in onShootKind, `if (kind === 'daytime')
 * setPlatformFilter('both')`, written on the reasoning that a daytime shoot is
 * usually both. It silently undid an explicit choice.
 *
 * WHY A SOURCE SCAN. The rule is about WIRING in App.tsx: not what either
 * control computes, which is tested in core, but that one handler does not
 * reach into the other's state. There is nothing to call and no value to
 * assert; the only thing that can regress is somebody adding the line back
 * because it reads like a convenience. So the line is what is tested.
 */
const APP = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

/**
 * COMMENTS ARE NOT CODE. The handler now carries a long note explaining the
 * removed line, and that note quotes the line. A scan that read it would match
 * its own explanation and fail on the fix, which is the trap every other
 * source guard in this repo has fallen into once.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * The body of one `const name = useCallback(` through to its closing `)`,
 * found by counting brackets rather than by a regex, because the body contains
 * both braces and parentheses.
 */
function callbackBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(`)
  if (start === -1) throw new Error(`no useCallback named ${name}`)
  let depth = 0
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth += 1
    if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced useCallback for ${name}`)
}

describe('the kind chip sets the window, not the platform', () => {
  const body = withoutComments(callbackBody(APP, 'onShootKind'))

  it('found the real handler', () => {
    /* If the extractor missed, every assertion below would be vacuous. */
    expect(body).toContain('setShootKind(kind)')
  })

  /*
   * THE HANDLER ONLY RECORDS THE CHOICE NOW. Setting the window moved out of
   * it, because a handler runs once and a chip tapped before the pin existed
   * could only leave a note saying it had done nothing. The rule watches the
   * condition instead: see src/lib/chipWindow.ts.
   */
  it('records the choice and leaves the window to the rule that watches for it', () => {
    expect(body).not.toContain('shootPreset(')
    expect(body).not.toMatch(/setVenue\s*\(/)
  })

  /*
   * And the comment stripper really strips, rather than returning the source
   * unchanged and leaving the scan reading prose.
   */
  it('strips comments but keeps the code', () => {
    const stripped = withoutComments(`a() /* setPlatformFilter('both') */ // setPlatformFilter('x')
      b()`)
    expect(stripped).not.toContain('setPlatformFilter')
    expect(stripped).toContain('a()')
    expect(stripped).toContain('b()')
  })

  /*
   * And the app still applies a chip in either order, which is the behaviour
   * the handler gave up. Asserted on the rule that replaced it, so removing
   * the handler's logic cannot quietly remove the feature with it.
   */
  it('still sets the window from the chip, somewhere', () => {
    expect(APP).toContain('chipWindow(')
    expect(APP).toMatch(/chipOutcome\.action !== 'apply'/)
  })

  it('does not set the platform filter', () => {
    expect(body).not.toMatch(/setPlatformFilter\s*\(/)
  })

  /*
   * Nor anything else that decides what an Add makes. The handler's whole job
   * is the shoot kind and the suggested window.
   */
  it('does not reach into what a new position will be', () => {
    expect(body).not.toMatch(/setPlacing\s*\(/)
    expect(body).not.toMatch(/setPositions\s*\(/)
  })

  /* The check has to be able to fail. */
  it('would catch the line if it came back', () => {
    const planted = withoutComments(
      callbackBody(
        `const onShootKind = useCallback((kind: ShootKind) => {
           setShootKind(kind)
           if (kind === 'daytime') setPlatformFilter('both')
         }, [])`,
        'onShootKind',
      ),
    )
    expect(planted).toMatch(/setPlatformFilter\s*\(/)
  })

  /*
   * And the extractor really does stop at the right paren, rather than running
   * to the end of the file and matching something from an unrelated handler.
   */
  it('extracts one handler, not the rest of the file', () => {
    const two = `const a = useCallback((x) => { f(x) }, [])
                 const b = useCallback(() => { setPlatformFilter('both') }, [])`
    expect(callbackBody(two, 'a')).not.toContain('setPlatformFilter')
    expect(callbackBody(two, 'b')).toContain('setPlatformFilter')
  })
})

/**
 * THE DRONE CHIP IS NOT DECORATION. The other half of the same requirement:
 * the platform row must actually set the filter, or the chip does nothing.
 */
describe('the platform chip sets the platform filter', () => {
  it('wires the chip row to the filter state, through no handler of its own', () => {
    /*
     * App hands setPlatformFilter down as onPlatformFilter and step 3's
     * Ground / Drone / Both buttons call it with their own value. No wrapper
     * in between, because a wrapper is where a line like the one this file
     * exists to prevent gets written.
     */
    expect(APP).toMatch(/onPlatformFilter=\{setPlatformFilter\}/)
    const setup = readFileSync(new URL('../src/components/SetupMode.tsx', import.meta.url), 'utf8')
    expect(setup).toMatch(/onPlatformFilter\(p\)/)
  })

  it('and the chip row calls it', () => {
    const chips = readFileSync(new URL('../src/components/ShootChips.tsx', import.meta.url), 'utf8')
    expect(chips).toMatch(/onClick=\{\(\) => onPlatform\(option\)\}/)
  })
})
