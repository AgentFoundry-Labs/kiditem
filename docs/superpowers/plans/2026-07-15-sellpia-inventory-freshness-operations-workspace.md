# Sellpia Inventory Freshness And Operations Workspace Implementation Plan

> **Partially superseded (2026-09-03):** Do not resume this plan's scheduler,
> browser claim/lease, heartbeat, or Operation/Alert tasks. Their current
> execution contract is the
> [Operation And Automation Hard Cutover Design](../specs/2026-09-03-operation-automation-hard-cutover-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Implementation correction — 2026-07-16

The UI consolidation and compatibility-redirect portions of this original plan
were withdrawn during implementation. For every operations route, commit
`c9e7caf875ca82574ae566a27fe0afa35c988918` is the preservation baseline.
Keep that commit's sidebar, independent URLs, page hierarchy, tabs, tables, and
primary interactions. Connect the completed Sellpia capabilities at their
existing logical controls or placeholders; do not replace the preserved pages
with the five-workspace proposal below.

In particular, the existing Rocket `납품 수량 판단 추후 연동` placeholder now
hosts the deterministic Sellpia freshness/component-capacity preview, while
actual confirmation, provider submission, reservation, workbook generation,
and stock mutation remain disabled. Order transmission and its subsequent
freshness refresh stay inside the preserved generated-file flow. The original
Task 11–12 consolidation and redirect steps are retained only as historical
planning context and are not implementation requirements.

**Goal:** Make Sellpia the safely refreshed inventory authority across order transmission, purchase submission, Rocket preview, matching, and the five canonical operations workspaces without guessing or directly decrementing stock.

**Architecture:** Inventory owns one organization-scoped persisted freshness state, the full-file validation/publication transaction, and a narrow purchase gate. The existing order-collector extension downloads Sellpia's full option-product workbook through the operator's Chrome session, while an authenticated KidItem web coordinator owns server claims and uploads. Supply records idempotent external submission attempts and rechecks the Inventory fence before any side effect. Channels keeps confirmed component recipes, including inactive-component evidence and Rocket PO identities. The web consolidates duplicate routes into URL-controlled, lazily mounted workspaces with one shared freshness drawer.

**Tech Stack:** Prisma 7, PostgreSQL, NestJS 11, TypeScript, Zod, Next.js 16.2, React 19, TanStack Query, Vitest, Chrome Manifest V3, Node test runner.

## Global Constraints

- Implement against the approved design in `docs/superpowers/specs/archive/2026-07-15-sellpia-inventory-freshness-operations-workspace-design.md` as one cross-layer Inventory reconstruction. Do not mix unrelated business rewrites into this release.
- Work in the existing checkout unless the user chooses a separate execution task. Preserve unrelated changes and stage only each task's named files.
- Bump root `VERSION` from `0.1.18` to `0.1.19`; this work changes persisted schema and data behavior.
- Only a valid completed full Sellpia snapshot may write `MasterProduct.currentStock`. Orders, Supply, Channels, Rocket, and web code must not estimate, reserve, increment, or decrement it.
- Fresh means `now - lastVerifiedAt < 10 minutes`. Exactly ten minutes is stale. Persist BigInt generations but serialize every API generation as a decimal string.
- Add `activeSyncOwnerUserId` to `SellpiaInventoryState`. The approved owner-only open/cancel/heartbeat contract cannot be enforced from a public run identity alone.
- Add `POST /api/inventory/sellpia-freshness/source-binding`, guarded by `@Roles('owner', 'admin')`, for the drawer's one-time `https://kiditem.sellpia.com` / `kiditem` confirmation. This is not a separate settings page.
- Use a 90-second browser claim lease and a 20-second heartbeat. Heartbeats extend the lease by 90 seconds; a dead owner becomes reclaimable only after expiry.
- Server time owns TTL, settle/coalescing, lease, and confirmation timing. Order transmission settle delay is 2 minutes, capped at 5 minutes from the first pending transmission; first same-hash confirmation waits 3 minutes and runs once.
- Supply may use one narrowly scoped transaction adapter to lock/read `sellpia_inventory_states` while locking a PurchaseOrder. It may compare the opaque Inventory fence and active item identities, but it must not own freshness derivation or write Sellpia state/stock.
- Keep `POST /api/purchase-orders` as the Supply route's single action-body mutation endpoint. Add actions to that body instead of adding per-action controller routes.
- Rocket `0.1.19` is preview-only. It may persist observed Rocket channel identities and calculate read-time capacity, but it must not create reservations, commitments, confirmation workbooks, provider submissions, or stock mutations.
- Existing `service-worker.js` and order-collection `page.tsx` exceed 700 lines. Put new behavior in focused modules/hooks and shrink those files; do not add substantial logic in place.
- Frontend code uses `apiClient` and focused `@kiditem/shared/*` exports only. Do not expand the shared root barrel and do not embed one `page.tsx` inside another.
- All mutation services receive `organizationId` from authenticated context. Never trust client `organizationId`, actor IDs, Sellpia cookies, passwords, Supabase refresh tokens, or raw browser response bodies.
- Update frozen scoped `AGENTS.md` route/capability contracts in the same task that changes their ownership. Share those instruction changes with the team in the implementation PR.
- Use `rtk` for every shell command and `apply_patch` for edits. Keep the TDD specs created below as durable regression contracts.

---

### Task 1: Define the shared freshness, provenance, error, and browser contracts

**Files:**
- Create: `packages/shared/src/schemas/sellpia-inventory-freshness.ts`
- Create: `packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts`
- Create: `packages/shared/src/sellpia-inventory-freshness.ts`
- Modify: `packages/shared/src/schemas/source-import.ts`
- Modify: `packages/shared/src/schemas/source-import.spec.ts`
- Modify: `packages/shared/src/schemas/browser-collection-session.ts`
- Modify: `packages/shared/src/schemas/browser-collection-session.spec.ts`
- Modify: `packages/shared/src/errors/codes.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`

**Interfaces:**
- Consumes: Zod date helpers, the current `SourceImportRunSchema`, browser collection session vocabulary, and focused-export rules.
- Produces: strict public freshness/request/claim/quality schemas from `@kiditem/shared/sellpia-inventory-freshness`; completed-artifact and verified-Sellpia provenance that keep successful responses non-null; exact purchase error codes; producer `inventory.sellpia`; source type `coupang_rocket_po_catalog`.

- [ ] **Step 1: Write failing shared-contract tests**

Cover the four-state vocabulary, the exact ten-minute boundary, decimal generation strings, strict request/claim inputs, nullable provenance only for pre-download Sellpia failures, completed-file invariants, quality report limits, source binding literals, the new browser producer, the five typed Sellpia collection failures, and exact error-code strings.

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveSellpiaInventoryFreshness,
  SellpiaInventoryFreshnessViewSchema,
} from './sellpia-inventory-freshness';

const VERIFIED_AT = new Date('2026-07-15T00:00:00.000Z');

it('becomes stale at exactly ten minutes', () => {
  expect(deriveSellpiaInventoryFreshness({
    now: new Date('2026-07-15T00:10:00.000Z'),
    lastVerifiedAt: VERIFIED_AT,
    requestedGeneration: 4n,
    verifiedGeneration: 4n,
    failedGeneration: null,
    activeSyncLeaseExpiresAt: null,
  })).toBe('refresh_required');
});

it('serializes generations as decimal strings', () => {
  const parsed = SellpiaInventoryFreshnessViewSchema.parse({
    status: 'fresh',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    },
    lastVerifiedAt: '2026-07-15T00:00:01.000Z',
    expiresAt: '2026-07-15T00:10:01.000Z',
    requestedGeneration: '4',
    verifiedGeneration: '4',
    refreshRequestedAt: null,
    refreshReason: null,
    syncNotBefore: null,
    activeSync: null,
    lastAttempt: null,
  });
  expect(parsed.verifiedGeneration).toBe('4');
});
```

- [ ] **Step 2: Run the shared tests and verify RED**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/sellpia-inventory-freshness.spec.ts src/schemas/source-import.spec.ts src/schemas/browser-collection-session.spec.ts
```

Expected: FAIL because the freshness module and new contract fields do not exist.

- [ ] **Step 3: Implement the focused schemas and vocabulary**

Use these exact server/client vocabularies. Keep the pure derivation function in the shared schema module so backend and web cannot drift.

```ts
export const SELLPIA_INVENTORY_FRESHNESS_STATUSES = [
  'fresh',
  'refresh_required',
  'syncing',
  'failed',
] as const;

export const SELLPIA_INVENTORY_REFRESH_REASONS = [
  'initial_snapshot',
  'ttl_expired',
  'order_transmission_requested',
  'same_hash_confirmation',
  'purchase_preflight',
  'manual_request',
  'retry',
  'legacy_manual_import',
] as const;

export type SellpiaFreshnessDerivationInput = {
  now: Date;
  lastVerifiedAt: Date | null;
  requestedGeneration: bigint;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  activeSyncLeaseExpiresAt: Date | null;
};

export function deriveSellpiaInventoryFreshness(
  input: SellpiaFreshnessDerivationInput,
): 'fresh' | 'refresh_required' | 'syncing' | 'failed' {
  if (input.activeSyncLeaseExpiresAt && input.activeSyncLeaseExpiresAt > input.now) return 'syncing';
  if (input.failedGeneration === input.requestedGeneration && input.failedGeneration > input.verifiedGeneration) return 'failed';
  if (!input.lastVerifiedAt) return 'refresh_required';
  if (input.requestedGeneration > input.verifiedGeneration) return 'refresh_required';
  return input.now.getTime() - input.lastVerifiedAt.getTime() < 10 * 60_000
    ? 'fresh'
    : 'refresh_required';
}
```

Define bounded `SellpiaInventoryQualityReportSchema` issues as `{ code, severity, count, sampleRowNumbers, sampleProductCodes }`, with at most 20 issues and at most 10 samples per issue. Add import outcome `published | same_hash_verified | same_hash_confirmation_scheduled`. Make `SourceImportRunSchema.fileName/fileHash` nullable. Introduce `CompletedSourceArtifactRunSchema` that requires non-null artifact name/hash and `importedAt`; existing Wing and Task 10 Rocket catalog results use it. Add `VerifiedSellpiaSourceImportRunSchema` on top, requiring `lastVerifiedAt` and `verificationCount >= 1`; Sellpia completed responses use this stricter schema. Pre-download Sellpia failures use the nullable base schema.

Add the exact error values:

```ts
ErrorCodes.INVENTORY.SELLPIA_SYNC_REQUIRED = 'SELLPIA_SYNC_REQUIRED';
ErrorCodes.PURCHASE.ITEM_INACTIVE = 'PURCHASE_ITEM_INACTIVE';
ErrorCodes.PURCHASE.REFERENCE_INVALID = 'PURCHASE_REFERENCE_INVALID';
ErrorCodes.PURCHASE.SUBMISSION_RECONCILIATION_REQUIRED = 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED';
ErrorCodes.PURCHASE.ROCKET_COLLECTION_INCOMPLETE = 'ROCKET_COLLECTION_INCOMPLETE';
```

Define collection failures as `sellpia_login_required | sellpia_download_contract_drift | sellpia_invalid_workbook | sellpia_background_timeout | sellpia_network_failed`; do not reuse a human message as a programmatic error code. Add browser attention reason `extension_outdated` so the web can distinguish an absent extension from one that responds without the required capability.

Make the public shapes strict. Source binding is a discriminated union: unconfirmed is exactly `{ origin: fixed origin, accountKey: null, confirmed: false }`, while confirmed is exactly `{ origin: fixed origin, accountKey: 'kiditem', confirmed: true }`. `activeSync` is null or `{ runId: UUID, generation: decimal string, startedAt: ISO datetime, leaseExpiresAt: ISO datetime, canControl: boolean }`; it never exposes an owner ID or second run field. `lastAttempt` is null or `{ attemptedAt: ISO datetime, status: completed | failed, trigger: refresh reason | null, errorCode: collection failure | null, errorMessage: trimmed string up to 300 characters | null }`. Public refresh input allows only `order_transmission_requested | manual_request | retry`; claim/heartbeat/cancel bodies are strict empty objects; fail accepts only `{ errorCode, errorMessage }`; source binding accepts only the fixed origin/account and `confirmed: true`. Claim output is a strict `claimed` discriminated union: a joined caller receives `{ claimed: false, state }`, while the atomic winner receives `{ claimed: true, claimToken: UUID, activeGeneration: decimal string, leaseExpiresAt: ISO datetime, state }`. Other freshness mutations return the strict freshness view directly.

