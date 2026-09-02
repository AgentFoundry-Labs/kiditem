# Channel and Sellpia Matching Web and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old ProductOption reconciliation UI and Sellpia stock-adjustment UI with pure source imports and an account-scoped multi-component ChannelSku matching workspace, then verify the two approved real workbooks end to end.

**Architecture:** Keep Sellpia upload in Inventory Hub and rebuild `/product-hub/matching` for Wing catalog upload plus ChannelSku mapping. Route-local API modules parse all server responses with focused shared Zod contracts. React Query owns account/list/candidate/import/mutation state. The component dialog edits a local complete recipe draft and saves it atomically.

**Tech Stack:** Next.js App Router, React 19, React Query, Zod, `apiClient`, Testing Library, Vitest, Sonner, NestJS runtime endpoints.

## Global Constraints

- Complete the schema, imports, and matching-backend plans first.
- Do not expose/edit InventorySku.reportedStock, Sellpia prices, or channel prices in the mapping dialog.
- Do not infer quantity from names such as `4개`, `8개`, or bundle text.
- Do not auto-save a suggested candidate.
- The normal Save action requires at least one component; unmapping is a separate confirmed action that sends `[]`.
- Do not show raw JSON.
- Every API call goes through `apiClient`; no direct fetch, Prisma, Supabase, or organization ID.
- Use server paging and status counts; do not load 2,241 rows into client memory.
- In `0.1.8`, offer only `channel === 'coupang'` accounts for the Wing importer. The reserved future Rocket account code is `rocket`; never infer service type from an account name.
- Keep `/product-hub/matching` as the canonical URL.
- Remove all UI copy that implies Coupang image sync creates SKU matching rows.
- The user's workbook files remain local operator input and are never added to git.

---

## Final User Flow

```text
Inventory Hub > Sellpia 재고 가져오기
  -> choose exported-list (3).xls
  -> upload
  -> see 1,964 imported rows and create/update/zero counts

Product Hub > 상품 매칭 센터
  -> choose ChannelAccount
  -> choose Coupang_detailinfo_260711.xlsx
  -> upload
  -> see 1,225 parents / 2,241 SKUs / 3 skipped rows
  -> refresh status
  -> filter all / unmatched / needs review / matched
  -> open one SKU
  -> add one or more Sellpia components and quantities
  -> save or explicitly unmap
```

## File Structure

### Inventory Hub

Create:

- `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.ts`
- `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.spec.ts`
- `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.tsx`
- `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx`

Delete after replacement:

- `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx`
- `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx`
- `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-review-ui.ts`
- `apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-review-ui.test.ts`

Modify:

- `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- `apps/web/src/app/(inventory)/_shared/inventory-api.ts`

### Product Hub matching

Create:

- `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/CoupangWingCatalogImportDialog.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/MappingStatusTabs.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/CoupangWingCatalogImportDialog.spec.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`

Replace:

- `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`

Delete after replacement:

- `apps/web/src/app/(catalog)/product-hub/matching/hooks/useReconciliation.ts`
- `apps/web/src/app/(catalog)/product-hub/matching/components/StatusTabs.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/LinkProductOptionModal.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/StatusBadge.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/SummaryCards.tsx`
- `apps/web/src/app/(catalog)/product-hub/matching/components/ItemsTable.tsx`

### Cutover/docs

Delete:

- `packages/shared/src/channel-reconciliation.ts`
- `packages/shared/src/schemas/channel-reconciliation.ts`
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnmatchedReconciliationBanner.tsx`

Create:

- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnmatchedImageRowsBanner.tsx`
- `docs/runbooks/channel-sellpia-matching.md`

Modify:

- `packages/shared/package.json`
- `packages/shared/tsup.config.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/lib/query-keys.spec.ts`
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/page.tsx`
- related thumbnail AI tests/mocks
- `apps/web/src/app/(catalog)/AGENTS.md`
- `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/runbooks/README.md`

## Task 1: Replace Sellpia Review UI with Pure Import

