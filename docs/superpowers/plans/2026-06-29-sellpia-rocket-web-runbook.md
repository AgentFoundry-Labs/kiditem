# Sellpia Rocket Web Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the operator UI and runbook for Sellpia row import/review, new product candidates, Rocket commit, shipment issue, and return/restock.

**Architecture:** Web code calls NestJS APIs through route-group helpers. Inventory hub owns Sellpia sync and manual Rocket shipment/return stock operations; Rocket orders owns the post-generate commit action.

**Tech Stack:** Next.js App Router, React Query, `apiClient`, `@kiditem/shared/inventory`, lucide-react, Vitest, Testing Library.

---

## File Structure

- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/_shared/inventory-api.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/_shared/inventory-api.test.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.tsx`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(orders)/rocket-orders/lib/rocket-confirm-api.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx`
- Create: `/Users/yhc125/workspace/kiditem/docs/runbooks/sellpia-rocket-inventory-sync.md`

## Engineering Review Constraints

- Use `apiClient.uploadParsed` for Sellpia XLSX upload. `apiClient.post` stringifies JSON bodies and must not receive `FormData`.
- Add an Inventory Hub manual Rocket stock-event UI, not only the Rocket confirm commit button.
- UI actions must disable duplicate submits while a request is pending and show server errors.
- Receipt upload UI shows `template_pending` state only until the Sellpia upload template is configured.

### Task 1: Inventory API Helpers

**Files:**
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/_shared/inventory-api.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/_shared/inventory-api.test.ts`

- [ ] **Step 1: Write failing API helper tests**

Append tests to `inventory-api.test.ts`:

```ts
import { importSellpiaInventoryFile, approveSellpiaSnapshotItem, postRocketInventoryEvent } from './inventory-api';
import { apiClient } from '@/lib/api-client';
import { SellpiaSnapshotImportResponseSchema } from '@kiditem/shared/inventory';

describe('Sellpia and Rocket inventory API helpers', () => {
  it('uploads Sellpia XLSX through multipart import endpoint', async () => {
    const upload = vi.spyOn(apiClient, 'uploadParsed').mockResolvedValueOnce({ ok: true } as never);
    const file = new File(['xlsx'], 'exported-list.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await importSellpiaInventoryFile(file, '2026-06-29T00:00:00.000Z');

    expect(upload).toHaveBeenCalledWith(
      '/api/inventory/sellpia-sync/import',
      SellpiaSnapshotImportResponseSchema,
      expect.any(FormData),
    );
  });

  it('approves a Sellpia item with operator-confirmed target quantity', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(undefined as never);

    await approveSellpiaSnapshotItem('item-1', { targetCurrentStock: 12, reason: 'count checked' });

    expect(post).toHaveBeenCalledWith('/api/inventory/sellpia-sync/items/item-1/approve', {
      targetCurrentStock: 12,
      reason: 'count checked',
    });
  });

  it('posts Rocket manual inventory events to the inventory endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ledgerId: 'ledger-1', alreadyApplied: false } as never);

    await postRocketInventoryEvent({
      inventoryId: '00000000-0000-4000-8000-000000000001',
      optionId: '00000000-0000-4000-8000-000000000002',
      eventType: 'return_restock',
      quantity: 2,
      sourceActionId: 'return-1',
      sourceType: 'rocket_return',
      sourceRef: 'return-1',
    });

    expect(post).toHaveBeenCalledWith('/api/inventory/rocket/events', expect.objectContaining({
      eventType: 'return_restock',
      quantity: 2,
    }));
  });
});
```

- [ ] **Step 2: Run API helper tests and verify failure**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/_shared/inventory-api.test.ts"
```

Expected: FAIL with missing exported helper functions.

- [ ] **Step 3: Add API helper functions**

Append to `inventory-api.ts`:

```ts
import type {
  RocketInventoryEventInput,
  SellpiaApprovalInput,
  SellpiaSnapshotImportResponse,
} from '@kiditem/shared/inventory';
import { SellpiaSnapshotImportResponseSchema } from '@kiditem/shared/inventory';

export async function importSellpiaInventoryFile(
  file: File,
  effectiveExportedAt: string,
): Promise<SellpiaSnapshotImportResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('effectiveExportedAt', effectiveExportedAt);
  return apiClient.uploadParsed(
    '/api/inventory/sellpia-sync/import',
    SellpiaSnapshotImportResponseSchema,
    form,
  );
}

export async function approveSellpiaSnapshotItem(
  itemId: string,
  input: SellpiaApprovalInput,
): Promise<void> {
  await apiClient.post(`/api/inventory/sellpia-sync/items/${itemId}/approve`, input);
}

export async function postRocketInventoryEvent(
  input: RocketInventoryEventInput,
): Promise<{ ledgerId: string; alreadyApplied: boolean }> {
  return apiClient.post('/api/inventory/rocket/events', input);
}
```

- [ ] **Step 4: Run API helper tests**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/_shared/inventory-api.test.ts"
```

Expected: PASS.

- [ ] **Step 5: Commit API helpers**

```bash
git add "apps/web/src/app/(inventory)/_shared/inventory-api.ts" "apps/web/src/app/(inventory)/_shared/inventory-api.test.ts"
git commit -m "feat: add Sellpia Rocket inventory API helpers"
```

### Task 2: Sellpia Sync Inventory Hub Tab

**Files:**
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/page.tsx`

- [ ] **Step 1: Write failing component test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SellpiaSync from './SellpiaSync';

const importSellpiaInventoryFile = vi.hoisted(() => vi.fn(async () => ({
  snapshot: {
    id: '00000000-0000-4000-8000-000000000001',
    fileName: 'exported-list.xlsx',
    rowCount: 1,
    effectiveExportedAt: '2026-06-29T00:00:00.000Z',
    status: 'previewed',
  },
  summary: {
    matchedCount: 1,
    recommendedCount: 1,
    reviewCount: 0,
    rejectedCount: 0,
    newProductCandidateCount: 0,
  },
  items: [],
  newProductCandidates: [],
})));

vi.mock('../../_shared/inventory-api', () => ({
  importSellpiaInventoryFile,
}));

