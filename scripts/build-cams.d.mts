/* Types for scripts/build-cams.mjs, for tests/camsJson.test.ts. */
import type { CamEntry } from '../src/core/camPick.ts'

export declare const TAGS: readonly ['sky', 'surf', 'road']
export declare function buildCams(): CamEntry[]
export declare function camsJsonText(cams: readonly CamEntry[]): string
