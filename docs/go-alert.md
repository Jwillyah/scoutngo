# The alerts fire only while ScoutNGo is open

Batch DRONE, Section 6.8 (16 Nov). Settings › Go alert (src/lib/goAlert.ts,
src/core/goAlert.ts) says "Go now · color likely · 4:44 PM–5:10 PM · look WSW"
when the sky call for tonight's sunset or tomorrow's sunrise reaches Likely,
up to 45 minutes before.

**It is worked out on the phone, by the open app.** The check runs in the page
while ScoutNGo is open, or just put away and not yet suspended by the phone.
Once iOS or Android suspends the page, nothing runs, and no alert comes.
Settings says so under the toggle: "Keep ScoutNGo open for Go alerts".

**Why not a push that comes with the app closed.** A notification to a closed
app comes from a server (Web Push). To know when your sky turns Likely, that
server would have to know your spot and run the call for it, and that is the
one thing this app does not do: the venue coordinate never leaves the device
(CLAUDE.md, "Privacy"). A push that carried no spot could only say "check the
app", on a timer, which is not an alert.

What is kept, on this phone only: the setting (`scoutngo.goAlert.v1`) and the
events already announced (`scoutngo.goAlert.sent.v1`), so each is said once.

## What fires (Batch SIMPLE-3, Sections 1b.3, 2b.2, 6.1)

One switch, Settings › Go alert, for all three. Each is worked out by the open
app on the phone and shown through the phone's own notification; each is said
once (`scoutngo.goAlert.sent.v1`, the last 20 keys).

| alert | words | when | never |
|---|---|---|---|
| Go (sky color) | "Go now · color likely · 6:20 AM–6:30 AM · look ESE" | from 45 minutes before the window starts; with the app open that long it has 15 minutes or more of lead | after the window's end (21 Nov: "6:20–6:30" was pushed at 6:52; the guard was the event's linger, not the window the words printed) |
| Rain | "Rain starts ~20 min · light", "Rain ending ~11:50 PM" | rain starts or ends within 30 minutes, from `rainNow` | for "showers nearby" or "unknown"; for a start with no time; "dry" is never said |
| Supermoon | "Supermoon rising now · look ENE" | 15 minutes before moonrise (`moonGoAlert`) | at or after the rise |

A Go first seen with less than 15 minutes of lead still says "Go now" while its
window lasts; after the window, nothing. Rain and Supermoon follow the same
rule: no alert after the thing they name has started (rain start) or ended.

**What a PWA allows.** The page runs the check once a minute while it is open or
just put away and not yet suspended; iOS only shows notifications from the
home-screen app, after the person has allowed them. A suspended page runs
nothing: no alert comes. That is the limit, and Settings says "Keep ScoutNGo
open for Go alerts".

**No server learns the spot.** Rain comes from the same requests the home
already makes (Open-Meteo, the radar tiles, station reports); nothing is added
for the alert, and the alert's input is the result on the phone. The moonrise
is computed on the phone. A push that reached a closed app would need a server
to hold the spot and the schedule, which this app does not have.
