# The Go alert fires only while ScoutNGo is open

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
