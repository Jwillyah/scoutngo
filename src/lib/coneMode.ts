/*
 * WHICH COVERAGE CONES THE MAP DRAWS.
 *
 * THE TYPE OUTLIVED ITS COMPONENT. It was declared in ConePicker.tsx, a
 * disclosure that sat over the map; the shell rebuild made Layers a card of
 * tiles and the picker was never rehomed, so the file became a component
 * nothing rendered that two modules still imported a type from.
 *
 * 'all' or 'none' is the Cones tile. Isolating a single position is a
 * separate piece of state (isolatedId) set from that position's own card,
 * because "only this one" is a question about one position and belongs on
 * the card about it.
 */
export type ConeMode = 'all' | 'none'
