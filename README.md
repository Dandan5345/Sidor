# Sidor — authenticated scheduling

Employees first choose אחמ״ש or קב״ט using the original role buttons, select their name from the filtered list, then enter the matching personal employee code in a modal. The pre-login directory contains only names and roles. A code belonging to another selected name is rejected. The submission form uses a separate in-memory Auth session; retained manager logins never authorize employee submissions. Reloading or finishing requires name/code verification again. Managers sign in with their existing Firebase email and password. Reading application data requires an explicit membership entry; creating an arbitrary Firebase Authentication account grants no access.

## Permissions

- `access/managers/{uid}` is the manager allowlist. Only managers can change membership, employee records, codes, rules or settings, and read/delete all schedules. Manager credentials cannot create submissions or edit their shifts, preferences, timestamp or employee ID; name/type metadata synchronization remains allowed.
- `access/employees/{uid}` maps a login to an employee ID. The matching `employees/{employeeId}/authUid` binding must also be current, so removing an employee or rotating a code immediately blocks their previous session.
- Workers can read only their safe profile, their schedules/history, and shared rules/settings. They can create/update only their own schedule and history while submissions are open. They cannot read the employee/code directory or write settings.
- `publicEmployees` contains only first name, last name and role for the pre-login name picker; its schema rejects code/UID fields. All other unlisted paths deny access. Anonymous requests and unapproved authenticated accounts are denied.

The employee code is encoded as a deterministic synthetic email/password for Firebase Authentication. This supports the existing five-digit codes without a paid backend or custom token server. Hashing is an encoding and does not make a short or known code harder to guess. Treat employee codes as passwords. Existing codes were previously public; rotate them through the manager screen if confidentiality is required. Employee edits and code assignments are reserved in a database transaction. Two-minute leases recover interrupted operations; the final transaction checks the lease and operation ID again, preventing stale browsers from committing after takeover.

Manager account provisioning uses a separate, in-memory Firebase Auth instance, preserving the manager's own session. Adding, changing or removing an employee updates membership and the safe profile atomically. Retired Authentication accounts immediately lose database access. Reassigning a released code recreates its account under an exclusive reservation with a fresh UID, so an old session cannot inherit the next employee’s access.

## Weekly automation

The browser cannot reset the database or change submission settings on behalf of a worker. `.github/workflows/weekly-automation.yml` runs every ten minutes and can also be dispatched manually. It applies due Tuesday 14:00 closes and Friday 23:50 resets in `Asia/Jerusalem`, including daylight saving and missed events. GitHub schedules can be delayed. The Database Rules enforce the close time using the server clock, even if the workflow runs late; reopening waits for the reset.

The workflow authenticates through Google Workload Identity Federation. It has no stored service-account key. The configured provider restricts access to this repository ID, owner ID, `main`, and this exact workflow file. Its service account has Realtime Database administration permission only. The server uses a conditional ETag write to apply the reset and settings together without overwriting concurrent submissions. Employees, rules and history are retained.

## Verification

Node 22+ and Java 21+:

```sh
npm ci
npm test
npm run test:rules
```

The rules tests need the Firebase CLI. CI pins its version and verifies denied anonymous requests, unapproved/revoked accounts, per-employee reads/writes, manager access and server-enforced submission deadlines.

## Deploy and bootstrap

`firebase.json` deploys Realtime Database Rules and the static site. The same static source is served by GitHub Pages from `main`.

Before activating these rules on a previously open database, back up the live database and bootstrap explicit manager/worker memberships. `scripts/migrate-auth.cjs` supports a dry run by default; `--apply` creates/verifies worker accounts and adds membership/profile/employee-ID fields while retaining schedules and history. It requires a privileged OAuth token in `FIREBASE_ACCESS_TOKEN`, an explicit JSON array of trusted manager UIDs in `SIDOR_MANAGER_UIDS`, and a new private backup filename in `SIDOR_BACKUP_PATH`. The token needs Firebase, Cloud Platform and user email scopes. Never commit backups, tokens or employee codes. During cutover temporarily deny browser writes, run the migration with an ETag-guarded complete-state write, verify preservation, and deploy the final rules and updated client in the same release. Do not leave the old public client able to overwrite records during migration.

```sh
firebase deploy --only database,hosting --project sidoravoda111
```
