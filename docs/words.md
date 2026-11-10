# Words

One thing, one name, everywhere (Batch QA, Section 2). `tests/words.test.ts`
fails on any banned variant in a string the app shows.

| Say | Never | Notes |
|---|---|---|
| Sky color | Sky fire, Sunset color, Fire | The page and the feature. "Color detail" is its full page. |
| Color likely · Color possible · Color unlikely | Fire likely, "Big color", Go/Maybe/Skip as a headline | The call's words (`colorWords`). The models' agreement is said as a count, "5 of 5", never with a word of its own. |
| offshore · onshore · cross-shore | Cross, crossshore | `sideWords`; a pill may capitalise the first letter. |
| Calm · Light and variable | a direction under 3 kt | `calmDirection`. |
| Flat · Small · Rideable · Fun · Firing | Solid, Big, Good, Epic | The surf tag scale (`surfTag`). Size words (knee, waist…) are a different thing and stay. |
| Today · Tomorrow · Week | Tmrw, Tom., 7-day | |
| Sunrise · Sunset | Sun up, Sun down | |
| golden hour · blue hour | Golden Hour (mid-sentence) | Lower case in a sentence. |
| AM · PM | Am, am, a.m. | Both ends of a range carry it (the clock audit). |
| didn't load · retrying | did not load, failed to load, error | What failed, then what happens next. |
| The forecast did not say | no data, N/A, null, undefined | A dash in a number's place. |
| kt · mph · km/h · m/s | kts, knots (in a value) | The user's unit, `windUnitLabel`. |
| ft · m | feet (in a value) | |
| Plan a shoot | Plan, Shoot setup (as a button) | The + on the map and the menu row. |
| Preflight | Pre-flight, Checklist | |
| Viewfinder | AR, Camera view | |
