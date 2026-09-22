import Anthropic from '@anthropic-ai/sdk'

/*
 * ===========================================================================
 * THIS FUNCTION LOGS NOTHING. DELIBERATELY. Same rule as generate.ts.
 *
 * It receives an organizer's event graphic and a satellite view of the venue.
 * Together those say where a specific person intends to be standing on a
 * specific day, which is the same category of information as the venue itself.
 * It is never written to a log, a database or a file. Vercel retains function
 * logs in its dashboard, which is exactly why none are written. Debug with
 * `vercel dev`, not with a log line.
 * ===========================================================================
 */

const MODEL = 'claude-sonnet-5'

/*
 * Larger than generate's budget because a course can carry a lot of vertices
 * and thinking tokens come out of the same allowance. The caps that actually
 * bound the answer are in src/lib/eventLayout.ts, not here.
 */
const MAX_TOKENS = 12000
const EFFORT = 'low' as const

/*
 * STEP 1. Read the artwork, and nothing else.
 *
 * Coordinates here are in the ARTWORK's own space and are used for nothing but
 * showing the reader what was found. No real-world claim is made at this step,
 * which is why the prompt never mentions the map.
 */
const READ_PROMPT = `You are reading an event layout graphic published by an event organizer.

Return STRICT JSON and nothing else. No prose, no code fences.

{"elements":[{"type":"...","label":"...","points":[{"x":0.0,"y":0.0}]}]}

TYPE is one of exactly these nine, and nothing else:
  course      the route the action follows, drawn as a line
  start       the start line or gate
  finish      the finish line or gate
  turn        a turn marker, buoy, gate or corner
  crowd       spectators, bleachers, a viewing bank
  vendors     stalls, traders, a market row
  food        food trucks, a food court, a bar
  stage       a stage, a band, music
  restricted  closed, private, staff only, no public access

If something in the artwork is not one of those nine, LEAVE IT OUT. Do not map it
to the nearest type.

POINTS are normalised coordinates ON THIS ARTWORK. x is 0 at the left edge and 1
at the right. y is 0 at the top and 1 at the bottom.

HOW MANY POINTS:
  course                                  2 to 16, in the order the action travels
  start, finish, turn                     exactly 1
  crowd, vendors, food, stage, restricted 3 to 12, tracing the outline of the area

LABEL is at most 6 words, copied or summarised from the artwork. If the artwork
does not name it, use a plain description like "north bank".

DO NOT return latitude, longitude, or any real-world coordinate. You do not know
where this place is and you are not being asked. Return only positions on this
image.

DO NOT comment on light, sun, shadow or the time of day. That is computed
elsewhere and anything you say about it is discarded.

If the image is not an event layout, return {"elements":[]}.`

/*
 * STEP 2. Where those elements sit on REAL IMAGERY.
 *
 * The whole georeferencing approach is this prompt. The artwork is never
 * transformed onto the map; the placement question is asked against the
 * satellite capture, which is the one image the app can invert through a
 * recorded camera. Coordinates come back in that frame and are unprojected in
 * code, exactly as camera positions already are.
 */
const PLACE_PROMPT = `You are given TWO images of the same place.

IMAGE 1 is an event layout graphic drawn by an organizer. It may be an oblique
or perspective view, it may be an illustration rather than a photograph, and it
is not to scale. Treat its shapes as approximate.

IMAGE 2 is a real satellite photograph of the same place, looking straight down.

You are told which elements were found in IMAGE 1. For each one, work out where
it sits in IMAGE 2 and return that position.

Return STRICT JSON and nothing else. No prose, no code fences.

{"placements":[{"id":"e1","points":[{"x":0.0,"y":0.0}]}]}

id MUST be one of the ids given to you below. Do not invent an element, do not
rename one, and do not return an element that was not in the list.

POINTS are normalised coordinates ON IMAGE 2, the satellite photograph. x is 0 at
its left edge and 1 at its right. y is 0 at its top and 1 at its bottom. Give the
same number of points the element had in IMAGE 1, in the same order, unless part
of it falls outside IMAGE 2.

HOW TO DO THIS. Find landmarks that appear in both images: a bridge, a shoreline,
a pier, a road junction, a distinctive roof. Anchor on those first, then work out
the rest relative to them. IMAGE 1 may be drawn from an angle, so a shape that
looks long and thin there may be square from above.

IF PART OF AN ELEMENT FALLS OUTSIDE IMAGE 2, leave those points out. Do NOT push
them to the edge of the frame. A course that bends where the picture ends is
worse than a course that stops there.

IF YOU CANNOT PLACE AN ELEMENT with reasonable confidence, LEAVE IT OUT
ENTIRELY. It will be placed by hand. A wrong position is worse than a missing
one, because a wrong one looks finished.

DO NOT return latitude, longitude, or any real-world coordinate. Return only
positions on IMAGE 2.

DO NOT comment on light, sun, shadow or the time of day.`