**Files:** Inventory Hub files listed above.

- [ ] **Step 1: Write the failing API helper test**

Freeze this helper:

```ts
export async function importSellpiaInventory(
  file: File,
): Promise<SellpiaInventoryImportResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.uploadParsed(
    '/api/inventory/sellpia-sync/import',
    SellpiaInventoryImportResponseSchema,
    form,
  );
}
```

Assert that no `effectiveExportedAt`, target stock, approval reason, or organization field is appended.

- [ ] **Step 2: Write the failing component tests**

`SellpiaInventoryImport.test.tsx` must cover:

- upload button disabled without a file;
- `.xls`, `.xlsx`, `.csv`, and tabular text accept string matches backend-supported formats;
- successful first import renders run row count plus created/updated/zeroed counts;
- duplicate response renders `이미 가져온 동일 파일입니다` and zero changes;
- API error is visible;
- no stock input, approve button, candidate creation, row review table, or effective timestamp exists;
- successful upload leaves matching-status refresh to the next `/product-hub/matching` page open; it does not try to update channel rows from Inventory Hub.

- [ ] **Step 3: Run and verify failure**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.spec.ts' 'src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx'
```

Expected: FAIL.

- [ ] **Step 4: Implement the API and component**

The component displays only:

- file picker;
- import button/progress;
- filename, import status, row count;
- created/updated/zeroed counters;
- duplicate or error message.

It must state that Sellpia stock is copied as reported stock and KidItem does not adjust it.

- [ ] **Step 5: Switch Inventory Hub and delete old review code**

Update the dynamic import in `inventory-hub/page.tsx` to `SellpiaInventoryImport`. Keep tab ID `sellpia-sync` for URL compatibility, but change label to `Sellpia 재고 가져오기`.

Remove obsolete Sellpia review/approval functions from `_shared/inventory-api.ts` only after this search proves no remaining consumer:

```bash
rtk rg -n 'approveSellpia|ignoreSellpia|resolveSellpiaCandidate|importSellpiaInventoryFile|SellpiaSnapshotImportResponse' apps/web/src
```

Receipt-upload helpers unrelated to this UI remain.

- [ ] **Step 6: Run tests and commit**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub'
rtk git add 'apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.ts' 'apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-inventory-import-api.spec.ts' 'apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.tsx' 'apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx' 'apps/web/src/app/(inventory)/inventory-hub/page.tsx' 'apps/web/src/app/(inventory)/_shared/inventory-api.ts'
rtk git add -u 'apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx' 'apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx' 'apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-review-ui.ts' 'apps/web/src/app/(inventory)/inventory-hub/lib/sellpia-review-ui.test.ts'
rtk git commit -m "feat: replace Sellpia stock review with snapshot import"
```

## Task 2: Add Typed Matching and Import API Helpers

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/query-keys.spec.ts`

- [ ] **Step 1: Write failing query-key tests**

Replace `channelReconciliation` with:

```ts
channelAccounts: {
  all: ['channelAccounts'] as const,
  active: () => [...queryKeys.channelAccounts.all, 'active'] as const,
},
channelSkuMappings: {
  all: ['channelSkuMappings'] as const,
  lists: () => [...queryKeys.channelSkuMappings.all, 'list'] as const,
  list: (params: Record<string, string>) =>
    [...queryKeys.channelSkuMappings.lists(), params] as const,
  candidates: (channelSkuId: string, params: Record<string, string>) =>
    [...queryKeys.channelSkuMappings.all, 'candidates', channelSkuId, params] as const,
},
```

Test stable key equality for equivalent params created in the same canonical order.

- [ ] **Step 2: Write failing API helper tests**

Freeze these functions and exact routes:

```ts
listChannelAccounts()
listChannelSkuMappings(params)
refreshChannelSkuMappingStatuses(input)
listChannelSkuCandidates(channelSkuId, params)
replaceChannelSkuComponents(channelSkuId, input)
importCoupangWingCatalog(channelAccountId, file)
```

Requirements:

- GET/list response parses with `ChannelSkuMappingListResponseSchema`;
- account list parses with `z.array(ChannelAccountListItemSchema)`;
- candidate response parses with its shared schema;
- refresh POST and replace PUT manually parse their unknown responses with shared schemas because `apiClient` has no `postParsed`/`putParsed` helper;
- component input is parsed before request;
- Wing import uses `uploadParsed` and encodes account ID in the path;
- URLSearchParams omits empty search and `mappingStatus=all` but includes page/limit/account;
- no organization ID is sent.

- [ ] **Step 3: Run and verify failure**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts' src/lib/query-keys.spec.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement helpers and keys**

Use `encodeURIComponent` for all path UUIDs even though shared input validates them. Export API parameter types from shared inferred types rather than duplicating response interfaces.

- [ ] **Step 5: Run and commit**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts' src/lib/query-keys.spec.ts
rtk git add 'apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts' 'apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts' apps/web/src/lib/query-keys.ts apps/web/src/lib/query-keys.spec.ts
rtk git commit -m "feat: add channel SKU matching web API"
```

