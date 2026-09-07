# Rocket PO Confirmation PR 335 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 335가 의도한 “쿠팡 거래처확인요청 수집 → 저장분 재사용 → 확정 가능한 Sellpia 구성 연결 → 재고 용량 검토 → 예약 → 쿠팡 양식 생성”을 현재 `develop`의 Products·Inventory·Supply 경계 위에서 완성한다.

**Architecture:** Channels는 Rocket PO 원본 증거, 채널 상품/옵션 identity, 저장 수집본 조회를 소유하고 Products의 기존 채널 상품 프로비저닝 capability를 사용한다. Products만 `ProductVariantComponent`를 쓰고, 기존 결정적 매칭 미리보기/적용 명령을 로켓 화면에서도 명시적으로 호출한다. Supply는 최신 Inventory 가용량 계산과 공통 `InventoryCommitment` 확정/해제를 유지하며, Web은 서버 저장본 달력·미리보기·원본 양식 채우기·세션 작업 알림을 조합한다.

**Tech Stack:** TypeScript 5.8, NestJS 11, Prisma 7, PostgreSQL 17, Zod 3, Next.js, React Query, SheetJS, Vitest, Testing Library

## Global Constraints

- 기존 PR 335의 `/api/orders/rocket/*`, `RocketPoReservation`, 1,000줄대 orders 서비스, 이름 포함/LCS/Dice 퍼지 자동확정은 복원하지 않는다.
- Rocket confirmation은 Supply에 유지하고 HTTP는 기존 단일 `POST /api/purchase-orders` action 계약을 확장한다.
- 물리 재고 소유자는 `SellpiaInventorySku`, 구성표 소유자는 `ProductVariantComponent`, 예약 소유자는 공통 `InventoryCommitment`다.
- `SellpiaInventorySku.currentStock`은 수집·매칭·미리보기·확정에서 변경하지 않는다.
- 코드·고유 물리 바코드·엄격한 정규화 상품명+옵션만 결정적 적용 후보가 된다. 이름만 같음, 포함, 퍼지, 가격 유사도, 묶음/BOM 불확실성, 신호 충돌은 운영자 검토에 남긴다.
- 결정적 레시피 적용은 페이지 조회나 수집 중 숨겨서 실행하지 않는다. 기존 proposal-version fence를 보여 주고 운영자가 버튼으로 명시적으로 적용한다.
- 기존 수동/결정적 `ProductVariantComponent`는 덮어쓰지 않는다.
- 서버 저장 Rocket PO는 authoritative confirmation evidence이므로 `RocketPurchaseOrder.items` JSON을 사용하지 않고 정규화한다.
- 저장 수집본을 다시 열어도 Inventory freshness/capacity는 매번 새로 계산한다. 저장되는 것은 공급사 PO 증거이며 재고 수량이 아니다.
- 공급사 계정 불일치는 무시하지 않는다. 저장/조회/미리보기 모두 `organizationId + channelAccountId`로 제한하고 vendor mismatch는 실행 가능한 안내로 유지한다.
- 원본 양식 채우기는 `상품목록`의 식별 열을 검증한 뒤 `확정수량`과 `납품부족사유`만 바꾸고 다른 시트/셀을 보존한다.
- 기본 생성 23열 workbook은 원본 파일이 없는 경우의 정상 fallback으로 유지한다.
- 500줄 이상인 `RocketPurchaseWorkspace.tsx`에 새 orchestration을 더하지 않고 hook/하위 컴포넌트로 분리한다.
- Raw 재고 약정 목록은 주 화면에서 제거하되 확정 상태, 예약 수량, 해제 기능과 백엔드 조회 API는 유지한다.
- 테이블은 `overflow-x-auto`, 최소 너비, `table-fixed`, 셀 `truncate`/툴팁을 사용해 텍스트 겹침을 만들지 않는다.
- 새 정규화 모델과 persisted behavior 때문에 `VERSION`은 `0.1.22`에서 `0.1.23`으로 올린다. 기존 행 백필은 없고 같은 PO를 다시 수집할 때 과거 `SourceImportRun`의 누락 snapshot을 idempotent하게 보완한다.
- 별도 worktree를 만들지 않는다. 현재 `feat/rocket-confirm-restore`에서 작업한다.
- `develop`을 PR 브랜치에 merge하지 않는다. 원격 PR 335 head가 `ec4d063d8b49c7326e8975c9ef395d6bf362d2fa`인지 재확인한 뒤 `--force-with-lease`로 현재 `develop` 기반 기록을 올린다.
- PR 335 body는 수정하지 않는다. 설계 차이, commit, DB 영향, 검증 결과는 PR 코멘트로 추가한다.

