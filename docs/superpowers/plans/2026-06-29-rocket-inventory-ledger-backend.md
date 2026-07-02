# Rocket Inventory Ledger Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KidItem-owned Rocket reservation, release, issue, and return/restock stock mutations with idempotent ledger events.

**Architecture:** Orders continues to own Rocket PO preview/generate UX, but Inventory owns reservation and stock writes through the existing `INVENTORY_PORT`. The Rocket ledger records stock deltas Sellpia never contains.

**Tech Stack:** NestJS, Prisma row locks, Zod contracts from `@kiditem/shared/inventory`, Vitest.

---

## File Structure

- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/rocket-inventory-event.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/in/stock/inventory.port.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/out/repository/inventory.repository.port.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/inventory.service.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/inventory.service.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/out/repository/inventory.repository.adapter.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/in/http/rocket-inventory.controller.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/inventory.module.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/orders/controllers/rocket-po.controller.ts`

## Engineering Review Constraints

- Do not create or export `ROCKET_INVENTORY_PORT`. `InventoryModule` continues to export only `INVENTORY_PORT`.
- `RocketPoController` in Orders injects `INVENTORY_PORT` and calls `applyRocketInventoryEvent`.
- Reuse `InventoryRepositoryPort.runInventoryStockMutation` for row locks.
- Extend the existing `InventoryRepositoryPort`/adapter with Rocket ledger and reserved-stock helpers instead of adding a second stock mutation repository.
- Keep `rocket-inventory-event.ts` pure domain code. It throws a custom domain error and `InventoryService` maps it to `BadRequestException`.

### Task 1: Rocket Ledger Policy

**Files:**
- Test: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/rocket-inventory-event.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildRocketInventoryEvent } from '../rocket-inventory-event';

describe('buildRocketInventoryEvent', () => {
  it('reserves stock without changing current stock', () => {
    expect(buildRocketInventoryEvent({ eventType: 'reserve', quantity: 4, openReservationQty: 0 }))
      .toMatchObject({ reservedDelta: 4, stockDelta: 0 });
  });

  it('issues stock by reducing reservation and current stock', () => {
    expect(buildRocketInventoryEvent({ eventType: 'issue', quantity: 3, openReservationQty: 5 }))
      .toMatchObject({ reservedDelta: -3, stockDelta: -3, overReservationQty: 0 });
  });

  it('blocks issue over open reservation without override reason', () => {
    expect(() => buildRocketInventoryEvent({ eventType: 'issue', quantity: 5, openReservationQty: 3 }))
      .toThrow('open reservation');
  });

  it('allows issue over open reservation with override reason', () => {
    expect(buildRocketInventoryEvent({
      eventType: 'issue',
      quantity: 5,
      openReservationQty: 3,
      allowOverReservation: true,
      overrideReason: 'manual shipment count correction',
    })).toMatchObject({ reservedDelta: -3, stockDelta: -5, overReservationQty: 2 });
  });

  it('returns stock without changing reservation', () => {
    expect(buildRocketInventoryEvent({ eventType: 'return_restock', quantity: 2, openReservationQty: 0 }))
      .toMatchObject({ reservedDelta: 0, stockDelta: 2 });
  });
});
```

- [ ] **Step 2: Run policy tests and verify failure**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts
```

Expected: FAIL because policy file does not exist.

- [ ] **Step 3: Implement the policy**

Create `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/rocket-inventory-event.ts`:

```ts
import type { RocketInventoryEventType } from '@kiditem/shared/inventory';

export class RocketInventoryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RocketInventoryPolicyError';
  }
}

export type RocketInventoryPolicyInput = {
  eventType: RocketInventoryEventType;
  quantity: number;
  openReservationQty: number;
  allowOverReservation?: boolean;
  overrideReason?: string;
};

export type RocketInventoryPolicyResult = {
  reservedDelta: number;
  stockDelta: number;
  overReservationQty: number;
};