## Task 3: Implement Recipe Draft Logic

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.ts`

- [ ] **Step 1: Write failing pure-helper tests**

Define a UI-only draft:

```ts
export type ComponentDraftRow = {
  inventorySkuId: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
  quantityText: string;
};
```

Test:

- current components initialize exact quantities;
- add candidate defaults to quantity text `1`;
- adding the same InventorySku again returns the unchanged draft and a duplicate error;
- adding component 51 is blocked using shared `MAX_CHANNEL_SKU_COMPONENTS=50` and returns a limit error;
- quantity update accepts digit text for editing but serialization requires a positive integer;
- quantity `4` serializes as 4;
- mixed X×1 + Y×2 preserves order;
- remove deletes exactly one row;
- serialization emits only `inventorySkuId` and `quantity`;
- stock/name/barcode edits are impossible through the helper API;
- empty draft is valid only for the explicit unmap action, not normal save.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts'
```

Expected: FAIL.

- [ ] **Step 3: Implement and test**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts'
```

Expected: PASS.

## Task 4: Build React Query Hooks

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`

- [ ] **Step 1: Write failing hook tests**

Hooks:

```ts
useChannelAccounts()
useChannelSkuMappings({ channelAccountId, mappingStatus, search, page, limit })
useChannelSkuCandidates(channelSkuId, search, enabled)
useRefreshChannelSkuMappingStatuses()
useReplaceChannelSkuComponents()
useImportCoupangWingCatalog()
```

Test:

- list query is disabled only while no account is selected if the UI has active accounts; an explicit all-account mode may pass no account;
- prior page data remains while the next server page loads;
- candidates are disabled when dialog is closed;
- replacement invalidates mapping lists and that SKU's candidates;
- status refresh invalidates mapping lists;
- Wing import success invokes status refresh for the imported account, then invalidates lists;
- import does not optimistic-write rows or components;
- API errors propagate to the component for toast rendering.

- [ ] **Step 2: Implement hooks and run tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx'
```

Expected: PASS.

## Task 5: Build the Multi-Component Dialog

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`

- [ ] **Step 1: Write failing dialog tests**

Cover all operator-critical behavior:

- opens with current recipe rows and quantities;
- candidate section shows evidence badges `상품코드 일치`, `고유 식별자`, `중복 식별자`, `이름 제안`, or `검색 결과`;
- reported stock is text only and no stock input exists;
- candidate click adds but does not save;
- duplicate candidate cannot be added twice;
- the 51st component cannot be added and an inline 50-component limit message is shown;
- exact candidate still requires operator Save;
- quantity 4 saves same-SKU bundle payload;
- X×1 + Y×2 saves mixed payload;
- zero/blank/fraction quantity blocks Save with inline error;
- normal Save disabled for an empty draft;
- `매칭 해제` is separate, opens `ConfirmDialog`, then sends `{components: []}`;
- closing without save discards local draft;
- candidate search sends trimmed query and does not search on every whitespace change;
- mutation error leaves the draft open.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx'
```

Expected: FAIL.

- [ ] **Step 3: Implement the dialog**

Use the shared `ConfirmDialog` for unmap. The header must show parent/SKU names and external IDs so similarly named options can be distinguished. Keep the draft editor below suggestions; do not hide current components when search changes.

- [ ] **Step 4: Run the dialog test**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx'
```

