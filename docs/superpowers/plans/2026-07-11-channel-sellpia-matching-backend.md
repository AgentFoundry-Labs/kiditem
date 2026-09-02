# Channel SKU Component Matching Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose account-scoped ChannelSku matching reads, live Sellpia candidates, status refresh, and atomic multi-component replacement while retiring the active ProductOption reconciliation service.

**Architecture:** Channels owns the mapping workflow and component transaction. Inventory owns `InventorySku` reads behind an incoming application port. A Channels adapter bridges its local outgoing port to the Inventory port, so channel application services never import Inventory repositories. Candidate ranking is a pure Channels-domain function. `ChannelSkuComponent` is the only confirmed mapping truth.

**Tech Stack:** NestJS modules and ports, Prisma v7, PostgreSQL, Zod DTO validation, React-facing shared contracts, Vitest, Testcontainers.

## Global Constraints

- Complete schema and both import plans first.
- Do not query `ProductOption`, legacy `Inventory`, `BundleComponent`, `ChannelReconciliationItem`, or `ChannelListingOption.optionId` from any new matching path.
- Do not write InventorySku stock or metadata from Channels.
- Do not persist candidate rows.
- The active matching queue includes only ChannelSku rows whose `lastImportRun` is a completed `coupang_wing_catalog` run. Legacy rows with no new import provenance stay outside the rebuilt queue.
- Do not auto-confirm any candidate; the operator always confirms component quantities.
- All list/write/candidate operations are organization-scoped.
- A wrong-organization ChannelSku is 404; a foreign/missing InventorySku in a replacement is 400.
- Validate the complete replacement request and inventory ownership before deleting current components.
- Component delete/create and status update occur in one transaction.
- `matched` is derived from component existence; unmapped advisory status is refreshed from current deterministic evidence.
- Keep physical legacy reconciliation tables until a later contract release, but remove their active controller/service/AI write bridge in this plan.

---

## Fixed API

```text
GET /api/channels/sku-mappings
POST /api/channels/sku-mappings/status-refresh
GET /api/channels/sku-mappings/:channelSkuId/candidates
PUT /api/channels/sku-mappings/:channelSkuId/components
```

List query:

```ts
{
  channelAccountId?: string;
  mappingStatus?: 'all' | 'unmatched' | 'needs_review' | 'matched';
  search?: string;
  page?: number;   // default 1
  limit?: number;  // default 50, max 200
}
```

Search covers normalized product/SKU fields only: parent external ID, registered/display name, SKU external ID, seller SKU, option name, barcode, and model number. It never scans `rawJson`.

Counts use the same organization/account/search base filter but ignore the selected status filter.

## File Structure

### Inventory read boundary

Create:

- `apps/server/src/inventory/application/port/in/stock/inventory-sku-read.port.ts`
- `apps/server/src/inventory/application/port/out/repository/inventory-sku-read.repository.port.ts`
- `apps/server/src/inventory/application/service/inventory-sku-read.service.ts`
- `apps/server/src/inventory/application/service/inventory-sku-read.service.spec.ts`
- `apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.ts`
- `apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts`

Modify:

- `apps/server/src/inventory/inventory.module.ts`
- `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- `apps/server/src/inventory/application/port/in/stock/index.ts`
- `apps/server/src/inventory/application/port/out/repository/index.ts`
- `apps/server/src/inventory/AGENTS.md`

### Channels matching

Create:

- `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`
- `apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts`
- `apps/server/src/channels/application/port/out/cross-domain/inventory-sku-read.port.ts`
- `apps/server/src/channels/adapter/out/inventory/inventory-sku-read.adapter.ts`
- `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`
- `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- `apps/server/src/channels/adapter/in/http/dto/channel-sku-mapping-query.dto.ts`
- `apps/server/src/channels/adapter/in/http/dto/replace-channel-sku-components.dto.ts`
- `apps/server/src/channels/adapter/in/http/channel-sku-mapping.controller.ts`
- `apps/server/src/channels/adapter/in/http/__tests__/channel-sku-mapping.controller.spec.ts`
- `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`

Modify:

- `apps/server/src/channels/channels.module.ts`
- `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`
- `apps/server/src/channels/adapter/in/http/dto/index.ts`
- `apps/server/src/channels/application/port/out/cross-domain/index.ts`
- `apps/server/src/channels/application/port/out/repository/index.ts`
- `apps/server/src/channels/AGENTS.md`

