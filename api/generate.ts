import Anthropic from '@anthropic-ai/sdk'

/*
 * ===========================================================================
 * THIS FUNCTION LOGS NOTHING. DELIBERATELY.
 *
 * Not the request body, not the venue name, not the coordinates, not the map
 * image, not the model response, not on the error path either. It writes to no
 * database and no filesystem.
 *
 * The reason is the whole privacy stance in README.md: a venue location plus a
 * date and a time window is a statement about where a specific person will be
 * standing at a specific hour. There is no product reason to keep that, so it is
 * never written down. Function logs are readable in the Vercel dashboard, and are
 * retained and searchable there, so a single console.log of the request body would
 * quietly undo it. This rule is a property of the data, not of the host: it survives
 * any move, and it survived this one.
 *
 * If you are debugging this, reproduce locally with `vercel dev` rather than
 * adding a log line here. If you add one anyway, it must not include any field
 * from the request or the response.
 * ===========================================================================
 */

const MODEL = 'claude-sonnet-5'

/*
 * Raised from 4000 when moving off claude-sonnet-4-6. On Sonnet 5 thinking is on
 * by default and thinking tokens are drawn from the SAME max_tokens budget as the
 * visible answer, so the old 4000 was no longer 4000 for the JSON. The plan itself
 * is small, about 700 tokens for six positions, so this is headroom rather than a
 * licence to ramble: the caps that matter are the per-field ones in the prompt and
 * in src/lib/parsePlan.ts, and they are unchanged.
 *
 * Still a single non-streaming request. 8000 is far below the point where the SDK
 * wants streaming to dodge an HTTP timeout.
 */
const MAX_TOKENS = 8000

/*
 * Adaptive thinking, stated rather than left implicit, because Sonnet 5 runs it
 * whether or not it is asked for and the budget arithmetic above depends on it.
 *
 * Effort is held at 'low' deliberately. The judgement asked for here is bounded:
 * pick four to six places to stand in one image. Every expensive part, the
 * bearings, the cones, the lighting and the siting checks, is arithmetic done in
 * src/core/ after the response comes back, so paying for deeper reasoning buys
 * very little and costs seconds on a button the user is already waiting on. Raise
 * this if placements start looking lazy; it is one word.
 */
const EFFORT = 'low' as const

/*
 * Lighting and geometry are settled by src/core/. The model is told this
 * plainly, and the app discards any lighting claim regardless of what comes
 * back, so a model that ignores the instruction cannot corrupt the output.
 */
const SYSTEM_PROMPT = `You are a location scout for a solo photographer and videographer planning a shoot at a venue they have never visited.

You are looking at a satellite map image of the venue. Propose 4 to 6 camera positions.

WHAT YOU DECIDE: where a shooter should stand, what the shot is, and what the risk is. That is judgement, and it is the only thing you are asked for.

WHAT YOU MUST NOT DECIDE: anything geometric or photometric. Do not state or imply whether a position is backlit, front-lit, side-lit, sunlit, shaded, in golden hour, or facing the sun. Do not give bearings, angles, degrees, field of view, or distances. The application computes all of that from your coordinates using tested code, and it discards any lighting or geometry claim you make. Writing one wastes your token budget and changes nothing.

OUTPUT FORMAT. Return a single JSON object and nothing else. No prose before or after. No markdown code fences. No explanation.

{"positions":[{"x":0.0,"y":0.0,"lensId":"","focalLength":0,"shot":"","risk":"","platform":"ground","altitudeFeet":0}]}

FIELD RULES, all mandatory:
- x, y: numbers from 0 to 1, the position in the image. x is left to right, y is top to bottom.

WHERE A SHOOTER CAN STAND. When a SITE GEOMETRY block is present it is real OpenStreetMap data for this exact view, in [longitude, latitude] pairs, and it is authoritative over what you think you see in the image. Use it:
- NEVER place a position inside a water ring. A person cannot stand on a river.
- NEVER place a position on a road centreline. That is standing in traffic.
- Piers, parking areas, and the ground beside buildings are all good places to stand.
The application checks every position you return against this same geometry and flags the ones in water or in a roadway, so a bad placement is visible immediately rather than silently accepted.
- lensId: exactly one of the lens ids listed in the context. Do not invent one.
- focalLength: millimetres, within that lens's range as listed.
- shot: what to capture from here. AT MOST 25 WORDS. Hard limit.
- risk: what could go wrong here, such as access, crowds, obstruction, or distance. AT MOST 15 WORDS. Hard limit.
- platform: "ground" or "air". Use "air" ONLY if a drone is listed in the kit below. An air position is a hover point, so it may sit over water or a road.
- altitudeFeet: for "air", height above ground in feet, no more than 400, which is the FAA ceiling. For "ground", 0.

Vary the positions. Do not cluster them all on one side. Respect the shooter's stated style and the lenses they actually brought.

Stay inside the limits. A response cut off mid JSON is worthless.`

interface GenerateContext {
  venueName?: unknown
  event?: unknown
  outcome?: unknown
  date?: unknown
  startTime?: unknown
  endTime?: unknown
  timeZoneLabel?: unknown
  style?: unknown
  lenses?: unknown
  bodies?: unknown
  drones?: unknown
  bounds?: unknown
  image?: unknown
  mediaType?: unknown
  site?: unknown
}

const asText = (value: unknown, cap: number): string =>
  typeof value === 'string' ? value.slice(0, cap) : ''