describe('SellpiaSync', () => {
  it('shows row-scoped import summary after upload', async () => {
    render(<SellpiaSync />);
    const input = screen.getByLabelText('Sellpia XLSX');
    await userEvent.upload(input, new File(['xlsx'], 'exported-list.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByText('1 rows')).toBeInTheDocument();
    expect(screen.getByText('신규 상품 후보 0')).toBeInTheDocument();
  });

  it('disables duplicate preview submit while upload is pending', async () => {
    const user = userEvent.setup();
    importSellpiaInventoryFile.mockReturnValueOnce(new Promise(() => undefined));
    render(<SellpiaSync />);

    await user.upload(screen.getByLabelText('Sellpia XLSX'), new File(['xlsx'], 'exported-list.xlsx'));
    await user.click(screen.getByRole('button', { name: '미리보기' }));

    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run component test and verify failure**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx"
```

Expected: FAIL because component file does not exist.

- [ ] **Step 3: Create the Sellpia sync component**

Create a client component with these controls and labels:

```tsx
'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { importSellpiaInventoryFile } from '../../_shared/inventory-api';
import type { SellpiaSnapshotImportResponse } from '@kiditem/shared/inventory';

export default function SellpiaSync() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SellpiaSnapshotImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const effectiveExportedAt = file ? new Date(file.lastModified).toISOString() : new Date().toISOString();

  async function preview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await importSellpiaInventoryFile(file, effectiveExportedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sellpia import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium" htmlFor="sellpia-xlsx">Sellpia XLSX</label>
        <input
          id="sellpia-xlsx"
          aria-label="Sellpia XLSX"
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={preview}
          disabled={!file || loading}
          className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm"
        >
          <Upload className="h-4 w-4" />
          미리보기
        </button>
      </div>

      {result ? (
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div>{result.snapshot.rowCount} rows</div>
          <div>추천 {result.summary.recommendedCount}</div>
          <div>검토 {result.summary.reviewCount}</div>
          <div>신규 상품 후보 {result.summary.newProductCandidateCount}</div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Add the Inventory Hub tab**

Modify `inventory-hub/page.tsx`:

```tsx
import { RefreshCw } from 'lucide-react';

const SellpiaSyncPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/SellpiaSync'), { ssr: false });
```

Add this tab entry after `입출고`:

```tsx
{ id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: <SellpiaSyncPage /> },
```

- [ ] **Step 5: Run web focused tests and build**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx" "src/app/(inventory)/_shared/inventory-api.test.ts"
npm run build --workspace=apps/web
```

Expected: tests pass and Next build completes.

- [ ] **Step 6: Commit Sellpia UI**

```bash
git add "apps/web/src/app/(inventory)/inventory-hub/page.tsx" "apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx" "apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx"
git commit -m "feat: add Sellpia inventory sync UI"
```

### Task 3: Rocket Manual Stock Event UI

**Files:**
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.tsx`
- Create: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/page.tsx`

- [ ] **Step 1: Write failing manual Rocket event UI tests**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RocketStockEvents from './RocketStockEvents';

const postRocketInventoryEvent = vi.fn(async () => ({ ledgerId: 'ledger-1', alreadyApplied: false }));

vi.mock('../../_shared/inventory-api', () => ({
  postRocketInventoryEvent: (...args: unknown[]) => postRocketInventoryEvent(...args),
}));

describe('RocketStockEvents', () => {
  it('submits a return/restock event with required source reference', async () => {
    render(<RocketStockEvents />);

    await userEvent.type(screen.getByLabelText('Inventory ID'), '00000000-0000-4000-8000-000000000001');
    await userEvent.type(screen.getByLabelText('Option ID'), '00000000-0000-4000-8000-000000000002');
    await userEvent.selectOptions(screen.getByLabelText('Event type'), 'return_restock');
    await userEvent.type(screen.getByLabelText('Quantity'), '2');
    await userEvent.type(screen.getByLabelText('Source reference'), 'return-1');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(postRocketInventoryEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'return_restock',
      quantity: 2,
      sourceRef: 'return-1',
    }));
    expect(await screen.findByText('ledger-1')).toBeInTheDocument();
  });

  it('requires override reason for issue over open reservation', async () => {
    render(<RocketStockEvents />);

    await userEvent.selectOptions(screen.getByLabelText('Event type'), 'issue');
    await userEvent.type(screen.getByLabelText('Quantity'), '5');
    await userEvent.type(screen.getByLabelText('Open reservation'), '3');
    await userEvent.click(screen.getByLabelText('Allow over-reservation'));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(await screen.findByText('초과 출고 사유를 입력하세요.')).toBeInTheDocument();
    expect(postRocketInventoryEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run component test and verify failure**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx"
```

Expected: FAIL because the component file does not exist.

- [ ] **Step 3: Create the Rocket stock event component**

Create a client component with:

- icon buttons or compact selects for event type: `release`, `issue`, `return_restock`;
- text inputs for `inventoryId`, `optionId`, `sourceRef`, and optional `note`;
- numeric inputs for `quantity` and `openReservationQty`;
- checkbox for `allowOverReservation`;
- required override-reason input when `eventType === 'issue'`, `allowOverReservation === true`, and `quantity > openReservationQty`;
- submit button labelled `적용`, disabled while pending;
- result display showing `ledgerId` and `alreadyApplied`;
- server error display.

The submitted `sourceActionId` must be deterministic:

```ts
const sourceActionId = `manual-rocket:${eventType}:${sourceRef}:${quantity}`;
```

- [ ] **Step 4: Add the Inventory Hub tab**

Add `RocketStockEvents` to `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/page.tsx` as `로켓 수동 처리`. Keep `Sellpia 동기화` and existing stock I/O tabs separate.

- [ ] **Step 5: Run focused web tests**

Run:

```bash
npm exec --workspace=apps/web vitest -- run "src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx" "src/app/(inventory)/_shared/inventory-api.test.ts"
```

Expected: PASS.

- [ ] **Step 6: Commit manual Rocket stock UI**

```bash
git add "apps/web/src/app/(inventory)/inventory-hub/page.tsx" "apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.tsx" "apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx"
git commit -m "feat: add Rocket manual stock event UI"
```

### Task 4: Rocket Commit UI

**Files:**
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(orders)/rocket-orders/lib/rocket-confirm-api.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx`

- [ ] **Step 1: Add Rocket commit API helper**

Append to `rocket-confirm-api.ts`:

```ts
export interface RocketConfirmCommitResult {
  reservedRows: number;
  alreadyReservedRows: number;
  skippedRows: number;
}

export async function commitRocketConfirmRows(
  rows: RocketComputedRow[],
): Promise<RocketConfirmCommitResult> {
  return apiClient.post<RocketConfirmCommitResult>('/api/orders/rocket/confirm-commit', { rows });
}
```

- [ ] **Step 2: Add commit action to the confirm panel**

In `RocketConfirmPanel.tsx`, import `commitRocketConfirmRows`. Add a button labelled `예약 확정` that is enabled only after preview rows exist. On success, show the returned reserved/already/skipped counts and disable repeated commit for the same preview result in local component state.

Use this state shape:

```tsx
const [commitResult, setCommitResult] = useState<RocketConfirmCommitResult | null>(null);
const [commitPending, setCommitPending] = useState(false);
```

Use this action body:

```tsx
async function handleCommitReservation() {
  if (!preview?.rows.length || commitPending || commitResult) return;
  setCommitPending(true);
  try {
    setCommitResult(await commitRocketConfirmRows(preview.rows));
  } finally {
    setCommitPending(false);
  }
}
```

- [ ] **Step 3: Run Rocket orders build**

Run:

```bash
npm run build --workspace=apps/web
```

Expected: build completes with the new Rocket commit helper and component imports resolved.

- [ ] **Step 4: Commit Rocket UI**

```bash
git add "apps/web/src/app/(orders)/rocket-orders/lib/rocket-confirm-api.ts" "apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx"
git commit -m "feat: add Rocket reservation commit UI"
```

### Task 5: Operator Runbook

**Files:**
- Create: `/Users/yhc125/workspace/kiditem/docs/runbooks/sellpia-rocket-inventory-sync.md`

- [ ] **Step 1: Create the runbook**

```md
# Sellpia + Rocket Inventory Sync Runbook

## Prerequisites

- Operator is signed into KidItem with the correct active organization.
- Sellpia stock export XLSX is available.
- Coupang Rocket PO rows are collected through the order-collector extension.
- Sellpia receipt upload template may be unconfigured; receipt batches remain `template_pending` until configured.

## Sellpia Import

1. Open `/inventory-hub`.
2. Select `Sellpia 동기화`.
3. Upload the Sellpia XLSX.
4. Confirm the effective export time.
5. Review recommended rows.
6. Enter or confirm final target quantity for selected rows.
7. Add a reason for large differences or edited targets.
8. Approve selected rows.

## New Product Candidates

Rows without a matching `ProductOption.legacyCode` appear as `신규 상품 후보`. Resolve each candidate by creating a new product, creating an option under an existing product, linking an existing option, or ignoring the row. Initial stock is recorded through `RECEIVE`.

## Rocket Confirmation

1. Open `/rocket-orders`.
2. Collect Rocket PO rows.
3. Run preview.
4. Edit confirm quantities if needed.
5. Generate the Coupang confirm workbook.
6. After the operator is ready to reserve stock, click `예약 확정`.

## Rocket Shipment And Return

Manual shipment issue decreases both `reservedStock` and `currentStock`. Manual Rocket return/restock increases `currentStock`. Issue over the open reservation requires admin/inventory-manager override with a reason.

## Verification

- Sellpia import preview does not create stock transactions.
- Approved Sellpia rows create `ADJUST` transactions.
- Rocket reservation changes `reservedStock` only.
- Rocket issue changes `reservedStock` and `currentStock`.
- Rocket return/restock changes `currentStock` only.
```

- [ ] **Step 2: Commit runbook**

```bash
git add docs/runbooks/sellpia-rocket-inventory-sync.md
git commit -m "docs: add Sellpia Rocket inventory runbook"
```

## Self-Review

- Spec coverage: Sellpia UI, Rocket commit UI, API helpers, and operator runbook are covered.
- Red-flag scan: no blocked planning phrases are intentionally present.
- Type consistency: API helper types match the shared contract names from the schema plan.
