import { ESRI_ATTRIBUTION } from './MapView.tsx'

/**
 * THE HERO IS THE PRODUCT.
 *
 * A real map frame doing the thing: Esri satellite imagery, the sun ray with
 * its bearing plate, the shadow ray, and a position with its cone. No stock
 * photography and no illustration.
 *
 * WHY THE TILE IS REAL AND NOT DRAWN. The page's argument is that this app
 * computes rather than guesses. A drawn map on the front of it would be the
 * same mistake as a stock photograph on a page arguing against stock
 * photography: it would read as a picture of a product rather than the
 * product. So the imagery is a tile from the same Esri basemap the map uses,
 * at the calibration venue, and the overlays on top are the app's own
 * vocabulary in the app's own colours.
 *
 * WHAT IS DRAWN, AND WHY EACH ONE:
 *
 *   THE SUN RAY in amber, with its bearing on a black plate in mono numerals,
 *   because that plate is the single most characteristic thing on this map:
 *   a measured number on a surface built to survive direct sunlight.
 *
 *   THE SHADOW RAY in violet, the reciprocal, because the pair is the whole
 *   idea. Where the light comes from and where it falls are two facts and the
 *   app draws both.
 *
 *   ONE POSITION with its field of view cone, in the backlit colour, because
 *   a cone that is merely present says "we draw cones" and a cone in the
 *   colour of its own lighting read says "this is computed".
 *
 * IT DEGRADES TO THE GROUND. If the tile does not load the frame is still the
 * dark chart ground with the overlays on it, which is still the product.
 */

/* The calibration venue, which is a real place with real imagery. */
const TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/25194/19004'

export function LandingHero() {
  return (
    <figure className="hero">
      <div className="hero__frame">
        <img className="hero__tile" src={TILE} alt="" aria-hidden="true" loading="eager" />

        {/*
          * The overlays, in the app's own geometry: a 320 by 200 viewBox with
          * the venue at the centre, the sun low in the west and the shadow
          * thrown east, which is a real late-afternoon arrangement.
          */}
        <svg className="hero__draw" viewBox="0 0 320 200" aria-hidden="true">
          {/* The field of view cone, from the position towards the venue. */}
          <path className="hero__cone" d="M86 150 L142 86 L186 104 Z" />

          {/* The shadow ray: where the light falls. */}
          <line className="hero__ray hero__ray--shadow" x1="160" y1="96" x2="300" y2="58" />
          {/* The sun ray: where it comes from. */}
          <line className="hero__ray hero__ray--sun" x1="160" y1="96" x2="20" y2="134" />

          {/* The venue pin. */}
          <circle className="hero__pin" cx="160" cy="96" r="5" />

          {/* The position: a white disc with its number, as on the map. */}
          <circle className="hero__disc" cx="86" cy="150" r="13" />
          <text className="hero__num" x="86" y="155" textAnchor="middle">
            1
          </text>
        </svg>

        {/*
          * THE BEARING PLATE, in HTML rather than SVG so it is the real one:
          * the same mono numerals, the same hard black plate, the same
          * uppercase label at the same tracking as every readout in the app.
          */}
        <p className="hero__plate hero__plate--sun">
          <span className="hero__plate-label">Sun</span>
          <span className="hero__plate-value num">254.1°</span>
        </p>
        <p className="hero__plate hero__plate--shadow">
          <span className="hero__plate-label">Shadow</span>
          <span className="hero__plate-value num">74.1°</span>
        </p>
        {/*
          * THE AIRCRAFT, NOT A LENS. It said SIGMA 28, which is a ground
          * optic, on a page whose hero is a drone shoot and whose whole
          * Part 107 half is about flying. The plate names what is actually in
          * the air and the focal length that camera has.
          */}
        <p className="hero__plate hero__plate--optic num">DJI AIR 3S · 24mm · BACKLIT</p>
      </div>

      {/*
        * WHOSE PLACE THIS IS. An example venue, said plainly: on a first run
        * somebody could otherwise read a map frame as their own surroundings,
        * and this app's whole position on that is that it does not know where
        * they are and does not ask.
        */}
      <figcaption className="hero__credit">
        An example venue, not your location. {ESRI_ATTRIBUTION}
      </figcaption>
    </figure>
  )
}