## Task 1: Add the InventorySku Read Port

**Files:** Inventory read-boundary files listed above.

- [ ] **Step 1: Write failing service and repository tests**

Freeze this owner-domain port:

```ts
export const INVENTORY_SKU_READ_PORT = Symbol('INVENTORY_SKU_READ_PORT');

export type InventorySkuReadModel = {
  id: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
};

export interface InventorySkuReadPort {
  findByIds(organizationId: string, ids: string[]): Promise<InventorySkuReadModel[]>;
  findBySellpiaCodes(organizationId: string, codes: string[]): Promise<InventorySkuReadModel[]>;
  findByBarcodes(organizationId: string, barcodes: string[]): Promise<InventorySkuReadModel[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<InventorySkuReadModel[]>;
}
```

The outgoing repository port uses the same methods. Test:

- empty ID/evidence lists return without a repository call;
- identifier strings are trimmed but not numerically coerced;
- search trims the query, requires at least one non-space character, caps limit at 100;
- repository filters every method by organization;
- search exact Sellpia code sorts before prefix code, name, option, and barcode matches;
- barcode lookup returns all duplicates rather than pretending uniqueness.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/inventory-sku-read.service.spec.ts src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts
```

Expected: FAIL on missing files.

- [ ] **Step 3: Implement service/repository/module wiring**

Use Prisma `findMany` with `{organizationId, id/code/barcode: {in: ...}}`. Search uses a tenant-scoped Prisma query with case-insensitive `contains`, then stable sort in the repository so exact code is first. Select only the read-model fields; do not expose raw JSON or prices.

Export only `INVENTORY_SKU_READ_PORT` in addition to the module's existing `INVENTORY_PORT`. Update `apps/server/src/inventory/AGENTS.md` in the same change so its documented module-export boundary names this read-only matching capability.

- [ ] **Step 4: Run tests and wiring gate**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/inventory-sku-read.service.spec.ts src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/server/src/inventory/application/port/in/stock/inventory-sku-read.port.ts apps/server/src/inventory/application/port/out/repository/inventory-sku-read.repository.port.ts apps/server/src/inventory/application/port/in/stock/index.ts apps/server/src/inventory/application/port/out/repository/index.ts apps/server/src/inventory/application/service/inventory-sku-read.service.ts apps/server/src/inventory/application/service/inventory-sku-read.service.spec.ts apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.ts apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts apps/server/src/inventory/inventory.module.ts apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts apps/server/src/inventory/AGENTS.md
rtk git commit -m "feat: expose InventorySku matching reads"
```

## Task 2: Implement Pure Candidate Ranking

**Files:**

- Create: `apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts`
- Create: `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`

- [ ] **Step 1: Write failing pure-domain tests**

Define:

```ts
export type ChannelSkuEvidence = {
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  productNames: string[];
  optionName: string | null;
};

export type CandidateInventorySku = {
  id: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
};

export type RankedInventorySkuCandidate = CandidateInventorySku & {
  reason: 'exact_sellpia_code' | 'unique_barcode' | 'ambiguous_identifier' | 'name_suggestion' | 'manual_search';
  rank: number;
};
```

Test exact behavior:

1. exact Sellpia code in sellerSku ranks before modelNumber exact and both dedupe by InventorySku ID;
2. a hyphenated alphanumeric code token extracted from optionName can be exact code evidence, while ordinary name words cannot;
3. unique normalized identifier is lower priority than exact code;
4. modelNumber/barcode identifier normalization removes non-digits, accepts only 8–14 digits, and never numeric-coerces the retained string;
5. an identifier shared by two InventorySkus returns both rows as `ambiguous_identifier`, never `unique_barcode`;
6. external product/SKU IDs are not inputs to the function;
7. `'001-ABC'` does not equal `'1-ABC'`;
8. general names can create `name_suggestion` only; the narrowly defined hyphenated option-name code token is the sole name-field exception;
9. manual query results use `manual_search`, but an InventorySku already returned by deterministic evidence keeps its stronger reason;
10. rank ordering is stable by reason, then Sellpia code, then ID.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-sku-candidate-ranking.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the ranker**

Keep it free of NestJS, Prisma, HTTP, repository imports, and Inventory-domain types. The Channels bridge maps the Inventory read model into `CandidateInventorySku`. Export a second helper:

```ts
export function statusForUnmappedCandidates(
  candidates: RankedInventorySkuCandidate[],
): 'needs_review' | 'unmatched' {
  return candidates.some((candidate) =>
    candidate.reason === 'exact_sellpia_code' ||
    candidate.reason === 'unique_barcode' ||
    candidate.reason === 'ambiguous_identifier'
  ) ? 'needs_review' : 'unmatched';
}
```

- [ ] **Step 4: Run and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-sku-candidate-ranking.spec.ts
rtk git add apps/server/src/channels/domain/channel-sku-candidate-ranking.ts apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts
rtk git commit -m "feat: rank channel SKU mapping candidates"
```

## Task 3: Define the Channels Mapping Ports and Service

**Files:**

- Create: `apps/server/src/channels/application/port/out/cross-domain/inventory-sku-read.port.ts`
- Create: `apps/server/src/channels/adapter/out/inventory/inventory-sku-read.adapter.ts`
- Create: `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`
- Create: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Create: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`

- [ ] **Step 1: Define the local cross-domain port**

Mirror only the four methods Channels consumes under a local token `CHANNELS_INVENTORY_SKU_READ_PORT`. The bridge adapter injects Inventory's incoming `INVENTORY_SKU_READ_PORT` and delegates. Channels application code imports only its local interface/token.

- [ ] **Step 2: Define repository records**

```ts
export type ChannelSkuMappingRow = {
  channelAccount: { id: string; channel: string; name: string };
  product: {
    id: string;
    externalProductId: string;
    registeredName: string | null;
    displayName: string | null;
    status: string | null;
  };
  sku: {
    id: string;
    externalSkuId: string;
    sellerSku: string | null;
    optionName: string | null;
    barcode: string | null;
    modelNumber: string | null;
    salePrice: number | null;
    status: string | null;
    mappingStatus: 'unmatched' | 'needs_review' | 'matched';
    updatedAt: Date;
  };
  componentRefs: Array<{
    inventorySkuId: string;
    quantity: number;
    mappingSource: string | null;
  }>;
};

export type UnmappedChannelSkuEvidenceRow = {
  channelSkuId: string;
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  productNames: string[];
  optionName: string | null;
};
```

Repository methods:

```ts
list(organizationId, query): Promise<{ rows: ChannelSkuMappingRow[]; total: number; counts: ... }>
findOne(organizationId, channelSkuId): Promise<ChannelSkuMappingRow | null>
findEvidence(organizationId, channelSkuId): Promise<UnmappedChannelSkuEvidenceRow | null>
listUnmappedEvidence(organizationId, channelAccountId?): Promise<UnmappedChannelSkuEvidenceRow[]>
updateUnmappedStatuses(organizationId, updates): Promise<void>
replaceComponents(input): Promise<void>
```

- [ ] **Step 3: Write failing service tests**

Cover:

- list hydrates component refs through one batched Inventory read and returns shared-contract shape;
- missing component target is treated as invariant failure, not silently omitted;
- candidates request loads exact code/barcode pools, optional name/manual search, ranks and caps limit;
- status refresh batches unique code/barcode lookups, updates only unmapped rows, and never sends `matched` as an advisory update;
- replace rejects duplicate IDs and invalid quantities even if called without HTTP DTO;
- replace rejects missing/foreign InventorySku before repository mutation;
- nonempty replacement sends `nextStatus='matched'`, `mappingSource='manual'`, authenticated user ID;
- empty replacement computes `needs_review` or `unmatched` from current evidence;
- repository mutation error propagates and no false success is returned;
- after replace, service rehydrates and returns the updated list item.

- [ ] **Step 4: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement the service and bridge**

Use `BadRequestException` only at the application boundary; the ranker remains pure. Deduplicate all requested inventory IDs before owner-port reads, but reject duplicate request entries rather than merging quantities.

For automatic display suggestions, call the Inventory search port once for each distinct nonblank full string in `[optionName, ...productNames]`, at most three queries and ten rows per query, then merge/deduplicate. Do not tokenize, edit-distance match, or normalize beyond trimming. An explicit operator search uses the operator's full trimmed query and the requested limit.

Status refresh accepts optional account scope and returns current counts:

```ts
{ all: number; unmatched: number; needsReview: number; matched: number }
```