---

## File Structure

- `prisma/models/channels.prisma`: 완료된 Rocket PO 수집 snapshot과 정규화 line을 소유한다.
- `prisma/models/core.prisma`: Organization, ChannelAccount, SourceImportRun 역관계만 추가한다.
- `packages/shared/src/schemas/rocket-purchase-preview.ts`: 저장 PO 목록/수집본 조회 계약을 추가한다.
- `apps/server/src/channels/application/port/in/rocket-po-catalog.port.ts`: Supply가 사용하는 저장 목록/수집본 capability를 추가한다.
- `apps/server/src/channels/application/port/out/repository/rocket-po-catalog.repository.port.ts`: persistence 조회·쓰기 계약을 추가한다.
- `apps/server/src/channels/adapter/out/repository/rocket-po-catalog.repository.adapter.ts`: identity publication, Products 프로비저닝, snapshot 저장, tenant-scoped 조회를 한 transaction 경계에 둔다.
- `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`: `listSavedRocketPos`, `loadSavedRocketCollection` action 입력을 검증한다.
- `apps/server/src/supply/adapter/in/http/procurement.controller.ts`: 저장 목록/수집본 capability를 기존 Supply action endpoint에 노출한다.
- `apps/web/src/lib/channel-recipe-automation-api.ts`: Product Hub와 Rocket이 공유하는 결정적 recipe preview/apply API를 소유한다.
- `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts`: 저장 목록/수집본 API를 소유한다.
- `apps/web/src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.ts`: 새 workbook 생성과 원본 template 채우기를 분리한다.
- `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts`: 수집·저장본 로드·미리보기·수량 재검증·확정·해제·다운로드 state machine을 소유한다.
- `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.tsx`: 기존 결정적 recipe preview/apply와 운영자 검토 이동을 소유한다.
- `apps/web/src/app/(orders)/rocket-orders/hooks/useRocketOrderActivity.ts`: 페이지 세션 activity event를 소유한다.
- `apps/web/src/app/(orders)/rocket-orders/components/RocketOrderActivityPanel.tsx`: 시각·상태·메시지를 표시한다.
- `apps/web/src/app/(orders)/rocket-orders/components/RocketOrdersWorkspace.tsx`: 서버 저장 PO 달력과 선택 snapshot을 조합한다.

### Task 1: Freeze Saved Rocket PO Contracts and Schema

**Files:**
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.ts`
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.spec.ts`
- Modify: `prisma/models/channels.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `VERSION`

**Interfaces:**
- Produces: `RocketSavedPoSummary`, `RocketSavedPoListRequest`, `RocketSavedPoCollection`.
- Produces: Prisma `RocketPoCatalogSnapshot` and `RocketPoCatalogLine`.

- [ ] **Step 1: Write failing shared contract tests**

Add strict tests that accept this exact boundary and reject cross-account/malformed dates before HTTP use:

```ts
const summary = RocketSavedPoSummarySchema.parse({
  sourceImportRunId: '11111111-1111-4111-8111-111111111111',
  poNumber: '10000001',
  orderedAt: '2026-07-18 09:00:00',
  plannedDeliveryDate: '2026-07-20',
  status: '거래처확인요청',
  vendorId: 'A00001',
  centerName: '덕평1센터',
  inboundType: '택배',
  firstProductName: '키즈 식판',
  skuCount: 2,
  orderQuantity: 8,
  orderAmount: 79200,
  collectedAt: '2026-07-18T01:00:00.000Z',
});
expect(summary.poNumber).toBe('10000001');

