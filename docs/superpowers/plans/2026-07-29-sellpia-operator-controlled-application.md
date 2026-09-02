# Sellpia Operator-Controlled Application Implementation Plan

> **Rocket screen clarification (2026-07-29):** Coupang Rocket PO review is the
> pre-confirmation stockout decision sent back to Coupang, not a Sellpia order
> injection flow. Collection/catalog persistence and row display remain
> unconditional, but the screen synchronizes Sellpia and recalculates the
> stockout quantities from the target fresh generation before enabling the
> Coupang workbook. A freshness-pending response carries prior-snapshot advisory
> rows so collection results never disappear during that wait. This clarification
> overrides later steps that remove the freshness recovery waiter.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always collect, persist, and display marketplace orders and Coupang Rocket PO evidence, let the operator choose generated order files to submit to Sellpia, and use Sellpia's actual submission result—not preflight freshness or prior-workbook matching—as the success/failure authority.

**Architecture:** Treat source collection, Rocket stockout review, and irreversible Sellpia submission as distinct stages. Inventory keeps unresolved submission intents for exact-file idempotency and audit but no longer lets them redefine stock freshness or block a collection claim; Supply persists and displays Rocket PO rows before waiting for the fresh generation used to finalize stockout quantities; Orders generates a Sellpia file from every collected Rocket final-order row while Supply reconciliation remains non-destructive workflow metadata.

**Tech Stack:** NestJS 11, Next.js/React 19, Zod and `@kiditem/shared`, Prisma 7/PostgreSQL, TanStack React Query, browser extension bridge, Vitest.

## Global Constraints

- Classify this as a user-declared incident hotfix restoring one operator workflow across Inventory, Supply, Orders, and Web. Exclude unrelated cleanup and do not change top-level domain ownership.
- Collection and persistence always happen before freshness, mapping, prior-workbook, or submission-result decisions. A completed source run must remain reopenable even when every row is advisory-only or unmatched.
- An unresolved Sellpia transmission intent is an audit/idempotency condition for that exact `intentKey`; it must not change inventory freshness, block inventory collection, block other order collection, or block a different generated file.
- Preserve `prepare -> extension submit -> finalize|abort` for irreversible submission. Explicit `not_submitted` aborts the intent; `unknown` remains prepared and requires operator reconciliation; `submitted` finalizes idempotently.
- Show the exact extension/Sellpia error message on explicit non-submission. Offer a manual inventory-sync action, but never start inventory synchronization automatically merely because Sellpia rejected a file.
- Coupang Rocket final-order rows are all Sellpia candidates. Active Rocket workbook matching links workflow evidence and provides matched/unmatched metadata; it never filters the generated Sellpia file.
- Keep SHIPMENT and MILKRUN as separate generated files and separate stable transmission intent keys. A transport with no collected source row may still return HTTP 204 as a successful no-row probe; a transport with collected but workbook-unmatched rows must return a file.
- The Rocket PO review API publishes the complete catalog first. If inventory
  is stale, it returns advisory rows in a `freshness_pending` checkpoint so the
  web displays the PO immediately, then recalculates from the requested fresh
  generation before enabling the official Coupang workbook.
- Keep the source distinction explicit: the Rocket PO catalog persists every collected status, while the Coupang confirmation editor remains scoped to `confirmation_requested`; the later Rocket final-order collection is the dataset that becomes a Sellpia order candidate, and every one of those collected rows is included.
- Do not weaken source completeness, organization scoping, recipe confirmation, browser upload evidence, exact-file duplicate prevention, or unknown-result reconciliation.
- No Prisma schema or data migration is required. Keep root `VERSION` at `0.1.29`; record “no schema change, no backfill” in the PR release decision.
- Do not touch or overwrite the existing unrelated dirty Channels changes or `packages/shared/src/schemas/source-import*` changes.
- All shell commands in this plan use the repository-required `rtk` prefix.

---

## Fast Execution Profile (Authoritative)

The detailed tasks below are implementation references, not mandatory agent,
review, or commit boundaries. This profile overrides the per-task commit steps
when executing the plan.

- Execute in three cohesive batches and make at most one commit per batch.
- Do not dispatch a fresh agent or request a review for every task or TDD step.
  If parallelism is useful, use at most two long-lived, non-overlapping owners
  and let the primary agent integrate their work.
- Run focused tests while changing each behavior, but do not repeat the same
  broad suite after every small edit.
- Perform one holistic code/contract review after Batch 2, then one final diff
  and release-guard check in Batch 3. There is no mandatory reviewer checkpoint
  between individual tasks.
- Continue through ordinary test failures and fix them inline. Pause only for a
  destructive prompt, organization-boundary failure, unexpected overlap with
  the pre-existing dirty files, or a product decision that changes this plan's
  behavior.

| Batch | Reference work | Deliverable | Boundary gate | Commit |
|---|---|---|---|---|
| 1. Backend contract and data path | Task 1; server portions of Tasks 2-3 | Inventory claims are independent, preview has advisory/fresh modes, and all Rocket final-order rows are classified without filtering | Focused shared + Inventory + Supply + Orders tests | `fix: decouple Sellpia collection and application gates` |
| 2. Operator workflow | Web portions of Tasks 2-3; Task 4 | Immediate Rocket preview, every non-empty transport file appears, and Sellpia errors offer manual recovery | Entire affected web suites plus one holistic diff review | `fix: expose operator-controlled Sellpia application` |
| 3. Contract alignment and proof | Tasks 5-6 | Scoped guidance is aligned and the complete workflow is verified | Builds, server boot, hygiene, IDOR/tenant, PR guards, smoke matrix | `docs: align Sellpia operator workflow contracts` |

Recommended ordering:

```text
Batch 1 backend contract/data path
  -> Batch 2 web integration and one holistic review
  -> Batch 3 documentation and final verification
```

The checkbox steps remain useful for tracking exact behavior and tests, but an
executor should not stop, ask for approval, create a commit, or trigger a review
at each checkbox.

