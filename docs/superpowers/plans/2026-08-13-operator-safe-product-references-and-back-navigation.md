# Operator-Safe Product References and Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide system-generated product codes throughout operator-facing product and inventory UI while preserving useful references, and make product detail return to the actual previous screen.

**Architecture:** Keep backend identifiers and API schemas unchanged. Extend the existing shared frontend product-reference utility with one deterministic internal-code classifier, then consume it at each operator display boundary. The product detail page owns browser-history fallback behavior and passes an explicit `onBack` callback to its presentation-only header.

**Tech Stack:** Next.js App Router, React 19, TypeScript, TanStack React Query, Vitest, Testing Library, Tailwind CSS, Lucide React.

## Global Constraints

- Frontend data remains behind NestJS `apiClient`; do not add database access or API schema changes.
- Treat all `INV-SELLPIA-*` values as system-owned codes; hide them from operator presentation but retain them in state and API responses.
- Treat only UUID-shaped `CP-<UUID>` and `CP-SKU-<UUID>` values as channel-origin internal codes; retain non-internal product codes and channel public references.
- Never let the product editor submit a replacement code for a product with a system-owned internal code.
- Preserve Sellpia SKU, barcode, option code, and channel external product number visibility and search behavior.
- Use browser history first for detail return; when `window.history.length <= 1`, use `router.replace('/product-hub')`.
- This change shares a display-policy helper between catalog and inventory UI but does not alter product, inventory, or matching backend ownership.
- Use TDD: each behavioral change starts with a failing test and ends with the relevant passing test command.
- The current worktree already contains the approved KID-23 inventory-hub consolidation implementation; do not discard or overwrite those changes while staging the final KID-23 commit.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/web/src/lib/operator-product-reference.ts` | Classifies internal product-code namespaces and formats a linked product for an operator. |
| `apps/web/src/lib/operator-product-reference.spec.ts` | Regression contract for internal versus operator-visible codes. |
| `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx` | Suppresses an internal product-code secondary label in catalog rows. |
| `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductHeader.tsx` | Renders a reference only when appropriate and delegates return navigation through `onBack`. |
| `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx` | Omits the product-code information row for an internal code. |
| `apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.tsx` | Omits the code editor and excludes a system-owned code from update payloads. |
| `apps/web/src/app/(catalog)/product-hub/[id]/page.tsx` | Chooses history back or direct-entry fallback and supplies it to the header. |
| Existing component and page specs under the same directories | Prove visible-code preservation, internal-code suppression, payload safety, and back behavior. |
| `apps/web/src/app/(catalog)/product-hub/matching/components/ProductInventoryMatchingTable.tsx` | Continues formatting linked products through the shared policy. |
| `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryTable.tsx` | Continues formatting linked products through the shared policy. |

### Task 1: Define one internal product-code display policy

**Files:**

- Create: `apps/web/src/lib/operator-product-reference.spec.ts`
- Modify: `apps/web/src/lib/operator-product-reference.ts`

**Interfaces:**

- Produces: `isInternalProductCode(code: string): boolean`
- Produces: `operatorProductReference(code: string, name: string): string`
- Consumes: no route state, API client, or React runtime.

- [ ] **Step 1: Write the failing utility regression test**

```ts
import { describe, expect, it } from 'vitest';
import {
  isInternalProductCode,
  operatorProductReference,
} from './operator-product-reference';

