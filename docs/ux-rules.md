# ScoutNGo · UX rules (checked on every run)

Why: most fixes so far were UI/UX, found on the phone after the code passed. These rules turn those finds into checks.

## Where it's used
- One hand, outdoors, bright sun, often no signal, sometimes gloves. Often launched from the home-screen icon (standalone), not Safari.

## Layout
1. Safe areas: nothing important under the status bar (top 47 px) or home bar (bottom 34 px) in standalone. Sheets paint under the home bar; nothing opaque on top of them.
2. One message at a time over the map. Max one status line. Hints auto-hide in 4 s.
3. Nothing overlaps: labels, pills, chips and HUD never cover each other or controls. Map labels (SUN, SHADOW, times) dodge UI and the status bar.
4. No clipped or wrapped-mid-word text ("this.", "10 / AM"). Shorten the words before shrinking the font.
5. Sheets: every stop shows content (header right under the handle; lowest stop shows a one-line summary). No empty black.
6. Panels max ~25% of the screen unless the user pulls them up.

## Touch
7. Targets 44 px minimum. One meaning per gesture per surface (docs/gestures.md).
8. While a finger is down, nothing else moves the camera, the sheet, or the time.
9. Anything that looks like a button is one. Disabled things are grey text, not buttons.

## Words
10. Plain words first, numbers second, method in the "i". No ALL-CAPS sentences; caps only for short labels.
11. One name for one thing everywhere (venue name, lens name, size words). One source for each fact.
12. Never "safe", "clear", "legal". Never a score that sounds certain.
13. Data age shown when old or offline ("from 9:12 AM").

## Look
14. Dark glass over the map, gold accent, data colours keep their meaning. No red except hazards. Readable in sun (contrast AA+).
15. Same component for the same job: one chip, one pill, one sheet, one card style (see the design canvas boards).
16. Motion is short (≤ 300 ms) and never blocks input. Respect reduce-motion.

## Beginner first, expert reachable
19. Every screen opens with the answer in plain words (the verdict), then one picture, then numbers. Method and raw data sit one tap deeper ("More", "i", or an Advanced tab on that page).
20. No global beginner/expert mode (decided against: two apps to test). Per page, the app remembers on the phone whether I last opened Advanced.
21. Useful with zero setup: sensible defaults (my spot or last venue, today, now). Setup never blocks seeing value.
22. First run only: up to 3 short coach marks, skippable, never shown again. Empty states say what to do next.
23. Any jargon (blue hour, MLLW, swell period, ND) is tappable for a one-line plain explanation.
24. Menu grouped by job, max 7 top items: Plan · Sky · Water (tides, surf, wind) · Fly · Kit · Saved · Settings/About. Every feature reachable in 2 taps from the map.
25. Undo instead of "are you sure?" wherever the action can be undone.

## Proof on every run
26. Contact sheet of every touched screen at 390 × 844: browser tab and standalone. Checked against this list before push.
27. Real-iPhone-only items listed as a checklist for me.
