/* The pages of the Sky card, in the order they are offered. */
export type SkyTab = 'tonight' | 'sun' | 'moon' | 'calendar' | 'seasons' | 'exposure'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'sun', label: 'Sun' },
  { id: 'moon', label: 'Moon' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'seasons', label: 'Seasons' },
  /* The exposure playground: no venue in it, only a photo. Also opened from Kit. */
  { id: 'exposure', label: 'Exposure' },
]