export function buildRocketInventoryEvent(input: RocketInventoryPolicyInput): RocketInventoryPolicyResult {
  if (input.quantity <= 0) throw new RocketInventoryPolicyError('quantity must be positive');
  if (input.eventType === 'reserve') {
    return { reservedDelta: input.quantity, stockDelta: 0, overReservationQty: 0 };
  }
  if (input.eventType === 'release') {
    if (input.quantity > input.openReservationQty) {
      throw new RocketInventoryPolicyError('cannot release more than the open reservation');
    }
    return { reservedDelta: -input.quantity, stockDelta: 0, overReservationQty: 0 };
  }
  if (input.eventType === 'issue') {
    const reservedToConsume = Math.min(input.quantity, input.openReservationQty);
    const overReservationQty = Math.max(input.quantity - input.openReservationQty, 0);
    if (overReservationQty > 0 && (!input.allowOverReservation || !input.overrideReason?.trim())) {
      throw new RocketInventoryPolicyError('cannot issue more than the open reservation without override reason');
    }
    return { reservedDelta: -reservedToConsume, stockDelta: -input.quantity, overReservationQty };
  }
  return { reservedDelta: 0, stockDelta: input.quantity, overReservationQty: 0 };
}
```

- [ ] **Step 4: Run policy tests**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit policy**

```bash
git add apps/server/src/inventory/domain/policy/rocket-inventory-event.ts apps/server/src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts
git commit -m "feat: add Rocket inventory event policy"
```

### Task 2: Inventory Port Rocket Event Service

**Files:**
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/in/stock/inventory.port.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/out/repository/inventory.repository.port.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/inventory.service.ts`
- Test: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/inventory.service.spec.ts`

- [ ] **Step 1: Write failing InventoryService tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService Rocket events', () => {
  it('reserves stock idempotently by source action and event type', async () => {
    const repository = makeRepository();
    repository.findRocketLedgerBySource.mockResolvedValueOnce(null);
    const service = makeService(repository);

    await service.applyRocketInventoryEvent({
      organizationId: 'org-1',
      userId: 'user-1',
      inventoryId: 'inventory-1',
      optionId: 'option-1',
      eventType: 'reserve',
      quantity: 5,
      sourceActionId: 'PO-1-line-1-reserve',
      sourceType: 'rocket_confirm',
      sourceRef: 'PO-1/line-1',
    });

    expect(repository.applyStockAndReservedDeltas).toHaveBeenCalledWith(expect.anything(), 'inventory-1', {
      reservedDelta: 5,
      stockDelta: 0,
    });
    expect(repository.appendRocketLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'reserve',
      reservedDelta: 5,
      stockDelta: 0,
    }));
  });

  it('returns existing ledger without double-applying when source action was already recorded', async () => {
    const repository = makeRepository();
    repository.findRocketLedgerBySource.mockResolvedValueOnce({ id: 'ledger-1' });
    const service = makeService(repository);

    await service.applyRocketInventoryEvent({
      organizationId: 'org-1',
      userId: 'user-1',
      inventoryId: 'inventory-1',
      optionId: 'option-1',
      eventType: 'reserve',
      quantity: 5,
      sourceActionId: 'PO-1-line-1-reserve',
      sourceType: 'rocket_confirm',
      sourceRef: 'PO-1/line-1',
    });

    expect(repository.applyStockAndReservedDeltas).not.toHaveBeenCalled();
    expect(repository.appendRocketLedger).not.toHaveBeenCalled();
  });

  it('blocks over-reservation issue without override reason', async () => {
    const repository = makeRepository({ reservedStock: 2, currentStock: 10 });
    repository.findRocketLedgerBySource.mockResolvedValueOnce(null);
    const service = makeService(repository);

    await expect(service.applyRocketInventoryEvent({
      organizationId: 'org-1',
      userId: 'user-1',
      inventoryId: 'inventory-1',
      optionId: 'option-1',
      eventType: 'issue',
      quantity: 3,
      sourceActionId: 'PO-1-line-1-issue',
      sourceType: 'rocket_shipment',
      sourceRef: 'PO-1/line-1',
    })).rejects.toThrow(BadRequestException);
  });
});

function makeRepository(stock = { reservedStock: 0, currentStock: 10 }) {
  const tx = Symbol('tx');
  return {
    findRocketLedgerBySource: vi.fn(),
    runInventoryStockMutation: vi.fn(async (_inventoryId: string, _organizationId: string, op: any) => op(tx, {
      id: 'inventory-1',
      optionId: 'option-1',
      organizationId: 'org-1',
      currentStock: stock.currentStock,
      reservedStock: stock.reservedStock,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      warehouseLocation: null,
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    applyStockAndReservedDeltas: vi.fn(async () => undefined),
    appendRocketLedger: vi.fn(async () => ({ id: 'ledger-1' })),
    appendStockLedger: vi.fn(async () => ({ id: 'stock-tx-1' })),
    findOptionNameForLedger: vi.fn(async () => '옵션'),
  } as any;
}

function makeService(repository: ReturnType<typeof makeRepository>) {
  return new InventoryService({} as any, repository, {} as any);
}
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/inventory.service.spec.ts
```

Expected: FAIL because `InventoryPort.applyRocketInventoryEvent` and repository Rocket helpers do not exist.

- [ ] **Step 3: Extend Inventory port, repository port, and service**

Extend `InventoryPort`:

```ts
import type { RocketInventoryEventInput } from '@kiditem/shared/inventory';

export type ApplyRocketInventoryEventInput = RocketInventoryEventInput & {
  organizationId: string;
  userId: string;
};

export interface InventoryPort {
  applyRocketInventoryEvent(input: ApplyRocketInventoryEventInput): Promise<{ ledgerId: string; alreadyApplied: boolean }>;
}
```

Extend `InventoryRepositoryPort` with:

```ts
findRocketLedgerBySource(
  organizationId: string,
  sourceActionId: string,
  eventType: string,
): Promise<{ id: string } | null>;

applyStockAndReservedDeltas(
  tx: RepositoryTransaction,
  inventoryId: string,
  deltas: { stockDelta: number; reservedDelta: number },
): Promise<void>;

appendRocketLedger(tx: RepositoryTransaction, input: {
  organizationId: string;
  inventoryId: string;
  optionId: string;
  eventType: string;
  quantity: number;
  reservedDelta: number;
  stockDelta: number;
  sourceActionId: string;
  sourceType: string;
  sourceRef: string;
  overReservationQty: number;
  overrideBy: string | null;
  overrideReason: string | null;
  createdBy: string;
  note: string | null;
}): Promise<{ id: string }>;
```

