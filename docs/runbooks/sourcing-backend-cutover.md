# Sourcing Backend Normalized Cutover

This runbook applies the sourcing dashboard cutover that replaces public
workspace-snapshot ownership with server-owned observations, recommendation
runs, validation, and review state. It does not authorize a broad sourcing-data
reset.

## Scope and ownership

- Canonical inputs that survive: `sourcing_workspace_snapshots`,
  `trend_seed_keywords`, Naver keyword/popular history, Shorts, live-commerce,
  TikTok, `sourcing_1688_offer_keyword_observations`, keyword preferences,
  interest targets, source-control overrides, and all evidence/candidate/
  supplier/launch/decision/procurement/downstream provenance.
- Derived rows that the post-schema data migration resets: recommendation runs
  and items, validation episodes/checks, and review selections/batches.
- The only intentional legacy schema drop is
  `sourcing_1688_hot_product_daily_snapshots`. Its old lossy identity is fully
  replaced by exact offer-keyword observations. Do not backfill old rows into
  the new observation table.
- Existing evidence remains because downstream provenance can reference it.
  Evidence with no valid current source key is excluded from new collection and
  recommendation inputs; this cutover does not backfill, reactivate, or recover
  it.

## Prerequisites

1. Confirm the candidate PR/commit targets `develop` and passed its local
   schema, shared-contract, server, web, and migration gates.
2. Use the already configured, develop-compatible environment on the operator
   machine. Do not print, copy, or commit environment files.
3. Use the GitHub Actions Office release path. Never run a local command
   against the Office database.
4. Verify an Office database checkpoint and the prior deploy artifact are
   available before the release is approved.
5. Record, without exporting payloads, Office row counts for:

   - `sourcing_1688_hot_product_daily_snapshots` — the known irreversible
     data-loss scope;
   - `sourcing_evidence_ingestion_runs` and
     `sourcing_evidence_observations`;
   - downstream Supplier offer, launch-candidate, decision, and procurement
     rows that can reference evidence.

6. Review the generated schema diff. Stop if it drops or truncates any table
   other than `sourcing_1688_hot_product_daily_snapshots`.

## Apply

1. Close or drain sourcing collection ingress through the approved operational
   control so a write cannot race the release.
2. Release the reviewed candidate through the Office GitHub Actions workflow.
   The workflow/approved runtime applies the reviewed Prisma schema and then
   runs the registered `v0.1.30:005_reset_sourcing_display_state` migration.
3. Confirm the schema stage removed only the 1688 hot-product table and that
   the data migration reports only derived recommendation/validation/review
   counts as affected rows.
4. Start the API and web runtime from the released artifact and verify
   authenticated health.
5. Run one safe collection each for trend, 1688, and authenticated Wing. No
   entitlement bootstrap is required: the server allowlist plus an optional
   disabled source control decides access.
6. Verify recommendation and validation API envelopes, then reload the
   dashboard. An empty or unavailable result must be explicit, never rendered
   as a successful fixture or stale browser cache.
7. Reopen sourcing ingress only after the checks pass.

## Verification

- Naver popular history remains available to compare the latest and previous
  collection dates for Entry demand/new-entry scoring.
- `find1688HotHistory()` reads `Sourcing1688OfferKeywordObservation`; no
  production reader or writer refers to
  `Sourcing1688HotProductDailySnapshot`.
- Workspace cache rows remain stored but the public/client snapshot API has no
  writer.
- Existing evidence and downstream reference counts match the pre-cutover
  checkpoint. The new runtime does not treat old unkeyed evidence as fresh
  recommendation input.
- A Final action creates a review batch only. It must not create a decision,
  procurement intent, purchase order, or provider call.

## Rollback and blockers

If the schema application has not run, stop the release and use the normal
artifact rollback path. Once the hot-product table is dropped, runtime rollback
alone cannot restore it. Restore the verified database checkpoint together with
the prior artifact if that legacy table must be recovered.

Stop and escalate if the schema diff has an unexpected drop, evidence or
downstream reference counts differ, the Office checkpoint is unavailable, or an
authenticated collection/reload fails. Do not improvise a backfill or execute
direct Office database commands.

## Final report

Report separately:

- preserved canonical/history/operator tables;
- the pre-drop 1688 hot-product row count and the intentional data loss;
- derived projection reset counts;
- evidence and downstream reference count comparison;
- collection/API/browser verification results;
- any blocker and whether a checkpoint restore is required.