- [ ] **Step 6: Run service tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-sku-candidate-ranking.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts
```

Expected: PASS.

## Task 4: Implement Tenant-Safe Mapping Persistence

**Files:**

- Create: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- Create: `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`

- [ ] **Step 1: Write the failing PostgreSQL integration suite**

Cover in one real database suite:

- list returns only ChannelSku rows whose parent and account belong to the organization;
- optional account filter and normalized search work;
- counts share search/account filters and ignore selected status;
- list ignores legacy `optionId` and `ChannelReconciliationItem` rows;
- candidate code evidence uses only sellerSku, the complete modelNumber, and the narrowly defined hyphenated Sellpia-code token from optionName; general names and external IDs never become code evidence;
- duplicate normalized Sellpia identifiers return every ambiguous candidate and set needs-review without confirmation;
- exact code 1:1 mapping persists quantity 1;
- same InventorySku persists quantity 4 for a multipack;
- mixed recipe persists X×1 + Y×2;
- full replacement removes old components not in the request;
- `[]` clears all components and applies the service-selected advisory status;
- duplicate or non-positive quantities fail before repository invocation/service deletion;
- wrong-organization ChannelSku is not found;
- foreign InventorySku is rejected and old components remain unchanged;
- concurrent replacements lock the ChannelSku row and finish with one complete recipe, never an interleaved union;
- component relation prevents cross-organization insertion even through direct repository misuse;
- metadata re-import leaves every component ID/quantity unchanged;
- no operation updates InventorySku.reportedStock.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement list/find/evidence reads**

Select only compatibility fields required by the mapping port. Require:

```ts
where: {
  organizationId,
  channelAccountId: accountFilter,
  lastImportRun: {
    sourceType: 'coupang_wing_catalog',
    status: 'completed',
  },
  listing: {
    organizationId,
    channelAccountId: accountFilter,
    isDeleted: false,
  },
}
```

Map `listing.externalId -> externalProductId`, `listing.channelName -> registeredName`, `externalOptionId -> externalSkuId`, and `itemName -> optionName`. Component reads return IDs/quantity/source only; Inventory metadata is hydrated through the owner port.

- [ ] **Step 4: Implement atomic component replacement**

Inside one interactive transaction:

1. lock the tenant-scoped ChannelSku row with tagged `SELECT ... FOR UPDATE` joining parent/account ownership;
2. if no row, throw/return not found before deletion;
3. delete current `ChannelSkuComponent` rows for `{organizationId, channelSkuId}`;
4. create every validated component with the same organization, `mappingSource='manual'`, and `createdBy=userId`;
5. update `ChannelListingOption.mappingStatus` to the service-provided next status;
6. commit.

Translate a foreign-key race (InventorySku deleted after validation) to 400 while preserving rollback.

- [ ] **Step 5: Implement status refresh writes safely**

Batch updates in a transaction. Every update predicate includes `{id, organizationId, components: {none: {}}}` so a concurrent mapping confirmation cannot be overwritten to unmapped/needs_review.
Both evidence selection and update also require a completed `coupang_wing_catalog` `lastImportRun`, preventing legacy reconciliation rows from entering the queue.

- [ ] **Step 6: Run the integration suite**

```bash
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Expected: PASS.

## Task 5: Expose Matching HTTP Endpoints

**Files:**

- Create: `apps/server/src/channels/adapter/in/http/dto/channel-sku-mapping-query.dto.ts`
- Create: `apps/server/src/channels/adapter/in/http/dto/replace-channel-sku-components.dto.ts`
- Create: `apps/server/src/channels/adapter/in/http/__tests__/channel-sku-mapping.controller.spec.ts`
- Create: `apps/server/src/channels/adapter/in/http/channel-sku-mapping.controller.ts`
- Modify: `apps/server/src/channels/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`

- [ ] **Step 1: Write failing DTO/controller tests**

Assert:

- base controller path exactly `channels/sku-mappings`;
- list accepts account/status/search/page/limit and no organization body field;
- status refresh accepts only optional account ID;
- candidate param uses UUID validation and search limit max 100;
- replacement parses with `ReplaceChannelSkuComponentsInputSchema` and rejects unknown privilege fields;
- replacement current user ID reaches the service;
- every call receives `@CurrentOrganization()` scope;
- module imports `InventoryModule`, wires bridge/repository/service/controller, and exports no new repository implementation.

- [ ] **Step 2: Implement DTOs and controller**

