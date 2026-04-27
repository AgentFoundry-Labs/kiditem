# Wave H1/H2 Plan — Hard Rewrite Channel Market-Data Pipeline

Status: superseded by hard-rewrite scope; ready for implementation
Created: 2026-04-27 KST
Branch: `refactor/channel-market-data-hard-rewrite`
Depends on: Wave C5 audit (`docs/superpowers/plans/2026-04-27-channel-market-data-legacy-audit.md`)

## Intent

This plan is now a hard-rewrite implementation slice under the source-of-truth direction in `docs/superpowers/plans/2026-04-27-channel-market-data-daily-facts-source-of-truth.md`.

The goal is no longer a narrow status-only compatibility migration. The faster path is to replace the legacy market-data pipeline: define missing daily facts, rewrite ingestion and reads against them, then delete legacy market-data code/models once replacement tests pass.

The core intent remains:

- current winner/status/count UX should be based on `ChannelListingDailySnapshot`, `ChannelScrapeRun`, and `ChannelScrapeSnapshot`;
- legacy lifetime observation counts should no longer be presented as if they are current state;
- compatibility fallback should not silently resurrect old status semantics.

## Product decision

C5 deferred the following candidates because they changed user-visible semantics. That decision is now resolved:

> For status/read surfaces, prefer **current-state semantics** over legacy lifetime/legacy snapshot semantics.

Concretely:

- A count shown as item-winner status means **latest/current listing state**, not all historical `ItemWinner` rows.
- A scrape/snapshot count shown as collection status means **current channel scrape/run capture**, not legacy `AdSnapshot` row count.
- Latest collection metadata means **latest `ChannelScrapeRun`/`ChannelScrapeSnapshot` metadata**, not latest legacy `AdSnapshot.capturedAt` unless the surface explicitly says it is an ad-metric legacy snapshot.

## In scope

### 1. `/api/ads/extension/status` current status

`AdSyncService.getExtensionStatus(companyId)` should switch from legacy `ItemWinner.groupBy` and broad `AdSnapshot.count` status semantics to channel market-data current-state semantics.

Required behavior:

- Winner summary is computed from `ChannelListingDailySnapshot` latest row per listing.
- Latest means order by:
  1. `businessDate DESC`
  2. `lastObservedAt DESC`
  3. `updatedAt DESC`
  4. `id DESC` as deterministic tie-breaker if needed
- Count `isOfferWinner === true` as current winner listings.
- Count `isOfferWinner === false` as current non-winner listings.
- Treat `isOfferWinner === null` as unknown, not winner/non-winner.
- Do not use `ItemWinner` as fallback for current winner status. If there is no daily snapshot, return an explicit empty current-state result (`0` counts or `null`, depending on existing API shape), not legacy lifetime counts.
- If Wing KPI raw JSON is still used for fields daily snapshots do not carry, label it as provider KPI metadata and do not let it override current winner counts.

Recommended response semantics:

- Keep old fields only when necessary for API compatibility, but make their values current-state based.
- Additive fields are allowed if they clarify semantics, for example:
  - `currentWinnerCount`
  - `currentNonWinnerCount`
  - `currentUnknownWinnerCount`
  - `currentWinnerObservedListings`
  - `latestChannelStateAt`
  - `rawSnapshotCount`
  - `latestScrapeAt`
  - `latestScrapePageType`
- If `itemWinnerCount` remains, it must mean current observed listing count, not legacy `ItemWinner` row count. Prefer renaming in shared/web surfaces where safe.

### 2. `/api/ads/collect/status` scrape-run status

`AdCollectService.getStatus(companyId)` should use `ChannelScrapeRun` / `ChannelScrapeSnapshot` for current collection metadata.

Required behavior:

- `lastCollectedAt` should come from latest relevant `ChannelScrapeRun.finishedAt ?? startedAt`, not legacy `AdSnapshot.createdAt`.
- Campaign/product counts should move from `AdSnapshot.level` to channel scrape page/source buckets where possible.
- Recommended mapping:
  - campaign-like advertising collection: `source='advertising'`, `pageType IN ('campaign', 'keyword', 'product', 'advertising')`
  - Wing product/status collection: `source='wing'`, `pageType IN ('itemwinner', 'traffic')`