interface EventRequestBody {
  step?: unknown
  /** Base64 of the organizer's artwork. Required for both steps. */
  layout?: unknown
  layoutMediaType?: unknown
  /** Base64 of the satellite capture. Required for 'place'. */
  capture?: unknown
  /** Compass bearing toward the top of the capture, so "up" is not assumed. */
  captureNorthBearing?: unknown
  /** The elements from step 1, as the ids and shapes step 2 must answer for. */
  elements?: unknown
}

/** What step 2 is allowed to answer for, rendered as plain text for the model. */
function renderElements(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'No elements were supplied.'
  const lines = value.slice(0, 48).map((entry) => {
    const item = entry as Record<string, unknown>
    const id = typeof item?.id === 'string' ? item.id : '?'
    const type = typeof item?.type === 'string' ? item.type : '?'
    const label = typeof item?.label === 'string' ? item.label : ''
    const count = Array.isArray(item?.points) ? item.points.length : 0
    return `${id}  ${type}  "${label}"  ${count} point${count === 1 ? '' : 's'} in IMAGE 1`
  })
  return `ELEMENTS FOUND IN IMAGE 1. Place every one of these that you can.\n${lines.join('\n')}`
}

function orientation(value: unknown): string {
  const north = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.abs(north) < 0.5
    ? 'NORTH IS STRAIGHT UP in IMAGE 2. East is right, south is down, west is left.'
    : `IMAGE 2 is ROTATED: compass bearing ${north.toFixed(0)} degrees points toward its top.`
}

const mediaTypeOf = (value: unknown): 'image/png' | 'image/jpeg' =>
  value === 'image/png' ? 'image/png' : 'image/jpeg'

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { status: 'error', message: 'ANTHROPIC_API_KEY is not set on the server.' },
      { status: 500 },
    )
  }

  let body: EventRequestBody
  try {
    body = (await request.json()) as EventRequestBody
  } catch {
    return Response.json({ status: 'error', message: 'Body was not JSON.' }, { status: 400 })
  }

  const step = body.step === 'place' ? 'place' : 'read'
  const layout = typeof body.layout === 'string' ? body.layout : ''
  if (layout === '') {
    return Response.json(
      { status: 'error', message: 'No event layout image was attached.' },
      { status: 400 },
    )
  }

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaTypeOf(body.layoutMediaType), data: layout },
    },
  ]

  if (step === 'place') {
    const capture = typeof body.capture === 'string' ? body.capture : ''
    if (capture === '') {
      return Response.json(
        { status: 'error', message: 'No satellite capture was attached for placement.' },
        { status: 400 },
      )
    }
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: capture },
    })
    content.push({
      type: 'text',
      text: `${orientation(body.captureNorthBearing)}\n\n${renderElements(body.elements)}`,
    })
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: step === 'place' ? PLACE_PROMPT : READ_PROMPT,
      messages: [{ role: 'user', content }],
    })

    /*
     * Raw text, handed back untouched, for the app to parse. The type filter is
     * load bearing with thinking on: the response also carries thinking blocks
     * and they must not reach the JSON parser.
     */
    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return Response.json({
      status: 'ok',
      raw,
      stopReason: response.stop_reason,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })
  } catch (error) {
    /*
     * The message only, never the request. An Anthropic SDK error carries the
     * status and a short reason, neither of which contains the images.
     */
    const message = error instanceof Error ? error.message : 'The model call failed.'
    return Response.json({ status: 'error', message })
  }
}