expect(() => RocketSavedPoListRequestSchema.parse({
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  from: '2026/07/01',
  to: '2026-07-31',
})).toThrow();
```

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/rocket-purchase-preview.spec.ts
```

Expected: FAIL because saved PO schemas are not exported.

- [ ] **Step 3: Add the exact shared contracts**

Add these shapes to the focused Rocket schema file:

```ts
export const RocketSavedPoListRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  from: isoDay,
  to: isoDay,
  status: boundedText(80).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.to < value.from) ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['to'],
    message: 'to must be on or after from',
  });
});

export const RocketSavedPoSummarySchema = z.object({
  sourceImportRunId: z.string().uuid(),
  poNumber: requiredText(80),
  orderedAt: boundedText(40),
  plannedDeliveryDate: isoDay,
  status: boundedText(80),
  vendorId: boundedText(120),
  centerName: boundedText(120),
  inboundType: boundedText(80),
  firstProductName: requiredText(240),
  skuCount: z.number().int().nonnegative(),
  orderQuantity: z.number().int().nonnegative(),
  orderAmount: z.number().int().nonnegative(),
  collectedAt: z.string().datetime(),
}).strict();

export const RocketSavedPoCollectionSchema = z.object({
  sourceImportRunId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  collection: RocketPoCollectionEvidenceSchema,
  rows: z.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
```

- [ ] **Step 4: Add normalized Prisma models**

Add `RocketPoCatalogSnapshot` with organization/account/source-run/collection-run/vendor/page-count/detail-count and `RocketPoCatalogLine` with scalar fields for every `RocketPoCatalogRow` and every optional `confirmation` field. Use these keys and fences:

```prisma
@@unique([sourceImportRunId, organizationId], map: "rocket_po_catalog_snapshots_run_org_key")
@@unique([organizationId, channelAccountId, collectionRunId], map: "rocket_po_catalog_snapshots_org_account_collection_key")
@@unique([snapshotId, poLineId], map: "rocket_po_catalog_lines_snapshot_line_key")
@@index([organizationId, channelAccountId, plannedDeliveryDate])
```

`RocketPoCatalogLine` must include `hasConfirmation Boolean` so nullable/empty provider values are distinguishable from legacy rows without the capability. `plannedDeliveryDate` uses `@db.Date`; KRW fields use `Int`; `poRegisteredAt` stays `String?` because the provider supplies a display timestamp.

- [ ] **Step 5: Validate schema generation and shared build**

Run:

```bash
rtk npx prisma validate
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
```

Expected: all exit 0 and generated client exposes both new models.

- [ ] **Step 6: Bump persisted behavior version**

Change `VERSION` from `0.1.22` to `0.1.23`. Do not create a data migration: the tables are additive and old completed artifacts are healed idempotently when collected again.

- [ ] **Step 7: Commit the contract**

```bash
rtk git add VERSION prisma/models/channels.prisma prisma/models/core.prisma packages/shared/src/schemas/rocket-purchase-preview.ts packages/shared/src/schemas/rocket-purchase-preview.spec.ts
rtk git commit -m "feat: persist normalized Rocket PO catalog evidence"
```

### Task 2: Publish Operational Products and Persist Reusable Rocket Evidence

**Files:**
- Modify: `apps/server/src/channels/application/port/in/rocket-po-catalog.port.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/rocket-po-catalog.repository.port.ts`
- Modify: `apps/server/src/channels/application/service/rocket-po-catalog.service.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/rocket-po-catalog.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/rocket-po-catalog.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts`

**Interfaces:**
- Consumes: existing `CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT` and `publishCatalogOperationalProducts(...)`.
- Produces: `listSavedPos(input)` and `loadSavedCollection(input)` on `RocketPoCatalogPort`.