Expected: PASS.

## Task 6: Build Wing Import Dialog and Matching Table

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/CoupangWingCatalogImportDialog.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/CoupangWingCatalogImportDialog.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/matching/components/MappingStatusTabs.tsx`

- [ ] **Step 1: Write failing import-dialog tests**

Assert:

- selected account is required and must have `channel === 'coupang'`; a future `channel === 'rocket'` account is rejected even if its display name contains Coupang or Wing;
- file picker accepts `.xlsx`/`.xls`;
- upload response displays parent/SKU create/update plus skipped count;
- duplicate response is clearly a no-op;
- error remains visible;
- upload never claims it created mappings;
- on success callback resets page to 1 and refreshes status.

- [ ] **Step 2: Implement import dialog**

State explicitly: `이 파일은 쇼핑몰 상품 메타데이터만 갱신하며 기존 Sellpia 구성 매칭은 유지합니다.`

- [ ] **Step 3: Implement status tabs/table**

Tabs:

```text
전체 / 미매칭 / 확인 필요 / 매칭 완료
```

Table columns:

```text
채널 계정
상품 (registered/display name, externalProductId)
옵션 SKU (option name, externalSkuId, sellerSku)
식별자 (barcode, model number)
판매 메타데이터 (status, sale price or 없음)
Sellpia 구성 (code/name × quantity, reported stock)
상태/action
```

Do not render `rawJson`, ProductOption, MasterProduct, legacy code, or editable stock.

- [ ] **Step 4: Run component tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components'
```

Expected: PASS.

## Task 7: Replace `/product-hub/matching`

**Files:**

- Create: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`
- Replace: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Delete: old matching hook/components listed in File Structure

- [ ] **Step 1: Write the failing page test**

Test:

- active accounts load, the current Wing UI filters to `channel === 'coupang'`, rejects the reserved `rocket` code, and selects the first eligible account deterministically: primary first, then name, then ID;
- non-Coupang accounts are never offered to the Wing upload dialog; the generic backend remains ready for later channel-specific importers;
- page calls status refresh on initial selected account and manual refresh;
- account/status/search changes reset page to 1;
- search is debounced and server-side;
- counts render from list response;
- empty state distinguishes no imported catalog from no rows under a filter;
- Wing import button receives selected account;
- edit opens the new component dialog;
- old summary cards, ignore action, auto-link tab, ProductOption modal, and image-sync scan button are absent.

- [ ] **Step 2: Implement the page**

Header copy:

```text
쇼핑몰 옵션 SKU마다 어떤 Sellpia 상품을 몇 개 사용하는지 관리합니다.
상품명과 가격은 참고 정보이며, 저장된 구성품이 실제 매칭 기준입니다.
```

Use a 50-row server page. Preserve the current page while refetching and show a compact refresh indicator.

- [ ] **Step 3: Delete old UI files and run route tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching'
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add 'apps/web/src/app/(catalog)/product-hub/matching/page.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.ts' 'apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts' 'apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts' 'apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/CoupangWingCatalogImportDialog.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/MappingStatusTabs.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/CoupangWingCatalogImportDialog.spec.tsx'
rtk git add -u 'apps/web/src/app/(catalog)/product-hub/matching/hooks/useReconciliation.ts' 'apps/web/src/app/(catalog)/product-hub/matching/components/StatusTabs.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/LinkProductOptionModal.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/StatusBadge.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/SummaryCards.tsx' 'apps/web/src/app/(catalog)/product-hub/matching/components/ItemsTable.tsx'
rtk git commit -m "feat: rebuild channel SKU matching workspace"
```