When `SourceImportRun.fileName` and `fileHash` are null, require a true pre-download failure: Sellpia source, failed status, null channel account, zero rows, no imported/verified timestamps, zero verification count, no quality report or manual attestation, one of the typed Sellpia collection failure codes, and a bounded non-null error message. Generation and trigger provenance may remain populated.

Export only through `src/sellpia-inventory-freshness.ts`, `package.json`, and `tsup.config.ts`. Do not modify `src/index.ts` or `src/schemas/index.ts`.

- [ ] **Step 4: Run contract tests and build shared**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/sellpia-inventory-freshness.spec.ts src/schemas/source-import.spec.ts src/schemas/browser-collection-session.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: PASS, and `dist/sellpia-inventory-freshness.{js,cjs,d.ts}` exists.

- [ ] **Step 5: Commit the shared contracts**

```bash
rtk git add packages/shared/src/schemas/sellpia-inventory-freshness.ts packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts packages/shared/src/sellpia-inventory-freshness.ts packages/shared/src/schemas/source-import.ts packages/shared/src/schemas/source-import.spec.ts packages/shared/src/schemas/browser-collection-session.ts packages/shared/src/schemas/browser-collection-session.spec.ts packages/shared/src/errors/codes.ts packages/shared/package.json packages/shared/tsup.config.ts
rtk git commit -m "feat: define Sellpia freshness contracts"
```

### Task 2: Add the 0.1.19 persisted state, provenance, and submission-attempt migration

**Files:**
- Modify: `VERSION`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/supply.prisma`
- Create: `scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts`
- Create: `scripts/__tests__/sellpia-inventory-freshness-migration.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`
- Modify: `docs/ERD.md`
- Modify: `docs/erd/`
- Modify: `graphify-out/schema/`
- Modify: `graphify-out/schema-consumers/`

**Interfaces:**
- Consumes: Task 1 vocabulary and current organization/import/purchase relations.
- Produces: one `SellpiaInventoryState` per organization, expanded `SourceImportRun`, durable `PurchaseOrderSubmissionAttempt`, idempotent legacy backfill, and root release `0.1.19`.

- [ ] **Step 1: Write failing schema and migration contract tests**

Assert the new model fields, partial hash constraints, pre-download-failure uniqueness by generation, attempt uniqueness, no native Prisma enum, migration registration, source binding, completed-run verification backfill, initial generation values, and preservation of `MasterProduct.currentStock`. Expand the authoritative-inventory scanner so it rejects Prisma `create`, `createMany`, `update`, `updateMany`, and `upsert` writes as well as raw SQL that assigns `master_products.current_stock` anywhere outside the Inventory publication adapter; fixtures and test setup must use an explicit allowlist rather than broad directory exclusions.

```ts
import { describe, expect, it, vi } from 'vitest';
import { sellpiaInventoryFreshnessMigration } from '../data-migrations/v0.1.19/001_sellpia_inventory_freshness';

it('initializes an organization without a completed run as requested generation one', async () => {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    sourceImportRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    organization: { findMany: vi.fn().mockResolvedValue([{ id: 'org-1' }]) },
    sellpiaInventoryState: { createMany },
  };
  await sellpiaInventoryFreshnessMigration.run(tx as never);
  expect(createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({
      organizationId: 'org-1',
      requestedGeneration: 1n,
      verifiedGeneration: 0n,
      refreshReason: 'initial_snapshot',
    })],
    skipDuplicates: true,
  });
});
```

- [ ] **Step 2: Run the migration tests and verify RED**

Run:

```bash
rtk npm exec vitest -- run --config scripts/vitest.config.ts __tests__/sellpia-inventory-freshness-migration.spec.ts
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
```

Expected: FAIL because release `0.1.19`, the models, and migration do not exist.

- [ ] **Step 3: Implement schema fields and relations**

Add `SellpiaInventoryState` under `prisma/models/inventory.prisma` with the approved fields plus `activeSyncOwnerUserId` and opaque UUID `freshnessFence`. Every freshness/request/claim/publication/binding transition rotates the fence; Supply may compare it but never parse it. Add indexes for `lastCompletedImportRunId` and `activeSyncOwnerUserId`. Keep status/reason fields as `String`.

Expand `SourceImportRun` with nullable file provenance, `lastVerifiedAt`, `verificationCount @default(0)`, `lastTrigger`, `freshnessGeneration`, manual attestation actor/time, quality JSON, and sanitized error fields. Every hash unique predicate must include `file_hash IS NOT NULL`. Add a partial unique constraint for one null-file Sellpia failure per organization/source/generation.

Add this Supply-owned attempt shape:

```text
PurchaseOrderSubmissionAttempt
  id                      UUID primary key
  organizationId          UUID
  purchaseOrderId         UUID
  idempotencyKey          String
  freshnessGeneration     BigInt
  status                  String
  providerReference       String?
  errorCode               String?
  errorMessage            String?
  reconciliationOutcome   String?
  reconciledAt            Timestamptz?
  reconciledBy            UUID?
  createdAt               Timestamptz
  updatedAt               Timestamptz
```

Use unique `(organizationId, purchaseOrderId, idempotencyKey)` and composite tenant-safe relations. Add the required Organization, User, PurchaseOrder, and SourceImportRun back-relations.

- [ ] **Step 4: Implement the idempotent data migration and registry entry**

Set every completed Sellpia run to `lastVerifiedAt = importedAt`, `verificationCount = 1`, and `lastTrigger = legacy_manual_import` only when not already populated. Find the latest completed run per organization, then `createMany({ skipDuplicates: true })` state rows bound to the fixed origin/account. Completed organizations start at requested/verified generation `1`; empty organizations start requested `1`, verified `0`, reason `initial_snapshot`. Never update MasterProduct rows.

- [ ] **Step 5: Generate and verify the schema**

Run:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run test:scripts
rtk npm run data:migrate -- status
```

Expected: schema generation, shared build, ERD/Graphify generation, script tests, and migration registry status all pass. Do not run the local data mutation yet; Task 13 performs the verified rehearsal after all runtime code exists.

- [ ] **Step 6: Commit schema and migration**

```bash
rtk git add VERSION prisma/models/core.prisma prisma/models/inventory.prisma prisma/models/supply.prisma scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts scripts/data-migrations/index.ts scripts/__tests__/sellpia-inventory-freshness-migration.spec.ts scripts/__tests__/run-data-migrations.spec.ts scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs docs/ERD.md docs/erd graphify-out
rtk git commit -m "feat: persist Sellpia freshness state"
```

### Task 3: Implement freshness policy, leases, source binding, HTTP APIs, and the purchase gate

**Files:**
- Create: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.ts`
- Create: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts`
- Create: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-freshness.port.ts`
- Create: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-freshness-gate.port.ts`
- Create: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-refresh-request.port.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/index.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/sellpia-inventory-freshness.repository.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/index.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter.ts`
- Create: `apps/server/src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts`
- Create: `apps/server/src/inventory/adapter/in/http/dto/sellpia-inventory-freshness.dto.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/index.ts`
- Create: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.ts`
- Create: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.spec.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.spec.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-master-import.repository.adapter.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.spec.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/inventory-sku-snapshot-list.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts`

**Interfaces:**
- Consumes: persisted state from Task 2, shared schemas from Task 1, `@CurrentOrganization()`, `@CurrentUser()`, and `@Roles()`.
- Produces: freshness GET/request/claim/heartbeat/fail/cancel/source-binding APIs; exported refresh-request and purchase-gate ports; owner-safe leases; atomic generation transitions.

- [ ] **Step 1: Write failing policy and service tests**

Cover state priority, exactly-ten-minute staleness, lazy initialization, atomic TTL-generation creation on claim, request coalescing, order settle/cap behavior, request-during-active follow-up generation, retry after failure, due claim, owner-only heartbeat/fail/cancel, lease expiry/reclaim, source-binding block, BigInt serialization, and error-code separation for stale/inactive/cross-tenant items.

```ts
it('coalesces order transmissions and caps syncNotBefore at five minutes', async () => {
  vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
  repository.seedState({
    requestedGeneration: 1n,
    verifiedGeneration: 1n,
    lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
  });
  await service.requestRefresh({
    organizationId: ORG_ID,
    userId: USER_ID,
    reason: 'order_transmission_requested',
  });
  vi.setSystemTime(new Date('2026-07-15T00:04:30.000Z'));
  const view = await service.requestRefresh({
    organizationId: ORG_ID,
    userId: USER_ID,
    reason: 'order_transmission_requested',
  });
  expect(view.syncNotBefore).toBe('2026-07-15T00:05:00.000Z');
  expect(view.requestedGeneration).toBe('2');
});
```

- [ ] **Step 2: Run focused Inventory tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.spec.ts
```

Expected: FAIL because the policy, service, ports, repository, and controller do not exist.

- [ ] **Step 3: Implement the incoming contracts and policy**

Use these narrow cross-domain ports:

```ts
export interface SellpiaInventoryRefreshRequestPort {
  requestRefresh(input: {
    organizationId: string;
    reason: 'order_transmission_requested' | 'purchase_preflight';
  }): Promise<void>;
}

export interface SellpiaInventoryFreshnessGatePort {
  assertFreshAndActive(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<{
    fence: string;
    lastVerifiedAt: string;
    expiresAt: string;
  }>;
}
```

The cross-domain refresh port uses the Inventory clock and intentionally returns no actor-specific view. The application-facing freshness port exposes `getState({ organizationId, userId })`, `confirmSourceBinding`, `requestRefresh`, `claimDue`, `heartbeat`, `fail`, and `cancel`; `claimDue` returns Task 1's winner/joined discriminated union and the other mutations return the shared view. That view uses one `activeSync` object with run ID, timestamps, and caller-derived `canControl`, never a second `activeRunId` field. Repository operations use one organization/source advisory lock and compare-and-swap predicates for token, owner, generation, fence, and lease expiry.

The server policy imports and calls Task 1's `deriveSellpiaInventoryFreshness`; it owns transition decisions and timing but must not reimplement the four-state formula.

Because Task 1 deliberately tightened shared provenance before Task 4 replaces the import pipeline, keep the branch buildable with narrow compatibility mappings in the listed legacy adapters and history contracts. Wing uses `CompletedSourceArtifactRunSchema` with non-null artifact provenance. Snapshot history propagates nullable file provenance, verification/trigger/generation, attestation, quality, and sanitized errors through the shared schema, repository row port, service, and adapter without dropping or fabricating values; BigInt generation is serialized as a decimal string at the API boundary. The legacy Sellpia adapter may return verified completion only from fields durably present on its completed run and must fail explicitly rather than fabricate missing verification. Do not implement Task 4 parser, quality-policy, same-hash, or publication behavior here.

- [ ] **Step 4: Implement the repository and service transitions**

`getState` idempotently lazy-upserts a missing organization state with requested `1`, verified `0`, and `initial_snapshot`; subsequent GETs only read it and never advance a generation. Every TTL, lease, and gate decision samples server time inside the advisory/row-locked callback, immediately before the decision; a timestamp captured before lock acquisition is never an authorization clock. When `claimDue` sees `requestedGeneration === verifiedGeneration`, no active lease, and `lastVerifiedAt` is at least ten minutes old, it atomically creates and claims one `ttl_expired` generation under the same organization lock; concurrent claimers cannot create two. Any future lease expiry blocks takeover even if its owner relation was set null; reclaim begins only at exact expiry. Treat `refreshRequestedAt` as the first pending order event while updating `syncNotBefore` to `min(first + 5m, max(current, now + 2m))`. If a request is already beyond verified or active generation, join it instead of incrementing again. A new request during an active generation creates exactly one follow-up generation. Rotate `freshnessFence` on every transition that can change purchase eligibility.

