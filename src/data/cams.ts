import type { LatLon } from '../core/geo.ts'

/*
 * SKY CAMERAS, AS A FILE IN THIS REPO.
 *
 * WHY A FILE AND NOT AN API. This is the whole privacy point, not a fallback
 * because no keyless cam API exists. Any cam service would need the venue
 * coordinate sent somewhere to answer "which cameras are near me". Shipping
 * the list means that question is answered on the device, against data already
 * in the bundle, and the venue coordinate never leaves. There is no key, no
 * account, no cost, and no request until you deliberately tap a link.
 *
 * WHAT THIS APP DOES WITH A CAM: ranks it, and offers the link. Nothing else.
 *
 *   LINK OUT ONLY. Never embedded in an iframe, never proxied through our own
 *   function, never a manifest or a stream pulled for a thumbnail, and never a
 *   frame saved anywhere, including into an offline field pack. Opening a cam
 *   is you visiting that operator's site, in your browser, with whatever that
 *   entails between you and them. The app's involvement ends at the href.
 *
 * ADDING YOUR OWN. Append an entry. Six fields, no build step, no coordinate
 * lookup service: a lat and lon off any map is fine, because the only thing
 * they are used for is ranking by direction and distance, where a few hundred
 * metres changes nothing. The README has the walkthrough. This file is the
 * easiest thing in the project to contribute to, which is deliberate.
 *
 * ON THE COORDINATES BELOW. They are the cam's location to within a few
 * hundred metres, which is what the upwind ranking needs: a cam is useful
 * because it is twenty kilometres upwind, and twenty kilometres is not
 * sensitive to which end of a pier the camera is bolted to.
 *
 * ON THE URLS BELOW. Every one was requested before being committed and
 * returned 200, except the two Surfline pages: Surfline answers 403 to any
 * automated request, so those two are the operator's own published cam pages
 * and could not be machine checked. They are marked paid, which is the thing
 * that matters most about them.
 */

export interface Cam {
  /** Stable, because the ranking is keyed by it. Never reused. */
  id: string
  name: string
  at: LatLon
  /** Opened in a new tab. Nothing fetches it. */
  url: string
  /** Who runs it, so you know whose site you are about to land on. */
  operator: string
  /**
   * Whether watching it costs money.
   *
   * Stated rather than discovered by tapping. A paid cam is not worse, but
   * finding out it is paid by arriving at a paywall at 05:40 is.
   */
  access: 'free' | 'paid'
  /**
   * What it looks at. Absent is 'coast', every entry written before roads
   * existed. A road entry is a state transport department's own map of its
   * traffic cameras: for the drive in, and for the weather at road level.
   */
  kind?: 'coast' | 'road'
}

export function camKind(cam: Cam): 'coast' | 'road' {
  return cam.kind ?? 'coast'
}

/**
 * Seeded with the mid-Atlantic coast, which is where this app is used.
 *
 * Not meant to be complete, or even to stay accurate: a cam goes offline and
 * nobody tells us. A link that does not work is a bad entry to fix or delete,
 * which is a one line change anybody can make.
 */
