/* The pages of the Sky card, in the order they are offered. */
export type SkyTab = 'tonight' | 'sun' | 'moon' | 'calendar' | 'seasons'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'sun', label: 'Sun' },
  { id: 'moon', label: 'Moon' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'seasons', label: 'Seasons' },
]