- Prefer run metadata for status (`status`, `startedAt`, `finishedAt`, `rowCount`, `matchedCount`, `unmatchedCount`, `errorCount`).
- Do not fall back to legacy `AdSnapshot` when no run exists. Return a clear empty state.

### 3. `AdActionService.getActions` latest scrape metadata

The action queue summary should stop using `AdSnapshot.findFirst` for `latestSnapshotAt` / `latestSnapshotPageType`.

Required behavior:

- Read latest scrape metadata from `ChannelScrapeRun` or `ChannelScrapeSnapshot`.
- Keep AdAction generation rules unchanged; they may still use `AdSnapshot` rows because the five rule engine inputs are ad metric snapshot rows.
- If the response retains `latestSnapshotAt` / `latestSnapshotPageType`, document that these are now latest channel scrape metadata. Prefer additive or renamed fields if the frontend/shared contract can tolerate it.

### 4. UI copy and shared contract

If frontend/shared surfaces expose these fields:

- Remove or avoid copy implying cumulative historical observation counts.
- Use labels such as “현재 상태”, “최근 수집”, “최근 스크랩 기준”, or “현재 아이템위너 상태”.
- Update `packages/shared/src/schemas/ads.ts` only if the API response shape is formalized there.
- Frontend must continue to consume server APIs only; no direct DB access.

### 5. Documentation

Update after implementation:

- this C6 plan doc with actual result;
- `apps/server/src/advertising/CLAUDE.md` with the new permanent status semantics;
- C5 audit doc disposition rows if any candidate moved from `C6 CANDIDATE` to `MIGRATED IN C6`.

## Out of scope

Do not do these in the hard rewrite:

- Preserve legacy market-data models as architecture when daily facts can represent the same grain.
- Change `/api/ads/extension/sync` request contract unless the extension is updated in the same branch.
- Build `ProductStrategyDaily` or any derived cache before daily facts are the source.
- Change AdAction threshold constants unless required by the new fact grain and covered by tests.
- Add period-specific source tables.
- Add new ADR files.

Allowed after replacement tests pass:

- Delete `Ad`, `AdSnapshot`, `TrafficStats`, and `ItemWinner` Prisma models if all runtime consumers are rewritten.
- Delete legacy writes and tests that only protect removed code.
- Update schema/RLS/ERD/Graphify for removals.

## Tests required

### `getExtensionStatus`

- Creates older `ItemWinner` lifetime rows that disagree with latest daily snapshot; response follows latest `ChannelListingDailySnapshot`, not `ItemWinner`.
- Multiple daily rows for one listing collapse to exactly one current row using latest `businessDate` / `lastObservedAt` ordering.
- `isOfferWinner=true`, `false`, and `null` produce winner, non-winner, and unknown/current-observed counts as specified.
- No daily snapshot returns explicit empty current-state counts; no legacy fallback.
- Existing Wing KPI JSON fields that are still retained do not override current winner counts.

### `AdCollectService.getStatus`

- Latest run drives `lastCollectedAt` and status metadata.
- Run counts/row counts are channel scrape-run based.
- Legacy `AdSnapshot` rows do not change current collection status if no corresponding run exists.
- Empty state is deterministic when no run exists.

### `AdActionService.getActions`

- Summary latest metadata comes from `ChannelScrapeRun` / `ChannelScrapeSnapshot`.
- Existing action queue counts remain unchanged.
- AdAction generation rule tests still pass unchanged.

### Frontend/shared

- If response fields change, update type/schema tests and UI copy tests or component assertions where present.
- UI labels reflect current-state semantics.

## Verification commands

Run at minimum:

```bash
cd apps/server && npx vitest run src/advertising
cd apps/server && npm run build
cd packages/shared && npm run build
npm run build --workspace=apps/web
npm run graphify:schema
git diff --check
```

Schema commands (`npm run db:push`, `npx prisma generate`, `npm run db:3layer-setup`) are not required unless implementation changes Prisma schema.

## PR contract

Suggested PR title:

```text
refactor(advertising): replace legacy market-data pipeline with daily facts
```

PR body must include:

- which C5 candidates moved to current-state semantics;
- exact new definition of winner/status/snapshot counts;
- intentionally broken legacy semantic compatibility, if any;
- legacy models still retained and why;
- dual-write retained or changed;
- Graphify regeneration status;
- verification evidence.
