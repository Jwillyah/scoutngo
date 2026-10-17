import { bearingBetween, type LatLon } from '../core/geo.ts'

/**
 * WHERE THE GROUND VIEW STANDS AND WHICH WAY IT LOOKS.
 *
 * WHAT WAS REPORTED. "The borrowed ground view points the wrong way. It looks
 * from the venue pin towards my position, so at a building I get a wall from
 * ten feet away. That is backwards for what I need."
 *
 * THE FIRST VERSION'S REASONING WAS A TRUE FACT AND A WRONG CONCLUSION. There
 * is no Street View car at 200 feet, so it stood at the pin instead. But
 * Street View is at ground level wherever you ask from: asking at the
 * position's own coordinate returns the nearest road imagery to that spot,
 * which is "roughly where it will be looking from". The altitude was never the
 * thing that could be honoured, and standing somewhere else to avoid that was
 * answering a question nobody asked.
 *
 * SO IT IS THE SAME AIM A GROUND POSITION ALREADY HAS: stand at the position,
 * look at the subject. An air position differs only in that it says so.
 *
 * A TOP-DOWN AND A 360 HAVE NO CAMERA BEARING, by construction: one points at
 * the ground and the other at everything. They still get a view, aimed at the
 * subject, because what is around the subject is the useful part for both.
 */
export interface GroundViewAim {
  /** Where to ask for imagery. Always the position: never somewhere else. */
  from: LatLon
  /** Which way to look, or null when there is nothing to look at. */
  bearing: number | null
  /** Whether the card must say this is not the view from the aircraft. */
  disclose: boolean
}

export function groundViewAim(input: {
  at: LatLon
  subject: LatLon | null
  /** The measured camera bearing, which only a framed shot has. */
  cameraBearing: number | null
  air: boolean
}): GroundViewAim {
  const toSubject = input.subject === null ? null : bearingBetween(input.at, input.subject)

  /*
   * THE MEASURED BEARING WINS WHERE THERE IS ONE. For a framed shot it is the
   * forward azimuth turf computed, and recomputing it here from the same two
   * points would be a second answer to a question already answered.
   */
  const bearing = input.cameraBearing ?? toSubject

  return {
    from: input.at,
    bearing,
    /* Only an aircraft needs the disclaimer: a ground view of a ground
     * position is the view from where you will stand. */
    disclose: input.air && bearing !== null,
  }
}
