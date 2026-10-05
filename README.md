# Sidor — weekly submission automation

## How it works

There is no server and no Cloud Functions (no Blaze plan, no cost). The automation runs in the browser of whoever opens the site:

1. On entry, `index.html` shows a loading screen (about 1.2 seconds) while it reads Firebase server time and the automation settings.
2. It computes which scheduled events came due since the last recorded one, in `Asia/Jerusalem` time (including daylight saving):
   - Tuesday 14:00: close weekly submissions.
   - Friday 23:50: delete `schedules` and reopen submissions.
3. The first visitor to open the site after an event applies it. Others see it already recorded (`settings/weeklyAutomationLastEventAt`) and do nothing. The claim is a Realtime Database transaction on `settings`, so an event runs once. If deleting `schedules` fails, the claim is released so the next visitor retries.
4. If nobody opens the site for days, both events are applied in order on the next visit. Between the deadline and that visit the form is already closed by the time check in the page.

`manager.html` runs the same check when opened. The manager can enable/disable the automation. When disabled, the manual submission setting controls the form. Enabling does not delete anything, and events before enabling are ignored.

Employee records, rules and `scheduleHistory` are retained.

## Database rules

Visitors' browsers write `settings/*` and delete `schedules`, so the Realtime Database rules must allow that for the public form. This also means anyone with the site open can change those values. If the rules should be stricter, they need to be reviewed against the actual live rules, which were not available in this checkout and are not changed here.

## Verification

```sh
cd functions
npm test
```

Tests cover summer/winter times, missed events, event ordering and duplicate/stale protection. Live database rule behavior must be verified separately.
