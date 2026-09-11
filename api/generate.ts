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

WHAT YOU DECIDE: where a shooter should stand, what the shot is, why that vantage is worth standing in, and what the risk is. That is judgement, and it is the only thing you are asked for.

WHAT YOU MUST NOT DECIDE: anything geometric or photometric. Do not state or imply whether a position is backlit, front-lit, side-lit, sunlit, shaded, in golden hour, or facing the sun. Do not give bearings, angles, degrees, field of view, or distances. The application computes all of that from your coordinates using tested code, and it discards any lighting or geometry claim you make. Writing one wastes your token budget and changes nothing.

You are GIVEN the sun's position below as fact. Use it to choose where to stand. Do not recompute it, restate it, or report what it implies.

OUTPUT FORMAT. Return a single JSON object and nothing else. No prose before or after. No markdown code fences. No explanation.

{"positions":[{"x":0.0,"y":0.0,"lensId":"","focalLength":0,"shot":"","risk":"","angleRationale":"","platform":"ground","altitudeFeet":0}]}

FIELD RULES, all mandatory:
- x, y: numbers from 0 to 1, the position in the image. x is left to right, y is top to bottom.

WHERE A SHOOTER CAN STAND. When a SITE GEOMETRY block is present it is real OpenStreetMap data for this exact view, in [longitude, latitude] pairs, and it is authoritative over what you think you see in the image. Use it:
- NEVER place a position inside a water ring. A person cannot stand on a river.
- NEVER place a position on a road centreline. That is standing in traffic.
- Piers, parking areas, and the ground beside buildings are all good places to stand.
The application checks every position you return against this same geometry and flags the ones in water or in a roadway, so a bad placement is visible immediately rather than silently accepted.
- lensId: exactly one of the optic ids listed in the context. Do not invent one. GROUND positions must use a ground lens id. AIR positions must use a drone camera id. They are not interchangeable.
- focalLength: millimetres, within that optic's listed range. A drone camera has ONE focal length and no range: use exactly the number listed. Any other value for an air position is rejected outright and the position is thrown away.
- shot: what to capture from here. AT MOST 25 WORDS. Hard limit.
- risk: what could go wrong here, such as access, crowds, obstruction, or distance. AT MOST 15 WORDS. Hard limit.
- angleRationale: why THIS vantage is worth standing in, rather than anywhere else. AT MOST 15 WORDS. Hard limit. Say what the position gives you: a clean background, a line of pilings running away from camera, separation from the crowd, a foreground element, the light coming across the subject. Do not name a compass bearing, a degree, or a lighting class.
- platform: "ground" or "air". Use "air" ONLY if a drone is listed in the kit below. An air position is a hover point, so it may sit over water or a road.
- altitudeFeet: for "air", height above ground in feet, no more than 400, which is the FAA ceiling. For "ground", 0.

HOW FAR TO STAND BACK. Each optic below carries a MAX STANDOFF in metres, computed by the application for that optic. Do not exceed it. A position beyond it frames so much ground that the subject is a speck, and it is flagged as an error in the app. Closer is usually better: pick the shortest standoff that still gets the shot and still clears the obstacles.

VARY THE RANGE. Do not park every position at its maximum standoff. A plan that is six versions of "as far back as this lens allows" has no near work in it. Include at least one position in the closer half of its optic's range. The application measures this and reports a plan that is entirely parked at the back.

COVERAGE IS A HARD REQUIREMENT, and it is measured. The application computes the compass bearing FROM the subject TO each position you return, and checks how they are distributed. Two rules:

1. THREE SECTORS. Divide the compass around the subject into four quadrants: NE is 0 to 90, SE is 90 to 180, SW is 180 to 270, NW is 270 to 360. Your positions must fall in AT LEAST THREE different quadrants. A plan landing in fewer is reported to the user as a cluster, with the count shown.

2. ONE ON THE FAR SIDE. At least one position must sit on the opposite side of the subject from where the majority sit, more than 90 degrees away from them. If five positions are south of the subject, one must be north of it.

These are requirements about GEOMETRY, not about light, and they win when the two conflict. Work out where the subject is, then deliberately walk around it and choose the best vantage available in each quadrant.

WHERE THE LIGHT WANTS YOU. The sun's compass bearing is given below for three moments in the window. A camera whose view direction is roughly 135 to 180 degrees away from the sun's bearing has the sun behind it and the subject lit from the front. Prefer those vantages WHEN CHOOSING BETWEEN TWO POSITIONS IN THE SAME QUADRANT. Never use light as a reason to leave a quadrant empty.

