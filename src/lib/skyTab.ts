/*
 * The tabs of the Sky card, in the order they are offered: four since the
 * field test of 30 Oct (docs/navigation.md), and Weather since Batch K. Sun, Moon and Night are swipe
 * pages of Now; Preview is the colour clock under Sky fire; Seasons is under
 * Calendar.
 */
export type SkyTab = 'now' | 'weather' | 'fire' | 'special' | 'calendar'

export const SKY_TABS: readonly { id: SkyTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  /* Will the clouds light up, and what colour, at the next sunrise or sunset (SkyFire.tsx, SkyPreview.tsx). */
  { id: 'fire', label: 'Sky color' },
  /* The forecast for this spot: six models corrected against the stations here, blended (Batch K, WeatherTab.tsx). Sky opens here (addendum A). */
  { id: 'weather', label: 'Weather' },
  /* Special light this week: fog, rainbows, god rays, glassy water, sky fire (SpecialLight.tsx). */
  { id: 'special', label: 'Special' },
  { id: 'calendar', label: 'Calendar' },
]
