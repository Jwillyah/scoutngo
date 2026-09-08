# ScoutNGo build brief

## What we're building

A shot planning tool for shooting an event at a venue you have never physically visited. You give it a location, a satellite screenshot, what happens there, and how you shoot. It gives you back specific camera positions plotted on that satellite image, with lens, focal length, what to capture, and whether you'll be lit or backlit at that time of day.

It is not a sun calculator. PhotoPills already does that well. The thing that does not exist is "here is where to stand and what to shoot, for how I shoot."

## Who it's for

Me first. I'm a freelance photographer and videographer in Virginia Beach shooting surf, action, drone, events, and commercial work. I shoot four to six travel events a year at venues I've never seen. The recurring problem is arriving cold and burning the first hour figuring out where to stand.

Second audience, if it turns out useful: other solo shooters with the same problem. Open source, bring your own API key.

## The single most important design decision

**The model proposes. Code computes.**

I built a throwaway prototype that asked the model to figure out lighting direction, and it got it backwards on half the positions. It put a camera northwest of the venue, which means the camera points southeast at 135 degrees, with the sun at 134 degrees, and labeled it "sun behind camera, front-lit." That is the exact opposite of the truth, and it's the one question the tool exists to answer.

Anything that is arithmetic must be arithmetic. The model's job is judgment: where would a shooter stand, what's the shot, what's the risk. Never geometry.

### Lighting, computed not inferred

```
cameraBearing = (positionBearing + 180) % 360   // position bearing is FROM venue TO position
d = |cameraBearing - sunAzimuth|
delta = min(d, 360 - d)

delta < 45    -> backlit, shooting into the sun
delta > 135   -> front-lit, sun behind the camera
otherwise     -> side-lit
```

Also derive and surface:
- Sun altitude. Below about 15 degrees means long shadows and possible flare. Above about 60 means flat overhead light.
- Shadow direction, which is sunAzimuth + 180.
- Whether the position is lit at the start, middle, and end of the window separately, because a four hour window can flip from backlit to front-lit.

The model should receive the computed lighting result as an input it must respect, or the app should compute it after the model returns positions and override anything the model claims. Prefer the second: let the model return positions and shots, then the app labels the lighting itself.

### Field of view, computed not inferred

```
hFOV = 2 * atan(sensorWidth / (2 * focalLength)) * 180 / PI
vFOV = 2 * atan(sensorHeight / (2 * focalLength)) * 180 / PI
```

Sony a7IV full frame sensor is 35.9mm x 24.0mm. APS-C crop mode is 23.5mm x 15.6mm, which the Sony 10-18 f4 triggers automatically on this body.

I shoot vertical for most deliverables, so show the vertical framing too, not just horizontal.

## Core flow, version one

1. Enter venue name and coordinates, or drop a pin
2. Upload a satellite screenshot of the venue, from Google Maps or similar
3. Set date and time window
4. Describe what happens at the event, in plain language
5. Describe what I want out of it
6. Select gear from a saved kit profile
7. Generate

The model receives the image plus all the text context and returns positions as **normalized image coordinates** (x and y from 0 to 1 relative to the uploaded screenshot), not as compass bearings. It can see the water, the docks, the parking, the crowd areas. That's the whole reason for the image.

The app then:
- Overlays numbered markers on the uploaded image at those coordinates
- Draws FOV cones from each marker toward the subject point, sized by the computed FOV for that lens and focal length
- Computes and labels lighting for each position independently
- Draws the sun direction across the image

If no image is uploaded, fall back to a bearing-based compass view, but treat that as the degraded mode.

## Stack

- Vite, React, TypeScript
- `suncalc` for solar position. MIT, tiny, well tested. Do not hand roll this.
- `@turf/turf` for bearings, distances, and destination points
- MapLibre GL JS if we add a live map later. Version one can be satellite screenshot only.
- Anthropic API via a Netlify serverless function so the key is not in the browser. I plan to host on Netlify.