- [ ] **Step 1: Write failing service and PG integration tests**

Lock these behaviors:

```ts
it('passes complete collection evidence to publication', async () => {
  await service.publishAndResolve({ organizationId, userId, request: request() });
  expect(repo.publish).toHaveBeenCalledWith(expect.objectContaining({
    collection: request().collection,
  }));
});

it('stores and reloads the exact completed collection under its account', async () => {
  const published = await repository.publish(publishInput('a'.repeat(64), row('P-1')));
  await expect(repository.loadSavedCollection({
    organizationId: TEST_ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    sourceImportRunId: published.run.id,
  })).resolves.toMatchObject({ rows: [{ productNo: 'P-1' }] });
  await expect(repository.loadSavedCollection({
    organizationId: randomUUID(),
    channelAccountId: ACCOUNT_ID,
    sourceImportRunId: published.run.id,
  })).resolves.toBeNull();
});
```

Also seed one exact barcode `ProductVariantComponent` and assert Rocket publication links the new listing and option to that existing master/variant. Seed an unmatched row and assert a channel-origin master/variant is created instead of leaving the option null.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/rocket-po-catalog.service.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts
```

Expected: unit test fails on missing collection argument; PG test fails on missing methods/models or missing operational links.

- [ ] **Step 3: Extend the ports without leaking Prisma**

Add:

```ts
listSavedPos(input: {
  organizationId: string;
  channelAccountId: string;
  from: string;
  to: string;
  status?: string;
}): Promise<RocketSavedPoSummary[]>;

loadSavedCollection(input: {
  organizationId: string;
  channelAccountId: string;
  sourceImportRunId: string;
}): Promise<RocketSavedPoCollection | null>;
```

Pass `collection: RocketPoCollectionEvidence` into `repository.publish` so the persisted snapshot is reconstructed exactly.

- [ ] **Step 4: Reuse Products provisioning in Rocket publication**

Inject `CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT` into `RocketPoCatalogRepositoryAdapter`. After `upsertChannelCatalogIdentities`, call:

```ts
await publishCatalogOperationalProducts(tx, this.productProvisioner, {
  organizationId: input.organizationId,
  userId: input.userId,
  products,
  persistedListings: identities.persistedListings,
});
```

Do this for both new and duplicate artifact paths. The duplicate path must not merely return: it must heal missing normalized snapshot rows and missing operational links left by the old implementation, while preserving existing manual identities and recipes.

- [ ] **Step 5: Persist and reload the normalized snapshot in the same transaction**

Create/upsert one snapshot per `SourceImportRun`, replace its lines only when the snapshot is newly created, and reconstruct optional `confirmation` only when `hasConfirmation=true`. `listSavedPos` must:

- filter by `organizationId`, `channelAccountId`, and planned delivery date;
- order newest snapshot first;
- group lines by `(sourceImportRunId, poNumber)`;
- deduplicate repeated PO numbers by newest completed snapshot;
- compute `skuCount`, order quantity, and amount from scalar line columns;
- apply status filtering in the repository input, not in unscoped client memory.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run both Task 2 commands. Expected: all unit and PG tests pass, duplicate publication creates no second source run, foreign organization/account loads return null.

- [ ] **Step 7: Commit the owner-side implementation**

```bash
rtk git add apps/server/src/channels
rtk git commit -m "feat: publish and reuse Rocket PO catalog snapshots"
```

### Task 3: Expose Saved Catalog Reads Through the Existing Supply Action Contract

**Files:**
- Modify: `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`
- Modify: `apps/server/src/supply/adapter/in/http/procurement.controller.ts`
- Create: `apps/server/src/supply/adapter/in/http/procurement.controller.spec.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.spec.ts`

**Interfaces:**
- Produces: `listSavedRocketPos(input)` and `loadSavedRocketCollection(input)`.

- [ ] **Step 1: Write failing controller and web API tests**

```ts
expect(rocketCatalog.listSavedPos).toHaveBeenCalledWith({
  organizationId,
  channelAccountId,
  from: '2026-07-01',
  to: '2026-07-31',
  status: '거래처확인요청',
});

