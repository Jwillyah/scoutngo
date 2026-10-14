/*
 * GROUND, AIR, OR BOTH.
 *
 * One choice that decides what the map shows AND what a generate asks for.
 * Those two have to be the same choice, or the filter becomes a thing you set
 * and then have to remember you set: ask for air only, generate, and get a
 * plan full of ground positions that are immediately hidden from you.
 *
 * It is in core because it is a predicate, and because both the view and the
 * request have to apply the identical one. Two copies of "does this count"
 * drift, and the way that drift shows up is a position you can see but cannot
 * edit, or one in the plan that never appears.
 */

/** What a camera is standing on. Matches Platform in src/lib/parsePlan.ts. */
export type Platform = 'ground' | 'air'

export type PlatformFilter = 'both' | 'ground' | 'air'

/** Left to right, in the order the control shows them. */
export const PLATFORM_FILTERS: readonly PlatformFilter[] = ['both', 'ground', 'air'] as const

export const DEFAULT_PLATFORM_FILTER: PlatformFilter = 'both'

export const PLATFORM_FILTER_LABEL: Record<PlatformFilter, string> = {
  both: 'Both',
  ground: 'Ground',
  air: 'Air',
}

/** THE predicate. Everything that filters anything goes through this. */
export function showsPlatform(filter: PlatformFilter, platform: Platform): boolean {
  return filter === 'both' || filter === platform
}

/** What a generate is allowed to come back with. */
export function allowedPlatforms(filter: PlatformFilter): Platform[] {
  return (['ground', 'air'] as const).filter((platform) => showsPlatform(filter, platform))
}

/**
 * The same predicate over a list. Generic over anything carrying a platform, so
 * it works on a raw position and on a planned one without a second version.
 */
export function filterByPlatform<T extends { platform: Platform }>(
  list: T[],
  filter: PlatformFilter,
): T[] {
  return list.filter((item) => showsPlatform(filter, item.platform))
}

/**
 * How many of each are there, which is what lets the control say "4 / 1"
 * rather than offering a tab that turns out to be empty.
 */
export function platformCounts<T extends { platform: Platform }>(
  list: T[],
): Record<Platform, number> {
  return {
    ground: list.filter((item) => item.platform === 'ground').length,
    air: list.filter((item) => item.platform === 'air').length,
  }
}

/**
 * Whether a filter is hiding anything, and how much.
 *
 * SO IT CAN SAY SO. A filter that silently hides four positions is how someone
 * walks out of the house with a plan missing most of the day. The control shows
 * this number when it is not zero.
 */
export function hiddenByFilter<T extends { platform: Platform }>(
  list: T[],
  filter: PlatformFilter,
): number {
  return list.length - filterByPlatform(list, filter).length
}
