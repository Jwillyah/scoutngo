/* The pages of the Sky card, in the order they are offered. */
export type SkyTab = 'tonight' | 'sun' | 'fire' | 'preview' | 'special' | 'moon' | 'calendar' | 'seasons'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  /* The night: tonight's sky and, under it, the next thirty nights for the Milky Way (moved from Calendar, 29 Oct). */
  { id: 'tonight', label: 'Night' },
  { id: 'sun', label: 'Sun' },
  /* Will the clouds light up at the next sunrise or sunset (SkyFire.tsx, 29 Oct). */
  { id: 'fire', label: 'Fire' },
  /* What colour the clouds go, minute by minute: the colour clock (SkyPreview.tsx, 29 Oct). */
  { id: 'preview', label: 'Preview' },
  /* Special light this week: fog, rainbows, god rays, glassy water, sky fire (SpecialLight.tsx, 29 Oct). */
  { id: 'special', label: 'Special' },
  { id: 'moon', label: 'Moon' },
  /* Opens the month as a calendar, a page of its own (CalendarPage.tsx). */
  { id: 'calendar', label: 'Calendar' },
  { id: 'seasons', label: 'Seasons' },
]