---

## Behavior Matrix

| Event | Generated data | Inventory sync | Same file | Other files |
|---|---|---|---|---|
| Collection succeeds | Persist and display all rows | Unaffected | Selectable | Selectable |
| Prior Rocket workbook has no match | Generate Sellpia file; mark unmatched metadata | Unaffected | Selectable | Selectable |
| Sellpia explicitly rejects | Keep file unsent and show exact error | Operator may request sync | Retry allowed after abort | Unaffected |
| Sellpia result is unknown | Keep file and prepared intent | Still allowed | Reconcile before retry | Unaffected |
| Sellpia accepts | Finalize intent and mark submitted | May be requested later | Idempotent | Unaffected |

## File Structure

### Inventory independence

- `packages/shared/src/schemas/sellpia-inventory-freshness.ts` — derive freshness only from snapshot/generation/lease evidence.
- `packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts` — prove an unresolved transmission does not redefine a fresh snapshot.
- `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.ts` — allow due collection claims even when unresolved intents exist.
- `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts` — pure claim regression.
- `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts` — service-level crashed-tab/manual-refresh regression.
- `apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.ts` — classify sync state independently from unresolved transmission alerts.
- `apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.spec.ts` — UI classification regression.
- `apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.tsx` — keep reconciliation UI but remove global-blocking copy.
- `apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.spec.tsx` — informational alert copy regression.

### Immediate Rocket PO preview

- `apps/server/src/supply/application/port/in/procurement/rocket-purchase-preview.port.ts` — add caller-owned `inventoryRequirement: 'advisory' | 'fresh'`.
- `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts` — use latest stored component stock immediately for advisory preview and invoke the freshness gate only for fresh-required callers.
- `apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts` — advisory/fresh behavior tests.
- `apps/server/src/supply/adapter/in/http/procurement.controller.ts` — HTTP `previewRocket` requests advisory mode.
- `apps/server/src/supply/application/service/rocket-purchase-confirmation.service.ts` — official Coupang workbook export requests fresh mode.
- `apps/server/src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts` — prove export still performs final capacity validation.
- `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts` — render the first preview response instead of polling inventory for up to fifteen minutes.
- `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx` — collected rows appear immediately without a freshness wait.
- Delete `apps/web/src/app/(supply)/purchase-orders/lib/rocket-preview-freshness-recovery.ts` and its spec after all imports are removed.

### All-row Rocket final-order candidates

- `apps/server/src/supply/application/port/in/procurement/rocket-final-order-reconciliation.port.ts` — return a stable non-null transport intent key plus matched/unmatched refs.
- `apps/server/src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.ts` — keep matching as workflow linkage only.
- `apps/server/src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts` — unmatched-only and mixed-batch linkage regressions.
- `apps/server/src/orders/application/port/in/coupang-direct-order-collection.port.ts` — return `collectedLines`, `matchedLines`, and `unmatchedLines` explicitly.
- `apps/server/src/orders/adapter/out/transaction/coupang-direct-order-collection.transaction.adapter.ts` — persist all rows and classify linkage without filtering.
- `apps/server/src/orders/application/service/coupang-direct-order-collection.service.spec.ts` — result contract regression.
- `apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts` — all-row persistence and classification regression.
- `apps/server/src/orders/controllers/order-collection.controller.ts` — generate from the full transport request; reserve 204 for a genuinely empty transport.
- `apps/server/src/orders/controllers/order-collection.controller.spec.ts` — unmatched-only requests return a file.
- `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.ts` — require the stable intent key but allow a null Rocket workbook export ID.
- `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.spec.ts` — unmatched-only file parsing regression.
- `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts` — store every non-empty transport file and label workbook match counts as advisory.
- `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.spec.ts` — both transport and unmatched-file regressions.

### Submission-result UX

- `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.ts` — preserve exact errors and add an operator-triggered inventory-sync action.
- `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx` — explicit failure, manual sync, and unknown-result isolation tests.
- `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.ts` — no behavioral change unless tests expose drift; it remains the idempotent submission state machine.

---

### Task 1: Decouple Inventory Freshness and Claims from Unresolved Submissions

