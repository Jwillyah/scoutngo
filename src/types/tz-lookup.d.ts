/**
 * tz-lookup ships no types. It is a single CommonJS function over a packed table
 * of timezone boundaries, with no dependencies and no network access, which is
 * exactly what resolving a venue's timezone offline needs.
 *
 * `export =` because that is literally what the module does: `module.exports =
 * tzlookup`, one function and no named exports. The default import in
 * src/core/timezone.ts reaches it through the usual CommonJS interop.
 *
 * This file has to be visible to BOTH tsconfig projects. tsconfig.app.json picks
 * it up through `include: ["src"]`; tsconfig.node.json names `src/types`
 * explicitly, because the tests it compiles import from src/ and would otherwise
 * see tz-lookup as untyped in that project alone.
 */
declare module 'tz-lookup' {
  /**
   * The IANA timezone name for a coordinate, for example "America/New_York".
   * Throws on a coordinate that is not a finite number in range.
   */
  function tzlookup(latitude: number, longitude: number): string
  export = tzlookup
}