## Task 8: Remove the Legacy Shared/UI Contract

**Files:** shared reconciliation and thumbnail-banner files listed above.

- [ ] **Step 1: Replace the thumbnail image-sync banner**

Rename it to `UnmatchedImageRowsBanner`. Remove the link to `/product-hub/matching`, `legacyCode` copy, and any claim that image rows populate the SKU queue.

Use this message:

```text
이미지 동기화에서 내부 상품을 찾지 못한 쿠팡 행 {count}건이 있습니다.
이 결과는 채널 SKU 재고 매칭과 별개입니다. 이미지 원본 식별자를 확인해 주세요.
```

Keep only count and dismiss behavior.

- [ ] **Step 2: Remove the shared legacy subpath**

Delete both source files and remove `./channel-reconciliation` from `packages/shared/package.json`, `typesVersions`, and `tsup.config.ts`.

- [ ] **Step 3: Prove no active reference remains**

```bash
rtk rg -n '@kiditem/shared/channel-reconciliation|channelReconciliation|useReconciliation|UnmatchedReconciliationBanner' apps packages/shared/src
```

Expected: no hit.

- [ ] **Step 4: Run shared/web tests and commit**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/web
rtk git add -u packages/shared/src/channel-reconciliation.ts packages/shared/src/schemas/channel-reconciliation.ts 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnmatchedReconciliationBanner.tsx'
rtk git add packages/shared/package.json packages/shared/tsup.config.ts 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnmatchedImageRowsBanner.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/page.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/__tests__/page.spec.tsx'
rtk git commit -m "refactor: remove legacy reconciliation UI contract"
```

## Task 9: Update Architecture and Operator Runbook

**Files:**

- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/runbooks/README.md`

- [ ] **Step 1: Update durable ownership docs**

Document:

- Inventory owns Sellpia `InventorySku` snapshot import/read;
- Channels owns ChannelProduct/ChannelSku catalog metadata and component mapping;
- logical-to-physical compatibility names for `0.1.8`;
- candidates are computed, components are truth;
- current matching route and API endpoints;
- image sync is unrelated;
- Rocket catalog/PO/order behavior remains out of scope.

- [ ] **Step 2: Write the operator runbook**

Required sections:

```text
Purpose
Prerequisites
Safe agent/operator actions
Forbidden actions
Sellpia upload steps
Wing upload steps
Matching and unmapping steps
Idempotent re-upload behavior
Validation/count expectations
Failure recovery
Verification commands
Blockers
Final report format
```

The runbook names the two approved local files but states they must not be committed or embedded in migrations.
Its failure-recovery section states that a fresh running duplicate returns 409, a process-crashed run is safely reclaimable with the same file after the 30-minute lease expires, and operators must not edit import-run status or normalized rows directly.

- [ ] **Step 3: Commit docs**

```bash
rtk git add apps/server/src/channels/AGENTS.md 'apps/web/src/app/(catalog)/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md' docs/ARCHITECTURE.md docs/runbooks/channel-sellpia-matching.md docs/runbooks/README.md
rtk git commit -m "docs: document channel Sellpia matching operations"
```

## Task 10: Automated Verification

- [ ] **Step 1: Run focused shared/server/web tests**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts src/schemas/channel-sku-matching.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/ai/application/service/__tests__/coupang-image-sync.service.spec.ts src/ai/__tests__/ai.architecture.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub' 'src/app/(catalog)/product-hub/matching' src/lib/query-keys.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run complete build and policy gates**

