/**
 * Reads a design token at runtime.
 *
 * MapLibre paint properties are set in JavaScript, but the colors still belong
 * in tokens.css. This pulls them off the document element so there is exactly
 * one place a color is defined, including the ones drawn on the map.
 */
export function readToken(name: string, fallback = '#000000'): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}