Use `class-transformer` for numeric query conversion and shared Zod parsing for the replacement body. Parse the status-refresh body with `RefreshChannelSkuMappingStatusInputSchema` as well, so unknown organization/privilege fields are rejected rather than stripped. Add `@CurrentUser()` only on component replacement. Status refresh does not need a user.

- [ ] **Step 3: Wire modules and run tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/domain/channel-sku-candidate-ranking.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts src/channels/adapter/in/http/__tests__/channel-sku-mapping.controller.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit matching backend**

```bash
rtk git add apps/server/src/channels/application/port/out/cross-domain/inventory-sku-read.port.ts apps/server/src/channels/application/port/out/cross-domain/index.ts apps/server/src/channels/adapter/out/inventory/inventory-sku-read.adapter.ts apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts apps/server/src/channels/application/port/out/repository/index.ts apps/server/src/channels/application/service/channel-sku-mapping.service.ts apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts apps/server/src/channels/adapter/in/http/dto/channel-sku-mapping-query.dto.ts apps/server/src/channels/adapter/in/http/dto/replace-channel-sku-components.dto.ts apps/server/src/channels/adapter/in/http/channel-sku-mapping.controller.ts apps/server/src/channels/adapter/in/http/__tests__/channel-sku-mapping.controller.spec.ts apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts apps/server/src/channels/channels.module.ts apps/server/src/channels/__tests__/channels.module.wiring.spec.ts apps/server/src/channels/adapter/in/http/dto/index.ts apps/server/src/channels/AGENTS.md
rtk git commit -m "feat: map channel SKUs to Sellpia components"
```

## Task 6: Retire the Active Legacy Reconciliation Backend

**Files:**

Delete:

- `apps/server/src/channels/application/port/out/repository/channel-reconciliation.repository.port.ts`
- `apps/server/src/channels/application/service/channel-reconciliation-matcher.service.ts`
- `apps/server/src/channels/application/service/channel-reconciliation-resolution.service.ts`
- `apps/server/src/channels/application/service/channel-reconciliation.types.ts`
- `apps/server/src/channels/application/service/channel-reconciliation.service.ts`
- `apps/server/src/channels/application/service/channel-reconciliation-scan.service.ts`
- `apps/server/src/channels/application/service/channel-reconciliation-query.service.ts`
- `apps/server/src/channels/application/service/__tests__/channel-reconciliation.service.spec.ts`
- `apps/server/src/channels/application/service/__tests__/channel-reconciliation-matcher.service.spec.ts`
- `apps/server/src/channels/adapter/in/http/channel-reconciliation.controller.ts`
- `apps/server/src/channels/adapter/out/repository/channel-reconciliation-scan.repository.adapter.ts`
- `apps/server/src/channels/adapter/out/repository/channel-reconciliation-resolution.repository.adapter.ts`
- `apps/server/src/channels/adapter/out/repository/channel-reconciliation-matcher.repository.adapter.ts`
- `apps/server/src/channels/adapter/out/repository/channel-reconciliation-query.repository.adapter.ts`
- `apps/server/src/channels/adapter/in/http/dto/reconciliation-row.dto.ts`
- `apps/server/src/channels/adapter/in/http/dto/reconciliation-query.dto.ts`
- `apps/server/src/channels/adapter/in/http/dto/reconciliation-action.dto.ts`
- `apps/server/src/ai/adapter/out/channels/coupang-image-reconciliation.adapter.ts`
- `apps/server/src/ai/application/port/out/cross-domain/coupang-image-reconciliation.port.ts`

Modify:

- `apps/server/src/channels/channels.module.ts`
- `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`
- `apps/server/src/channels/adapter/in/http/dto/index.ts`
- `apps/server/src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts`
- `apps/server/src/ai/application/port/out/cross-domain/index.ts`
- `apps/server/src/ai/application/service/coupang-image-sync.service.ts`
- `apps/server/src/ai/application/service/__tests__/coupang-image-sync.service.spec.ts`
- `apps/server/src/ai/ai.module.ts`
- `apps/server/src/ai/__tests__/ai.architecture.spec.ts`
- any AI module-wiring test that lists the removed bridge

- [ ] **Step 1: Add failing active-route/architecture assertions**

Update module tests to assert:

- `ChannelReconciliationController` is absent;
- no legacy reconciliation provider/repository is wired or exported;
- ChannelsModule exports only its still-supported channel capabilities/provider contracts;
- Coupang image sync constructor has no reconciliation dependency;
- image sync no longer calls `recordRows` with image inventory IDs;
- physical Prisma `ChannelReconciliationRun/Item` models remain in the expand release.