```bash
rtk npm run test:scripts
rtk npx prisma validate
rtk npm run check:channel-sku-identity
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: every command exits `0`.

- [ ] **Step 3: Boot the server**

```bash
rtk npm run dev:server
```

Expected: Nest completes initialization with the new import/mapping routes and no legacy reconciliation controller, route collision, missing token, or circular dependency. Stop after confirming boot.

## Task 11: Real Workbook Acceptance

This is an explicit local/staging operator test, not a fixture or data migration.

- [ ] **Step 1: Import Sellpia through Inventory Hub**

Open `/inventory-hub?tab=sellpia-sync`, select `/Users/yhc125/Downloads/exported-list (3).xls`, and import.

Expected:

```text
run.status = completed
run.sourceType = sellpia_inventory
run.rowCount = 1964
duplicate = false on first import
no approval/review/stock-adjust controls are visible
```

- [ ] **Step 2: Import Coupang through Matching Center**

Open `/product-hub/matching`, select the intended active Coupang Wing ChannelAccount, select `/Users/yhc125/Downloads/Coupang_detailinfo_260711.xlsx`, and import.

Expected final catalog shape:

```text
valid ChannelProduct count = 1225
valid ChannelSku count = 2241
skippedRowCount = 3
every visible ChannelSku has a parent and account
sellerSku = null for new rows
salePrice = null for new rows
initial component count = 0
```

- [ ] **Step 3: Refresh matching statuses**

Expected queue counts before any confirmation:

```text
all = 2241
needsReview = 155
unmatched = 2086
matched = 0
```

The breakdown is 154 unambiguous identifier rows plus one ambiguous row with two candidate InventorySkus. The ambiguous row is needs-review, and no candidate is auto-confirmed.

- [ ] **Step 4: Confirm the three recipe shapes**

Using three distinct visible ChannelSku rows and available InventorySku candidates/search results, save:

```text
A -> X × 1
B -> X × 4
C -> X × 1 + Y × 2
```

Reload the page and reopen each dialog. Expected: exact components and quantities round-trip; matched count becomes 3; reported stock has not changed.

- [ ] **Step 5: Verify explicit unmap and restore**

Use `매칭 해제` on one test row, confirm the warning, and verify it returns to needs-review/unmatched based on current evidence. Restore its prior recipe and verify matched count returns to 3.

- [ ] **Step 6: Re-upload both identical files**

Expected:

```text
duplicate = true for both responses
all change counts = 0
InventorySku, ChannelProduct, and ChannelSku IDs remain stable
all three component recipes and quantities remain unchanged
reportedStock remains equal to the Sellpia snapshot
```

- [ ] **Step 7: Capture the final acceptance report**

Use this exact report structure in the implementation handoff:

```text
Release: 0.1.8
Sellpia run: record the `run.id` returned by the Sellpia response; rows 1964; duplicate re-upload confirmed
Wing run: record the `run.id` returned by the Wing response; parents 1225; SKUs 2241; skipped 3; duplicate re-upload confirmed
Matching before test: unmatched 2086 / needs review 155 (154 unambiguous + 1 ambiguous) / matched 0
Recipes verified: single X1 / same-SKU X4 / mixed X1+Y2
Re-import preservation: confirmed
Inventory stock mutation count: 0
Legacy active routes: removed
Automated gates: all passed
```

Run IDs are runtime output and must not be written into source code or fixtures.

## Task 12: Final Scope Review

- [ ] **Step 1: Review git status and diff**

```bash
rtk git status --short
rtk git diff --stat origin/develop...HEAD
rtk git diff --name-only origin/develop...HEAD
```

Expected: no user-owned `docs/references/**` workbook is staged; no real workbook or generated temporary analysis is in the diff.

- [ ] **Step 2: Search for forbidden active behavior**

```bash
rtk rg -n 'sync-from-image-listings|scan-from-rows|approveSellpia|manual-adjust|resolveSellpiaCandidate|import:product-baseline|wing-inventory-matched' apps package.json scripts docs/runbooks
```

Expected: no active implementation or runbook advertises the retired workflows. Historical design/spec text outside active runbooks may still describe why it was replaced.

- [ ] **Step 3: Confirm out-of-scope code was not added**

Review for absence of Rocket PO logic, order-time component snapshots, inventory reservations, channel stock upload, persisted candidates, fuzzy-match tables, price history, and generic provider abstraction.
