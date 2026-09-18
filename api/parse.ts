import Anthropic from '@anthropic-ai/sdk'

/*
 * ===========================================================================
 * THIS FUNCTION LOGS NOTHING. DELIBERATELY. Same rule as generate.ts.
 *
 * The text it receives is a description of where a specific person will be
 * standing on a specific day, which is the same category of information the
 * whole privacy stance in README.md exists to protect. Not the request, not the
 * response, not on the error path. It writes to no database and no filesystem.
 *
 * Debug with `vercel dev`, not with a log line.
 * ===========================================================================
 */

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 2000
const EFFORT = 'low' as const

/*
 * THE MODEL RETURNS A PLACE NAME. IT NEVER RETURNS COORDINATES.
 *
 * This is the central rule of the project applied to a new surface. A model
 * asked for a latitude will happily produce one, it will look exactly like a
 * real coordinate, and it will sometimes be a field three towns away. The app
 * geocodes the name through Nominatim, which is a lookup rather than a guess,
 * and shows every match rather than picking one.
 *
 * Dates are the same division. The model reports what the text SAID, "saturday",
 * and src/core/when.ts works out which Saturday against the venue's own clock.
 */
const SYSTEM_PROMPT = `You read a photographer's plain description of a shoot and turn it into structured fields.

OUTPUT FORMAT. Return a single JSON object and nothing else. No prose before or after. No markdown code fences. No explanation.

{"venueSearch":"","date":"","startTime":"","endTime":"","eventBrief":"","wantOut":""}

FIELD RULES:

- venueSearch: a PLACE NAME to look up in a geocoder, exactly as a person would type it into a map search. Include the town and state or country if the text gives them. Examples: "Brew River Dock Bar, Salisbury, MD", "Brighton Pier, UK".
  NEVER return coordinates. No latitude, no longitude, no decimal degrees, no grid references. You do not know where this place is and you must not appear to. The application looks the name up. A made up coordinate is the single worst thing you can return here.
  If the text names no place at all, return "".

- date: if the text gives a real calendar date, return it as YYYY-MM-DD. If it gives a relative day, return ONE of exactly these lowercase tokens and nothing else: today, tomorrow, monday, tuesday, wednesday, thursday, friday, saturday, sunday, next monday, next tuesday, next wednesday, next thursday, next friday, next saturday, next sunday.
  Do NOT work out what date a weekday falls on. You do not know today's date at the venue. Report the word, the application does the calendar.
  If there is no day at all, return "".

- startTime, endTime: 24 hour HH:MM. Use ordinary sense about a shoot: "11 to 3" is 11:00 to 15:00, "7 til dusk" starts 19:00. If a time is genuinely absent, return "".

- eventBrief: what actually happens at this event, in plain language, for a photographer who has never been. AT MOST 60 WORDS. Only what the text supports. Do not invent crowds, boats, stages or weather that were not mentioned.

- wantOut: what the shooter says they want out of it, including format and length if stated. AT MOST 40 WORDS. Again only what the text supports.

If the text is too vague for a field, return an empty string for that field. An empty field is correct and useful. A confident guess is not.

Return the JSON object now, and nothing else.`

interface ParseBody {
  text?: unknown
}

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

  let body: ParseBody
  try {
    body = (await request.json()) as ParseBody
  } catch {
    return Response.json({ status: 'error', message: 'Body was not JSON.' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.slice(0, 4000).trim() : ''
  if (text === '') {
    return Response.json(
      { status: 'error', message: 'Nothing to read. Describe the shoot first.' },
      { status: 400 },
    )
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    })

    // Raw text, handed back untouched, parsed and capped in src/lib/describe.ts.
    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return Response.json({ status: 'ok', raw, stopReason: response.stop_reason })
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