/** Coordinates at about one metre, which is as precise as this needs to be. */
const ring = (shape: unknown): string =>
  Array.isArray(shape)
    ? `[${shape
        .map((pair) =>
          Array.isArray(pair) && pair.length === 2
            ? `[${Number(pair[0]).toFixed(5)},${Number(pair[1]).toFixed(5)}]`
            : '',
        )
        .filter((p) => p !== '')
        .join(',')}]`
    : ''

const shapes = (label: string, list: unknown): string => {
  if (!Array.isArray(list) || list.length === 0) return ''
  return `${label} (${list.length}):\n${list.map(ring).filter((r) => r !== '[]' && r !== '').join('\n')}\n`
}

/**
 * Real OSM shapes for this view. Absent when Overpass was slow or down, in which
 * case the model falls back to reading the image, exactly as it did before.
 */
function renderSite(site: unknown): string {
  if (typeof site !== 'object' || site === null) {
    return 'SITE GEOMETRY: not available for this view. Read the land and water from the image, and be conservative about where a person can stand.'
  }
  const s = site as Record<string, unknown>
  const blocks = [
    shapes('WATER, never place a position inside these', s.water),
    shapes('ROADS, never place a position on these lines', s.roads),
    shapes('PIERS, good places to stand', s.piers),
    shapes('PARKING, good places to stand', s.parking),
    shapes('BUILDINGS, stand beside not on', s.buildings),
  ].filter((b) => b !== '')

  if (blocks.length === 0) {
    return 'SITE GEOMETRY: OpenStreetMap returned nothing for this view. Read the land and water from the image.'
  }
  return `SITE GEOMETRY, real OpenStreetMap data for this exact view, [longitude, latitude]. This is authoritative over the image.\n${blocks.join('\n')}`
}

/** Renders the context the app sent into the user turn. */
function renderContext(body: GenerateContext): string {
  const lenses = Array.isArray(body.lenses)
    ? body.lenses
        .map((l) => {
          const lens = l as Record<string, unknown>
          return `- id "${asText(lens.id, 60)}": ${asText(lens.name, 80)}, ${String(lens.min)}mm to ${String(lens.max)}mm`
        })
        .join('\n')
    : '(none supplied)'

  const bodies = Array.isArray(body.bodies)
    ? body.bodies.map((b) => asText(b, 80)).join(', ')
    : ''

  const bounds = body.bounds as Record<string, unknown> | undefined

  return `VENUE: ${asText(body.venueName, 200)}

WHAT HAPPENS THERE:
${asText(body.event, 2000)}

WHAT THE SHOOTER WANTS OUT OF IT:
${asText(body.outcome, 2000)}

HOW THEY SHOOT:
${asText(body.style, 1500)}

DATE AND WINDOW: ${asText(body.date, 20)}, ${asText(body.startTime, 10)} to ${asText(body.endTime, 10)} in VENUE LOCAL TIME${
    asText(body.timeZoneLabel, 40) === '' ? '' : ` (${asText(body.timeZoneLabel, 40)})`
  }

BODIES IN PLAY: ${bodies}

AIRCRAFT IN PLAY: ${Array.isArray(body.drones) && body.drones.length > 0 ? body.drones.map((d) => asText(d, 80)).join(', ') : 'none, so every position must be "ground"'}

LENSES IN PLAY, use one of these ids:
${lenses}

MAP BOUNDS of the attached image, for your reference only, do not return coordinates in these units:
west ${String(bounds?.west)}, south ${String(bounds?.south)}, east ${String(bounds?.east)}, north ${String(bounds?.north)}

The attached image is the satellite view of this venue.
${renderSite(body.site)}
Return the JSON object now, and nothing else.`
}

/*
 * A Vercel Web Handler: one named export per HTTP method, taking a standard
 * Request and returning a standard Response.
 *
 * POST is the only export on purpose. Vercel routes by method and answers anything
 * else with 405 before this module is reached, so there is no method check here to
 * go stale. Verified against `vercel dev`: GET /api/generate returns 405.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      {
        status: 'error',
        message:
          'ANTHROPIC_API_KEY is not set. Copy .env.example to .env, add your own key, and run `vercel dev`.',
      },
      { status: 500 },
    )
  }

  let body: GenerateContext
  try {
    body = (await request.json()) as GenerateContext
  } catch {
    return Response.json({ status: 'error', message: 'Body was not JSON.' }, { status: 400 })
  }

  const image = typeof body.image === 'string' ? body.image : ''
  if (image === '') {
    return Response.json(
      { status: 'error', message: 'No map image was attached.' },
      { status: 400 },
    )
  }

  const mediaType = body.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: renderContext(body) },
          ],
        },
      ],
    })

    /*
     * Raw text, handed back untouched. The app parses it and, if that fails,
     * shows the user exactly this instead of a dead end error.
     *
     * The type filter is load bearing now that thinking is on: the response also
     * carries thinking blocks, and they must not reach the JSON parser. Their text
     * is empty by default in any case, since display is 'omitted' unless asked for.
     */
    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return Response.json({
      status: 'ok',
      raw,
      stopReason: response.stop_reason,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    })
  } catch (error) {
    // The message is surfaced, but nothing about the request is recorded.
    const message =
      error instanceof Anthropic.APIError
        ? `Anthropic API error ${error.status}: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Unknown error calling the Anthropic API.'
    return Response.json({ status: 'error', message }, { status: 502 })
  }
}
