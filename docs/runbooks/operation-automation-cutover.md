# Operation/Automation Hard-Cutover Preflight

## Purpose

Run this read-only inventory immediately before the reviewed Operation/Automation
schema cutover. It records the deployed and `release/office` identities plus
bounded counts and catalog names needed for the cutover decision. It never
writes application rows, changes schedules, cancels runs, or applies schema
changes.

The command must run from the Windows Office host against the intended Office
database before writer shutdown. Store its JSON output in the protected
deployment record or another location outside Git. Never paste the database URL,
credentials, cookies, provider payloads, or row data into a ticket or report.

## Preconditions

- Confirm the checkout and runtime are the intended Office deployment.
- Confirm a restorable database backup exists and the writer-stop window is
  approved. This command does not create or verify that backup.
- Set `DATABASE_URL` to the explicit PostgreSQL connection URL for the intended
  database. The preflight does not read a fallback URL from the environment.
- Set `KIDITEM_DEPLOYED_SHA` and `KIDITEM_RELEASE_OFFICE_SHA` to the full,
  non-secret deployment identities. Do not echo their source environment.
- Keep API, worker, scheduler, and other writers running until the preflight
  succeeds; stop them only at the separately approved cutover boundary.

## Run

From the repository checkout on the Windows Office host:

```powershell
npm run deploy:office:status
node scripts/operation-automation-cutover-preflight.mjs --database-url "$env:DATABASE_URL" --deployed-sha "$env:KIDITEM_DEPLOYED_SHA" --release-office-sha "$env:KIDITEM_RELEASE_OFFICE_SHA" | Tee-Object -FilePath C:\ProgramData\Kiditem\deployments\operation-automation-preflight.json
```

The equivalent package entrypoint is:

```powershell
npm run preflight:operation-automation-cutover -- --database-url "$env:DATABASE_URL" --deployed-sha "$env:KIDITEM_DEPLOYED_SHA" --release-office-sha "$env:KIDITEM_RELEASE_OFFICE_SHA"
```

All inventory queries run against one repeatable-read, read-only snapshot. The
output is one sanitized JSON object containing `generatedAt`, the two SHA
identities, the nine named counts, active operation keys, enabled schedule
keys, and installed workflow names. Lists are bounded; row payloads, operation
inputs/results, credentials, and the database URL are not emitted.

## Decision gate

Proceed to the separately authorized writer shutdown and schema/data cutover
only when:

- `counts.activeOperationRuns` is `0` and `activeOperationKeys` is empty;
- `counts.enabledSchedules` is `0` and `enabledScheduleKeys` is empty; and
- the recorded SHA identities match the approved deployed and
  `release/office` SHAs.

If either active count is nonzero, stop. Complete or cancel the named work
through its owning runtime, disable schedules through the owning control, and
rerun this same read-only command. Do not edit database rows manually and do
not use `--apply`; the command rejects writable execution modes.

If the URL is malformed, a required table is absent, a count is invalid, or any
query fails, treat the preflight as blocked. Keep writers in their current safe
state, correct the environment/runtime or database issue, and rerun after the
approved backup and maintenance decision are still valid.

## Verification and record

Local fixture verification uses no database or network connection:

```bash
node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs
npm run check:scripts-inventory
```

Retain the JSON output outside Git with the deployment record, along with the
backup reference and the operator's cutover decision. Do not retain secrets or
raw PostgreSQL errors.
