/* Types for the gate's fixtures (fixtures.mjs), for the tests that read them (tests/tfrApi.test.ts). */
export const TILE_DIR: string
export const FIXTURE_NOW: Date
export function fixtureElevation(lat: number, lon: number): number
export function answer(href: string): Promise<{ status: number; type: string; body: Uint8Array; fixture: string }>
