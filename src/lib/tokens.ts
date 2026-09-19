/**
 * Reads a design token at runtime.
 *
 * MapLibre paint properties are set in JavaScript, but the colors still belong
 * in tokens.css. This pulls them off the DOM so there is exactly one place a
 * color is defined, including the ones drawn on the map.
 *
 * READ FROM THE ELEMENT, NOT FROM :root. Accents are overridden per screen:
 * SETUP redefines --color-accent on .shell--setup so the whole screen turns
 * lime. Reading the document element skips that override entirely and returns
 * the white defined at the root, which is how the reach ring came out white on a
 * lime screen while every chip beside it was correct.
 */
export function readToken(
  name: string,
  fallback = '#000000',
  from?: Element | null,
): string {
  if (typeof document === 'undefined') return fallback
  const element = from ?? document.documentElement
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}
