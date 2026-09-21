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
keys, and installed workflow names. The KID-90 schema drop removed
`rules_evaluation_applications`, `action_tasks`, and `alerts.kind`; a database
without one counts it as zero and lists it in `absentOptionalTables` or
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
   generic rows, and, while `action_tasks` still exists, verifies that its
   row count did not move. The schema-drop cleanup (`v0.1.31:013`) removes
   account-day KPI rows, the raw scrape rows only they used, and the retired
   `ads.tier.dailyBudget` setting. `v0.1.31:014` then removes the rows that
   would stop `db push` or that v0.1.31 cannot read:
   - Every row of a listed table while it still lacks the column v0.1.31
     requires with no database default, because `db push` cannot add such a
     column to a table that has rows: `ingestion_run_id` for
     `naver_keyword_daily_snapshots`,
     `naver_popular_keyword_daily_snapshots`, `shorts_trend_daily_snapshots`,
     `live_commerce_broadcast_daily_snapshots`,
     `live_commerce_product_daily_snapshots`, and
     `tiktok_creative_trend_daily_snapshots`, whose old rows name no
     ingestion run; and `dedupe_key` for `alerts`, so the signal alerts
     `v0.1.31:005` keeps are deleted too.
   - Every Office 0.1.30 `sourcing_evidence_ingestion_runs` row (the table
     has no `is_current_complete` yet), after the rows that point at it:
     evidence observations, 1688 keyword observations, market facts,
     recommendation and validation evidence links, and the human-entered
     review hand-off items, registered supplier offers and their price
     tiers, launch candidates, decision items that cite an offer or launch,
     decision evidence, and procurement test intents.
   - Duplicates under the 16 unique keys v0.1.31 adds to
     `source_import_runs`, after 007 and 012 have settled every status. The
     newest run of each key stays (the higher id on a tie). An older run goes
     with the rows that depend on it: its collected facts, ABC calculations,
     and Rocket purchase confirmations with their lines, allocations, and
     transmissions. Carried-forward rows lose only their pointer to it.

   The owner approved both deletions of human-entered rows on 2026-09-17;
   014 records the approval on each entry. An entry still waiting for an
   approval fails 014 before its first statement. ADR-0010 kept rows are
   never deleted: a nullable pointer from one is cleared, and a transport
   receipt or consumption that cites a duplicate run keeps it. A running
   duplicate that a kept row cites is marked `failed` instead of removed; a
   duplicated generation that a receipt or consumption cites stops 014.

   `v0.1.31:015` then closes as failed every approved ad action the old Office
   never ran, campaign registrations included, with the manual-action or
   cutover message (KID-230).

   `v0.1.31:016_master_product_inventory_cutover` runs last in this
   pre-schema phase. It is the MasterProduct/legacy-Sellpia inventory
   boundary and fails closed before any source table is dropped: every
   surviving MasterProduct must have one explicit legacy SKU mapping with
   source identity evidence, and missing, cross-organization, multiple-SKU,
   duplicate, or conflicting mappings stop the transaction. An unlinked
   MasterProduct is deleted only when the legacy schema has a non-null
   `origin_channel_listing_id`, empty `image_urls`, and zero references from
   ABC/evaluation history, facts, Sourcing, Channel, supply, or inventory
   records; every other unlinked row remains a blocker. The deletion count is
   included in the migration result and rolls back with the transaction.
   It preserves all other MasterProduct UUIDs and historical legacy SKU
   identifiers, maps only live references that resolve, and leaves unresolved
   historical identifiers for history reads. It explicitly removes known
   inbound legacy-SKU foreign keys while retaining their historical columns.
   It also prepares the shared bounded `kid_item_code_seq`,
   allocates independent MasterProduct and bundle codes atomically, permits a
   singleton Channel option to reuse its component MasterProduct code, and
   runs the same strict sequence check before dropping the legacy table. A
   malformed existing sequence definition (bound, increment, or cycle policy)
   blocks the cutover; it is never silently reset.
   Treat any 016 failure as a blocked cutover; correct the data decision and
   rerun the complete pre-schema phase before proceeding to the survey or
   schema push.

   A table that already has its column, and a key whose index exists, are
   left alone. Tables and columns a database no longer has are skipped:

   ```powershell
   npm run data:migrate -- up --target office --phase pre-schema --release-version 0.1.31 --confirm APPLY_DATA_MIGRATIONS
   ```

   If this step fails, do not continue to schema application. The transaction
   rolls back; correct the writer-stop or data issue and rerun. When 014 stops
   on a pending approval or a kept row, record the owner's decision on a
   reviewed branch and rerun the cutover from that branch.
3. Survey what the schema step would hit in this database's data. An empty
   database accepts every schema change, so this is the first point where the
   answer is the real one: the pre-schema migrations have run, and `db push` has
   not. It reads only — no statement it issues writes — and exits non-zero when
   something would halt the next step. A unique index over existing duplicates,
   or a NOT NULL column added with no database default against a table that
   still has rows, stops `db push` mid-flight; resolve those before continuing.

   The Office deployer runs this survey itself, between the pre-schema
   migrations and `db push`, from the exact-SHA worktree with the same
   protected `DATABASE_URL` as the data migrations. Any non-zero exit (a
   blocker, a pending backfill decision, or a survey error) stops the cutover
   before `db push`, with writers still stopped. When rehearsing by hand, run:

   ```powershell
   npm run check:cutover-data-blockers
   ```

4. Apply the reviewed Prisma schema drop on the same stopped target, then
   regenerate the client. This removes the generic Operation/Workflow/
   Automation Marketplace models and their Organization/User relations. The
   KID-90 drop in the same schema removes `action_tasks`,
   `rules_evaluation_applications`, and the other retired tables and columns
   with their rows under the data-loss policy; Channels marketplace
   registration models remain:

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

   The post-schema `ensure:kid_item_code_sequence` step runs after the 016
   in-transaction check and after Prisma applies the final schema. It must
   still pass before the application is started; it rejects invalid codes,
   independently issued duplicates, and illegal Channel reuse.

### Irreversible boundary and recovery

Before step 4, stop if the pre-schema result, writer state, or SHA identity
is not exact. A failed step 3 survey leaves the pre-schema deletions committed
and the schema unchanged: keep writers stopped, then fix forward and rerun the
cutover, or restore the cutover dump and redeploy the previously approved
exact SHA. Step 4 is destructive: this
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
