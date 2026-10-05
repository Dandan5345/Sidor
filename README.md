# Sidor — weekly submission automation

## Schedule

- Tuesday 14:00: close weekly submissions.
- Friday 23:50: atomically delete `schedules`, reopen submissions and record the completed reset.
- Time zone: `Asia/Jerusalem`, including daylight saving changes.
- Employee records, rules and `scheduleHistory` are retained.
- Manager page: enable/disable weekly automation. When disabled, the existing manual submission setting controls the form. Enabling does not immediately delete any submissions. Missed events before re-enabling are ignored.

## Required activation (not activated by a GitHub commit)

The frontend is a static site. Scheduled deletion requires the Firebase Functions deployment below; no browser needs to stay open. Automation defaults to disabled until the manager enables it. No data is deleted by installing or deploying these files.

From the repository, using an account authorized for Firebase project `sidoravoda111`:

```sh
cd functions
npm install
npm test
cd ..
npx firebase-tools login
npx firebase-tools deploy --only functions:sidor-weekly-automation --project sidoravoda111
```

Scheduled Functions require Firebase's Blaze billing plan. Check billing and project access before deployment. After successful deployment, enable weekly automation on `manager.html`. Verify both scheduler jobs in Google Cloud Scheduler (region `europe-west1`), their time zone and upcoming runs. Do not manually run the reset job against real data for verification: that intentionally deletes current submissions.

## Database rules

No existing live Realtime Database security rules were available in this checkout, so this change does not replace or deploy them. The form blocks submission at the deadline using Firebase's server-time offset and rechecks settings at final confirmation. **Direct database writes are only blocked if existing security rules enforce the submission flag.** Before rollout, review existing rules and add the `settings/allowScheduleSubmission` condition to employee schedule write permissions, retaining existing authorization/validation clauses. Do not grant employees write access to the automation settings. An ancestor `.write: true` would bypass a child restriction and must be accounted for.

A browser check is not a substitute for database rules. For strict server-time enforcement at the exact deadline before the scheduled close completes, extend the existing schedule write rule with a server-maintained next-deadline timestamp checked against `now`. That rule integration requires the actual existing rules and is not included here.

## Verification

```sh
cd functions
npm test
```

Tests cover summer/winter cutoff and reopening, preserving history and employees, disabled automation, retry deduplication, old event ordering and events scheduled before re-enabling. Firebase deployment and live rule enforcement must be verified separately.
