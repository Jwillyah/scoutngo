/*
 * THE WEBGL PROBE'S STEPS, IN ORDER (Batch 3D, Section 1.1). The phone, not
 * the Mac, is the truth for 3D: on 17 Nov an iPhone 13 Pro Max said "3D
 * didn't load" and then reloaded out of memory while every WebKit run here
 * passed. /?probe=webgl runs these one at a time and prints PASS or FAIL
 * with the browser's own words, and stops at the first failure: the one
 * line Jwilly screenshots is the answer. This file is the runner and the
 * text; src/lib/webglProbePage.ts is the steps themselves.
 *
 * A step returns what it found (PASS) or throws (FAIL, its message). A step
 * marked `note` checks something the app does not depend on: what it finds
 * is said, and a failure never stops the run.
 */
export type StepStatus = 'pass' | 'fail' | 'note' | 'running' | 'not run'

export interface ProbeStep {
  name: string
  /** Not something the 3D view or Fly needs: a failure is said and the run goes on. */
  note?: boolean
  run(): Promise<string> | string
}

export interface StepResult {
  name: string
  status: StepStatus
  detail: string
  ms: number
}

export const describeError = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : String(e))

/**
 * Run `steps` in order. Each result is handed to `onUpdate` as it changes
 * (a step 'running', then its verdict), so a page that dies mid-step still
 * shows which step it died in. Stops at the first failure: every step after
 * it is 'not run'.
 */
export async function runSteps(steps: readonly ProbeStep[], onUpdate: (results: readonly StepResult[]) => void = () => {}, now: () => number = () => performance.now()): Promise<StepResult[]> {
  const results: StepResult[] = steps.map((s) => ({ name: s.name, status: 'not run', detail: '', ms: 0 }))
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]
    results[i] = { ...results[i], status: 'running' }
    onUpdate(results.map((r) => ({ ...r })))
    const t0 = now()
    let status: StepStatus
    let detail: string
    try {
      detail = await step.run()
      status = step.note === true ? 'note' : 'pass'
    } catch (e) {
      detail = describeError(e)
      status = step.note === true ? 'note' : 'fail'
    }
    results[i] = { name: step.name, status, detail, ms: Math.round(now() - t0) }
    onUpdate(results.map((r) => ({ ...r })))
    if (status === 'fail') break
  }
  return results
}

const LABEL: Record<StepStatus, string> = { pass: 'PASS', fail: 'FAIL', note: 'NOTE', running: 'RUNNING', 'not run': 'not run' }

/** The first failure, or null when nothing failed. */
export const firstFailure = (results: readonly StepResult[]): StepResult | null => results.find((r) => r.status === 'fail') ?? null

/** One line a step: "3. PASS  Shader: sky (12 ms): compiled and linked". */
export function stepLine(r: StepResult, i: number): string {
  const time = r.status === 'not run' || r.status === 'running' ? '' : ` (${r.ms} ms)`
  return `${i + 1}. ${LABEL[r.status]}  ${r.name}${time}${r.detail === '' ? '' : `: ${r.detail}`}`
}

/** The whole report as plain text, for Copy all: the header, the verdict, then every step. */
export function reportText(header: { build: string; ua: string; at: string }, results: readonly StepResult[]): string {
  const fail = firstFailure(results)
  const running = results.find((r) => r.status === 'running')
  const verdict = fail !== null ? `STOPPED AT: ${fail.name}: ${fail.detail}` : running !== undefined ? `STILL RUNNING: ${running.name}` : results.every((r) => r.status === 'pass' || r.status === 'note') ? 'ALL PASSED' : 'NOT FINISHED'
  return [`ScoutNGo WebGL probe · build ${header.build} · ${header.at}`, header.ua, verdict, '', ...results.map(stepLine)].join('\n')
}