expect(apiClient.post).toHaveBeenCalledWith('/api/purchase-orders', {
  action: 'loadSavedRocketCollection',
  channelAccountId,
  sourceImportRunId,
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/adapter/in/http/procurement.controller.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.spec.ts'
```

Expected: missing actions/functions.

- [ ] **Step 3: Add DTO validation and controller branches**

Extend the action whitelist with `listSavedRocketPos` and `loadSavedRocketCollection`. Validate account/run UUIDs and ISO-day strings; inject `ROCKET_PO_CATALOG_PORT` into `ProcurementController`. Never accept `organizationId` from the request body.

- [ ] **Step 4: Add parsed web API functions**

```ts
export async function listSavedRocketPos(
  input: RocketSavedPoListRequest,
): Promise<RocketSavedPoSummary[]> {
  const request = RocketSavedPoListRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'listSavedRocketPos',
    ...request,
  });
  return z.array(RocketSavedPoSummarySchema).parse(response);
}
```

`loadSavedRocketCollection` must parse `RocketSavedPoCollectionSchema` and treat a server `404` as an error, not an empty collection.

- [ ] **Step 5: Run tests and commit**

Run both Task 3 commands and expect PASS.

```bash
rtk git add apps/server/src/supply/adapter/in/http apps/web/src/app/'(supply)'/purchase-orders/lib
rtk git commit -m "feat: expose saved Rocket PO evidence to Supply UI"
```

### Task 4: Reuse Deterministic ProductVariantComponent Automation in the Rocket Flow

**Files:**
- Create: `apps/web/src/lib/channel-recipe-automation-api.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx`

**Interfaces:**
- Consumes: existing `getChannelRecipeAutomationPreview`/`applyChannelRecipeAutomation` HTTP contract and proposal version.
- Produces: `onApplied(): Promise<void>` callback that re-previews the same saved source rows against fresh Inventory capacity.

- [ ] **Step 1: Write failing component tests**

Lock that the panel shows exact counts, never applies on mount, applies only after explicit confirmation, and leaves review cases visible:

```ts
render(<RocketDeterministicMatchingPanel channelAccountId={ACCOUNT_ID} onApplied={onApplied} />);
expect(applyChannelRecipeAutomation).not.toHaveBeenCalled();
expect(screen.getByText(/자동 적용 가능 12/)).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '확정 기준 매칭 적용' }));
await user.click(screen.getByRole('button', { name: '12개 구성 적용' }));
expect(applyChannelRecipeAutomation).toHaveBeenCalledWith({
  channelAccountId: ACCOUNT_ID,
  proposalVersion: 'a'.repeat(64),
});
expect(onApplied).toHaveBeenCalled();
```

- [ ] **Step 2: Run test and verify RED**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx'
```

Expected: component/module not found.

- [ ] **Step 3: Extract the shared browser API without changing its server route**

Move only recipe preview/apply functions to `apps/web/src/lib/channel-recipe-automation-api.ts`; make Product Hub import or re-export them so its tests remain unchanged. Do not duplicate Zod parsing.

- [ ] **Step 4: Implement the explicit Rocket matching panel**

Show four existing decisions: auto apply, operator review, blocked, configured. The apply button opens a confirmation dialog and sends the current proposal version. Add a link to `/product-hub/matching?level=options` for quantity/conflict/ambiguous/name-review/no-match rows.

After a newly collected catalog is published, invalidate/refetch the account-scoped recipe preview so newly provisioned Rocket variants appear without a page reload. This refresh is read-only; it must not call apply.

- [ ] **Step 5: Re-preview the same evidence after apply**

The callback must call existing `previewRocketPurchases` using the current in-memory or server-loaded `collection` and `sourceRows`; it must not call the browser extension again. Fresh Inventory generation is therefore re-gated by `RocketPurchasePreviewService`.