Failure records only the active generation, clears the lease, and in the same transaction upserts the generation-keyed null-file `SourceImportRun` from Task 2 with bounded sanitized error fields. Repeated `/fail` calls are idempotent. Cancel clears the lease but leaves refresh required and does not create a failed run.

The gate throws `AppException` with `SELLPIA_SYNC_REQUIRED`, `PURCHASE_ITEM_INACTIVE`, or `PURCHASE_REFERENCE_INVALID`. It rejects empty/malformed input before the transaction, then resolves deduplicated organization-owned references under the lock and returns `PURCHASE_REFERENCE_INVALID` for missing/foreign items before freshness evaluation. Freshness is evaluated next; active status is checked after freshness so a stale inactive item may be refreshed before its final inactive verdict.

- [ ] **Step 5: Implement authenticated HTTP ownership**

Map these routes exactly:

```text
GET  /api/inventory/sellpia-freshness
POST /api/inventory/sellpia-freshness/source-binding
POST /api/inventory/sellpia-freshness/requests
POST /api/inventory/sellpia-freshness/claims
POST /api/inventory/sellpia-freshness/claims/:token/heartbeat
POST /api/inventory/sellpia-freshness/claims/:token/fail
POST /api/inventory/sellpia-freshness/claims/:token/cancel
```

The binding body is strict `{ sourceOrigin, sourceAccountKey, confirmed: true }` with literal fixed values and owner/admin authorization. Other mutation DTOs never contain organization or actor fields. GET passes the authenticated user into `getState` and exposes `activeSync.canControl`; cancel/heartbeat/fail also require that user to equal `activeSyncOwnerUserId`.

- [ ] **Step 6: Wire, integration-test, and boot Inventory**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-snapshot.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.spec.ts src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
```

Expected: policy/controller/wiring/integration tests and server build pass. Confirm the integration test proves organization B cannot view, claim, heartbeat, fail, cancel, bind, or gate organization A's state.

- [ ] **Step 7: Commit the freshness backend**

```bash
rtk git add apps/server/src/inventory apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts packages/shared/src/schemas/inventory-snapshot.ts packages/shared/src/schemas/inventory-snapshot.spec.ts
rtk git commit -m "feat: coordinate Sellpia inventory freshness"
```

### Task 4: Harden raw workbook intake and atomically publish or reverify one unified import run

**Files:**
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-file.validator.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-file.validator.spec.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts`
- Create: `apps/server/src/inventory/domain/policy/sellpia-inventory-quality.policy.ts`
- Create: `apps/server/src/inventory/domain/policy/sellpia-inventory-quality.policy.spec.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-import.port.ts`
- Create: `apps/server/src/inventory/application/port/out/cross-domain/confirmed-channel-component-reference.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/cross-domain/index.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/sellpia-import-run.repository.port.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/sellpia-snapshot-publication.repository.port.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/sellpia-master-import.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.spec.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-import-run.repository.adapter.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-snapshot-publication.repository.adapter.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/confirmed-channel-component-reference.repository.adapter.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/confirmed-channel-component-reference.repository.adapter.spec.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/sellpia-master-import.repository.adapter.ts`
- Create: `apps/server/src/inventory/adapter/in/http/dto/sellpia-inventory-import.dto.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.spec.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/inventory-sku-snapshot-list.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts`
- Modify: `apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.spec.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`

**Interfaces:**
- Consumes: raw uploaded bytes plus browser/manual execution metadata, Task 3 lease/state, previous active MasterProduct set, and confirmed recipe references.
- Produces: one parser/quality/publication path for manual and browser files; atomic new-snapshot publication; same-hash verification without stock writes; bounded order confirmation; expanded unified history.

- [ ] **Step 1: Write failing validator, quality, service, and integration tests**

Cover OLE2/XLSX/delimited-text acceptance, HTML/login and MIME/magic rejection, required schema and zero-row errors, existing duplicate/negative/overflow rules, 30% row/code-loss hard blocks, 10–under-30% churn warning, missing name/barcode/price warnings, inactive recipe warning, source mismatch, manual attestation, manual/browser collision, same-hash stock immutability, first/second order same-hash behavior, stale generation fencing, stable warning identity by hash/code, and previous snapshot preservation on every failure.

```ts
it('schedules one confirmation when the first post-order workbook has the same hash', async () => {
  repository.claimFileRun.mockResolvedValue({ kind: 'completed', runId: RUN_ID });
  publication.verifySameHash.mockResolvedValue({
    outcome: 'same_hash_confirmation_scheduled',
    duplicate: true,
    run: completedRun,
    changes: {
      createdMasterProductCount: 0,
      updatedMasterProductCount: 0,
      inactivatedMasterProductCount: 0,
    },
  });
  const result = await service.importInventory(browserInput);
  expect(result.outcome).toBe('same_hash_confirmation_scheduled');
  expect(publication.publishSnapshot).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-file.validator.spec.ts src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts src/inventory/domain/policy/sellpia-inventory-quality.policy.spec.ts src/inventory/application/service/sellpia-inventory-import.service.spec.ts src/inventory/adapter/out/repository/confirmed-channel-component-reference.repository.adapter.spec.ts src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-snapshot.spec.ts
```

Expected: FAIL because raw-file execution metadata, validator, quality policy, and split repositories do not exist.

- [ ] **Step 3: Move parsing behind the incoming port and validate the envelope**

Use this exact input union:

```ts
export type SellpiaImportExecution =
  | {
      kind: 'browser';
      claimToken: string;
      activeGeneration: string;
      trigger: SellpiaInventoryRefreshReason;
      sourceOrigin: 'https://kiditem.sellpia.com';
      sourceAccountKey: 'kiditem';
    }
  | {
      kind: 'manual';
      manualFreshExportConfirmed: true;
    };

export type ImportSellpiaInventoryInput = {
  organizationId: string;
  userId: string;
  file: { buffer: Buffer; fileName: string; mimeType: string };
  execution: SellpiaImportExecution;
};
```

Validate multipart strings through `SellpiaInventoryImportDto`: UUID claim token, decimal generation, refresh-reason enum, literal origin/account, and manual string `"true"` transformed to boolean `true`; map `file.mimetype` to `mimeType`. Compute SHA-256 before parsing so downloaded invalid files can be recorded. The validator checks allowed MIME plus OLE2, ZIP/XLSX, or bounded Sellpia-like delimited text magic and rejects HTML/login bytes without logging them. Keep name fallback in parsed rows but attach a `missing_name` quality fact.

- [ ] **Step 4: Split run lifecycle from snapshot publication**

`SellpiaImportRunRepositoryPort` claims/retries/coalesces hash runs and records sanitized terminal failure. A narrow confirmed-component read adapter supplies only organization-owned recipe references for the non-blocking inactive-reference quality check. `SellpiaSnapshotPublicationRepositoryPort` owns the organization/source advisory lock and one transaction that locks the import run plus freshness state, rechecks token/owner/generation/binding, loads quality baseline, evaluates policy, writes either failure or publication, updates run verification metadata, sets `verifiedGeneration = claimed activeGeneration`, rotates the fence, and clears the active lease/generation. If `requestedGeneration` is higher, it remains pending as the follow-up. Both execution modes require a previously confirmed fixed source binding; browser mode additionally compares its reported origin/account, while manual mode relies on the explicit fresh-export attestation and never silently creates the binding.

Use this processing order: compute hash; acquire/coalesce the run and generation execution; validate envelope/magic and parse; terminate the same run with a sanitized failure if invalid; then enter publication. Manual upload returns 409 while an unexpired browser lease exists. After expiry it may reclaim; otherwise it atomically creates/joins a generation and receives an internal manual claim token before parsing, so a later browser execution cannot overtake its publication.

For a completed same hash, never create a row or touch MasterProduct. For ordinary/manual/TTL/preflight, increment verification count and `lastVerifiedAt`. For the first `order_transmission_requested` same hash, clear the current lease and create `same_hash_confirmation` due in 3 minutes without verifying. For that one confirmation generation, the same hash verifies and cannot schedule a third run.

Pre-download `/fail` uses the partial generation key from Task 2 through Task 3's atomic fail transition. Store stable warning identity `fileHash + warningCode` in `qualityReport`; Task 7, not the publication repository, uses it to suppress duplicate Operation Alerts.

- [ ] **Step 5: Extend unified history and preserve successful channel imports**

Return nullable filename/hash for failed pre-download rows and all new verification/trigger/generation/quality/error fields from the existing `GET /api/inventory/sellpia-sync/import-runs`. Sort by `updatedAt DESC`. Keep `importedAt` as first stock publication time and `lastVerifiedAt` as current validation time. Update the existing Wing mapper to use `CompletedSourceArtifactRunSchema`; Task 10 gives Rocket a canonical artifact name/hash when it adds that source.

- [ ] **Step 6: Run unit, integration, and tenant gates**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-snapshot.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
```

Expected: all Inventory tests pass, old generations cannot publish, hard blocks preserve the last completed snapshot, and tenant scanners report no findings.

- [ ] **Step 7: Commit the unified import pipeline**

```bash
rtk git add apps/server/src/inventory apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts packages/shared/src/schemas/inventory-snapshot.ts packages/shared/src/schemas/inventory-snapshot.spec.ts
rtk git commit -m "feat: verify Sellpia inventory publications"
```

### Task 5: Preserve inactive recipe evidence without making inactive inventory purchasable

**Files:**
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts`
- Modify: `apps/server/src/channels/application/port/out/cross-domain/sellpia-master-product-read.port.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-availability.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.spec.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.spec.ts`

**Interfaces:**
- Consumes: confirmed `ChannelSkuComponent` recipes and the active/inactive MasterProduct snapshot published by Task 4.
- Produces: identity-preserving `findByIds`, inactive-component availability evidence, zero capacity for inactive components, and a block on creating a new recipe from inactive products.

- [ ] **Step 1: Write failing inactive-component tests**

Prove that exact-ID reads retain inactive identities while code, barcode, name, and search discovery remain active-only. Assert that one inactive component does not make the whole matching/availability response fail, preserves `mappingStatus: 'matched'`, reports `isActive: false` and `currentStock: 0`, and drives channel capacity to zero with warning `component_inactive`.

```ts
it('keeps a confirmed recipe visible but gives it zero capacity when one component is inactive', async () => {
  repository.findByChannelSkuIds.mockResolvedValue([confirmedMappingRow]);
  inventory.findByIds.mockResolvedValue([
    { ...activeMaster, id: 'master-1', sellpiaProductCode: 'A-1', currentStock: 4, isActive: true },
    { ...activeMaster, id: 'master-2', sellpiaProductCode: 'B-1', currentStock: 0, isActive: false },
  ]);
  const [result] = await service.findByChannelSkuIds(ORG_ID, [CHANNEL_SKU_ID]);
  expect(result.sku.mappingStatus).toBe('matched');
  expect(result.sku.sellableStock).toBe(0);
  expect(result.warnings).toContain('component_inactive');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts src/channels/domain/channel-sku-candidate-ranking.spec.ts src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts
```

Expected: FAIL because the availability DTO has no active flag and repository exact-ID reads currently discard inactive records.

- [ ] **Step 3: Implement the narrow cross-domain availability adapter**

Keep the existing Inventory incoming `findByIds(organizationId, ids)` contract, but change only its repository query to include inactive products. Keep `findByCodes`, `findByBarcodes`, `findByNormalizedNames`, and `search` filtered by `isActive = true`. Propagate the existing Inventory read model's `isActive` through the Channels cross-domain adapter; Channels must not query Prisma or import an Inventory repository directly.

- [ ] **Step 4: Derive review evidence and protect recipe writes**

Add `isActive` to the Channels candidate read model and `ChannelSkuMappingComponentSchema`. Add bounded list-item `warnings` containing `component_inactive`; discovery candidate responses remain active-only and do not need to advertise inactive rows. In `ChannelSkuAvailabilityService`, use zero for an inactive component before applying the recipe multiplier. In mapping mutation validation, reject a newly submitted component when `isActive` is false, while allowing an already confirmed recipe to remain persisted and visible for operator repair. Task 11's matching queue derives `매칭 확인 필요` from this warning without rewriting persisted `mappingStatus`.

