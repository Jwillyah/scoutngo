/* About's words (Batch DRONE, Section 5; docs/mockups/About_Story.png), word for word from the board. Never "no account". */
export const ABOUT_HEAD = 'One check before you go outside.'
export const ABOUT_STORY =
  "I'm a photographer and surfer in Virginia Beach. Every morning I flipped through nine apps to answer one question: is it worth going out, and where? ScoutNGo puts it in one look: the best sunset spot near you from the real clouds, wind at 400 ft and your airspace ceiling, plus surf, tide and wind."
export const ABOUT_DIFFERENT: readonly { key: string; lead: string; rest: string }[] = [
  { key: 'where', lead: 'Where, not just whether.', rest: 'It names the spot and the direction to look.' },
  { key: 'checks', lead: 'It checks itself.', rest: 'Every call is compared to what really happened. Hits and misses are public.' },
  { key: 'one', lead: 'All in one.', rest: 'Surf, light, drone, tide and wind from the same data.' },
  { key: 'free', lead: 'Free and open source.', rest: 'No ads, no tracking. Your spots stay on your phone.' },
]