- [ ] **Step 2: Remove the legacy Channels implementation and wiring**

Keep the shared `@kiditem/shared/channel-reconciliation` package entry temporarily because the old web page is replaced in the next plan. Do not delete physical tables or data.

Remove only the reconciliation-specific `describe` block from `channel-operation-alerts.controller.spec.ts`; preserve ChannelSync alert tests.

- [ ] **Step 3: Remove the AI recording bridge**

In `CoupangImageSyncService`, remove the injected reconciliation port and this call:

```ts
await this.reconciliation.recordRows({ organizationId, rows: uniqueRows });
```

Do not redirect image inventory IDs into the new catalog importer; those rows lack canonical `등록상품ID`/`옵션 ID` parents and would corrupt the new contract.

- [ ] **Step 4: Run server and architecture tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels src/ai/application/service/__tests__/coupang-image-sync.service.spec.ts src/ai/__tests__/ai.architecture.spec.ts
rtk npm run build --workspace=apps/server
```

Expected: PASS and no server source imports `channel-reconciliation.service`.

- [ ] **Step 5: Verify active route removal**

```bash
rtk rg -n 'channels/reconciliation|ChannelReconciliationService|sync-from-image-listings|scan-from-rows' apps/server/src
```

Expected: no active source hit; Prisma model names are allowed only outside `apps/server/src`.

- [ ] **Step 6: Commit**

```bash
rtk git add -u apps/server/src/channels/application/port/out/repository/channel-reconciliation.repository.port.ts apps/server/src/channels/application/service/channel-reconciliation-matcher.service.ts apps/server/src/channels/application/service/channel-reconciliation-resolution.service.ts apps/server/src/channels/application/service/channel-reconciliation.types.ts apps/server/src/channels/application/service/channel-reconciliation.service.ts apps/server/src/channels/application/service/channel-reconciliation-scan.service.ts apps/server/src/channels/application/service/channel-reconciliation-query.service.ts apps/server/src/channels/application/service/__tests__/channel-reconciliation.service.spec.ts apps/server/src/channels/application/service/__tests__/channel-reconciliation-matcher.service.spec.ts apps/server/src/channels/adapter/in/http/channel-reconciliation.controller.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-scan.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-resolution.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-matcher.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-query.repository.adapter.ts apps/server/src/channels/adapter/in/http/dto/reconciliation-row.dto.ts apps/server/src/channels/adapter/in/http/dto/reconciliation-query.dto.ts apps/server/src/channels/adapter/in/http/dto/reconciliation-action.dto.ts apps/server/src/ai/adapter/out/channels/coupang-image-reconciliation.adapter.ts apps/server/src/ai/application/port/out/cross-domain/coupang-image-reconciliation.port.ts
rtk git add apps/server/src/channels/channels.module.ts apps/server/src/channels/__tests__/channels.module.wiring.spec.ts apps/server/src/channels/adapter/in/http/dto/index.ts apps/server/src/channels/adapter/in/http/__tests__/channel-operation-alerts.controller.spec.ts apps/server/src/ai/application/port/out/cross-domain/index.ts apps/server/src/ai/application/service/coupang-image-sync.service.ts apps/server/src/ai/application/service/__tests__/coupang-image-sync.service.spec.ts apps/server/src/ai/ai.module.ts apps/server/src/ai/__tests__/ai.architecture.spec.ts
rtk git commit -m "refactor: retire legacy product option reconciliation"
```

## Task 7: Backend Checkpoint

- [ ] **Step 1: Run focused and integration tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/inventory-sku-read.service.spec.ts src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts src/channels/domain/channel-sku-candidate-ranking.spec.ts src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts src/channels/adapter/in/http/__tests__/channel-sku-mapping.controller.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run shared/server/tenancy gates**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:directory-architecture
rtk npm run dev:server
```

Expected: all non-watch commands exit `0`; Nest boots without circular module/provider errors.

- [ ] **Step 3: Inspect API invariants manually**

Using a local authenticated session, confirm:

- list requires session organization and does not accept an organization override;
- candidate results expose no raw JSON;
- replacement response contains the current components and display-only reported stock;
- clearing sends `[]` and returns an unmapped advisory status;
- InventorySku.reportedStock is unchanged before/after replacement.