describe('operator product references', () => {
  it('hides system-owned Sellpia and UUID channel codes but preserves operator codes', () => {
    expect(isInternalProductCode(' INV-SELLPIA-fcb317e3-b99d-4759-b153-10c20841ef6e ')).toBe(true);
    expect(isInternalProductCode('CP-11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isInternalProductCode('CP-SKU-11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isInternalProductCode('KI-001')).toBe(false);
    expect(isInternalProductCode('CP-333')).toBe(false);
    expect(operatorProductReference('INV-SELLPIA-100', '재고 상품')).toBe('재고 상품');
    expect(operatorProductReference('KI-001', '운영 상품')).toBe('KI-001 · 운영 상품');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the new API is absent**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/operator-product-reference.spec.ts
```

Expected: FAIL because `isInternalProductCode` is not exported and the current formatter exposes `INV-SELLPIA-100`.

- [ ] **Step 3: Implement the policy with strict channel matching and reserved Sellpia namespace**

```ts
const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const CHANNEL_ORIGIN_INTERNAL_CODE = new RegExp(`^CP-(?:SKU-)?${UUID}$`, 'iu');
const SELLPIA_ORIGIN_INTERNAL_CODE = /^INV-SELLPIA-/iu;

export function isInternalProductCode(code: string): boolean {
  const normalized = code.trim();
  return SELLPIA_ORIGIN_INTERNAL_CODE.test(normalized)
    || CHANNEL_ORIGIN_INTERNAL_CODE.test(normalized);
}

export function operatorProductReference(code: string, name: string): string {
  return isInternalProductCode(code) ? name : `${code} · ${name}`;
}
```

- [ ] **Step 4: Run the focused utility regression**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/operator-product-reference.spec.ts
```

Expected: PASS; generated namespaces return only the product name and `KI-001` remains visible.

### Task 2: Apply the policy to catalog list, detail, and editor surfaces

**Files:**

- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductHeader.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductHeader.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx`

**Interfaces:**

- Consumes: `isInternalProductCode(code: string): boolean`.
- Produces: `ProductHeader({ product, onEdit, onBack })`, where `onBack: () => void` is owned by the route page.
- Produces: update payloads that omit `code` when editing a system-owned internal product.

- [ ] **Step 1: Write failing presentation and payload tests**

Add a `ProductRowCard` test using a `displayReference` with
`{ type: 'product_code', label: '상품 코드', value: 'INV-SELLPIA-100' }`; assert the row still
shows the product name and brand but has no `INV-SELLPIA-100` text. Add a header test that passes the
same reference and asserts it is absent, plus a normal `MASTER-1` product-code test that remains visible.

Create `ProductInfoCards.spec.tsx` with the smallest complete detail fixture and assert both the
`상품 코드` term and `INV-SELLPIA-100` value are absent for an internal product, while `카테고리` and
`브랜드` remain visible.

Add this editor regression:

```tsx
it('preserves a system-owned Sellpia code without exposing or submitting it', async () => {
  vi.mocked(apiClient.patch).mockResolvedValue({ id: 'product-1' });
  renderDialog({
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
    product: {
      ...internalProduct(),
      code: 'INV-SELLPIA-100',
      displayReference: { type: 'product_code', label: '상품 코드', value: 'INV-SELLPIA-100' },
    },
  });

  expect(screen.queryByLabelText('상품 코드')).not.toBeInTheDocument();
  expect(screen.queryByText(/INV-SELLPIA-100/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '이름 변경' } });
  fireEvent.click(screen.getByRole('button', { name: '변경 저장' }));

  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(
    '/api/products/masters/11111111-1111-4111-8111-111111111111',
    expect.not.objectContaining({ code: expect.anything() }),
  ));
});
```

- [ ] **Step 2: Run the catalog component tests and verify they fail**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductHeader.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx'
```

Expected: FAIL because the components render the `product_code` reference unconditionally and updates include `code`.

- [ ] **Step 3: Render only non-internal product-code references**

In each display component, calculate the same condition rather than duplicating a new regex:

```ts
const hasVisibleDisplayReference = product.displayReference.type !== 'product_code'
  || !isInternalProductCode(product.displayReference.value);
```

In `ProductHeader`, render the badge only when `hasVisibleDisplayReference`. In `ProductInfoCards`,
render the `InfoRow` only when it is true. In `ProductRowCard`, build the secondary line from the
visible reference and brand:

```tsx
const secondaryLabel = hasVisibleDisplayReference
  ? `${product.displayReference.label} ${product.displayReference.value} · ${product.brand ?? '브랜드 미등록'}`
  : product.brand ?? null;

{secondaryLabel ? <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{secondaryLabel}</p> : null}
```

In `ProductEditorDialog`, use `isInternalProductCode(product.code)` for a `preserveInternalCode`
boolean. Keep the existing read-only channel-product display for `channel_product`; for an internal
`product_code`, render neither the field nor the internal value. Split the old payload helper so the
editor builds editable fields without code and adds `code: form.code.trim()` only for product creation
or a non-internal existing product:

```ts
const editableFields = toEditableProductFields(form);
if (product) {
  return apiClient.patch<{ id: string }>(
    `/api/products/masters/${product.id}`,
    (preserveInternalCode ? editableFields : { code: form.code.trim(), ...editableFields })
      satisfies UpdateMasterProductInput,
  );
}
return apiClient.post<{ id: string }>('/api/products/masters', {
  code: form.code.trim(),
  ...editableFields,
});
```

- [ ] **Step 4: Run the focused catalog component regression suite**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductHeader.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx'
```

Expected: PASS; ordinary product codes and channel product numbers remain visible, while generated codes are not rendered or sent in updates.

### Task 3: Apply the shared policy to matching and inventory links, then restore actual prior navigation

**Files:**

- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ProductInventoryMatchingTable.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductHeader.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductHeader.spec.tsx`

**Interfaces:**

- Consumes: `operatorProductReference(code, name)` in matching and Sellpia inventory tables.
- Produces: route callback `returnToPreviousScreen(): void`, which invokes `router.back()` or `router.replace('/product-hub')`.

- [ ] **Step 1: Extend existing linked-product tests for the reserved Sellpia namespace**

Keep the existing linked product fixtures but add assertions after render:

```tsx
expect(screen.getByText('동물 친구들 블록')).toBeInTheDocument();
expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
```

For the inventory workspace fixture, set its linked product code to `INV-SELLPIA-100` and assert the
link name remains `키즈 반팔 티셔츠` while the internal code is absent. This proves both consumers use
the shared formatter rather than separate local string rules.

In the detail page test's `ProductHeader` mock, expose `props.onBack` through an accessible button:

```tsx
default: (props: { onBack: () => void }) => (
  <button type="button" onClick={props.onBack}>이전 화면</button>
),
```

Add one test with `window.history.length` set above one that clicks the button and expects
`navigation.back` to be called, and a second with length one that expects
`navigation.replace('/product-hub')`. Restore the original `history.length` descriptor in `afterEach`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/ProductInventoryMatchingTable.spec.tsx' 'src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx' 'src/app/(catalog)/product-hub/[id]/page.spec.tsx'
```

Expected: FAIL because `INV-SELLPIA-*` is still emitted by the formatter and the header route callback does not yet exist.

- [ ] **Step 3: Pass an explicit route-owned back callback to the header**

Replace the hard-coded `next/link` return in `ProductHeader` with:

```tsx
<button
  type="button"
  onClick={onBack}
  aria-label="이전 화면으로 돌아가기"
  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
>
  <ArrowLeft size={16} /> 이전 화면
</button>
```

Add the required `onBack` property to the header props. In the detail page, define and pass:

```ts
const returnToPreviousScreen = () => {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.replace('/product-hub');
};

<ProductHeader
  product={product}
  onEdit={() => setEditorOpen(true)}
  onBack={returnToPreviousScreen}
/>
```

Do not add `returnTo` query parameters or change any detail link; browser history preserves source-page
URL state automatically.

- [ ] **Step 4: Run matching, inventory, detail, and header tests**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/matching/components/__tests__/ProductInventoryMatchingTable.spec.tsx' 'src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx' 'src/app/(catalog)/product-hub/[id]/page.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductHeader.spec.tsx'
```

Expected: PASS; the common policy suppresses code in both link surfaces and the detail button chooses the correct history behavior.

### Task 4: Run integrated verification, browser QA, and commit the complete KID-23 change

**Files:**

- Modify only if the following verification reveals a defect in a file named in Tasks 1–3 or the approved inventory-hub consolidation plan.

**Interfaces:**

- Consumes: complete KID-23 inventory UI consolidation plus safe product-reference and detail-back behavior.
- Produces: verification evidence and one scoped KID-23 implementation commit without unrelated files.

- [ ] **Step 1: Search for active operator presentation of system namespace**

Run:

```bash
rtk rg -n -S 'displayReference\\.(label|value)|product\\.code|linkedProduct\\.code|INV-SELLPIA-' apps/web/src --glob '*.{ts,tsx}' --glob '!**/*.spec.*'
```

Expected: every active product-code presentation either uses the shared utility or explicitly gates
`product_code` through `isInternalProductCode`; server-side generation and Sellpia SKU source columns
are out of scope.

- [ ] **Step 2: Run all affected web tests and guide hygiene**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(catalog)/product-hub' 'src/app/__tests__/retired-sidebar-routes.spec.ts' 'src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' src/lib/operator-product-reference.spec.ts
rtk npm run check:agents-hygiene
```

Expected: PASS. The Vite native-config loader warning may appear but must not accompany a failed test.

- [ ] **Step 3: Build the frontend**

Run:

```bash
rtk npm run build --workspace=apps/web
```

Expected: exit code 0.

- [ ] **Step 4: Perform browser QA against the local application**

Verify these exact flows:

1. `/inventory-hub` shows only `재고 현황` and `셀피아 재고`; the second tab carries filters in the URL and has no separate sidebar entry.
2. Open a linked product from `셀피아 재고`; its detail does not render `INV-SELLPIA-*` in the header, metadata card, or editor, and clicking `이전 화면` restores the filtered `셀피아 재고` URL.
3. Open a normal product code and a channel-origin product; their operator code/channel product number remains visible.
4. Directly open `/product-hub/<id>` in a new history entry; `이전 화면` navigates to `/product-hub` rather than trapping the user on the detail page.

- [ ] **Step 5: Review the scoped diff and commit only KID-23 work**

Run:

```bash
rtk git diff --check
rtk git status --short
rtk git diff --stat develop...HEAD
```

Stage the implementation files, approved documentation, tests, and intended deletions only after checking
that no unrelated user-owned changes are included. Then run:

```bash
rtk git commit -m "refactor: consolidate inventory UI and hide internal product codes (KID-23)"
```

Expected: one commit containing the intended KID-23 implementation and no unrelated files.
