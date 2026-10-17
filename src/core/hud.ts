/**
 * HOW MUCH OF THE TOP OF THE SCREEN THE CONTROLS TAKE.
 *
 * WHAT WAS REPORTED. "Seven controls across two rows: Conditions, Hazards,
 * Cones, the Ground/Air switch, Sun arc, Sky. On a phone at a venue, in sun,
 * that is most of the top of the screen gone before I see any ground."
 *
 * Measured at 390x844: the row was 150px over THREE lines, 18 percent of the
 * screen, before any map.
 *
 * ONE LINE WAS ASKED FOR AS AN ALTERNATIVE AND IS NOT POSSIBLE. Laid end to
 * end the controls measure about 650px of legible text: Conditions 113,
 * Hazards 92, the platform switch 219 because it carries its counts, Sun arc
 * 87, Sky 121. A 390px phone cannot hold that, and the only way to shrink it
 * is to replace words with icons, which trades away the thing that makes a
 * control usable in bright sun for the thing that is already fixable another
 * way.
 *
 * SO IT COLLAPSES, and the choice is between those two honestly: the controls
 * are OCCASIONAL and the map is CONTINUOUS. The platform is set once, the
 * conditions are glanced at, the hazards are marked once. The ground is looked
 * at the whole time.
 *
 * WHAT STAYS VISIBLE WHEN COLLAPSED is the platform switch, and it is the only
 * one that earns it: it is the only control here that changes what the NEXT
 * TAP DOES rather than what is drawn, and it carries the counts that say
 * whether the filter is hiding anything. Collapsed, the row is the switch and
 * one button: about 270px, which IS one line, so the answer turns out to be
 * both.
 *
 * COLLAPSED ONCE THERE IS A POSITION, because that is what "once I have set
 * it" means in a state the app can actually observe. Before the first
 * position the shooter is still deciding what the shoot is, and that is
 * exactly when the controls are being used.
 */

export type HudState = 'open' | 'collapsed'

/**
 * Whether the row should be collapsed, given the plan and any explicit choice.
 *
 * The override is remembered for the session and WINS. Somebody who opened the
 * row while holding six positions wants it open; re-collapsing it on them
 * because a rule says so is the app arguing.
 */
export function hudState(positionCount: number, override: HudState | null): HudState {
  if (override !== null) return override
  return positionCount > 0 ? 'collapsed' : 'open'
}

/** What the expand button says, so it is never a bare glyph. */
export function hudToggleLabel(state: HudState): string {
  return state === 'collapsed' ? 'More' : 'Less'
}