- [ ] **Step 6: Run Product Hub and Rocket matching tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching' 'src/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel.spec.tsx'
```

Expected: all pass; no recipe apply call occurs during render/query.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/src/lib/channel-recipe-automation-api.ts apps/web/src/app/'(catalog)'/product-hub/matching apps/web/src/app/'(supply)'/purchase-orders/components
rtk git commit -m "feat: reuse deterministic Sellpia matching in Rocket review"
```

### Task 5: Server-Saved Calendar, Snapshot Reuse, and Activity UI

**Files:**
- Create: `apps/web/src/app/(orders)/rocket-orders/hooks/useRocketOrderActivity.ts`
- Create: `apps/web/src/app/(orders)/rocket-orders/components/RocketOrderActivityPanel.tsx`
- Create: `apps/web/src/app/(orders)/rocket-orders/components/RocketOrderActivityPanel.spec.tsx`
- Create: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts`
- Create: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketOrdersWorkspace.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketOrdersWorkspace.spec.tsx`
- Modify: `apps/web/src/lib/query-keys.ts`

**Interfaces:**
- `RocketPurchasePreviewSection` adds optional callbacks `onAccountChange`, `onCatalogSaved`, and `onActivity`, plus `savedSourceImportRunId`.
- `RocketPurchaseWorkspace` delegates all workflow state/actions to `useRocketPurchaseWorkflow`.

- [ ] **Step 1: Write failing workflow and page tests**

Lock these user-visible behaviors:

```ts
expect(listSavedRocketPos).toHaveBeenCalledWith({
  channelAccountId: ACCOUNT_ID,
  from: '2026-07-01',
  to: '2026-07-31',
  status: '',
});
expect(listRocketPosFromExtension).not.toHaveBeenCalled();

await user.click(screen.getByRole('button', { name: /저장 수집본으로 미리보기/ }));
expect(loadSavedRocketCollection).toHaveBeenCalledWith({
  channelAccountId: ACCOUNT_ID,
  sourceImportRunId: RUN_ID,
});
expect(collectRocketPoRowsForConfirmationFromExtension).not.toHaveBeenCalled();
expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
  rows: savedCollection.rows,
}));
```

The activity test must assert start/success/error events keep newest first and cap the session list at 50.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/rocket-orders/components/RocketOrdersWorkspace.spec.tsx' 'src/app/(orders)/rocket-orders/components/RocketOrderActivityPanel.spec.tsx' 'src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx'
```

- [ ] **Step 3: Move stateful orchestration out of the 500-line component**

`useRocketPurchaseWorkflow` owns current collection/rows/preview/edits/shortage reasons/confirmation/template/activity callbacks. It exposes named commands:

```ts
collectAndPreview(): Promise<void>;
loadSavedAndPreview(sourceImportRunId: string): Promise<void>;
revalidateEditedQuantities(): Promise<void>;
applyRecipesAndRepreview(): Promise<void>;
confirmAndDownload(): Promise<void>;
releaseConfirmation(): Promise<void>;
```

Every command emits `started`, `succeeded`, or `failed` activity with a Korean operator-facing message. Keep failure state in both activity and the current inline alert.

- [ ] **Step 4: Replace calendar data source with saved server summaries**

`RocketPurchasePreviewSection` keeps the existing account selector and calls `onAccountChange(selectedAccount)`. `RocketOrdersWorkspace` enables the saved-list query only after account resolution. Header refresh reloads DB data; the explicit `미리보기 다시 계산` button remains the only extension collection action. Successful collection invalidates/refetches the saved calendar query.

- [ ] **Step 5: Load a selected snapshot without browser collection**

Each saved PO row shows `저장 수집본으로 미리보기`. Selecting it sets `savedSourceImportRunId`; the workflow loads the full snapshot, previews it, and re-runs Inventory freshness. Repeated PO summaries use the newest snapshot returned by the server.

- [ ] **Step 6: Add the right-side activity panel and remove raw commitment history**

Render calendar/chart content in a four-column desktop grid with visualization spanning three columns and activity one column. Keep a single-column mobile stack. Remove `<RocketInventoryCommitmentList>` from `RocketPurchasePreviewSection`; do not delete the component/API because operational reconciliation still uses it.

- [ ] **Step 7: Enforce non-overlapping table layout**

Wrap wide saved/preview tables with `overflow-x-auto`, give tables an explicit minimum width, use `table-fixed`, and use `truncate` plus `title` for long product/vendor/center text. Add a class assertion to the page/component tests.

- [ ] **Step 8: Run tests and commit**

Run Task 5 tests plus current Rocket workspace tests. Expected: all pass.

```bash
rtk git add apps/web/src/app/'(orders)'/rocket-orders apps/web/src/app/'(supply)'/purchase-orders apps/web/src/lib/query-keys.ts
rtk git commit -m "feat: reuse saved Rocket PO snapshots in the review workspace"
```

### Task 6: Fill the Original Coupang Workbook Safely

**Files:**
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.spec.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx`

