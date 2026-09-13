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
- Confirm the writer-stop window. The cutover starts from the dump described
  in the [data-loss policy](deployment-architecture.md#data-loss-policy).
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
keys, and installed workflow names. A retired table or column the database no
longer has (`rules_evaluation_applications`, `action_tasks`, `alerts.kind`)
counts as zero and is listed in `absentOptionalTables` or
`absentOptionalColumns`. Lists are bounded; row payloads, operation
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

## Approved cutover sequence

The preflight JSON is the admission record. The following steps run against
the writer-stopped target after its dump. Rehearse on the local QA database
`kiditem-qa-pg`, not on the developer database at `localhost:5433`.

1. Stop every API, worker, scheduler, and other database writer after the
   read-only preflight passes. Keep the backup and the exact deployed/release
   SHA identities with the cutover record.
2. Run the v0.1.31 pre-schema migrations. The preparation migration repeats
   the active-run and enabled-schedule guard inside its transaction, clears
   retired Alerts and Rules application receipts, removes only the retired
   generic rows, and verifies that the `ActionTask` row count did not move
   while it ran. Tables and columns a database no longer has are skipped:

   ```powershell
   npm run data:migrate -- up --target office --phase pre-schema --release-version 0.1.31 --confirm APPLY_DATA_MIGRATIONS
   ```

   If this step fails, do not continue to schema application. The transaction
   rolls back; correct the writer-stop or data issue and rerun.
3. Survey what the schema step would hit in this database's data. An empty
   database accepts every schema change, so this is the first point where the
   answer is the real one: the pre-schema migrations have run, and `db push` has
   not. It reads only — no statement it issues writes — and exits non-zero when
   something would halt the next step. A unique index over existing duplicates,
   or a NOT NULL column added with no database default against a table that
   still has rows, stops `db push` mid-flight; resolve those before continuing.

   ```powershell
   npm run check:cutover-data-blockers
   ```

4. Apply the reviewed Prisma schema drop on the same stopped target, then
   regenerate the client. This removes the generic Operation/Workflow/
   Automation Marketplace models and their Organization/User relations, and
   drops the retired `ActionTask` table with its rows under the data-loss
   policy; Channels marketplace registration models remain:

   ```powershell
   npm run db:push -- --accept-data-loss
   npx prisma generate
   ```

5. Run the post-schema migrations and the release checks. Record the migration
   ledger output, schema hash, and focused test results:

   ```powershell
   npm run data:migrate -- up --target office --phase post-schema --release-version 0.1.31 --confirm APPLY_DATA_MIGRATIONS
   npm run check:operation-automation-cutover
   npm run test:scripts
   npm run build --workspace=packages/shared
   ```

### Irreversible boundary and recovery

Before step 4, stop if the pre-schema result, writer state, or SHA identity
is not exact. Step 4 is destructive: this
runbook does not define an in-place rollback or recreate deleted generic rows.
After schema application, recover by fixing forward, or by restoring the
cutover dump and redeploying the previously approved exact SHA through the
Office release process. Do not manually reinsert Operation,
Workflow, Marketplace, or Alert history rows, and do not run a second generic
compatibility migration. If any post-schema check fails, keep writers stopped,
preserve the failure and migration-ledger evidence, and fix forward or
restore the cutover dump.

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
