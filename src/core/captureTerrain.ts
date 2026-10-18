/*
 * WHY A GENERATED PLAN IS MADE FROM A FLAT MAP, EVEN WITH TERRAIN ON.
 *
 * ESTABLISHED, NOT ASSUMED. Generation works by unprojecting normalised image
 * coordinates against the camera that took the image, and the whole method
 * rests on that inversion being exact. It is exact under pitch and rotation on
 * a flat map, which is what the projection audit has always proved. With
 * terrain enabled it is not.
 *
 * THE NUMBERS, at Skyline Drive in Shenandoah, zoom 13, using the exact
 * pattern the real code uses: record a camera, let the map move, then snap
 * back and invert in a single tick with no frame drawn in between.
 *
 *   terrain off    bearing   0   0.0 px      terrain on    0.0 px
 *   terrain off    bearing  40   0.0 px      terrain on    0.0 px
 *   terrain off    bearing 135   0.0 px      terrain on   34.4 px
 *   terrain off    bearing 250   0.0 px      terrain on   56.7 px
 *
 * THE MECHANISM, because it decides the fix. unproject is self-consistent
 * either way: asking twice for the same pixel at the same camera gives the
 * same coordinate to the metre. It is project that disagrees with it, and only
 * when no frame has been drawn since the camera moved. MapLibre resolves
 * elevation for projection against terrain state that a render pass updates,
 * and the inversion deliberately draws no frame: drawing one is what would
 * make the map visibly jump to the old camera and back in front of the
 * shooter. Fifty-seven pixels at capture resolution is hundreds of metres of
 * ground at this zoom, which is a position in the wrong valley.
 *
 * SO THE IMAGE IS TAKEN FLAT. Terrain is switched off for the moment of
 * capture, the frame is redrawn, the image is encoded, and terrain goes back
 * on. The model then sees exactly the projection the coordinates are inverted
 * against, which is the property the whole approach needs, and the inversion
 * is back to zero drift.
 *
 * AND THE APP SAYS SO. A plan generated from a flattened map is a plan made
 * without the ridge in the picture, and on a Shenandoah venue that is worth
 * knowing: the model could not see that a position is over a drop. Saying
 * nothing would make this a silent downgrade, which is the kind of thing this
 * app does not do.
 */

/** Shown wherever a generated plan is presented, when terrain was flattened. */
export const CAPTURE_FLATTENED_NOTE =
  'Terrain was flattened for the image this plan was generated from, so the ' +
  'model did not see the elevation. Positions are placed on the map, not on ' +
  'the hillside. Check them with terrain on before you drive out.'

/**
 * Why, in one line, for a place with no room for the paragraph.
 *
 * Deliberately says the measurement exists rather than quoting it: a number
 * in a status line invites the reader to judge whether 54 pixels matters,
 * which is not a question they have the context to answer standing in a car
 * park.
 *
 * THE NUMBER, RE-MEASURED: measurements/2026-10-18-terrain-capture-drift.md.
 * At a SETTLED camera the round trip is exact -- 0.0 px at every pitch. The
 * drift appears only when `project` is asked about a camera no frame has been
 * drawn for, which is the sequence a capture performs: 54.4 px at 45 degrees
 * of pitch, 324.5 at 60, and 381 at 75. The comment used to say 57 and that
 * was sound for the middle of the range; it did not say that the same
 * sequence is seven times worse at the pitch this app now allows.
 */
export const CAPTURE_FLATTENED_SHORT = 'Generated from a flattened map.'

/**
 * WHETHER THE NOTE APPLIES.
 *
 * A function rather than a bare boolean because the condition is not "is
 * terrain on now" but "was it on when the image was taken". Turning terrain
 * off after generating does not make the plan any more informed about the
 * ridge than it was.
 */
export function captureWasFlattened(capture: { flattenedTerrain: boolean } | null): boolean {
  return capture?.flattenedTerrain === true
}