Implement `InventoryService.applyRocketInventoryEvent` in this order:

1. Check `findRocketLedgerBySource(organizationId, sourceActionId, eventType)`.
2. If found, return `{ ledgerId: existing.id, alreadyApplied: true }`.
3. Lock inventory row through `runInventoryStockMutation(inventoryId, organizationId, ...)`.
4. Compute deltas through `buildRocketInventoryEvent`.
5. Assert `currentStock + stockDelta >= 0`.
6. Update `reservedStock` and `currentStock` with `applyStockAndReservedDeltas`.
7. Append stock ledger only for `issue` and `return_restock` through existing `appendStockLedger`.
8. Append Rocket ledger metadata with `overrideBy`, `overrideReason`, and `overReservationQty` when present.
9. Catch `RocketInventoryPolicyError` and map it to `BadRequestException` in the application service.

- [ ] **Step 4: Run Rocket service tests**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts src/inventory/application/service/inventory.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Rocket service**

```bash
git add apps/server/src/inventory/domain/policy/rocket-inventory-event.ts apps/server/src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts apps/server/src/inventory/application/port/in/stock/inventory.port.ts apps/server/src/inventory/application/port/out/repository/inventory.repository.port.ts apps/server/src/inventory/application/service/inventory.service.ts apps/server/src/inventory/application/service/inventory.service.spec.ts
git commit -m "feat: add Rocket inventory ledger service"
```

### Task 3: Repository, Controller, And Orders Commit Endpoint

**Files:**
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/out/repository/inventory.repository.adapter.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/in/http/rocket-inventory.controller.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/inventory.module.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/orders/controllers/rocket-po.controller.ts`

- [ ] **Step 1: Extend the existing Inventory repository adapter**

Add `findRocketLedgerBySource`, `applyStockAndReservedDeltas`, and `appendRocketLedger` to `InventoryRepositoryAdapter`. Keep using the existing tenant-scoped row lock from `runInventoryStockMutation`:

```ts
await tx.$queryRaw`
  SELECT id FROM inventory
  WHERE id = ${inventoryId}::uuid
    AND organization_id = ${organizationId}::uuid
  FOR UPDATE
`;
```

Use Prisma `findFirst({ where: { id: inventoryId, organizationId } })` after the lock. Do not use `findUnique({ where: { id } })`.

- [ ] **Step 2: Add Inventory HTTP endpoint for shipment/return manual events**

Add `RocketInventoryController` under `@Controller('inventory/rocket')` with:

- `POST /api/inventory/rocket/events`

The controller injects `INVENTORY_PORT`, passes `organizationId` and `user.id`, and calls `applyRocketInventoryEvent`. It returns `{ ledgerId, alreadyApplied }`.

- [ ] **Step 3: Add Orders commit endpoint**

Add `POST /api/orders/rocket/confirm-commit` to `RocketPoController`. The endpoint accepts final confirmed rows and delegates each reservable row to `INVENTORY_PORT.applyRocketInventoryEvent` with `eventType: 'reserve'`. Source action id format:

```ts
const sourceActionId = `rocket-confirm:${row.poNumber}:${row.barcode}:${row.confirmQty}`;
```

Skip rows with `confirmQty <= 0`. Return counts:

```ts
return { reservedRows, alreadyReservedRows, skippedRows };
```

- [ ] **Step 4: Update module and integration tests**

Update `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts` so:

- `RocketInventoryController` is registered;
- `InventoryModule` still exports only `INVENTORY_PORT`;
- no `ROCKET_INVENTORY_PORT` provider/export exists.

Extend `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts` with:

- concurrent duplicate Rocket reserve commits apply at most one reserved-stock delta;
- issue over open reservation fails without override reason;
- issue over open reservation succeeds with override reason and records `overReservationQty`;
- return/restock increases `currentStock` without changing `reservedStock`;
- bundle stock recomputes after Rocket issue and return/restock.

- [ ] **Step 5: Run focused backend checks**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts src/inventory/application/service/inventory.service.spec.ts src/inventory/__tests__/inventory.architecture.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts src/inventory/__tests__/inventory-flow.pg.integration.spec.ts src/orders/services/rocket-po-confirm.service.spec.ts
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: PASS. Existing Rocket preview/generate tests still pass.

- [ ] **Step 6: Commit wiring**

```bash
git add apps/server/src/inventory apps/server/src/orders/controllers/rocket-po.controller.ts
git commit -m "feat: wire Rocket inventory commit endpoints"
```

## Self-Review

- Spec coverage: reserve, release, issue, return/restock, idempotency, over-reservation override, and PR310 commit integration are covered.
- Red-flag scan: no blocked planning phrases are intentionally present.
- Type consistency: `eventType` values match `RocketInventoryEventTypeSchema`.