## Things to build after version one, in priority order

1. **Live map instead of screenshot upload.** MapLibre with a satellite raster source. Pin the venue, the app captures the visible bounds, positions come back as real lat/lon.
2. **Overpass API for real geometry.** Pull water polygons, building footprints, piers, roads, parking for a bounding box. Feed the model actual land and water shapes as GeoJSON rather than relying on it reading an image. Endpoint is `https://overpass-api.de/api/interpreter`, supports CORS.
3. **FAA airspace.** The UAS Facility Map is published as an ArcGIS REST service with LAANC grid ceilings. Check CORS before committing to a browser side call. Surface the ceiling for the venue's grid square and flag when the venue is in controlled airspace.
4. **Over people check.** FAA rules restrict flying over people not under cover. The DJI Air 3S is about 720 grams, so it does not qualify for Category 1. Any drone position whose flight path crosses a crowd area should be flagged. This one matters legally, not just creatively.
5. **Tide.** NOAA CO-OPS API. For waterfront venues the tide changes what's visible and where you can stand.
6. **Save venues.** Come back to a venue you've shot before, see what worked.

## My gear profile, use as the default kit

- Sony a7IV, primary video body
- Sony a7III, primary photo body
- Sigma 28-75 f2.8
- Sigma 30mm
- Sony 75-300
- Sony 200-600
- Sony 10-18 f4, triggers APS-C crop on the a7IV
- DJI Air 3S with DJI wireless mics

How I actually shoot, which should be an editable profile field:
- Tight and compressed. Long glass is roughly 70 percent of ground time.
- Drone heavy.
- I rarely shoot wide. The 28-75 mostly comes out only when I'm close to the subject.
- Deliverables are vertical cuts, 10 to 25 seconds. That length is where my reach actually lives.

The gear plus style profile is the moat. A generic scouting tool gives generic advice. Loading a real profile means the same venue produces different plans for different shooters. That's the thing worth open sourcing.

## Design direction

Field tool, used on a phone, outdoors, in sun. Not a SaaS dashboard.

The vernacular that fits is nautical and aeronautical charts: buff land, pale water, hard black linework, magenta reserved for airspace and hazard warnings, which is the actual chart convention for restricted areas. High contrast, no decorative gradients, numbers legible at a glance.

One family for text with a monospace variant for numeric readouts only, not for labels.

Do not build the generic rounded card grid.

## Explicit non-goals for version one

- No user accounts, no backend database
- No 3D. Google Photorealistic 3D Tiles have no useful mesh coverage in the small waterfront towns I shoot in, so real sightline occlusion is not achievable yet.
- No sun and moon timing features. PhotoPills owns that and does it better. Lighting here exists only to inform position choice.

## Known failure modes from the prototype, do not repeat

- Model output truncated mid JSON at the token cap, producing an unparseable response and a dead end error message. Keep schemas tight, cap word counts per field, and always surface the raw response when parsing fails.
- Model asserting lighting direction that contradicts the computed sun azimuth. Compute it in code and override.
- Positions returned as abstract bearings with no reference to real terrain, producing a compass with numbers on it that tells you nothing about where the water is.

## First milestone

Working end to end with a satellite screenshot for one venue: Brew River Dock Bar, Salisbury MD, 38.3648, -75.6069, on a Saturday from 11:00 to 15:00 local.

I know the right answer for this venue, so it's the calibration case. The river runs southwest to northeast, the dock bar and the crowd are on the north bank, the docking course pilings sit in the water directly in front of the deck, and there is public access on the south bank along Riverside Drive.

The correct call is that the south bank is the strong position, because the sun sits due south at midday and shooting from the north bank means shooting into it all afternoon. If the tool independently arrives at that, it works. If it tells me to find an elevated position with a clear view, it's pattern matching and the venue data is not reaching the model.
