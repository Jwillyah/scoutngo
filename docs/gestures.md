# Every gesture in the app

One surface, one meaning per gesture. Where two surfaces overlap (the time
bar's ruler inside the sheet, a curve inside a card) the drag is decided
once, on its first few pixels, and then belongs to one of them for the rest
of that touch: `src/core/sheetMotion.ts` (`dragAxis`) is the rule and
`src/lib/gestureOwner.ts` records who has it.

Every surface below is replayed with real touch input by
`scripts/audit-gestures.mjs`, which runs in the commit gate and fails on a
move of the wrong thing.

**Targets.** Everything that takes a tap is at least 44 × 44 px of touch,
drawn smaller where the design wants: a small icon gets an invisible hit area
(`.hit44` in `app.css`). The gesture audit probes each control's touch area
at ±21 px from its centre.

**Over the map, only buttons take a finger.** The boxes that hold the chips,
the top bar, the rail, the dock and the shadow note let touches through to the
map; their buttons take taps (`app.css`, "only buttons take a finger").

---

## The 2D map — `src/components/MapView.tsx`

| | |
|---|---|
| one finger, drag | pans |
| one finger, tap | in a placing mode, places (a position, the pilot, the aim, a mark, a measure point, a flight point); otherwise deselects |
| one finger, double tap | zooms in one level, round the finger |
| one finger, long press (550 ms) | starts a measure here, or ends the one started |
| two fingers, pinch | zooms round the fingers, from the first couple of pixels (dead zone 0.02 of a level) |
| two fingers, tap | zooms out one level |
| two fingers, twist | turns the map, only past a deliberate twist (MapLibre's 25 px round the circle of the two fingers) |
| two fingers, drag up or down together | nothing: no tilt by hand in 2D |

Nothing the app does moves the camera while a finger is down: every app
camera move waits in `moveCamera` until they lift and the map stops coasting.

**Pins on the map**

| | drag | tap | long press |
|---|---|---|---|
| a position (shooter figure) | moves it | selects it; its card opens | nothing |
| the venue pin | moves the venue | nothing | nothing |
| the pilot pin "P" | moves the pilot | nothing | nothing |
| measure points | not draggable: they are drawn on the map, placed by tap or long press | — | — |

## The sheet — `src/components/BottomSheet.tsx`

| | |
|---|---|
| one finger, up or down, anywhere in it | moves it 1:1: the handle, the date row, a card's empty space, a vertical drag on the ruler |
| released fast (over 0.25 px/ms) | one detent on from where it started, in the direction of the flick |
| released slow | the detent nearest where it was let go |
| content at full, at its top, pulled down | the sheet takes the drag back from the scroll |
| content at half or peek | does not scroll: pull the sheet to full |
| tap the handle | steps peek → half → full → peek |
| sideways | the content's (the ruler, a curve); never the sheet |
| two fingers | nothing |

A card shorter than the screen opens at its own height.

## The time bar — `src/components/TimeBar.tsx`

| | |
|---|---|
| ruler, one finger sideways | scrubs, 1:1 under the finger; decided at 8 px |
| ruler, flick sideways | coasts and slows to a stop |
| ruler, up or down | the sheet's: decided at 16 px, because a thumb's sideways swipe hooks about 12 px up first |
| ruler, tap | jumps to the time under the finger |
| date and time row, tap | opens the phone's date and time picker |
| date and time row, up or down | moves the sheet |
| the round arrow, tap | back to the shoot window |

The map's shadows follow the needle in the same frame (`src/lib/liveTime.ts`).

## The tool dock — `src/components/ToolDock.tsx`

Buttons only: Sun/Moon, Calendar, Lens, Layers, Now. Tap. No drag; the dock
sits clear of the sheet's handle.

## Cards in the sheet

| surface | sideways drag | tap | up or down |
|---|---|---|---|
| tide curve (`TideSheet.tsx`) | scrubs the time | sets the time there | the sheet's |
| sun curve grip (`SunCurve.tsx`) | scrubs the time | — | the sheet's |
| sun curve plot | — | jumps to that time | the sheet's |
| skyline chart (`SkylineSheet.tsx`) | — | — | the sheet's |
| light map legend (`LightMapSheet.tsx`) | — | — (the presets above it are buttons) | the sheet's |
| Sky › Preview pages (`SkyPreview.tsx`) | the next or last page (colour clock, four forecasts, week of skies); the dots follow | — | the sheet's |

The curves are marked `data-sideways` and claim the drag as a scrub, the
same as the ruler, so a scrub never moves the sheet and a vertical drag on
them never scrubs.

## Fly it yourself — `src/components/FlyControls.tsx`

| | |
|---|---|
| left stick, drag any way | yaw (sideways) and climb (up and down); springs back on release |
| right stick, drag any way | sideways and forward; springs back |
| both sticks at once | yes: each stick holds its own finger |
| gimbal wheel, drag | tilt rate; springs back to 0 on release or a cancelled touch |
| C / N / S, Land, the look, "i" | tap |
| the 3D picture outside the controls | nothing while flying: the drone's camera is set every frame |

## The 3D view — `src/three/clayScene.ts`

| | plain view | standing at a position | Compare a photo |
|---|---|---|---|
| one finger, drag | turns round the place | looks around, feet fixed | nothing |
| two fingers, pinch | zooms | nothing | nothing |
| two fingers, drag up or down together | tilts | nothing | nothing |
| two fingers, twist | turns the heading | nothing | nothing |
| tap | nothing | nothing | nothing (the swipe line follows a drag) |

Tilt by hand is the 3D view's alone.