**Interfaces:**
- Produces: `fillRocketConfirmationWorkbook(input)` with the same summary shape as `buildRocketConfirmationWorkbook`.

- [ ] **Step 1: Write failing workbook tests**

Create a template with `상품목록`, an extra `안내` sheet, column widths, and a source row. Assert only `확정수량` and `납품부족사유` change; extra sheet/cells and widths remain; wrong/missing rows fail closed.

```ts
const result = fillRocketConfirmationWorkbook({
  template: templateBytes,
  templateFileName: '쿠팡_원본.xlsx',
  sourceRows: [sourceRow()],
  confirmedRows,
});
expect(readCell(result, '상품목록', 'I2')).toBe(2);
expect(readCell(result, '상품목록', 'M2')).toBe('협력사 재고부족 - 수요예측 오류');
expect(readCell(result, '안내', 'A1')).toBe('보존값');
```

- [ ] **Step 2: Run and verify RED**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.spec.ts'
```

- [ ] **Step 3: Implement header-driven template filling**

Read with `cellStyles: true`. Resolve column indexes by exact Korean headers. Match rows using `(발주번호, 상품번호, 상품바코드)` plus occurrence index to support duplicate lines. Require a one-to-one match for all confirmed source rows and reject extra unmatched source/template rows. Mutate only the two output cells and write the existing workbook.

- [ ] **Step 4: Add UI selection and fallback**

Add an `.xlsx` file input labeled `쿠팡 원본 양식`. If supplied, use `fillRocketConfirmationWorkbook`; otherwise use the existing canonical 23-column builder. Save either result to the same local file history. Clearing the template returns to generated fallback.

- [ ] **Step 5: Run workbook/workflow tests and commit**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.spec.ts' 'src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx'
rtk git add apps/web/src/app/'(supply)'/purchase-orders
rtk git commit -m "feat: fill operator Coupang confirmation workbooks"
```

### Task 7: Full Verification, Browser Acceptance, and PR 335 Comment

**Files:**
- Generated: `docs/ERD.md`, `docs/erd/**`, `graphify-out/**`
- No PR body edit.

- [ ] **Step 1: Apply and regenerate schema artifacts**

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
```

Expected: exit 0; no destructive loss prompt; generated ERD contains both Rocket catalog models.

- [ ] **Step 2: Run focused and architecture gates**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels src/supply
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/rocket-orders' 'src/app/(supply)/purchase-orders' 'src/app/(catalog)/product-hub/matching'
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

- [ ] **Step 3: Run required builds/boot**

```bash
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: both builds exit 0; server boots without Nest dependency errors, then stop it cleanly.

- [ ] **Step 4: Verify the authenticated UI after hard refresh**

On `/rocket-orders`:

1. select the configured Rocket account;
2. collect a period with a real 거래처확인요청 PO;
3. confirm the saved calendar refreshes without another extension call;
4. choose `저장 수집본으로 미리보기` and confirm Inventory generation/capacity is recalculated;
5. inspect deterministic matching counts, apply only after confirmation, and confirm review rows remain;
6. edit confirmed quantity, choose shortage reason, confirm, download, re-download, and release;
7. verify the activity panel contains each operation and no table text overlaps;
8. verify the raw commitment history panel is absent;
9. download both generated and user-template variants and inspect `상품목록`/extra sheets.

