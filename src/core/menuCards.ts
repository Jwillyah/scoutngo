/*
 * THE MENU'S CARDS, LOOK D (Batch Flow, Section 8; board D_Menu): Weather
 * first, then the home's own cards in its order, Sky always among them; no
 * Moon (its page is a tap from Sky); the Drone only with drone tools, and
 * then always (Preflight's home), last when the home does not show it.
 */
export type MenuCard = 'weather' | 'sky' | 'surf' | 'wind' | 'tide' | 'drone'
export function menuCardList(home: readonly string[], drone: boolean): MenuCard[] {
  const out: MenuCard[] = ['weather']
  for (const c of home) if ((c === 'sky' || c === 'surf' || c === 'wind' || c === 'tide' || (c === 'drone' && drone)) && !out.includes(c)) out.push(c)
  if (!out.includes('sky')) out.splice(1, 0, 'sky')
  /* The Drone page is Preflight's home: with drone tools on (src/lib/activities.ts showsDrone) it is always here, after the home's own. */
  if (drone && !out.includes('drone')) out.push('drone')
  return out
}
