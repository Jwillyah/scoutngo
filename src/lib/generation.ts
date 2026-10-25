/*
 * WHAT THE PLAN PANEL SAYS ABOUT A SUGGEST, AND THE MAP BOX TYPE.
 *
 * What is left of src/lib/planRequest.ts once Suggest stopped asking a model.
 * The request body, the image orientation, the optics sent as facts and the
 * response parser all went with the call; Suggest is src/core/suggest.ts now.
 */

export interface MapBounds {
  west: number
  south: number
  east: number
  north: number
}

/*
 * SUGGEST'S STEPS, as it actually runs them (src/lib/suggestRun.ts). There is
 * no "asking" step any more: nothing is asked.
 */
export const GENERATE_STAGES = [
  { key: 'capture', label: 'Reading buildings and water' },
  { key: 'terrain', label: 'Reading airspace' },
  { key: 'positions', label: 'Testing every position' },
  { key: 'lighting', label: 'Scoring the light' },
] as const

export type GenerateStage = (typeof GENERATE_STAGES)[number]['key']

/** Where a stage sits in the sequence. -1 for a key that is not one. */
export function stageIndex(stage: GenerateStage): number {
  return GENERATE_STAGES.findIndex((entry) => entry.key === stage)
}

export function stageLabel(stage: GenerateStage): string {
  return GENERATE_STAGES.find((entry) => entry.key === stage)?.label ?? ''
}

import type { GenerateBlock } from './generateGate.ts'
import type { SuggestSummary } from './suggestRun.ts'

/** What the Plan panel shows about the last generate attempt. */
export type GenerationState =
  | { status: 'idle' }
  /** Mid flight, on the named step. Nothing here is inferred from elapsed time. */
  | { status: 'working'; stage: GenerateStage }
  | { status: 'error'; message: string }
  /**
   * It cannot run yet, and this says why, ON THE SCREEN THE BUTTON IS ON.
   *
   * SEPARATE FROM 'error' because nothing has gone wrong: something is missing.
   * It used to be an 'error' set in the same breath as a navigation to Setup,
   * which unmounted the only component that renders an error, so the button
   * silently did nothing. See src/lib/generateGate.ts.
   */
  | { status: 'blocked'; block: GenerateBlock }
  /**
   * The feature is off because the server has no key for it.
   *
   * SEPARATE FROM 'error' ON PURPOSE. Nothing is wrong, a optional feature is
   * simply not configured, and showing that in hazard red next to real warnings
   * teaches people to ignore the colour that means a position is in the water.
   */
  | { status: 'no-key'; message: string }
  /** Parsing failed. The raw response is shown rather than a dead end. */
  | { status: 'raw'; reason: string; raw: string }
  /** Placed. `summary` is Suggest's account of every candidate: see src/lib/suggestRun.ts. */
  | { status: 'done'; count: number; dropped: number; summary?: SuggestSummary }