Do not claim Supplier Hub upload acceptance unless the resulting file is uploaded through a reversible provider validation step. If the provider action would submit business data, stop at structural workbook verification and report the exact external acceptance blocker.

- [ ] **Step 5: Audit data invariants**

Record counts before/after and assert:

```text
Sellpia currentStock mutations: 0
New RocketPoReservation rows/tables: 0
Active InventoryCommitment change: only the explicitly confirmed PO
Existing ProductVariantComponent overwritten: 0
Deterministic components created: only proposal-version auto_apply items
Saved snapshot foreign-account reads: 0
```

- [ ] **Step 6: Confirm branch and PR safety before push**

```bash
rtk git fetch origin
rtk gh pr view 335 --json headRefName,headRefOid,baseRefName,state
rtk git log --oneline origin/develop..HEAD
rtk git diff --check origin/develop...HEAD
```

Stop if the PR head is no longer `ec4d063d8b49c7326e8975c9ef395d6bf362d2fa`, base is not `develop`, or unrelated commits/files appear.

- [ ] **Step 7: Push merge-free with lease**

```bash
rtk git push --force-with-lease=feat/rocket-confirm-restore:ec4d063d8b49c7326e8975c9ef395d6bf362d2fa origin HEAD:feat/rocket-confirm-restore
```

This replaces the PR branch history with the reviewed `develop`-based implementation; it does not merge `develop` into the PR branch.

- [ ] **Step 8: Add and verify a PR comment, leaving the body untouched**

The comment must state:

```markdown
## develop 기준 재구현 업데이트

- 유지: 저장 PO 재사용, 재고 검토, 확정 파일, 작업 알림
- 교체: orders 퍼지 자동매칭/별도 RocketPoReservation → Products의 결정적 ProductVariantComponent + InventoryCommitment
- 자동 적용 기준: 정확 코드, 고유 물리 바코드, 엄격한 상품명+옵션; 나머지는 운영자 검토
- DB: Rocket PO snapshot/line additive schema, VERSION 0.1.23, backfill 없음
- 검증: <실행한 명령과 결과>
- UI: <실제 계정/저장분/확정/다운로드 검증 결과>
- 외부 업로드: <통과 또는 정확한 미검증 사유>
```

Post with `gh pr comment 335 --body-file <temporary-file>` and immediately read it back with `gh pr view 335 --json comments`. Do not call `gh pr edit`.

## Self-Review

- Spec coverage: saved monthly PO view, no-recollection saved preview, deterministic matching, unresolved review path, capacity/shortage judgment, common reservation, generated workbook, original template fill, activity panel, and UI verification each have an owning task.
- Existing logic preservation: current Supply confirmation, Inventory freshness, `InventoryCommitment`, release/re-download, Product Hub recipe automation, and 23-column fallback remain canonical.
- Removed unsafe PR logic: no `/api/orders/rocket/*`, no `RocketPoReservation`, no direct Sellpia stock mutation, no fuzzy/price signal controlling capacity.
- Ownership: Channels stores provider evidence and identities; Products provisions/links central products and writes components; Inventory owns stock and commitments; Supply calculates and confirms; Web orchestrates.
- Type consistency: the same `RocketSavedPoSummary`, `RocketSavedPoCollection`, and `sourceImportRunId` names flow from shared schema through repository, controller, API, calendar, and workflow hook.
- Data safety: all reads include organization/account fences; duplicate artifacts heal without duplicate source runs; existing recipe components are preserved.
- UI safety: wide tables have overflow containment; account mismatch remains blocking; raw commitment internals are hidden while lifecycle controls remain.
- PR handling: no develop merge, no PR body rewrite, force-with-lease guarded by the exact current remote head, final update via verified comment.
