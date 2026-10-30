/*
 * The tabs of the Sky card, in the order they are offered: four since the
 * field test of 30 Oct (docs/navigation.md). Sun, Moon and Night are swipe
 * pages of Now; Preview is the colour clock under Sky fire; Seasons is under
 * Calendar.
 */
export type SkyTab = 'now' | 'fire' | 'special' | 'calendar'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  /* Will the clouds light up, and what colour, at the next sunrise or sunset (SkyFire.tsx, SkyPreview.tsx). */
  { id: 'fire', label: 'Sky fire' },
  /* Special light this week: fog, rainbows, god rays, glassy water, sky fire (SpecialLight.tsx). */
  { id: 'special', label: 'Special' },
  { id: 'calendar', label: 'Calendar' },
]