**Files:**
- Modify: `packages/shared/src/schemas/sellpia-inventory-freshness.ts:326-355`
- Modify: `packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts:90-130`
- Modify: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.ts:103-118,318-390`
- Modify: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts:470-495`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts:145-195`
- Modify: `apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.ts:1-85`
- Modify: `apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.spec.ts:35-75`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.tsx:1-100`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.spec.tsx:1-80`

**Interfaces:**
- Consumes: existing `SellpiaInventoryFreshnessState.unresolvedOrderTransmissionIntents` for the separate reconciliation list.
- Produces: freshness status derived only from lease/failure/generation/TTL; `planClaim` may return `claimed` with unresolved intents when a generation is due.

- [ ] **Step 1: Replace the shared stale-intent expectation with a freshness-independence test**

```ts
it('does not let an unresolved transmission redefine a verified stock snapshot', () => {
  expect(deriveSellpiaInventoryFreshness({
    now: new Date('2026-07-15T00:01:00.000Z'),
    lastVerifiedAt: VERIFIED_AT,
    requestedGeneration: 4n,
    verifiedGeneration: 4n,
    failedGeneration: null,
    activeSyncLeaseExpiresAt: null,
  })).toBe('fresh');
});
```

- [ ] **Step 2: Write the pure claim regression**

Replace `does not claim a generation while an order transmission intent is unresolved` with:

```ts
it('claims a due generation while an unrelated transmission result is unresolved', () => {
  const state = makeState({
    sourceAccountKey: 'kiditem',
    requestedGeneration: 2n,
    verifiedGeneration: 1n,
    syncNotBefore: NOW,
    unresolvedOrderTransmissionIntents: [UNRESOLVED_INTENT],
  });

  expect(planClaim(state, {
    now: NOW,
    userId: '00000000-0000-4000-8000-000000000064',
    claimToken: '00000000-0000-4000-8000-000000000065',
    freshnessFence: '00000000-0000-4000-8000-000000000066',
  })).toMatchObject({
    kind: 'claimed',
    generation: 2n,
  });
});
```

- [ ] **Step 3: Write the service regression for a crashed submit plus manual stock refresh**

```ts
it('keeps a crashed submit visible while allowing an independent stock collection', async () => {
  repository.seedState({
    sourceAccountKey: 'kiditem',
    requestedGeneration: 4n,
    verifiedGeneration: 4n,
    lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
  });
  await service.prepareOrderTransmissionIntent({
    organizationId: ORG_ID,
    userId: USER_ID,
    intentKey: INTENT_KEY,
  });

  await expect(service.getState({ organizationId: ORG_ID, userId: USER_ID }))
    .resolves.toMatchObject({ status: 'fresh' });
  await service.requestRefresh({
    organizationId: ORG_ID,
    userId: USER_ID,
    reason: 'manual_request',
  });
  await expect(service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
    .resolves.toMatchObject({ claimed: true, activeGeneration: '5' });
  expect(repository.unresolvedIntentCount(ORG_ID)).toBe(1);
});
```

- [ ] **Step 4: Run the three focused tests and confirm they fail under the current blocking policy**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/sellpia-inventory-freshness.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts
```

Expected: the claim remains `joined`, prepared intent reports `refresh_required`, or the service claim remains false.

- [ ] **Step 5: Remove unresolved intent from freshness derivation and claim eligibility**

Change the shared input and server policy to:

```ts
export type SellpiaFreshnessDerivationInput = {
  now: Date;
  lastVerifiedAt: Date | null;
  requestedGeneration: bigint;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  activeSyncLeaseExpiresAt: Date | null;
};

export function deriveFreshnessStatus(
  state: SellpiaInventoryFreshnessState,
  now: Date,
): SellpiaInventoryFreshnessStatus {
  return deriveSellpiaInventoryFreshness({
    now,
    lastVerifiedAt: state.lastVerifiedAt,
    requestedGeneration: state.requestedGeneration,
    verifiedGeneration: state.verifiedGeneration,
    failedGeneration: state.failedGeneration,
    activeSyncLeaseExpiresAt: state.activeSyncLeaseExpiresAt,
  });
}
```

In `planClaim`, keep source binding as the only non-lease eligibility guard:

```ts
if (!isSourceBindingConfirmed(state)) return { kind: 'joined' };
```

Do not delete unresolved-intent persistence, list endpoints, reconciliation, or exact-key submission guards.

- [ ] **Step 6: Make web sync classification ignore the separate transmission alert**

Use this outcome union and remove the `blocked` branch:

```ts
export type SellpiaStockSyncOutcome =
  | { kind: 'running' }
  | { kind: 'queued'; startsInMs: number }
  | { kind: 'stalled'; errorMessage: string | null }
  | { kind: 'fresh' }
  | { kind: 'request_failed' };

export function classifySellpiaStockSync(
  state: SellpiaInventoryFreshnessWithBlockers | null,
  now: number = Date.now(),
): SellpiaStockSyncOutcome {
  if (!state) return { kind: 'request_failed' };
  if (state.status === 'syncing') return { kind: 'running' };
  if (state.status === 'failed') {
    return { kind: 'stalled', errorMessage: state.lastAttempt?.errorMessage ?? null };
  }
  if (state.status === 'fresh') return { kind: 'fresh' };
  const notBefore = state.syncNotBefore ? Date.parse(state.syncNotBefore) : now;
  return {
    kind: 'queued',
    startsInMs: Number.isNaN(notBefore) ? 0 : Math.max(0, notBefore - now),
  };
}
```

Update `UnresolvedTransmissions` copy to say:

```tsx
<p>
  전송 결과가 확인되지 않은 파일입니다. 해당 파일의 재전송 전에 셀피아 주문 내역을
  확인하세요. 다른 주문 수집과 재고 동기화는 계속 사용할 수 있습니다.
</p>
```

- [ ] **Step 7: Add web assertions that sync remains runnable and the alert remains visible**

```ts
it('classifies the actual sync state even when an unresolved transmission is listed', () => {
  expect(classifySellpiaStockSync(view({
    status: 'syncing',
    unresolvedOrderTransmissionIntents: [
      { intentKey: 'orders-1', preparedAt: '2026-07-26T14:42:38.482Z' },
    ],
  }), NOW)).toEqual({ kind: 'running' });
});
```

In the component spec, assert both `전송 결과가 확인되지 않은 파일` and `다른 주문 수집과 재고 동기화는 계속 사용할 수 있습니다.` render.

- [ ] **Step 8: Run the complete Inventory/shared/web outcome tests**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/sellpia-inventory-freshness.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/_shared/sellpia-sync-outcome.spec.ts' 'src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.spec.tsx'
```

Expected: PASS. An unresolved intent remains queryable, while a due manual refresh can be claimed.

- [ ] **Step 9: Commit the independent Inventory behavior**

```bash
rtk git add packages/shared/src/schemas/sellpia-inventory-freshness.ts packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.ts apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts 'apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.ts' 'apps/web/src/app/(inventory)/_shared/sellpia-sync-outcome.spec.ts' 'apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.tsx' 'apps/web/src/app/(inventory)/stock-ops/components/UnresolvedTransmissions.spec.tsx'
rtk git commit -m "fix: decouple Sellpia stock collection from submission intents"
```

---

### Task 2: Return Rocket PO Preview Immediately and Reserve Fresh Validation for Export

**Files:**
- Modify: `apps/server/src/supply/application/port/in/procurement/rocket-purchase-preview.port.ts:1-18`
- Modify: `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts:25-166`
- Modify: `apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts:240-390`
- Modify: `apps/server/src/supply/adapter/in/http/procurement.controller.ts:118-141`
- Modify: `apps/server/src/supply/application/service/rocket-purchase-confirmation.service.ts:45-70`
- Modify: `apps/server/src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts:160-215`
- Modify: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts:1-570`
- Modify: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx`
- Delete: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-preview-freshness-recovery.ts`
- Delete: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-preview-freshness-recovery.spec.ts`

**Interfaces:**
- Produces: `RocketPurchasePreviewPort.preview({ ..., inventoryRequirement })` where HTTP preview uses `advisory` and official workbook export uses `fresh`.
- Preserves: the existing `RocketPurchasePreviewResponse` union for internal fresh-required export behavior and rolling-deploy compatibility.

- [ ] **Step 1: Add failing service tests for advisory and fresh callers**

```ts
it('returns advisory rows immediately without requesting inventory freshness', async () => {
  const deps = dependencies();
  const service = previewService(deps);

  const result = await service.preview({
    organizationId,
    userId,
    inventoryRequirement: 'advisory',
    request: request(),
  });

  expect(result).toMatchObject({
    status: 'ready',
    inventoryGeneration: null,
    rows: [{ poLineId, recommendedQuantity: 5 }],
  });
  expect(deps.freshness.readFreshCapacityOrRequest).not.toHaveBeenCalled();
});

it('requests same-generation capacity for official workbook validation', async () => {
  const deps = dependencies();
  const service = previewService(deps);

  await service.preview({
    organizationId,
    userId,
    inventoryRequirement: 'fresh',
    request: request(),
  });

  expect(deps.freshness.readFreshCapacityOrRequest).toHaveBeenCalledWith({
    organizationId,
    sellpiaInventorySkuIds: [sellpiaInventorySkuId],
  });
});
```

- [ ] **Step 2: Run the Supply preview tests and confirm the new required input is absent**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts
```

Expected: FAIL because `inventoryRequirement` is not part of the port and advisory mode still calls `readFreshCapacityOrRequest`.

- [ ] **Step 3: Add the exact port discriminator**

```ts
export type RocketInventoryRequirement = 'advisory' | 'fresh';

export interface RocketPurchasePreviewPort {
  preview(input: {
    organizationId: string;
    userId: string;
    inventoryRequirement: RocketInventoryRequirement;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPurchasePreviewResponse>;
}
```

- [ ] **Step 4: Gate only fresh-required preview calls**

Keep the existing `previewRows` construction from `CHANNEL_SKU_AVAILABILITY_PORT`. Replace the unconditional freshness block with:

```ts
let inventoryGeneration: string | null = null;
if (
  input.inventoryRequirement === 'fresh'
  && sellpiaInventorySkuIds.length > 0
) {
  const gated = await this.freshness.readFreshCapacityOrRequest({
    organizationId: input.organizationId,
    sellpiaInventorySkuIds,
  });
  if (gated.status === 'refresh_required') {
    if (!catalog.catalog) {
      throw new InternalServerErrorException(
        'Rocket catalog checkpoint is missing before inventory refresh',
      );
    }
    return {
      status: 'freshness_pending',
      collectionRunId: request.collection.collectionRunId,
      catalog: catalog.catalog,
      requestedGeneration: gated.requestedGeneration,
    };
  }
  inventoryGeneration = gated.generation;
  const inventorySkuById = new Map(
    gated.inventorySkus.map((sku) => [sku.sellpiaInventorySkuId, sku]),
  );
  for (const row of previewRows) {
    row.components = row.components.map((component) => {
      const inventorySku = inventorySkuById.get(component.sellpiaInventorySkuId);
      return {
        ...component,
        currentStock: inventorySku?.currentStock ?? 0,
        isActive: inventorySku?.isActive ?? false,
      };
    });
  }
}
```

Advisory mode falls through immediately and calculates rows from the already-read latest snapshot. It must not enqueue `purchase_preflight`.

- [ ] **Step 5: Set caller requirements explicitly**

In `procurement.controller.ts`:

```ts
return this.rocketPreview.preview({
  organizationId,
  userId: user.id,
  inventoryRequirement: 'advisory',
  request: {
    channelAccountId: body.channelAccountId,
    collection: body.collection,
    rows: body.rows,
    editedQuantities: body.editedQuantities,
    ...(body.clampEditedQuantities !== undefined && {
      clampEditedQuantities: body.clampEditedQuantities,
    }),
    ...(body.previewScope !== undefined && { previewScope: body.previewScope }),
  },
});
```

In `rocket-purchase-confirmation.service.ts`:

```ts
const preview = await this.previewPort.preview({
  organizationId: input.organizationId,
  userId: input.userId,
  inventoryRequirement: 'fresh',
  request: previewRequest satisfies RocketPurchasePreviewRequest,
});
```

- [ ] **Step 6: Remove web polling and consume one preview response**

Replace `previewWithFreshnessRecovery` with a single-call helper:

```ts
const loadAdvisoryPreview = async (
  request: RocketPurchasePreviewRequest,
): Promise<RocketPurchasePreviewReadyResponse> => {
  const result = await previewRocketPurchases(request);
  if (result.status !== 'ready') {
    throw new Error(
      `로켓 PO 수집본은 저장됐지만 미리보기 응답이 준비되지 않았습니다. (${result.requestedGeneration})`,
    );
  }
  return result;
};
```

Use it for new collection, saved-source reopen, and quantity recalculation. Remove `pendingCheckpoint`, `refreshing_inventory`, `attention_required`, waiter controllers, Inventory query invalidation, and `RocketPreviewFreshnessRecoveryError` imports. Keep collection session finalization immediately after catalog publication.

- [ ] **Step 7: Add the hook regression**

```ts
it('shows collected Rocket rows from the first advisory preview response', async () => {
  const source = savedCollection(
    ACCOUNT_A,
    SOURCE_A,
    COLLECTION_A,
    [sourceRow('LINE-A')],
  );
  vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
    collection: source.collection,
    rows: source.rows,
    poCount: 1,
  });
  vi.mocked(previewRocketPurchases).mockResolvedValue(
    preview(source, [previewRow('LINE-A', null, 3)]),
  );
  const hook = renderHook(() => useRocketPurchaseWorkflow({
    channelAccountId: ACCOUNT_A,
    hasConfiguredVendorId: true,
    from: '2026-07-01',
    to: '2026-07-31',
    savedSourceImportRunId: null,
  }), { wrapper: queryWrapper() });

  await act(async () => hook.result.current.recalculate());

  expect(previewRocketPurchases).toHaveBeenCalledTimes(1);
  expect(hook.result.current.preview?.rows).toHaveLength(1);
  expect(hook.result.current.stage).toBe('ready');
  expect(sellpiaInventoryFreshnessApi.getState).not.toHaveBeenCalled();
  expect(sellpiaInventoryFreshnessApi.requestRefresh).not.toHaveBeenCalled();
});
```

- [ ] **Step 8: Delete the obsolete fifteen-minute recovery module and run focused tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx' 'src/app/(orders)/rocket-orders/components/RocketConfirmPanel.spec.tsx'
```

Expected: PASS. The HTTP preview path calls no freshness API; official workbook export still requests fresh validation.

- [ ] **Step 9: Commit the immediate-preview boundary**

```bash
rtk git add apps/server/src/supply/application/port/in/procurement/rocket-purchase-preview.port.ts apps/server/src/supply/application/service/rocket-purchase-preview.service.ts apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts apps/server/src/supply/adapter/in/http/procurement.controller.ts apps/server/src/supply/application/service/rocket-purchase-confirmation.service.ts apps/server/src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts 'apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts' 'apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx' 'apps/web/src/app/(supply)/purchase-orders/lib/rocket-preview-freshness-recovery.ts' 'apps/web/src/app/(supply)/purchase-orders/lib/rocket-preview-freshness-recovery.spec.ts'
rtk git commit -m "fix: show Rocket PO preview without inventory preflight"
```

---

### Task 3: Generate Sellpia Candidates from Every Collected Rocket Final-Order Row

**Files:**
- Modify: `apps/server/src/supply/application/port/in/procurement/rocket-final-order-reconciliation.port.ts:1-45`
- Modify: `apps/server/src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.ts:20-200`
- Modify: `apps/server/src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts`
- Modify: `apps/server/src/orders/application/port/in/coupang-direct-order-collection.port.ts:1-35`
- Modify: `apps/server/src/orders/adapter/out/transaction/coupang-direct-order-collection.transaction.adapter.ts:120-185`
- Modify: `apps/server/src/orders/application/service/coupang-direct-order-collection.service.spec.ts`
- Modify: `apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts`
- Modify: `apps/server/src/orders/controllers/order-collection.controller.ts:55-115,450-475`
- Modify: `apps/server/src/orders/controllers/order-collection.controller.spec.ts:1-120`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.ts:25-140`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.spec.ts:50-145`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts:420-475`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.spec.ts:150-230`

**Interfaces:**
- Produces stable `rocket-final-order:{sourceImportRunId}:{transport}` keys for all non-empty transport conversions.
- Produces `collectedLines`, `matchedLines`, and `unmatchedLines`; only matched lines mutate Supply workbook linkage, while all collected lines enter the generated Sellpia workbook.

- [ ] **Step 1: Write the reconciliation regression for an unmatched-only batch**

```ts
it('returns a stable transport intent key even when no active workbook line matches', async () => {
  const finalOrderLineId = randomUUID();
  const result = await prisma.$transaction((tx) => adapter.reconcile({
    transaction: tx,
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    sourceImportRunId: finalImportRunId,
    transport: 'SHIPMENT',
    lines: [{
      finalOrderLineId,
      poNumber: 'PO-UNMATCHED',
      productNo: 'SKU-UNMATCHED',
      barcode: null,
      unitQuantity: 2,
    }],
  }));

  expect(result).toMatchObject({
    exportId: null,
    transmissionIntentKey: `rocket-final-order:${finalImportRunId}:shipment`,
    matchedLineCount: 0,
    unmatchedLines: [{ poNumber: 'PO-UNMATCHED', productNo: 'SKU-UNMATCHED' }],
  });
});
```

- [ ] **Step 2: Write the controller regression proving unmatched rows still generate a file**

```ts
it('generates a Sellpia file from collected rows when no prior Rocket workbook matches', async () => {
  const workbook = {
    generate: vi.fn().mockResolvedValue({
      buffer: Buffer.from('xls'),
      fileName: 'rocket.xls',
      poCount: 1,
      rowCount: 1,
    }),
  };
  const collection = {
    collect: vi.fn().mockResolvedValue({
    importRunId: '11111111-1111-4111-8111-111111111111',
    exportId: null,
    transmissionIntentKey:
      'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
    matchedLineCount: 0,
    reconciledRows: 0,
    collectedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    matchedLines: [],
    unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    duplicate: false,
    }),
  };
  const controller = new OrderCollectionController(
    {} as never,
    workbook as never,
    collection as never,
  );
  const response = { setHeader: vi.fn(), status: vi.fn() };

  const result = await controller.convertCoupangDirectship(
    request() as never,
    ORGANIZATION_ID,
    { id: USER_ID } as never,
    { once: vi.fn() } as never,
    response as never,
  );

  expect(result).toBeDefined();
  expect(workbook.generate).toHaveBeenCalledWith(
    request(),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(response.status).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run focused Supply and Orders tests and confirm the current no-match filtering fails**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts src/orders/controllers/order-collection.controller.spec.ts src/orders/application/service/coupang-direct-order-collection.service.spec.ts
```

Expected: FAIL because the reconciliation key is null, the result uses `confirmedLines/skippedLines`, and the controller returns 204.

- [ ] **Step 4: Make the transport intent key independent of workbook matching**

In the reconciliation adapter, create the key before workbook lookup:

```ts
const transmissionIntentKey =
  `rocket-final-order:${input.sourceImportRunId}:${input.transport.toLowerCase()}`;
```

Rename `skippedLines` to `unmatchedLines`. Return the stable key even when `exportId` is null:

```ts
if (!exportId) {
  return {
    exportId: null,
    transmissionIntentKey,
    matchedLineCount: 0,
    reconciledRows: 0,
    unmatchedLines,
  };
}
```

When an export exists, store the same key in `RocketPurchaseConfirmationTransmission`. Continue linking only exact matched workbook lines and computing workflow progress only from those links.

- [ ] **Step 5: Classify all persisted order lines without discarding any**

In the Orders transaction adapter:

```ts
const unmatchedKeys = new Set(
  reconciled.unmatchedLines.map(({ poNumber, productNo }) =>
    lineKey(poNumber, productNo)),
);
const collectedLines = dedupeLineRefs(
  reconciliationLines.map(({ poNumber, productNo }) => ({ poNumber, productNo })),
);
const matchedLines = collectedLines.filter(({ poNumber, productNo }) =>
  !unmatchedKeys.has(lineKey(poNumber, productNo)),
);
const unmatchedLines = dedupeLineRefs(reconciled.unmatchedLines);

return {
  importRunId: importRun.id,
  exportId: reconciled.exportId,
  transmissionIntentKey: reconciled.transmissionIntentKey,
  matchedLineCount: reconciled.matchedLineCount,
  reconciledRows: reconciled.reconciledRows,
  collectedLines,
  matchedLines,
  unmatchedLines,
  duplicate: existingRun?.status === 'completed',
};
```

Update the incoming port with these exact names and make `transmissionIntentKey` a non-null `string`.

- [ ] **Step 6: Generate from the full request and use 204 only for an empty selected transport**

Replace the confirmed-line filter in the controller with:

```ts
response.setHeader(
  'X-Rocket-Workbook-Matched-Rows',
  String(collected.matchedLines.length),
);
response.setHeader(
  'X-Rocket-Workbook-Unmatched-Rows',
  String(collected.unmatchedLines.length),
);
response.setHeader('X-Order-Collection-Skipped-Rows', '0');

const hasTransportRows = body.pos.some((purchaseOrder) =>
  String(purchaseOrder.transport).toUpperCase() === body.transport
  && purchaseOrder.items.length > 0,
);
if (!hasTransportRows) {
  response.setHeader('X-Order-Collection-Source-Rows', '0');
  response.setHeader('X-Order-Collection-Product-Rows', '0');
  response.setHeader('X-Order-Collection-Output-Rows', '0');
  response.status(204);
  return;
}

const result = await this.coupangDirectshipService.generate(body, {
  signal: abortController.signal,
});
```

Delete `filterCoupangRequest`. Add the two Rocket headers to `Access-Control-Expose-Headers`.

- [ ] **Step 7: Accept unmatched-only files in the web API**

Use this result shape:

```ts
export interface CoupangDirectConversionResult {
  file: OrderCollectionConversionResult | null;
  outputRows: number;
  workbookMatchedRows: number;
  workbookUnmatchedRows: number;
  importRunId: string;
  rocketWorkbookExportId: string | null;
  transmissionIntentKey: string;
}
```

For a non-204 response, require only the import run and transmission intent headers:

```ts
const transmissionIntentKey = requiredHeader(
  res,
  'X-Sellpia-Transmission-Intent-Key',
);
const rocketWorkbookExportId = res.headers.get('X-Rocket-Workbook-Export-Id');
const outputRows = numHeader(res, 'X-Order-Collection-Output-Rows') ?? 0;
const workbookMatchedRows = numHeader(res, 'X-Rocket-Workbook-Matched-Rows') ?? 0;
const workbookUnmatchedRows = numHeader(res, 'X-Rocket-Workbook-Unmatched-Rows') ?? 0;
```

For HTTP 204, return `file: null` with the stable response key if present; do not require a workbook export ID.

- [ ] **Step 8: Store and label every non-empty transport file**

Keep the existing file-level selection UI. Build the source label with advisory linkage counts:

```ts
const linkageLabel = conversion.workbookUnmatchedRows > 0
  ? ` · 워크북 미매칭 ${formatNumber(conversion.workbookUnmatchedRows)}품목 포함`
  : '';
const historyItem = {
  ...result,
  id: conversion.transmissionIntentKey,
  sourceName:
    `쿠팡직배송 ${label} (${formatNumber(poCount)}건 · ${formatNumber(itemRows)}품목${linkageLabel})`,
  convertedAt,
  collectionDate: collectionDateOf(run),
  collectionMode: 'browser' as const,
  collectedRows: poCount,
  mallKey: 'coupang-direct',
  mallName: `쿠팡직배송 ${label}`,
  orderNumbers,
  rocketWorkbookExportId: conversion.rocketWorkbookExportId,
  transmissionIntentKey: conversion.transmissionIntentKey,
};
```

Do not preselect or auto-submit the file; `GeneratedFilesSection` remains the operator selection point.

- [ ] **Step 9: Run all Rocket final-order regressions**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts src/orders/controllers/order-collection.controller.spec.ts src/orders/application/service/coupang-direct-order-collection.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/order-collection/lib/coupang-directship-api.spec.ts' 'src/app/(orders)/order-collection/lib/browser-mall-collection.spec.ts'
```

Expected: PASS for unmatched-only, mixed matched/unmatched, duplicate collection, SHIPMENT, MILKRUN, and genuine empty-transport 204 cases.

- [ ] **Step 10: Commit the all-row candidate behavior**

```bash
rtk git add apps/server/src/supply/application/port/in/procurement/rocket-final-order-reconciliation.port.ts apps/server/src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.ts apps/server/src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts apps/server/src/orders/application/port/in/coupang-direct-order-collection.port.ts apps/server/src/orders/adapter/out/transaction/coupang-direct-order-collection.transaction.adapter.ts apps/server/src/orders/application/service/coupang-direct-order-collection.service.spec.ts apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts apps/server/src/orders/controllers/order-collection.controller.ts apps/server/src/orders/controllers/order-collection.controller.spec.ts 'apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.ts' 'apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.spec.ts' 'apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts' 'apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.spec.ts'
rtk git commit -m "fix: expose all collected Rocket orders for Sellpia"
```

---

### Task 4: Make Sellpia's Actual Result the Operator Decision Point

**Files:**
- Modify: `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.ts:20-115`
- Modify: `apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx:1-280`
- Verify unchanged: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.ts`
- Verify unchanged: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.spec.ts`

**Interfaces:**
- Consumes: exact `SellpiaSendResult.error` for `outcome: 'not_submitted'`.
- Produces: one manual `requestRefresh('manual_request')` action on explicit failure; unknown outcomes retain the existing exact-file reconciliation action.

- [ ] **Step 1: Extend the hook mock and write the explicit-error action test**

Add `requestRefresh: vi.fn()` to the hoisted freshness mock and default it to a resolved freshness state. Replace the current exact-error assertion with:

```ts
it('shows the exact Sellpia error and lets the operator request stock sync', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  extension.sendOrderFileToSellpiaViaExtension.mockResolvedValue({
    success: false,
    outcome: 'not_submitted',
    error: '상품코드 K-100의 재고가 부족합니다.',
  });
  const { result } = renderHook(
    () => useSellpiaOrderTransmission({ onTransmissionRequested: vi.fn() }),
    { wrapper: wrapper(client) },
  );

  await act(async () => {
    await expect(result.current.transmit(generatedFile())).resolves.toBe(false);
  });

  expect(toast.error).toHaveBeenCalledWith(
    '상품코드 K-100의 재고가 부족합니다.',
    expect.objectContaining({
      action: expect.objectContaining({ label: '재고 동기화' }),
    }),
  );
  expect(freshness.requestRefresh).not.toHaveBeenCalled();
  const options = toast.error.mock.calls.at(-1)?.[1];
  await act(async () => options.action.onClick());
  expect(freshness.requestRefresh).toHaveBeenCalledWith('manual_request');
});
```

- [ ] **Step 2: Add the unknown-result isolation assertion**

Extend the existing unknown-outcome test:

```ts
expect(freshness.requestRefresh).not.toHaveBeenCalled();
expect(toast.error).toHaveBeenCalledWith(
  expect.stringContaining('셀피아 전송 결과 확인 필요'),
  expect.objectContaining({
    action: expect.objectContaining({ label: '전송 결과 확인' }),
  }),
);
```

This prevents an ambiguous result from being misclassified as a stock error.

- [ ] **Step 3: Run the hook test and confirm the sync action is missing**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx'
```

Expected: FAIL because the explicit error toast has no action.

- [ ] **Step 4: Add an operator-triggered refresh callback without automatic retry**

```ts
const requestInventoryRefresh = useCallback(() => {
  void sellpiaInventoryFreshnessApi.requestRefresh('manual_request')
    .then(async () => {
      await invalidateFreshnessHistory();
      toast.success('셀피아 재고 동기화를 요청했습니다. 완료 후 파일을 다시 전송하세요.');
    })
    .catch((error) => {
      toast.error(friendlyError(error) ?? '셀피아 재고 동기화 요청에 실패했습니다.');
    });
}, [invalidateFreshnessHistory]);
```

Use it only for explicit non-submission errors:

```ts
if (result.error) {
  toast.error(result.error, {
    duration: 12000,
    action: {
      label: '재고 동기화',
      onClick: requestInventoryRefresh,
    },
  });
}
```

Do not submit the file again after refresh. The operator explicitly chooses the retry from the generated-file list.

- [ ] **Step 5: Re-run pure transmission and hook tests**

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/order-collection/lib/sellpia-order-transmission.spec.ts' 'src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx'
```

Expected: PASS. Explicit failure aborts and remains retryable; unknown result stays prepared and blocks only the same file; other files and stock sync remain available.

- [ ] **Step 6: Commit the result-first UX**

```bash
rtk git add 'apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.ts' 'apps/web/src/app/(orders)/order-collection/hooks/use-sellpia-order-transmission.spec.tsx'
rtk git commit -m "fix: surface Sellpia errors with operator recovery"
```

---

### Task 5: Align Durable Contracts and Supersede the Old Hard-Gate Plan

**Files:**
- Modify: `apps/server/src/inventory/AGENTS.md:140-165`
- Modify: `apps/server/src/supply/AGENTS.md:65-85`
- Modify: `apps/server/src/orders/AGENTS.md:30-65`
- Modify: `apps/web/src/app/(inventory)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/order-collection/AGENTS.md:15-70`
- Modify: `apps/web/src/app/(supply)/AGENTS.md:35-75`
- Modify: `docs/superpowers/plans/2026-07-23-rocket-workbook-sellpia-workflow.md:430-520`
- Modify: `docs/superpowers/plans/2026-07-29-order-collection-server-source-of-truth.md:1-25,1100-1360`

**Interfaces:**
- Produces one consistent written contract: collection and candidate generation are unconditional; matching/freshness are advisory or final-action checks; unresolved intents are exact-file guards.

- [ ] **Step 1: Replace Inventory blocking guidance**

Use this rule in `apps/server/src/inventory/AGENTS.md`:

```md
- Before irreversible Sellpia order submission, Inventory persists an
  organization-scoped `prepared` transmission intent. The unresolved intent is
  an exact-file duplicate-submission guard and remains operator-reconcilable; it
  does not redefine stock freshness or block inventory collection claims. Only
  `submitted: true` finalization advances the post-submit requested generation.
  Explicit non-submission aborts the intent, and an unknown result requires
  reconciliation before that same intent key may be retried.
```

Describe the unresolved endpoint as an attention list, not a collection blocker.

- [ ] **Step 2: Replace Supply preview guidance**

Use this rule in `apps/server/src/supply/AGENTS.md` and the web Supply guide:

```md
- `previewRocket` publishes complete catalog evidence and returns advisory rows
  immediately from the latest stored Sellpia snapshot; it never waits for or
  schedules inventory freshness. The separate official workbook export reruns
  the preview with fresh-generation validation before persisting capacity-based
  quantities.
```

- [ ] **Step 3: Replace Orders hard-filter guidance**

Use this rule in server and web Orders guides:

```md
- Coupang Rocket PA collection persists every source row and generates one
  Sellpia candidate file for every non-empty transport. Supply links exact rows
  to an active Rocket workbook when possible, but unmatched rows remain in the
  generated file and are reported as advisory metadata. A stable transmission
  key is derived from `{sourceImportRunId, transport}` rather than requiring a
  workbook export.
```

Keep the upload-evidence and unknown-result retry rules unchanged.

- [ ] **Step 4: Mark the two older implementation plans as superseded where they conflict**

Add this note directly below each older plan header:

```md
> **Superseded behavior (2026-07-29):** The operator-controlled Sellpia
> application plan overrides this document wherever it says unresolved
> transmissions block stock collection, Rocket preview waits for freshness, or
> unmatched Rocket final-order rows produce HTTP 204/no artifact. Matching now
> records workflow evidence without filtering Sellpia candidates.
```

In `2026-07-29-order-collection-server-source-of-truth.md`, replace the global constraint that preserves HTTP 204 no-match artifacts with:

```md
- Coupang Rocket PA collection persists every row, links matching active-workbook
  rows as advisory workflow evidence, and persists an artifact for every
  non-empty SHIPMENT or MILKRUN transport. HTTP 204 is reserved for a transport
  with no collected source row.
```

Update its artifact task examples to use `collectedLines` for order numbers, `skippedRows: 0`, and separate workbook matched/unmatched metadata.

- [ ] **Step 5: Run instruction hygiene**

```bash
rtk npm run check:agents-hygiene
```

Expected: PASS with every root-to-leaf instruction chain below 28 KiB.

- [ ] **Step 6: Commit aligned documentation**

```bash
rtk git add apps/server/src/inventory/AGENTS.md apps/server/src/supply/AGENTS.md apps/server/src/orders/AGENTS.md 'apps/web/src/app/(inventory)/AGENTS.md' 'apps/web/src/app/(orders)/order-collection/AGENTS.md' 'apps/web/src/app/(supply)/AGENTS.md' docs/superpowers/plans/2026-07-23-rocket-workbook-sellpia-workflow.md docs/superpowers/plans/2026-07-29-order-collection-server-source-of-truth.md
rtk git commit -m "docs: define operator-controlled Sellpia application"
```

---

### Task 6: Verify the Complete Operator Workflow

**Files:**
- Verify only; fix failures in the owning task's files.

**Interfaces:**
- Consumes all preceding task outputs.
- Produces evidence that no ingestion path is freshness- or match-gated and submission safety remains exact-file scoped.

- [ ] **Step 1: Run shared, backend, and frontend focused suites**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/sellpia-inventory-freshness.spec.ts src/schemas/rocket-purchase-preview.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts src/orders/controllers/order-collection.controller.spec.ts src/orders/application/service/coupang-direct-order-collection.service.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(supply)/purchase-orders' 'src/app/(orders)/order-collection' 'src/app/(orders)/rocket-orders'
```

Expected: PASS.

- [ ] **Step 2: Run package builds**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Expected: all builds exit 0 with no contract drift.

- [ ] **Step 3: Run server organization-scope checks and boot verification**

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run dev:server
```

Expected: IDOR and tenant checks pass; NestJS reaches a successful boot. Stop the development server after confirming boot.

- [ ] **Step 4: Perform the manual browser smoke matrix**

1. Create or retain one unresolved test transmission intent and verify Inventory > Sellpia Sync still shows it.
2. Request Sellpia stock synchronization and verify the background collector claims and completes despite the unresolved intent.
3. Collect Rocket PO evidence while stock is older than ten minutes and verify the PO rows appear immediately without a freshness countdown.
4. Collect a Coupang Rocket final-order transport whose rows do not match an active workbook and verify a generated Sellpia file appears with an unmatched advisory label.
5. Select that file and submit it; for an explicit Sellpia rejection, verify the exact message appears and no automatic sync or retry runs.
6. Click `재고 동기화`, wait for completion, then manually select the file and retry.
7. Simulate an unknown extension outcome and verify only that file requires reconciliation; a different generated file and stock synchronization remain usable.
8. Submit a successful file twice and verify the second attempt does not invoke the extension again.

- [ ] **Step 5: Run final repository guards and review the scoped diff**

```bash
rtk npm run check:agents-hygiene
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git diff --check
rtk git status --short
```

Expected: every guard passes; the diff contains only this workflow, its tests, and aligned guidance. The pre-existing unrelated dirty files remain unchanged.

Any correction discovered by the final gates belongs in the preceding task's
owning files and commit. Do not create an empty or catch-all verification commit.

---

## Acceptance Criteria

- A prepared-but-unresolved Sellpia transmission does not change a fresh snapshot to `refresh_required` and does not prevent a due inventory claim.
- Rocket PO catalog evidence and preview rows appear after the first server preview call; the web app does not poll Inventory or wait fifteen minutes.
- Official Coupang confirmation-workbook export still revalidates capacity against a fresh generation before persisting positive quantities.
- Every collected Coupang Rocket final-order row is persisted and included in its transport's generated Sellpia file, regardless of prior workbook matching.
- Every non-empty transport gets a stable submission key derived from source import and transport; a Rocket workbook export ID is optional.
- The existing generated-file selection remains the only operator action that starts a Sellpia submission.
- Explicit Sellpia failure displays the exact error and offers manual stock synchronization; it does not auto-sync or auto-retry.
- Unknown submission outcome blocks only the same intent key until reconciliation; it never blocks stock collection, other source collection, or other generated files.
- Existing organization scoping, completeness checks, upload evidence, exact-file idempotency, and duplicate-submit protection remain green.
