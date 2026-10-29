/* The pages of the Sky card, in the order they are offered. */
export type SkyTab = 'tonight' | 'sun' | 'moon' | 'calendar' | 'seasons'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  /* The night: tonight's sky and, under it, the next thirty nights for the Milky Way (moved from Calendar, 29 Oct). */
  { id: 'tonight', label: 'Night' },
  { id: 'sun', label: 'Sun' },
  { id: 'moon', label: 'Moon' },
  /* Opens the month as a calendar, a page of its own (CalendarPage.tsx). */
  { id: 'calendar', label: 'Calendar' },
  { id: 'seasons', label: 'Seasons' },
]