The far side position will usually be shooting into the sun. Propose it anyway. Backlight is a real choice: rim light on spray, a boat wake lit from behind, a crowd in silhouette against water. The application computes and labels the lighting itself, honestly, so a backlit position is offered as what it is rather than hidden. A plan with one strong backlit angle is better than six safe front-lit ones from the same bank.

Respect the shooter's stated style and the optics they actually brought.

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
  optics?: unknown
  drones?: unknown
  sun?: unknown
  subjectPoint?: unknown
  imageNorthBearing?: unknown
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

const num = (value: unknown): string => (typeof value === 'number' ? String(value) : '?')

/**
 * The optics, each with the standoff the app computed for it. A fixed focal
 * length drone camera is rendered as one number rather than a range, because
 * writing "24mm to 24mm" invites the model to read it as a zoom.
 */
function renderOptics(list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) return '(none supplied)'
  return list
    .map((entry) => {
      const optic = entry as Record<string, unknown>
      const min = optic.minFocalLength
      const max = optic.maxFocalLength
      const fixed = min === max
      const kind = optic.kind === 'drone' ? 'DRONE CAMERA, air positions only' : 'ground lens'
      const focal = fixed
        ? `FIXED at ${num(min)}mm, this is not a zoom`
        : `${num(min)}mm to ${num(max)}mm`
      const standoff = fixed
        ? `max standoff ${num(optic.maxStandoffAtMin)}m`
        : `max standoff ${num(optic.maxStandoffAtMin)}m at ${num(min)}mm, ${num(optic.maxStandoffAtMax)}m at ${num(max)}mm`
      return `- id "${asText(optic.id, 60)}": ${asText(optic.name, 80)}, ${kind}, ${focal}. ${standoff}.`
    })
    .join('\n')
}

/**
 * Sun position across the window, as fact. Computed by src/core/sun.ts from the
 * venue's own timezone before this request was made.
 */
function renderSun(list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) {
    return 'SUN: not available for this window. Place positions on the merits of the view alone.'
  }
  const rows = list
    .map((entry) => {
      const fact = entry as Record<string, unknown>
      return `- ${asText(fact.label, 20)} ${asText(fact.clock, 10)}: sun bearing ${num(fact.azimuth)} degrees, altitude ${num(fact.altitude)} degrees`
    })
    .join('\n')
  return `SUN THROUGH THE WINDOW, computed by the application. These are facts, not estimates.\n${rows}\nBearing is a compass direction: 0 is north, 90 east, 180 south, 270 west. Altitude below 0 means the sun is down.`
}

/**
 * Which way the image is oriented, and where the subject is in it.
 *
 * THE MISSING LINK. Sun bearings are compass degrees; the model is looking at a
 * picture. Without being told which way north points in that picture it cannot
 * connect the two, and has to guess where "away from the sun" is on the image.
 * The subject point is the centre the coverage quadrants are measured around.
 */
function renderFraming(body: GenerateContext): string {
  const north = typeof body.imageNorthBearing === 'number' ? body.imageNorthBearing : 0
  const orientation =
    Math.abs(((north + 180) % 360) - 180) < 1
      ? 'NORTH IS STRAIGHT UP in this image. East is right, south is down, west is left.'
      : `This image is ROTATED: compass bearing ${north.toFixed(0)} degrees points toward the top of the image. Work out the other directions from that before placing anything.`

  const point = body.subjectPoint as { x?: unknown; y?: unknown } | undefined
  const subject =
    typeof point?.x === 'number' && typeof point?.y === 'number'
      ? `THE SUBJECT IS AT x=${point.x.toFixed(3)}, y=${point.y.toFixed(3)} in the image. Every coverage quadrant is measured outward from that exact point, so place your positions around it, not around the centre of the frame.`
      : 'The subject is at the centre of the venue. Place your positions around it.'

  return `IMAGE ORIENTATION. ${orientation}\n${subject}`
}

/** Renders the context the app sent into the user turn. */
function renderContext(body: GenerateContext): string {
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

${renderFraming(body)}

${renderSun(body.sun)}

AIRCRAFT IN PLAY: ${Array.isArray(body.drones) && body.drones.length > 0 ? body.drones.map((d) => asText(d, 80)).join(', ') : 'none, so every position must be "ground"'}

OPTICS IN PLAY, use one of these ids:
${renderOptics(body.optics)}

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
