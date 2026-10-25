/*
 * THE CALL SHEET, WRITTEN BY A MODEL ON THE SHOOTER'S OWN KEY, CHECKED BY CODE.
 *
 * NO SERVER. The phone calls api.anthropic.com directly with the shooter's
 * key (the browser-access header is Anthropic's opt-in for exactly this), so
 * nothing passes through ScoutNGo's own functions and nothing is logged there.
 * What goes to Anthropic, and only when Write is pressed: the words typed in
 * the box and the answers the tools give (times, bearings, distances, filters,
 * the kit, the playbook). Never the venue coordinate: see callSheetTools.ts.
 *
 * THE MODEL PROPOSES, CODE COMPUTES. The model gets tools, not data to do sums
 * on, and is told every number must come from one. Then every number in its
 * answer is checked against what the tools returned and what the shooter
 * typed (numberCheck.ts); an invented one is replaced with the app's value
 * when it is about something the app computed, and marked when it is not.
 */
import { checkNumbers, repair, type CheckResult, type RepairResult } from '../core/numberCheck.ts'
import { CALL_SHEET_TOOLS, codeValues, runTool, type ToolContext } from '../core/callSheetTools.ts'

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const CALL_SHEET_MODEL = 'claude-opus-5-5'
const MAX_TURNS = 8
const MAX_TOKENS = 4000

export const CALL_SHEET_SYSTEM = [
  'You write a call sheet for a photo and video shoot: first a run of show (a timed list of what happens when), then a shot list.',
  'Every number you write (every time, distance, height, focal length, filter, duration, count) must be copied from a tool result or from the shooter’s own words. Never work a number out yourself, never round one, never estimate one. If no tool gives a number you need, say it in words without a number.',
  'Call the tools first: sun_times, shoot_window, positions, kit, conditions and playbook, and nd_plan if a drone is flying. Follow the playbook.',
  'Never say a place, the airspace or the sky is clear, safe or free of hazards, in any wording. If a drone flies, include the line: Check today’s flight restrictions at tfr.faa.gov.',
  'Plain words, short lines. No em dashes.',
].join(' ')

export type CallSheetOutcome =
  | {
      status: 'ok'
      /** The text as shown: invented numbers replaced or marked. */
      text: string
      /** What the model wrote, before the check. */
      original: string
      check: CheckResult
      repaired: RepairResult
      toolsCalled: string[]
    }
  | { status: 'error'; reason: string }

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export async function writeCallSheet(
  prompt: string,
  key: string,
  ctx: ToolContext,
  fetchImpl: typeof fetch = fetch,
): Promise<CallSheetOutcome> {
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: prompt }]
  const results: unknown[] = []
  const toolsCalled: string[] = []

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    let response: Response
    try {
      response = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CALL_SHEET_MODEL,
          max_tokens: MAX_TOKENS,
          system: CALL_SHEET_SYSTEM,
          tools: CALL_SHEET_TOOLS,
          messages,
        }),
      })
    } catch {
      return { status: 'error', reason: 'Could not reach Anthropic. The call sheet needs a connection.' }
    }
    if (response.status === 401) return { status: 'error', reason: 'Anthropic did not accept that key. Check it in About, under Your API key.' }
    if (!response.ok) return { status: 'error', reason: `Anthropic answered with an error (HTTP ${response.status}).` }

    const body = (await response.json()) as { content?: ContentBlock[]; stop_reason?: string }
    const content = body.content ?? []
    messages.push({ role: 'assistant', content })

    const calls = content.filter((b) => b.type === 'tool_use')
    if (body.stop_reason === 'tool_use' && calls.length > 0) {
      messages.push({
        role: 'user',
        content: calls.map((call) => {
          const result = runTool(call.name ?? '', call.input ?? {}, ctx)
          results.push(result)
          toolsCalled.push(call.name ?? '')
          return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) }
        }),
      })
      continue
    }

    const original = content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim()
    if (original === '') return { status: 'error', reason: 'The model returned no call sheet.' }
    /* What may be quoted: every tool answer, and the shooter's own words. */
    const check = checkNumbers(original, { tools: results, typed: prompt })
    const repaired = check.ok ? { text: original, replaced: [], marked: [] } : repair(original, check.unknown, codeValues(ctx))
    return { status: 'ok', text: repaired.text, original, check, repaired, toolsCalled }
  }
  return { status: 'error', reason: 'The model kept asking for tools and never wrote the sheet.' }
}