- [ ] **Step 5: Run unit, integration, and server build gates**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts src/channels/domain/channel-sku-candidate-ranking.spec.ts src/channels/adapter/out/inventory/sellpia-master-product-read.adapter.spec.ts src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
```

Expected: confirmed inactive recipes remain diagnosable, new inactive recipes are rejected, and no tenant can resolve another organization's component IDs.

- [ ] **Step 6: Commit inactive-component handling**

```bash
rtk git add apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.spec.ts apps/server/src/channels packages/shared/src/schemas/channel-sku-matching.ts packages/shared/src/schemas/channel-sku-matching.spec.ts packages/shared/src/schemas/channel-sku-availability.spec.ts
rtk git commit -m "fix: preserve inactive matching evidence"
```

### Task 6: Download the Sellpia option-product workbook through the existing Chrome extension

**Files:**
- Create: `extensions/order-collector/background/sellpia-inventory.js`
- Modify: `extensions/order-collector/background/service-worker.js`
- Modify: `extensions/order-collector/background/order-collection-lifecycle.js`
- Modify: `extensions/order-collector/manifest.json`
- Modify: `extensions/order-collector/AGENTS.md`
- Create: `extensions/tests/order-collector-sellpia-inventory.test.mjs`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`
- Modify: `extensions/tests/collection-focus-policy.test.mjs`
- Modify: `packages/shared/src/schemas/browser-collection-session-adapter.integration.spec.ts`

**Interfaces:**
- Consumes: an authenticated inactive Chrome tab for `https://kiditem.sellpia.com/product_list_total.html` and command `{ action: 'collectSellpiaInventory', runId, deferTerminal: true }`.
- Produces: raw workbook bytes encoded as base64 plus fixed source identity and browser-session metadata; typed, sanitized collection failures; no KidItem server storage of Sellpia cookies or passwords.

- [ ] **Step 1: Write failing extension contract tests**

Assert the existing manifest wildcard covers `https://kiditem.sellpia.com/*`, producer registration, restart-safe dispatch, fixed POST target `/product_search.down.html`, form fields `downopt=2` and `downtype=excel`, raw response bytes, filename parsing, HTML/login rejection, size bounds, inactive-tab execution, and the five exact prefixed error codes from Task 1.

```ts
assert.deepEqual(command, {
  action: 'collectSellpiaInventory',
  runId: '0d7f4724-7d5b-4fea-80e3-184dd66884eb',
  deferTerminal: true,
});
assert.match(source, /downopt:\s*['"]2['"]/);
assert.match(source, /downtype:\s*['"]excel['"]/);
```

- [ ] **Step 2: Run the extension tests and verify RED**

Run:

```bash
rtk node --test extensions/tests/order-collector-sellpia-inventory.test.mjs extensions/tests/order-collector-action-coverage.test.mjs extensions/tests/collection-focus-policy.test.mjs
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts src/schemas/browser-collection-session-adapter.integration.spec.ts
```

Expected: FAIL because the action and downloader module do not exist.

- [ ] **Step 3: Implement the focused downloader module**

Keep these exact terminal shapes:

```ts
type SellpiaDownloadSuccess = {
  success: true;
  runId: string;
  workbookBase64: string;
  fileName: string;
  mimeType: string;
  size: number;
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  collectionSession: BrowserCollectionSessionView;
};

type SellpiaDownloadFailure = {
  success: false;
  runId: string;
  errorCode:
    | 'sellpia_login_required'
    | 'sellpia_download_contract_drift'
    | 'sellpia_invalid_workbook'
    | 'sellpia_background_timeout'
    | 'sellpia_network_failed';
  pendingLogin?: boolean;
  error: string;
  collectionSession: BrowserCollectionSessionView;
};
```

The module locates or creates an inactive Sellpia tab, executes `fetch('/product_search.down.html', { method: 'POST', body: URLSearchParams(...) })` inside that origin, validates response status/content-disposition/magic/size, converts the `ArrayBuffer` to base64, and returns only the bounded result. It never focuses the tab and never forwards cookies, passwords, DOM text, response headers, workbook contents, or raw error bodies.

Map `sellpia_login_required` to `attention_required/marketplace_login` and keep its inactive tab for the explicit open action. Map `sellpia_background_timeout` to `attention_required/background_timeout`. Contract drift and invalid workbook fail immediately. Network failure uses a bounded retry and then fails. No other failure keeps a managed tab open.

- [ ] **Step 4: Register restart-safe dispatch without growing the service worker**

Load the module with `importScripts`, expose exact ping capability `capabilities.collectSellpiaInventory = true`, and route the command from `service-worker.js`. Parameterize `order-collection-lifecycle.js` so producer/error classification are supplied by the caller. The web passes `runId = claimToken`; upload, failure, and finalization retain that claim token and `activeGeneration`. Persist the run ID before navigation; after service-worker restart, reuse it and restart collection from the beginning rather than inventing a second run.

Increment extension manifest version from `0.1.65` to `0.1.66` and update the scoped capability contract in `extensions/order-collector/AGENTS.md`.

- [ ] **Step 5: Validate syntax, manifest, tests, and extension diff**

Run:

```bash
rtk node --check extensions/order-collector/background/sellpia-inventory.js
rtk node --check extensions/order-collector/background/order-collection-lifecycle.js
rtk node --check extensions/order-collector/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
rtk node --test extensions/tests/order-collector-sellpia-inventory.test.mjs extensions/tests/order-collector-action-coverage.test.mjs extensions/tests/collection-focus-policy.test.mjs
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts src/schemas/browser-collection-session-adapter.integration.spec.ts
rtk git diff --check -- extensions/order-collector extensions/tests
```

Expected: the extension returns one bounded workbook result in an inactive tab and all static contract checks pass.

- [ ] **Step 6: Commit the extension collector**

```bash
rtk git add extensions/order-collector extensions/tests/order-collector-sellpia-inventory.test.mjs extensions/tests/order-collector-action-coverage.test.mjs extensions/tests/collection-focus-policy.test.mjs packages/shared/src/schemas/browser-collection-session-adapter.integration.spec.ts
rtk git commit -m "feat: collect Sellpia inventory workbook"
```

### Task 7: Coordinate automatic refresh in the web app and expose one shared freshness drawer

**Files:**
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Create: `apps/web/src/lib/sellpia-inventory-freshness-api.ts`
- Create: `apps/web/src/lib/__tests__/sellpia-inventory-freshness-api.spec.ts`
- Create: `apps/web/src/lib/sellpia-inventory-extension.ts`
- Create: `apps/web/src/lib/__tests__/sellpia-inventory-extension.spec.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/query-keys.spec.ts`
- Create: `apps/web/src/components/providers/SellpiaInventorySyncProvider.tsx`
- Create: `apps/web/src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx`
- Modify: `apps/web/src/components/providers/BrowserCollectionProvider.tsx`
- Modify: `apps/web/src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx`
- Modify: `apps/web/src/components/providers/AuthProvider.tsx`
- Modify: `apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx`
- Create: `apps/web/src/hooks/useSellpiaInventoryFreshness.ts`
- Create: `apps/web/src/hooks/useSellpiaInventoryFreshness.spec.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaFreshnessStatus.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaFreshnessStatus.spec.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaFreshnessDrawer.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaFreshnessDrawer.spec.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaManualImportForm.tsx`
- Create: `apps/web/src/components/sellpia-inventory/SellpiaSyncHistory.tsx`
- Create: `apps/web/src/components/sellpia-inventory/index.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.spec.ts`
- Modify: `apps/web/src/app/(inventory)/_shared/invalidate-sellpia-inventory.ts`
- Modify: `apps/web/src/app/(inventory)/_shared/invalidate-sellpia-inventory.spec.ts`
- Modify: `apps/server/src/automation/domain/policy/browser-operation-producers.ts`
- Modify: `apps/server/src/automation/domain/policy/browser-operation-producers.spec.ts`
- Modify: `apps/server/src/automation/AGENTS.md`
- Modify: `apps/web/src/lib/AGENTS.md`
- Modify: `apps/web/src/hooks/AGENTS.md`
- Modify: `apps/web/src/components/AGENTS.md`
- Modify: `apps/web/src/components/providers/AGENTS.md`
- Modify: `apps/web/src/app/(inventory)/AGENTS.md`

**Interfaces:**
- Consumes: Task 3 freshness/lease endpoints, Task 4 upload/history endpoint, Task 6 extension command, authenticated organization/user context, and existing Operation Alerts.
- Produces: one browser-tab owner of a claimed run, automatic upload/finalization, owner-safe cancellation, shared compact status, source binding confirmation, manual fallback, current-basis details, and unified attempt history.

- [ ] **Step 1: Write failing coordinator and drawer tests**

Cover due polling only after auth is ready, no claim before `syncNotBefore`, `navigator.locks` deduplication, in-memory fallback deduplication, `claimToken` as extension `runId`, 20-second heartbeat, 90-second lease handling, tab-close heartbeat stop and lease reclaim without cancellation, explicit owner cancellation, extension timeout/failure, missing versus outdated capability, upload/finalization success/failure, quality-alert deduplication by stable warning identity, query invalidation, owner-only control, source-binding admin gate, current-basis versus recent-attempt display, required manual attestation, and pre-download history rows with null file details.

```tsx
it('claims once across two mounted coordinators', async () => {
  render(<><SellpiaInventorySyncProvider /><SellpiaInventorySyncProvider /></>);
  await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));
  expect(extension.collectSellpiaInventory).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/sellpia-inventory-freshness-api.spec.ts src/lib/__tests__/sellpia-inventory-extension.spec.ts src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx src/components/providers/__tests__/AuthProvider.spec.tsx src/hooks/useSellpiaInventoryFreshness.spec.tsx src/components/sellpia-inventory/SellpiaFreshnessStatus.spec.tsx src/components/sellpia-inventory/SellpiaFreshnessDrawer.spec.tsx src/app/\(inventory\)/_shared/invalidate-sellpia-inventory.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/automation/domain/policy/browser-operation-producers.spec.ts
```

Expected: FAIL because the shared API, provider, and drawer do not exist.

- [ ] **Step 3: Implement focused browser and API adapters**

Add `collectSellpiaInventory` to `extension-bridge.ts`, validate the Task 6 reply before decoding, and expose no direct extension messaging from React components. Probe without a required capability first: no response is `extension_missing`, while a responding extension without `collectSellpiaInventory` is `extension_outdated`; only a matching capability runs. On one service-worker communication restart, retry once with the same claim-token run ID. Move all Sellpia import/history calls from the route-local library into `sellpia-inventory-freshness-api.ts`; delete the old library only after all consumers compile. Add query keys for freshness state and unified history.

- [ ] **Step 4: Implement the authenticated coordinator**

Mount the provider once inside `AuthContext.Provider`, alongside the existing browser provider. Inside it, enable polling/claim only when `useAuth()` reports `status === 'ready'` and `user.organizationId` exists. Use the organization ID only in the local lock name, never an API body. Use React Query `refetchInterval` for server-state polling; do not use a detached browser timer for due-state discovery. On a due state, acquire `navigator.locks.request('kiditem:sellpia-inventory:<organizationId>', { ifAvailable: true })`, guard again with a module-level in-flight map, claim, heartbeat, run the extension with `runId = claimToken`, upload raw bytes with the same claim token/generation, finalize the extension session, and invalidate freshness/history/inventory/matching/purchase query keys.

Register `inventory.sellpia` in the server Operation Alert producer map with canonical href `/inventory-hub?tab=overview`. Only this coordinator owns its alert lifecycle. Filter that producer out in `BrowserCollectionProvider`, then create/update/dismiss the alert with the authenticated claimant's run state so an unrelated tab cannot open or cancel it. Use Task 4's stable `fileHash + warningCode` identity when publishing quality alerts so repeat verification does not duplicate them. Extension success followed by upload failure calls `/fail`. Only an explicit owner action cancels the extension session and `/cancel`; tab close, logout, or unmount merely stops heartbeat so the request remains and becomes reclaimable after lease expiry. None of these paths mutates stock locally.

- [ ] **Step 5: Implement one drawer instead of another page**

The compact status displays `최신`, `갱신 필요`, `갱신 중`, or `실패` plus age. The drawer separates:

```text
현재 재고 기준: last completed/verified file, verified time, expiration, quality
최근 동기화 시도: active or latest attempt, trigger, error, retry/control
이력: existing unified import-run list
```

If binding is unconfirmed, show the fixed origin/account confirmation only to owner/admin. Manual upload remains in the drawer and requires `manualFreshExportConfirmed` before submit. Never show or request a Sellpia password/cookie field.

- [ ] **Step 6: Run web tests and build**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/sellpia-inventory-freshness-api.spec.ts src/lib/__tests__/sellpia-inventory-extension.spec.ts src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx src/components/providers/__tests__/AuthProvider.spec.tsx src/hooks/useSellpiaInventoryFreshness.spec.tsx src/components/sellpia-inventory/SellpiaFreshnessStatus.spec.tsx src/components/sellpia-inventory/SellpiaFreshnessDrawer.spec.tsx src/app/\(inventory\)/_shared/invalidate-sellpia-inventory.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/automation/domain/policy/browser-operation-producers.spec.ts
rtk npm run build --workspace=apps/web
```

Expected: one tab claims a due sync, other tabs only observe it, and manual/browser attempts appear in the same history.

- [ ] **Step 7: Commit the web coordinator and drawer**

```bash
rtk git add apps/web/src/lib apps/web/src/hooks apps/web/src/components/providers apps/web/src/components/sellpia-inventory apps/web/src/components/AGENTS.md apps/web/src/app/\(inventory\) apps/server/src/automation
rtk git commit -m "feat: coordinate Sellpia refresh in web"
```

### Task 8: Treat Sellpia order sending as a transmission request and schedule refresh afterward

**Files:**
- Create: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.ts`
- Create: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-generated-file-store.ts`
- Create: `apps/web/src/app/(orders)/order-collection/lib/order-generated-file-store.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/generated-file-view-model.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/generated-file-view-model.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-stats.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-stats.spec.ts`
- Create: `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.ts`
- Create: `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-page-model.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-page-model.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/components/GeneratedFilesSection.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/GeneratedFilesSection.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/OrderActivityFeed.tsx`
- Create: `apps/web/src/app/(orders)/order-collection/components/OrderActivityFeed.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/OrderCollectionPipeline.tsx`
- Create: `apps/web/src/app/(orders)/order-collection/components/OrderCollectionPipeline.spec.tsx`
- Modify: `apps/web/src/app/(orders)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/order-collection/AGENTS.md`

**Interfaces:**
- Consumes: existing generated-order workbook and extension send action, Task 3 refresh-request endpoint, and Task 7 query invalidation.
- Produces: durable local `transmissionRequestedAt`, operator wording that does not claim Sellpia acceptance, and one refresh event for every successful send action; only the server coalesces those events into the 2-minute/5-minute schedule.

- [ ] **Step 1: Write failing transmission-semantics tests**

Cover successful extension response, `{ success: true, submitted: false }`, local timestamp persistence, refresh request reason, invalidations, legacy `sentAt` normalization, refresh-request failure after extension success, repeated sends without client debounce, and the distinction between mall order collection and Sellpia order transmission.

```ts
it('keeps transmission success when refresh scheduling fails', async () => {
  extension.sendSellpiaOrders.mockResolvedValue({ success: true, submitted: true });
  freshness.requestRefresh.mockRejectedValue(new Error('offline'));
  const result = await transmitSellpiaOrder(input);
  expect(result.status).toBe('transmission_requested');
  expect(result.refreshWarning).toBe(true);
  expect(store.markTransmissionRequested).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused order-collection tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-collection
```

Expected: FAIL because send, local storage, and refresh scheduling are still coupled in the page.

- [ ] **Step 3: Extract and implement the transmission orchestration**

The exact order is: extension returns `{ success: true, submitted: true }`; persist `transmissionRequestedAt`; request refresh with `order_transmission_requested`; invalidate freshness/history. `{ success: true, submitted: false }` is not a transmission and writes/calls nothing. If refresh scheduling fails after the extension succeeds, preserve the timestamp and show `셀피아 전송 요청은 완료됐지만 재고 최신화 예약에 실패했습니다. 지금 동기화를 실행하세요.`—never relabel the send as failed and never resend automatically.

Normalize legacy `sentAt` on read, but write only `transmissionRequestedAt`. Raw collection from Coupang or another mall does not request Sellpia refresh; only successful Sellpia order transmission does. Bulk/multi-user coalescing is owned by the Task 3 server policy.

- [ ] **Step 4: Shrink the page and correct operator language**

Move only transmission orchestration into `use-sellpia-order-transmission`; Task 11 performs the broader page/workspace extraction. Update generated files, activity feed, pipeline, stats, view model, and page model from `전송 완료`/`접수 완료` to `전송 요청됨`, keep unsent work as `전송 대기`, and name the activity `셀피아 전송 요청`. Disclose that the next automatic Sellpia refresh verifies inventory rather than proving order acceptance. Keep no direct stock mutation or freshness guess in this route.

- [ ] **Step 5: Run focused tests and web build**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-collection
rtk npm run build --workspace=apps/web
```

Expected: a completed extension click is displayed as a transmission request, and a later automatic refresh owns inventory truth.

- [ ] **Step 6: Commit order transmission semantics**

```bash
rtk git add apps/web/src/app/\(orders\)/order-collection apps/web/src/app/\(orders\)/AGENTS.md
rtk git commit -m "fix: schedule inventory refresh after order transmission"
```

### Task 9: Gate every real purchase transition and make external checkout idempotent

**Files:**
- Modify: `apps/server/src/supply/application/port/in/procurement/purchase-order-submission.port.ts`
- Modify: `apps/server/src/supply/application/port/out/runtime/purchase-order-checkout-runtime.port.ts`
- Create: `apps/server/src/supply/application/port/out/transaction/purchase-order-submission.transaction.port.ts`
- Create: `apps/server/src/supply/adapter/out/transaction/purchase-order-submission.transaction.adapter.ts`
- Create: `apps/server/src/supply/adapter/out/transaction/purchase-order-submission.transaction.adapter.spec.ts`
- Modify: `apps/server/src/supply/application/service/purchase-order-submission.service.ts`
- Modify: `apps/server/src/supply/application/service/__tests__/purchase-order-submission.service.spec.ts`
- Modify: `apps/server/src/supply/application/service/procurement.service.ts`
- Modify: `apps/server/src/supply/application/port/out/repository/procurement.repository.port.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/procurement.repository.adapter.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/__tests__/procurement.repository.adapter.spec.ts`
- Modify: `apps/server/src/supply/adapter/out/runtime/alibaba-1688-checkout-runtime.adapter.ts`
- Modify: `apps/server/src/supply/adapter/out/runtime/__tests__/alibaba-1688-checkout-runtime.adapter.spec.ts`
- Modify: `apps/server/src/supply/adapter/in/agent/supply-agent-capability.adapter.ts`
- Modify: `apps/server/src/supply/adapter/in/agent/__tests__/supply-agent-capability.adapter.spec.ts`
- Modify: `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`
- Modify: `apps/server/src/supply/adapter/in/http/dto/list-purchase-orders.dto.ts`
- Modify: `apps/server/src/supply/adapter/in/http/procurement.controller.ts`
- Modify: `apps/server/src/supply/__tests__/procurement-flow.spec.ts`
- Create: `apps/server/src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts`
- Modify: `apps/server/src/supply/__tests__/supply.module.wiring.spec.ts`
- Modify: `apps/server/src/supply/supply.module.ts`
- Modify: `apps/server/src/supply/AGENTS.md`
- Create: `apps/web/src/app/(supply)/purchase-orders/lib/purchase-orders-api.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/lib/purchase-orders-api.spec.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/hooks/usePurchaseOrderSubmission.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/hooks/usePurchaseOrderSubmission.spec.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/page.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/PurchaseOrderTable.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/PurchaseOrderTable.spec.tsx`
- Modify: `apps/web/src/app/(supply)/AGENTS.md`

**Interfaces:**
- Consumes: Task 3 freshness gate, Task 2 attempt table, current PurchaseOrder rows, authenticated actor, and the existing optional checkout runtime.
- Produces: atomic providerless `pending -> ordered`, durable provider intents and reconciliation, an opaque freshness fence, one-retry web recovery for freshness only, and no duplicate external order after an ambiguous response.

- [ ] **Step 1: Write failing transaction, service, controller, Agent, and web tests**

Cover draft creation while stale, every `pending -> ordered` path through the gate, same-transaction state/PO locking, inactive and cross-tenant errors, idempotency-key reuse, provider success/failure/timeout, a second caller observing `prepared`, a process crash leaving `prepared`, stale-prepared promotion to `provider_unknown`, explicit reconciliation, Agent idempotency propagation, no post-submit refresh for current inbound procurement, and web auto-retry exactly once only for `SELLPIA_SYNC_REQUIRED`.

```ts
it('does not call the provider again after an ambiguous response', async () => {
  transaction.prepare.mockResolvedValue({
    kind: 'existing',
    attempt: { status: 'provider_unknown', idempotencyKey: 'po-1:submit-1' },
  });
  await expect(service.submit(input)).rejects.toMatchObject({
    code: 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED',
  });
  expect(runtime.submit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused Supply and web tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/adapter/out/transaction/purchase-order-submission.transaction.adapter.spec.ts src/supply/application/service/__tests__/purchase-order-submission.service.spec.ts src/supply/adapter/out/repository/__tests__/procurement.repository.adapter.spec.ts src/supply/adapter/out/runtime/__tests__/alibaba-1688-checkout-runtime.adapter.spec.ts src/supply/adapter/in/agent/__tests__/supply-agent-capability.adapter.spec.ts src/supply/__tests__/procurement-flow.spec.ts src/supply/__tests__/supply.module.wiring.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(supply\)/purchase-orders/lib/purchase-orders-api.spec.ts src/app/\(supply\)/purchase-orders/hooks/usePurchaseOrderSubmission.spec.tsx src/app/\(supply\)/purchase-orders/components/PurchaseOrderTable.spec.tsx
```

Expected: FAIL because ordered transitions bypass a persisted attempt/fence and the web has no freshness-aware retry helper.

- [ ] **Step 3: Implement the one allowed cross-domain transaction adapter**

`PurchaseOrderSubmissionTransactionPort` accepts organization, purchase order, item identities, idempotency key, actor, and the opaque fence returned by Inventory. Its Prisma adapter opens one transaction, locks the organization freshness row and PurchaseOrder row, compares `freshnessFence` as an uninterpreted UUID, rechecks `lastVerifiedAt` against database time, and confirms active organization-owned MasterProducts, then either:

- atomically changes a providerless order to `ordered`; or
- get-or-creates one `prepared` `PurchaseOrderSubmissionAttempt` and commits before any provider call.

The adapter may read Inventory state for fencing but must not derive freshness policy, update freshness, update stock, or expose the table through a general Supply repository. `SupplyModule` imports `InventoryModule` for the gate and refresh-request ports.

- [ ] **Step 4: Implement external attempt terminal states and reconciliation**

Keep statuses `prepared | provider_succeeded | provider_failed | provider_unknown | reconciled`. Only the request that atomically created a `prepared` row may make the provider call. Any later request that observes the row—whether concurrent or after a process crash—returns `PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED` and never calls the provider. On read or resubmit, atomically promote a `prepared` row older than 15 minutes to `provider_unknown`; this is recovery classification, not a retry. Pass the internal idempotency key to providers that support it. A clear response writes the terminal attempt and PurchaseOrder status; timeout or ambiguous output writes `provider_unknown` and never retries automatically.

Add action-body mutations `submit` and `reconcileSubmission` to the existing `POST /api/purchase-orders`; do not add another controller route. `submit` requires a client/Agent-created idempotency key, while actor identity comes from `@CurrentUser()`. Make generic `updateStatus` reject a transition to `ordered` so it cannot bypass `submit`. Reconciliation requires outcome and optional provider reference and writes `reconciliationOutcome`, `reconciledAt`, and authenticated `reconciledBy`.

Make actor and idempotency propagation identical at the submission port. Extend the existing `SubmitPurchaseOrderInput` external-order fields with required `idempotencyKey` and `userId`. The HTTP controller passes the client retry key and authenticated user's ID. Extract `purchaseOrderSubmissionIdempotencyKey(executionInput)` in `SupplyAgentCapabilityAdapter`; use that same helper for both the handler's `idempotencyKey` callback and `execute({ organizationId, input, requestedByUserId, ... })`. Agent execution rejects a missing actor, recomputes the helper key from the full execution input, and passes both it and `userId: requestedByUserId` to the port. The adapter must not compute and then discard either value. Add assertions that repeated Agent invocations reuse the key, the authenticated actor reaches the service, and reconciliation records the authenticated actor without accepting a client actor override.

Add `orderId` to the list query and return the latest attempt summary. Current Alibaba/manual/supplier purchase flows are inbound procurement and do not claim to mutate Sellpia stock, so they do not schedule a post-submit refresh. A future provider that can mutate Sellpia inventory must add an Inventory-owned durable refresh/outbox contract before it can be enabled; the Supply transaction adapter remains unable to write freshness state.

- [ ] **Step 5: Implement the web recovery boundary**

Move purchase-order calls out of the page. The submission hook sends a caller-created idempotency key, handles `SELLPIA_SYNC_REQUIRED` by joining/requesting the Task 7 sync, waits for one completed fresh generation, then retries the exact action once with the same key. It never auto-retries inactive/reference errors, login/quality failures, a second gate failure, provider failures, or `provider_unknown`. The table shows `외부 주문 생성됨 · 반영 확인 필요` and an explicit reconciliation action for ambiguous attempts.

- [ ] **Step 6: Run Supply, integration, tenant, and web gates**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply
rtk npm run test:integration --workspace=apps/server -- src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm exec --workspace=apps/web vitest -- run src/app/\(supply\)/purchase-orders/lib/purchase-orders-api.spec.ts src/app/\(supply\)/purchase-orders/hooks/usePurchaseOrderSubmission.spec.tsx src/app/\(supply\)/purchase-orders/components/PurchaseOrderTable.spec.tsx
rtk npm run build --workspace=apps/web
```

Expected: no real ordered transition bypasses the gate, and an ambiguous external attempt cannot produce a second provider call.

- [ ] **Step 7: Commit the common purchase boundary**

```bash
rtk git add apps/server/src/supply apps/web/src/app/\(supply\)/purchase-orders apps/web/src/app/\(supply\)/AGENTS.md
rtk git commit -m "feat: gate and reconcile purchase submissions"
```

### Task 10: Persist Rocket PO identities and provide a freshness-gated preview only

**Files:**
- Create: `extensions/order-collector/background/rocket-po-collection.js`
- Modify: `extensions/order-collector/background/service-worker.js`
- Modify: `extensions/order-collector/manifest.json`
- Modify: `extensions/order-collector/AGENTS.md`
- Modify: `extensions/tests/order-collector-rocket-sales-contract.test.mjs`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`
- Create: `packages/shared/src/schemas/rocket-purchase-preview.ts`
- Create: `packages/shared/src/schemas/rocket-purchase-preview.spec.ts`
- Create: `packages/shared/src/rocket-purchase-preview.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`
- Create: `apps/server/src/channels/application/port/in/rocket-po-catalog.port.ts`
- Create: `apps/server/src/channels/application/service/rocket-po-catalog.service.ts`
- Create: `apps/server/src/channels/application/service/__tests__/rocket-po-catalog.service.spec.ts`
- Create: `apps/server/src/channels/application/port/out/repository/rocket-po-catalog.repository.port.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-publication.repository.adapter.ts`
- Create: `apps/server/src/channels/adapter/out/repository/rocket-po-catalog.repository.adapter.ts`
- Create: `apps/server/src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`
- Modify: `apps/server/src/channels/AGENTS.md`
- Create: `apps/server/src/supply/domain/policy/rocket-capacity-preview.ts`
- Create: `apps/server/src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts`
- Create: `apps/server/src/supply/application/port/in/procurement/rocket-purchase-preview.port.ts`
- Create: `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts`
- Create: `apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts`
- Modify: `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`
- Modify: `apps/server/src/supply/adapter/in/http/procurement.controller.ts`
- Modify: `apps/server/src/supply/supply.module.ts`
- Modify: `apps/server/src/supply/__tests__/supply.module.wiring.spec.ts`
- Modify: `apps/server/src/supply/AGENTS.md`
- Create: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.spec.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx`
- Modify: `apps/web/src/lib/rocket-sales-collection.ts`
- Create: `apps/web/src/lib/rocket-sales-collection.spec.ts`
- Modify: `apps/web/src/app/(orders)/rocket-orders/lib/rocket-confirm-api.ts`
- Modify: `apps/web/src/app/(orders)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/CoupangWingCatalogImportDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/CoupangWingCatalogImportDialog.spec.tsx`
- Modify: `apps/web/src/app/(supply)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/rocket-orders/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`

**Interfaces:**
- Consumes: detailed Rocket PO browser collection, an owned active `channel = 'rocket'` ChannelAccount/vendor identity, confirmed component recipes, Channel availability, and Task 3 gate.
- Produces: non-destructive Rocket catalog identities, explicit completeness evidence, deterministic shared-component allocation, editable review preview, and no actual confirmation capability in `0.1.19`.

- [ ] **Step 1: Write failing completeness, catalog, capacity, and UI boundary tests**

Cover stable PO line IDs, collection run ID, non-display vendor ID, pages read, truncation, failed-detail PO numbers, 20 list-page/40 detail-page limits, organization/account/vendor mismatch, server canonical artifact hash and duplicate reuse, catalog upsert without inactivating prior Rocket observations, mapping queue inclusion, inactive/unmatched components, shared-component allocation order, edited-quantity bounds, stale inventory, and absence of workbook/provider/reservation/stock mutation calls.

```ts
it('allocates a shared component in stable ETA, PO, line order', () => {
  const rows = previewRocketCapacity({
    componentCapacity: new Map([['master-1', 5]]),
    rows: [laterRow, earlierRow],
  });
  expect(rows.map((row) => [row.poLineId, row.recommendedQuantity])).toEqual([
    ['line-earlier', 4],
    ['line-later', 1],
  ]);
});
```

- [ ] **Step 2: Run focused extension, server, and web tests and verify RED**

Run:

```bash
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/rocket-po-catalog.service.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts src/channels/adapter/out/repository/channel-catalog-identity-upsert.spec.ts src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.spec.ts src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/lib/rocket-sales-collection.spec.ts src/app/\(supply\)/purchase-orders/lib/rocket-purchase-preview-api.spec.ts src/app/\(supply\)/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
```

Expected: FAIL because collection silently skips detail failures, Rocket identities are not persisted through Channels, and the current boundary forbids even preview.

- [ ] **Step 3: Extract and harden detailed Rocket collection**

Move the existing `collectRocketPoRows`/scrape helpers out of the 4,000-line service worker into `rocket-po-collection.js`. Return this evidence with every collection:

```ts
type RocketPoCollectionEvidence = {
  collectionRunId: string;
  vendorId: string;
  listPagesRead: number;
  totalListPages: number;
  truncated: boolean;
  detailPoCount: number;
  failedPoNumbers: string[];
};
```

The web sends a UUID `runId` and the extension returns it as `collectionRunId`. Read the non-display `vendorId` field from every `/po-web/app/purchase-order/list` row; missing, mixed, or display-name-only identity makes the collection incomplete. Never substitute `vendorName`. Each row gets a deterministic `poLineId` from PO number, product number, barcode, and row ordinal. Do not swallow detail failures. Mark incomplete at the 20th list page or 40th detail page, or when any requested PO lacks detail. Increment the manifest version from Task 6's `0.1.66` to `0.1.67`.

- [ ] **Step 4: Publish Rocket identities through Channels**

Validate an active organization-owned Rocket ChannelAccount and exact collected vendor ID before publication. Canonicalize bounded evidence/rows on the server, compute SHA-256 there, use artifact name `rocket-po-catalog.json`, and reuse one completed `SourceImportRun` for the same organization/account/hash; never trust a client hash. Extract the existing listing/option identity upsert from `channel-catalog-publication.repository.adapter.ts` into the focused helper and reuse it for Rocket instead of duplicating catalog persistence. Upsert observed identities with source type `coupang_rocket_po_catalog`, preserve confirmed component recipes, and never inactivate an identity merely because a later PO collection did not contain it. Export the incoming `ROCKET_PO_CATALOG_PORT` from Channels for Supply; do not add a second browser-facing controller because the authenticated `previewRocket` action owns collection validation and calls this port. Update the source predicates in `channel-sku-mapping.repository.adapter.ts` so list/count/refresh/candidate queries include both Wing catalog and Rocket PO catalog. The Wing import dialog remains available only to Coupang accounts while the matching page accepts both `coupang` and `rocket` rows.

- [ ] **Step 5: Implement a pure preview action in Supply**

Use the existing single `POST /api/purchase-orders` action-body endpoint with `action: 'previewRocket'`. Its strict shared request contains `channelAccountId`, bounded collection evidence/rows, and optional edited quantities—not organization or actor IDs. The service calls Channels to validate/publish/resolve observed identities, checks collection completeness/account/vendor, and calls the Inventory gate before calculating. Sort by planned delivery date, PO number, then PO line ID. Allocate every confirmed component's read-time capacity across rows in memory; edited quantities cannot exceed recomputed remaining capacity. Return row reasons `mapping_required`, `component_inactive`, `insufficient_capacity`, `collection_incomplete`, or `vendor_mismatch`.

Do not create a PurchaseOrderSubmissionAttempt, reservation, commitment, confirmation file, provider call, or stock update. The UI's primary action is `미리보기 다시 계산`; actual confirmation remains disabled with a clear `0.1.19에서는 검토만 가능` explanation.

- [ ] **Step 6: Run extension, server, integration, and web gates**

Run:

```bash
rtk node --check extensions/order-collector/background/rocket-po-collection.js
rtk node --check extensions/order-collector/background/service-worker.js
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
rtk npm exec --workspace=apps/web vitest -- run src/lib/rocket-sales-collection.spec.ts src/app/\(supply\)/purchase-orders/lib/rocket-purchase-preview-api.spec.ts src/app/\(supply\)/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
rtk npm run build --workspace=apps/web
rtk git diff --check -- extensions/order-collector extensions/tests
```

Expected: incomplete collections block preview; complete collections produce stable recommendations; no Rocket path can submit or mutate inventory.

- [ ] **Step 7: Commit Rocket preview**

```bash
rtk git add extensions/order-collector extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs packages/shared apps/server/src/channels apps/server/src/supply apps/web/src/lib/rocket-sales-collection.ts apps/web/src/lib/rocket-sales-collection.spec.ts apps/web/src/app/\(supply\)/purchase-orders apps/web/src/app/\(supply\)/AGENTS.md apps/web/src/app/\(orders\)/rocket-orders apps/web/src/app/\(catalog\)/product-hub/matching
rtk git commit -m "feat: preview Rocket purchases from component capacity"
```

### Task 11: Build the five canonical, URL-controlled operations workspaces

**Files:**
- Modify: `apps/web/src/components/ui/TabLayout.tsx`
- Modify: `apps/web/src/components/ui/__tests__/TabLayout.spec.tsx`
- Modify: `apps/web/src/components/ui/AGENTS.md`
- Modify: `apps/web/src/components/ui/Pagination.tsx`
- Create: `apps/web/src/components/ui/__tests__/Pagination.spec.tsx`
- Create: `apps/web/src/hooks/useUrlControlledTab.ts`
- Create: `apps/web/src/hooks/useUrlControlledTab.spec.tsx`
- Modify: `apps/web/src/hooks/AGENTS.md`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryWorkspace.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryToolbar.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryHubWorkspace.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryHubWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSyncWorkspace.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSyncWorkspace.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaImportHistory.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaImportHistory.spec.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/PurchaseOrdersWorkspace.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/PurchaseOrdersWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/PurchaseOrderHeader.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/page.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderProcessingWorkspace.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderProcessingWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(orders)/orders/page.tsx`
- Modify: `apps/web/src/app/(orders)/orders/components/OrderHeader.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderCollectionWorkspace.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderCollectionWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/MallAccountSection.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/MallAccountSection.spec.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/UnshippedItemsWorkspace.tsx`
- Modify: `apps/web/src/app/(inventory)/unshipped-items/page.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OutboundWorkspace.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OutboundWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/outbound/page.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderHubWorkspace.tsx`
- Create: `apps/web/src/app/(orders)/order-hub/components/OrderHubWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-hub/components/SmartPicking.tsx`
- Delete: `apps/web/src/app/(orders)/order-hub/components/OutboundMgmt.tsx`
- Delete: `apps/web/src/app/(orders)/order-hub/components/OrderMatching.tsx`
- Delete: `apps/web/src/app/(orders)/order-hub/components/OrderMatching.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-hub/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/components/DeliverySearch.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/components/OrderInventory.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/components/OrderCompare.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/components/SyncCheck.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductOptionsWorkspace.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductOptionsWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/page.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductHubWorkspace.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductHubWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`
- Modify: `apps/web/src/components/QuickActionFab.tsx`
- Modify: `apps/web/src/components/__tests__/QuickActionFab.spec.tsx`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/AGENTS.md`
- Modify: `apps/web/src/app/(supply)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/order-collection/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/order-status-hub/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`

**Interfaces:**
- Consumes: existing route functionality as extracted workspace components, Tasks 7–10 status/purchase/Rocket components, and existing query parameters.
- Produces: `/inventory-hub`, `/purchase-orders`, `/order-hub`, `/product-hub`, and `/product-hub/matching` as the only canonical operations workspaces; URL-owned view state; lazy unmount; accessible tabs; one page heading.

- [ ] **Step 1: Write failing navigation, accessibility, lazy-mount, and workspace tests**

Prove that URL parameters select views and survive refresh/back-forward navigation; invalid values normalize deterministically; canonical workspaces opt into unmounting inactive content instead of CSS-hiding it; `ArrowLeft`, `ArrowRight`, `Home`, and `End` move focus/selection; one `tablist`/`tabpanel` and one `h1` exist; first/previous/next/last page buttons have accessible names; and the global quick-action button is absent on the five high-density canonical operations routes.

```tsx
it('unmounts inactive tab content when requested', async () => {
  render(<TabLayout title="운영" tabs={tabs} activeTab="first" onTabChange={onChange} unmountInactive />);
  expect(screen.getByText('first content')).toBeInTheDocument();
  expect(screen.queryByText('second content')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run shared UI and workspace tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/components/ui/__tests__/TabLayout.spec.tsx src/components/ui/__tests__/Pagination.spec.tsx src/hooks/useUrlControlledTab.spec.tsx src/app/\(inventory\)/inventory-hub/components/InventoryHubWorkspace.spec.tsx src/app/\(supply\)/purchase-orders/components/PurchaseOrdersWorkspace.spec.tsx src/app/\(orders\)/order-hub/components/OrderHubWorkspace.spec.tsx src/app/\(orders\)/order-hub/components/OrderCollectionWorkspace.spec.tsx src/app/\(orders\)/order-hub/components/OrderProcessingWorkspace.spec.tsx src/app/\(orders\)/order-hub/components/OutboundWorkspace.spec.tsx src/app/\(catalog\)/product-hub/components/ProductHubWorkspace.spec.tsx src/app/\(catalog\)/product-hub/components/ProductOptionsWorkspace.spec.tsx src/app/\(catalog\)/product-hub/matching/page.spec.tsx src/components/__tests__/QuickActionFab.spec.tsx src/components/layout/__tests__/AppLayout.auth.spec.tsx
```

Expected: FAIL because hidden tabs stay mounted, route state is copied into local state, and the canonical workspace components do not exist.

- [ ] **Step 3: Make tabs accessible and the URL authoritative**

Add an opt-in `unmountInactive?: boolean` contract to `TabLayout`; preserve the current mounted-panel default for unrelated consumers, while all five canonical operations workspaces pass `unmountInactive`. Add `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, stable IDs, roving `tabIndex`, and keyboard navigation. `useUrlControlledTab` reads one allowed value from `useSearchParams` and changes only its owned query key through `router.push`; it preserves all unrelated keys and has no mirrored `useState`.

Add labeled first/previous/next/last controls to `Pagination`. Keep `wrapTabs` behavior and existing call-site compatibility.

In `AppLayout`, suppress `QuickActionFab` on `/inventory-hub`, `/purchase-orders`, `/order-hub`, `/product-hub`, and `/product-hub/matching` (including their query variants). Keep the FAB on unrelated routes. Test route-based absence/presence instead of trying to infer pixel geometry in Vitest.

- [ ] **Step 4: Consolidate Inventory and Purchase**

Use these exact top-level views:

```text
/inventory-hub: tab=overview | inventory | attention | history
/purchase-orders: tab=general | rocket
```

Extract the existing inventory table into the canonical hub's `InventoryWorkspace`; the temporary legacy page renders that component until Task 12 replaces the page with a redirect. Do not embed its page. `overview` shows freshness and operational summaries, `inventory` keeps current search/filter/export/barcode features, `attention` reuses Sellpia zero/channel zero/bottleneck components plus channel-availability evidence and links SKU review to `/product-hub/matching?status=needs_review`, and `history` has exactly `view=assets | transfer | return`. Sellpia/manual file attempts stay only in Task 7's shared drawer; channel availability belongs in `attention`; ledger/audit/I/O/Rocket-manual duplicates are removed from the workspace. Remove the former Sellpia top tab and its route-local import/history components after replacing them with the drawer.

Purchase `general` keeps the current purchase table/create flow and honors `orderId` and `supplierId`; `rocket` renders Task 10's preview. Put `SellpiaFreshnessStatus` in both workspace headers. Make `InventoryToolbar`, `PurchaseOrderHeader`, and `OrderHeader` accept a heading-level/heading-visibility contract so they render `h2` below a canonical shell and never introduce a second `h1`.

- [ ] **Step 5: Consolidate Order around operator actions**

Use `tab=collection | processing | shipping | exceptions`. Extract order collection, order processing, unshipped, and outbound components under canonical `order-hub/components`; temporary legacy pages render those components until Task 12 redirects. Move the existing order-page behavior assertions into `OrderProcessingWorkspace.spec.tsx` before converting the route test to a redirect test. Collection puts `Sellpia 전송 필요`, `전송 요청됨`, `재고 반영 대기`, and recovery actions above charts. Update `MallAccountSection` and its focused spec so every mall account appears once under `조치 필요`, `수집 가능`, or `설정 필요`, with the classification derived from existing connection/collection state rather than display text. Processing reuses orders and Smart Picking. Replace the two duplicate outbound implementations with one `OutboundWorkspace`; Shipping reuses it and delivery search. Exceptions reuses unshipped, order inventory, compare, and sync check through `view`.

Delete the non-mutating `OrderMatching` duplicate; channel recipe repair remains in `/product-hub/matching`. Convert child workspace headings to `h2` so the canonical shell owns the only `h1`. Put `SellpiaFreshnessStatus` in the collection header.

- [ ] **Step 6: Consolidate Product list/options and retain matching density**

`/product-hub?view=list|options` switches between the existing product list and canonical `ProductOptionsWorkspace` without dropping search, filters, or pagination. Move the existing options-page behavior assertions into `ProductOptionsWorkspace.spec.tsx` before Task 12 changes the page test to redirect behavior. Matching remains a standalone workspace, adds compact freshness status, includes inactive-component availability warnings in `매칭 확인 필요`, and continues to require an operator save before any recipe is persisted.

- [ ] **Step 7: Run focused and full web verification**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/components/ui/__tests__/TabLayout.spec.tsx src/components/ui/__tests__/Pagination.spec.tsx src/hooks/useUrlControlledTab.spec.tsx src/app/\(inventory\)/inventory-hub src/app/\(supply\)/purchase-orders src/app/\(orders\)/order-hub src/app/\(orders\)/order-collection src/app/\(catalog\)/product-hub src/components/__tests__/QuickActionFab.spec.tsx src/components/layout/__tests__/AppLayout.auth.spec.tsx
rtk npm run build --workspace=apps/web
```

Expected: all canonical workspaces preserve their existing operational capabilities, inactive views make no background fetch/timer/toast, and accessibility assertions pass.

- [ ] **Step 8: Commit canonical workspaces**

```bash
rtk git add apps/web/src/components apps/web/src/hooks/useUrlControlledTab.ts apps/web/src/hooks/useUrlControlledTab.spec.tsx apps/web/src/hooks/AGENTS.md apps/web/src/app/\(inventory\) apps/web/src/app/\(supply\) apps/web/src/app/\(orders\) apps/web/src/app/\(catalog\)/product-hub
rtk git commit -m "refactor: consolidate operations workspaces"
```

### Task 12: Preserve old links with query-aware redirects and reduce duplicate navigation

**Files:**
- Create: `apps/web/src/lib/operations-navigation.ts`
- Create: `apps/web/src/lib/operations-navigation.spec.ts`
- Create: `apps/web/src/app/__tests__/operations-redirects.spec.ts`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/page.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/AGENTS.md`
- Modify: `apps/web/src/app/(inventory)/unshipped-items/page.tsx`
- Modify: `apps/web/src/app/(inventory)/outbound/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-hub/page.tsx`
- Modify: `apps/web/src/app/(orders)/orders/page.tsx`
- Modify: `apps/web/src/app/(orders)/orders/__tests__/orders-page.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/page.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/page.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/page.spec.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/sidebar-menu.ts`
- Modify: `apps/web/src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts`
- Modify: `apps/web/src/components/RebuildReadinessBanner.tsx`
- Modify: `apps/web/src/components/__tests__/RebuildReadinessBanner.spec.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOsHeader.tsx`
- Modify: `apps/web/src/app/(finance)/supplier-hub/page.tsx`
- Create: `apps/web/src/app/(finance)/supplier-hub/page.spec.tsx`
- Delete: `apps/web/src/app/(finance)/supplier-hub/components/SupplierPurchases.tsx`
- Modify: `apps/web/src/app/(finance)/AGENTS.md`
- Modify: `apps/server/src/automation/domain/policy/action-seeds.ts`
- Modify: `apps/server/src/automation/domain/policy/__tests__/action-seeds.spec.ts`
- Modify: `apps/server/src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts`
- Modify: `apps/server/src/automation/domain/policy/browser-operation-producers.ts`
- Modify: `apps/server/src/automation/domain/policy/browser-operation-producers.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sync.service.ts`
- Modify: `apps/server/src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts`

**Interfaces:**
- Consumes: Task 11 canonical routes and all legacy query strings/bookmarks.
- Produces: server redirects that preserve unrelated query parameters, canonical internal hrefs, and one compact five-entry operations navigation group.

- [ ] **Step 1: Write failing redirect-table and sidebar tests**

Encode every mapping from the design plus `/orders -> /order-hub?tab=processing`, actual legacy `return-transfer`, and the exact old `/inventory-hub` and `/order-hub` aliases listed below. Parameterize real redirect-page tests, not only the pure helper. Prove canonical keys win over consumed legacy `tab`/`view`, repeated unrelated values such as `status=a&status=b` survive in order, `orderId`, `supplierId`, date filters, and search survive once, and canonical URLs return `null` from the resolver so wrappers cannot loop.

```ts
expect(resolveOperationsRedirect('/stock-ops', {
  tab: 'mapping-attention',
  search: '보넷',
})).toBe('/product-hub/matching?status=needs_review&search=%EB%B3%B4%EB%84%B7');
```

- [ ] **Step 2: Run redirect and navigation tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/operations-navigation.spec.ts src/app/__tests__/operations-redirects.spec.ts src/app/\(inventory\)/stock-ops/page.spec.tsx src/app/\(orders\)/orders/__tests__/orders-page.spec.tsx src/app/\(catalog\)/product-hub/options/page.spec.tsx src/app/\(finance\)/supplier-hub/page.spec.tsx src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts src/components/__tests__/RebuildReadinessBanner.spec.tsx src/app/\(analytics\)/dashboard/components/DashboardSidePanel.spec.tsx
rtk npm exec --workspace=apps/server vitest -- run src/automation/domain/policy/__tests__/action-seeds.spec.ts src/automation/domain/policy/browser-operation-producers.spec.ts src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts
```

Expected: FAIL because legacy pages still render or local-state-select tabs and producers still emit old hrefs.

- [ ] **Step 3: Implement one pure redirect resolver**

Use the design's complete table:

```text
/inventory -> /inventory-hub?tab=inventory
/stock-ops -> /inventory-hub?tab=attention&view=sellpia-zero
/order-collection -> /order-hub?tab=collection
/orders -> /order-hub?tab=processing
/unshipped-items -> /order-hub?tab=exceptions&view=unshipped
/outbound -> /order-hub?tab=shipping
/order-status-hub -> /order-hub?tab=exceptions&view=order-inventory
/rocket-orders -> /purchase-orders?tab=rocket
/product-hub/options -> /product-hub?view=options
```

Map every documented stock/status subtab, accepting both `return` and existing `return-transfer`. Use these exact compatibility aliases:

```text
/inventory-hub?tab=status         -> /inventory-hub?tab=inventory
/inventory-hub?tab=po             -> /purchase-orders?tab=general
/inventory-hub?tab=sellpia-sync   -> /inventory-hub?tab=overview
/inventory-hub?tab=assets         -> /inventory-hub?tab=history&view=assets
/inventory-hub?tab=io             -> /inventory-hub?tab=history&view=transfer
/inventory-hub?tab=ledger         -> /inventory-hub?tab=history&view=transfer
/inventory-hub?tab=audits         -> /inventory-hub?tab=overview
/inventory-hub?tab=rocket-events  -> /inventory-hub?tab=attention&view=channel-availability
/order-hub?tab=orders             -> /order-hub?tab=processing
/order-hub?tab=picking            -> /order-hub?tab=processing&view=picking
/order-hub?tab=outbound           -> /order-hub?tab=shipping
/order-hub?tab=matching           -> /product-hub/matching
```

The helper accepts `Record<string, string | string[] | undefined>`, strips only consumed legacy keys, applies canonical mapped keys last, preserves repeated unrelated query values, and sorts output keys while retaining each value's order for deterministic tests. It returns `string | null`, with `null` for an already canonical location.

- [ ] **Step 4: Convert legacy pages to server redirects**

Legacy-only route files use Next.js 16 server-page props with `searchParams: Promise<Record<string, string | string[] | undefined>>`, await them, then call `redirect()` only when `resolveOperationsRedirect(...)` returns a destination. They contain no client hooks, API calls, timers, or workspace content. `/inventory-hub` and `/order-hub` become thin server wrappers that redirect only recognized old aliases and otherwise render their Task 11 client workspace. Task 11's extracted components remain imported only by canonical workspaces. Verify `orderId` selects/highlights a real row and `supplierId` filters the general purchase view after redirect/internal navigation.

- [ ] **Step 5: Replace internal hrefs before trimming the sidebar**

Update Action Board seeds, browser producer alerts, channel sync alerts, dashboard cards/panel, Agent OS header, readiness banner, and their tests to canonical URLs. Quick-action visibility and links were already finalized in Task 11. Remove the Supplier Hub `상세 구매` tab and its duplicate table; supplier-oriented purchase navigation goes to `/purchase-orders?supplierId=...`. Extract Sidebar data to `sidebar-menu.ts`; in the operations section keep exactly:

```text
상품 관리 -> /product-hub
상품 매칭 -> /product-hub/matching
주문 처리 -> /order-hub
발주 관리 -> /purchase-orders
재고 관리 -> /inventory-hub
```

Do not remove unrelated sourcing, advertising, finance, settings, or automation navigation.

- [ ] **Step 6: Run link scans, tests, and web build**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/operations-navigation.spec.ts src/app/__tests__/operations-redirects.spec.ts src/app/\(inventory\)/stock-ops/page.spec.tsx src/app/\(orders\)/orders/__tests__/orders-page.spec.tsx src/app/\(catalog\)/product-hub/options/page.spec.tsx src/app/\(finance\)/supplier-hub/page.spec.tsx src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts src/components/__tests__/RebuildReadinessBanner.spec.tsx src/app/\(analytics\)/dashboard/components/DashboardSidePanel.spec.tsx
rtk npm exec --workspace=apps/server vitest -- run src/automation/domain/policy/__tests__/action-seeds.spec.ts src/automation/domain/policy/browser-operation-producers.spec.ts src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts
rtk npm run build --workspace=apps/web
rtk rg -n -e "href=[{]?[\"']/(inventory|stock-ops|order-collection|orders|unshipped-items|outbound|order-status-hub|rocket-orders|product-hub/options)([?\"']|$)" -e "href:\\s*[\"']/(inventory|stock-ops|order-collection|orders|unshipped-items|outbound|order-status-hub|rocket-orders|product-hub/options)([?\"']|$)" apps/web/src apps/server/src
```

Expected: tests/build pass and the final `rg` exits 1 with no obsolete internal href. Legacy route files themselves may still contain their source pathname in redirect tests.

- [ ] **Step 7: Commit redirects and navigation cleanup**

```bash
rtk git add apps/web/src/lib/operations-navigation.ts apps/web/src/lib/operations-navigation.spec.ts apps/web/src/app apps/web/src/components apps/server/src/automation apps/server/src/channels/application/service/channel-sync.service.ts apps/server/src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts
rtk git commit -m "refactor: redirect legacy operations routes"
```

### Task 13: Update durable guidance and run the complete release verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEV_DATA_BUNDLES.md`
- Modify: `docs/TESTING.md`
- Create: `docs/runbooks/sellpia-inventory-freshness.md`
- Modify: `docs/runbooks/sellpia-rocket-inventory-sync.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `apps/web/src/app/AGENTS.md`

**Interfaces:**
- Consumes: the final code/schema/route behavior from Tasks 1–12 and the open authenticated Chrome environment.
- Produces: executable operator recovery guidance, updated architecture/navigation ownership, a rehearsed data migration, full automated evidence, and live browser evidence before implementation is declared complete.

- [ ] **Step 1: Update architecture, data, testing, and operator runbooks**

Document Inventory ownership of freshness/publication, Supply's narrow opaque fence and attempts, Channels' inactive/Rocket identity rules, the web coordinator, the five canonical workspaces, and compatibility redirects. `sellpia-inventory-freshness.md` is the authoritative auto-sync runbook and must list prerequisites, source binding, normal automatic flow, manual fallback attestation, login/capability/quality/lease/provider-unknown recovery, safe agent actions, prohibited secrets/logging, exact verification commands, blockers, and final report format.

Update Rocket guidance to preview-only and matching guidance to distinguish normalized-name/AI suggestions from operator-confirmed recipes. Update dev-data instructions for `SellpiaInventoryState`, completed/failed `SourceImportRun`, and `PurchaseOrderSubmissionAttempt` while keeping raw workbook bytes and credentials out of bundles.

- [ ] **Step 2: Run schema, migration, shared, script, and generated-document gates**

Run:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm exec --workspace=packages/shared vitest -- run
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run test:scripts
rtk npm run data:migrate -- status
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- status
rtk npm run check:schema-artifact-sync
```

Expected: migration ID `v0.1.19:001_sellpia_inventory_freshness` is applied by the first `up`; the second `up` reports it skipped/already applied without changing data; the final status is clean; and generated ERD/Graphify artifacts match Prisma.

- [ ] **Step 3: Run full backend and architecture verification**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: all tests/scanners/build pass and the NestJS boot log reports the application started with Inventory, Channels, and Supply modules wired. Stop the development server after confirming boot.

- [ ] **Step 4: Run full frontend and extension verification**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
rtk node --check extensions/order-collector/background/sellpia-inventory.js
rtk node --check extensions/order-collector/background/rocket-po-collection.js
rtk node --check extensions/order-collector/background/order-collection-lifecycle.js
rtk node --check extensions/order-collector/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
rtk node --test extensions/tests/order-collector-sellpia-inventory.test.mjs extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs extensions/tests/collection-focus-policy.test.mjs
rtk git diff --check -- extensions/order-collector extensions/tests
```

Expected: all web tests/build and extension behavior/static/diff checks pass.

- [ ] **Step 5: Audit the authoritative-stock and preview-only boundaries**

Run:

```bash
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
```

Expected: both boundary tests pass. The authoritative scanner covers Prisma creates/updates/upserts and raw SQL stock assignments, allows only the Inventory publication adapter plus explicit test-fixture exceptions, and reports no runtime writer outside Inventory.

- [ ] **Step 6: Verify the end-to-end flows in the already open Chrome**

Use the authenticated KidItem/Sellpia tabs without stealing focus during automatic runs and record screenshots/log-safe observations for:

1. unbound organization confirmation, first full download/publication, and compact status becoming fresh;
2. lease ownership across two KidItem tabs, heartbeat, owner-only cancel, tab close, expiry, and reclaim;
3. Sellpia login expiry, extension absence/old capability, HTML/invalid workbook, quality hard block, retry, and previous snapshot preservation;
4. unchanged manual/TTL verification, first post-order same-hash three-minute confirmation, and no third loop;
5. one and many mall collections producing no refresh until Sellpia transmission succeeds, then server-owned two-minute settle/five-minute cap/coalescing;
6. stale purchase block, automatic sync and one retry, inactive item block, external timeout as `provider_unknown`, and explicit reconcile without a second provider call;
7. complete versus missing/truncated/vendor-mismatched Rocket collection, deterministic preview, edited capacity validation, and no actual submit control;
8. every compatibility URL preserving unrelated and repeated query values, browser back/forward, inactive-tab unmount, keyboard tabs, labels, one `h1`, and no global quick action on the five dense workspaces.

Never capture or report cookies, passwords, workbook contents, auth tokens, or raw provider responses.

- [ ] **Step 7: Commit documentation and generated verification artifacts**

```bash
rtk git add docs/ARCHITECTURE.md docs/DEV_DATA_BUNDLES.md docs/TESTING.md docs/runbooks/sellpia-inventory-freshness.md docs/runbooks/sellpia-rocket-inventory-sync.md docs/runbooks/channel-sellpia-matching.md apps/web/src/app/AGENTS.md docs/ERD.md docs/erd graphify-out/schema graphify-out/schema-consumers
rtk git commit -m "docs: document Sellpia inventory operations"
```

- [ ] **Step 8: Run PR contract guards and inspect the final committed diff**

Run:

```bash
rtk git diff --check
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git status --short
rtk git diff --stat origin/develop...HEAD
rtk git log --oneline origin/develop..HEAD
```

Expected: no whitespace errors, both PR guards pass, only the Sellpia freshness/operations-workspace domain is changed, `VERSION` is `0.1.19`, and commits follow Tasks 1–13 without unrelated work.

## Plan Self-Review Checklist

- [ ] Tasks 1–4 establish one persisted freshness derivation, one raw-file validation/publication path, generation fencing, bounded quality policy, same-hash confirmation, and unified history.
- [ ] Tasks 5 and 10 keep confirmed recipes diagnosable when components are inactive and never treat normalized-name or AI suggestions as saved recipes.
- [ ] Tasks 6–8 use the existing Chrome extension and authenticated KidItem tab without forwarding credentials, automatically opening/focusing tabs, or claiming that a transmission request proves Sellpia acceptance.
- [ ] Task 9 gates providerless, manual, supplier, Agent, and external checkout paths and prevents retry after ambiguous external side effects.
- [ ] Rocket remains preview-only: no reservation, persistent allocation, confirmation file, provider submit, or stock mutation exists.
- [ ] Tasks 11–12 leave five canonical operations entries, one heading, accessible URL-owned tabs, lazy unmount, query-preserving redirects, and no page-to-page embedding.
- [ ] Inventory publication is the only runtime owner of `MasterProduct.currentStock`; every failure preserves the previous completed snapshot.
- [ ] Organization scope and actor ownership are enforced in controller DTOs, repositories, lease controls, attempts, Rocket identities, and source binding.
- [ ] `VERSION`, Prisma, durable migration, ERD/Graphify output, scoped `AGENTS.md`, architecture docs, testing guidance, and runbooks agree on release `0.1.19`.
- [ ] Automated and live-Chrome verification cover fresh/stale/syncing/failed, concurrency, server-owned order coalescing, purchase retry/reconcile, Rocket completeness, redirects, inactive tabs, and accessibility before completion is claimed.
