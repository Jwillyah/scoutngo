import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * THE SUGGEST BUTTON NEVER DOES NOTHING.
 *
 * "A button that silently does nothing is the worst version of this."
 *
 * WHY A SOURCE SCAN. The reason a generate stops is a value now, and
 * src/lib/generateGate.test.ts asserts it is a useful one. But the bug was
 * never the value: it was that the handler NAVIGATED AWAY from the only screen
 * that renders it, in the same statement that set it. Measured:
 *
 *   DIAG stop  guard 2, empty brief -> setMode('setup') + setGeneration(error)
 *   rail after tap   Setup=step, Plan=null
 *   message on screen []
 *
 * That is a wiring rule about one function, with no return value to assert, so
 * the wiring is what is tested.
 */
const APP = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const STATUS = readFileSync(new URL('../src/components/PlanStatus.tsx', import.meta.url), 'utf8')

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/** The body of `const onGenerate = async () => {` to its matching brace. */
function handlerBody(source: string): string {
  const start = source.indexOf('const onGenerate = async () => {')
  if (start === -1) throw new Error('no onGenerate')
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced onGenerate')
}

describe('deciding it cannot run does not leave the screen', () => {
  const body = withoutComments(handlerBody(APP))

  /* Suggest is arithmetic now: the handler gates, then runs the code in src/core/suggest.ts. */
  it('found the real handler', () => {
    expect(body).toContain('generateBlock(')
    expect(body).toContain('runSuggest(')
    expect(body).not.toContain('requestPlan(')
    expect(body.length).toBeGreaterThan(500)
  })

  /*
   * THE RULE. The handler sets the block and returns. It does not navigate,
   * because the thing that renders the block lives on the screen it is on.
   */
  it('never changes mode', () => {
    expect(body).not.toMatch(/setMode\s*\(/)
  })

  it('never points at a setup field from inside the handler', () => {
    expect(body).not.toMatch(/setPointAt\s*\(/)
  })

  it('sets a blocked state instead, and returns', () => {
    expect(body).toMatch(/setGeneration\(\{\s*status:\s*'blocked'/)
  })

  /* The check has to be able to fail. */
  it('would catch the old handler', () => {
    const old = withoutComments(
      handlerBody(`const onGenerate = async () => {
        if (bad) { setMode('setup'); setPointAt(x); return }
        await requestPlan(generateBlock(y))
      }`),
    )
    expect(old).toMatch(/setMode\s*\(/)
    expect(old).toMatch(/setPointAt\s*\(/)
  })

  it('extracts one handler and stops at its brace', () => {
    const two = `const onGenerate = async () => { a() }
                 const other = () => { setMode('setup') }`
    expect(handlerBody(two)).not.toContain('setMode')
  })
})

/**
 * THE TYPED BRIEF IS NOT A GATE ANY MORE, AND IT MUST NOT BECOME ONE AGAIN.
 *
 * "The chips already say what the shoot is: Sunrise, Drone. Making me type a
 * sentence as well re-adds the text box we just demoted, as a gate."
 *
 * So the gate may not read eventDescription at all. If it does, the sentence
 * is back to being required, whatever the message says.
 */
describe('the gate does not require prose', () => {
  const gate = withoutComments(
    readFileSync(new URL('../src/lib/generateGate.ts', import.meta.url), 'utf8'),
  )

  it('never inspects the typed brief', () => {
    expect(gate).not.toMatch(/eventDescription/)
    expect(gate).not.toMatch(/desiredOutcome/)
  })

  it('still blocks on the venue, which is the case with genuinely nothing', () => {
    expect(gate).toContain('hasErrors')
    /* And no longer on the brief, which Suggest never reads. */
    expect(gate).not.toMatch(/input\.staleBrief/)
  })

  /* The check can fail. */
  it('would catch the requirement coming back', () => {
    expect(/eventDescription/.test("if (venue.eventDescription.trim() === '') return block")).toBe(
      true,
    )
  })

  /*
   * NO BRIEF GOES ANYWHERE NOW. It used to be built from the chips and sent to
   * a model; Suggest is arithmetic (src/core/suggest.ts) and the request and
   * the endpoint are gone.
   */
  it('sends no brief, because nothing is asked', () => {
    expect(existsSync(new URL('../api/generate.ts', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../src/lib/planRequest.ts', import.meta.url))).toBe(false)
  })
})

/**
 * AND THE BLOCK IS RENDERED WHERE THE BUTTON IS. The other half: a value
 * nothing draws is the same silence wearing a type.
 */
describe('the blocked state is actually drawn', () => {
  it('PlanStatus renders it, with a way out', () => {
    const code = withoutComments(STATUS)
    expect(code).toMatch(/generation\.status === 'blocked'/)
    expect(code).toContain('generation.block.message')
    expect(code).toContain('generation.block.action')
    expect(code).toContain('onFixBlock')
  })

  /*
   * And PlanStatus is on the Plan screen, which is where the button is.
   *
   * ASSERTED ON THE HANDLER, NOT THE LABEL. It used to match /Suggest
   * positions/, and the label is now "Suggest" with the brief source beneath
   * it, because the button stopped being a full-width slab and became a text
   * action in the positions list header. The thing worth holding is that the
   * control which can FAIL and the panel which EXPLAINS the failure are on one
   * screen; the words on the button are not that.
   */
  it('sits on the same screen as the button', () => {
    const plan = readFileSync(new URL('../src/components/PlanMode.tsx', import.meta.url), 'utf8')
    expect(plan).toContain('<PlanStatus')
    expect(plan).toContain('onClick={onGenerate}')
  })

  /* Every branch of GenerationState has something that draws it. */
  it('leaves no generation state undrawn', () => {
    const code = withoutComments(STATUS)
    for (const status of ['working', 'error', 'blocked', 'no-key', 'raw', 'done']) {
      expect(code, `nothing renders status "${status}"`).toContain(`'${status}'`)
    }
  })
})