export const CAMS: readonly Cam[] = [
  /* ---------------------------------------------------- SurfChex, Virginia */
  {
    id: 'surfchex-sandbridge',
    name: 'Sandbridge',
    at: { lat: 36.725, lon: -75.94 },
    url: 'https://surfchex.com/cams/sandbridge-va/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-virginia-beach',
    name: 'Virginia Beach Pier',
    at: { lat: 36.839, lon: -75.968 },
    url: 'https://surfchex.com/cams/virginia-beach-web-cam/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-norfolk',
    name: 'Norfolk',
    at: { lat: 36.85, lon: -76.29 },
    url: 'https://surfchex.com/cams/norfolk-va/',
    operator: 'SurfChex',
    access: 'free',
  },

  /* ----------------------------------------------- SurfChex, Outer Banks */
  {
    id: 'surfchex-kitty-hawk',
    name: 'Kitty Hawk',
    at: { lat: 36.064, lon: -75.706 },
    url: 'https://surfchex.com/cams/kitty-hawk-nc/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-nags-head',
    name: 'Nags Head',
    at: { lat: 35.957, lon: -75.624 },
    url: 'https://surfchex.com/cams/nags-head-web-cam/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-rodanthe',
    name: 'Rodanthe',
    at: { lat: 35.594, lon: -75.467 },
    url: 'https://surfchex.com/cams/rodanthe-web-cam/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-waves',
    name: 'Waves, oceanside',
    at: { lat: 35.568, lon: -75.463 },
    url: 'https://surfchex.com/cams/waves-nc-oceanside/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-avon',
    name: 'Avon',
    at: { lat: 35.352, lon: -75.51 },
    url: 'https://surfchex.com/cams/avon/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-hatteras',
    name: 'Hatteras',
    at: { lat: 35.22, lon: -75.69 },
    url: 'https://surfchex.com/cams/hatteras-web-cam/',
    operator: 'SurfChex',
    access: 'free',
  },
  {
    id: 'surfchex-ocracoke',
    name: 'Ocracoke',
    at: { lat: 35.115, lon: -75.985 },
    url: 'https://surfchex.com/cams/ocracoke-nc-live-web-cam-surfchex/',
    operator: 'SurfChex',
    access: 'free',
  },

  /* ------------------------------------------- Outer Banks pier operators */
  {
    id: 'avalon-pier',
    name: 'Avalon Pier',
    at: { lat: 36.023, lon: -75.668 },
    url: 'https://avalonpier.com/piercam/',
    operator: 'Avalon Pier',
    access: 'free',
  },
  {
    id: 'nags-head-pier',
    name: 'Nags Head Pier',
    at: { lat: 35.948, lon: -75.595 },
    url: 'https://nagsheadpier.com/pier-cam',
    operator: 'Nags Head Pier',
    access: 'free',
  },
  {
    id: 'outer-banks-fishing-pier',
    name: 'Outer Banks Fishing Pier',
    at: { lat: 35.925, lon: -75.595 },
    url: 'https://www.fishingunlimited.net/pier-cam.html',
    operator: 'Outer Banks Fishing Pier',
    access: 'free',
  },

  /* ------------------------------------------------------------- Surfline */
  /*
   * PAID, and the two URLs here could not be machine checked: Surfline
   * answers 403 to any automated request, so these are their own published
   * cam pages rather than something verified the way every other entry was.
   */
  {
    id: 'surfline-virginia-beach',
    name: 'Virginia Beach',
    at: { lat: 36.853, lon: -75.977 },
    url: 'https://www.surfline.com/surf-reports-forecasts-cams/united-states/virginia/2141249',
    operator: 'Surfline',
    access: 'paid',
  },
  {
    id: 'surfline-outer-banks',
    name: 'Outer Banks',
    at: { lat: 35.957, lon: -75.624 },
    url: 'https://www.surfline.com/surf-reports-forecasts-cams/united-states/north-carolina/2141250',
    operator: 'Surfline',
    access: 'paid',
  },

  /*
   * ------------------------------------------------- roads: the state maps
   *
   * Each is the department's own public map of its traffic cameras, pinned
   * at the stretch of road it covers nearest the coast. They are maps of many
   * cameras, named as such, so the pin is where to look on that map rather
   * than one camera's position. Requested 2026-10-25 and returned 200.
   */
  {
    id: 'vdot-511-virginia-beach',
    name: 'VDOT 511 camera map, Virginia Beach',
    at: { lat: 36.845, lon: -76.03 },
    url: 'https://511.vdot.virginia.gov/',
    operator: 'Virginia DOT',
    access: 'free',
    kind: 'road',
  },
  {
    id: 'md-chart-us50',
    name: 'Maryland CHART camera map, US 50',
    at: { lat: 38.36, lon: -75.55 },
    url: 'https://chart.maryland.gov/',
    operator: 'Maryland CHART',
    access: 'free',
    kind: 'road',
  },
  {
    id: 'deldot-route-1',
    name: 'DelDOT camera map, Route 1',
    at: { lat: 38.7, lon: -75.1 },
    url: 'https://deldot.gov/map/index.shtml',
    operator: 'Delaware DOT',
    access: 'free',
    kind: 'road',
  },
  {
    id: 'drivenc-outer-banks',
    name: 'DriveNC camera map, Outer Banks',
    at: { lat: 35.96, lon: -75.63 },
    url: 'https://drivenc.gov/',
    operator: 'NCDOT',
    access: 'free',
    kind: 'road',
  },
]
