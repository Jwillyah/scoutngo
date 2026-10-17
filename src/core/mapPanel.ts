/**
 * WHICH PANEL IS OPEN OVER THE MAP. At most one, by construction.
 *
 * WHAT WAS REPORTED. "I opened Marking and the Weather panel is rendered
 * underneath it, bleeding through, with both scrolling."
 *
 * THE OLD SHAPE WAS TWO BOOLEANS, `marking` and `showSky`, each owned by a
 * different button. Two booleans have four states and only three of them are
 * legal, so "one at a time" was a thing each button had to remember to do and
 * neither did. Asking every new panel to remember it is how the fourth one
 * gets added in six months and the bug comes back in new clothes.
 *
 * ONE VALUE HAS NO ILLEGAL STATE. There is nothing for a button to remember
 * and nothing for a reviewer to check, because `'hazards' | 'sky'` cannot
 * hold both. This is the same move as the Aim union, which made a camera
 * bearing on a 360 unrepresentable rather than merely unlikely.
 *
 * THE SHEET IS NOT IN HERE, deliberately. It is not a panel over the map: it
 * is the bottom of the screen, it has its own detents, and the map is laid out
 * around it rather than under it. Opening it does not hide the map. What the
 * audit checks is that it does not END UP over the map controls, which is a
 * different question and is asked separately.
 */
export type MapPanel = 'none' | 'hazards' | 'sky'

export const MAP_PANELS: readonly Exclude<MapPanel, 'none'>[] = ['hazards', 'sky'] as const

/**
 * Toggling a panel: tapping the open one closes it, tapping another swaps.
 *
 * SWAPS RATHER THAN REFUSES. A shooter who taps Hazards while the sky key is
 * open wants hazards; making them close the other one first is an extra tap to
 * enforce a rule they did not break.
 */
export function togglePanel(current: MapPanel, wanted: Exclude<MapPanel, 'none'>): MapPanel {
  return current === wanted ? 'none' : wanted
}

/**
 * Whether the sky LAYER is painted.
 *
 * TIED TO THE PANEL, and the reason is that the key is not decoration: the
 * cells are a model, the colours mean nothing without the band key, and the
 * layer's own zoom warning lives there. A painted layer with its key closed is
 * a wash of colour with no way to find out what it means, which is the state
 * the sky layer was reported as being in before it had a key at all.
 */
export function skyLayerOn(panel: MapPanel): boolean {
  return panel === 'sky'
}
