# Inventory Hub Single Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overlapping `재고 현황` and `셀피아 재고` tabs with one URL-authoritative Sellpia inventory workspace that owns actions, summaries, filters, one operator-safe table, and the existing transfer/return sections.

**Architecture:** `/inventory-hub` becomes a tabless composition around one shared `InventoryWorkspace`; `/inventory` continues to reuse that workspace without the transfer/return sections. A focused workspace-state hook maps URL parameters to the existing Inventory API and export helpers, while presentational toolbar, summary, filters, and table components remain separately testable.

**Tech Stack:** Next.js App Router, React 19, TypeScript, TanStack React Query, Vitest, Testing Library, Zod-backed NestJS API contracts, Tailwind CSS.

## Global Constraints

- Sellpia remains the authoritative physical-stock source; the UI never mutates current stock.
- Frontend data access remains through the NestJS Inventory API via `apiClient` wrappers.
- `/inventory` remains an independent route composition and reuses `InventoryWorkspace`.
- `sellpiaInventorySkuId` remains an internal relation/key and must not render in operator UI.
- `INV-SELLPIA-*` and UUID-based `CP-*` product codes remain hidden by `operator-product-reference`.
- Search, stock, active, link, and page state are URL-authoritative; removing `tab` must preserve all other query parameters.
- Barcode and Excel exports use the full current search, stock, active, and link filter range.
- Cross-domain edits are limited to canonical `/inventory-hub` navigation links and their tests.
- Use `rtk` for every shell command and `apply_patch` for every source-file edit.

---

## File Map

- `apps/web/src/app/(inventory)/inventory-hub/page.tsx`: tabless hub composition and legacy `tab` removal.
- `apps/web/src/app/(inventory)/inventory-hub/hooks/useInventoryWorkspaceState.ts`: URL parsing, query params, pagination, and filter transitions.
- `apps/web/src/app/(inventory)/inventory-hub/components/InventoryWorkspace.tsx`: actions, export behavior, server-state orchestration, and presentation composition.
- `apps/web/src/app/(inventory)/inventory/components/InventoryToolbar.tsx`: title, sync/export actions, and latest-import copy only.
- `apps/web/src/app/(inventory)/inventory/components/InventoryFilters.tsx`: search plus stock, active, and link status controls.
- `apps/web/src/app/(inventory)/inventory/components/InventoryTable.tsx`: one operator-safe Sellpia table with connection targets and pagination.
- `apps/web/src/app/(inventory)/_shared/inventory-api.ts`: typed active/link filters for list and full-range export requests.
- `apps/web/src/app/(inventory)/inventory/lib/inventory-export.ts`: filter-object export boundary.
- `apps/web/src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts`: deletion and canonical-link regression guard.
- `apps/server/src/automation/domain/policy/action-seeds.ts`: canonical inventory action destination only.
- Inventory, analytics, readiness, architecture, runbook, and dev-data docs/tests: remove active `tab` URL ownership.

### Task 1: Make `/inventory-hub` a tabless canonical composition

**Files:**
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`

**Interfaces:**
- Consumes: `InventoryWorkspace`, `StockTransfers`, `ReturnTransfers`, `useRouter`, and `useSearchParams`.
- Produces: one `InventoryHubPage` that strips every `tab` value and preserves all other query parameters.

- [ ] **Step 1: Replace the two-tab assertions with failing single-workspace tests**

```tsx
it('renders one inventory workspace with transfer and return sections and no tabs', () => {
  render(<InventoryHubPage />);

  expect(screen.getByText('inventory')).toBeInTheDocument();
  expect(screen.getByText('transfers')).toBeInTheDocument();
  expect(screen.getByText('returns')).toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByText('sellpia inventory')).not.toBeInTheDocument();
});

it.each(['status', 'sellpia-inventory', 'sellpia-sync', 'constructor', 'unknown'])(
  'removes ?tab=%s while preserving inventory filters',
  (tab) => {
    navigation.params = new URLSearchParams(
      `tab=${tab}&search=SP-1001&linkStatus=unlinked&page=2`,
    );
    render(<InventoryHubPage />);

    expect(replaceMock).toHaveBeenCalledWith(
      '/inventory-hub?search=SP-1001&linkStatus=unlinked&page=2',
    );
  },
);
```

- [ ] **Step 2: Run the route test and confirm it fails against `TabLayout`**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/page.spec.tsx'`

Expected: FAIL because the page still renders two tabs and preserves or rewrites `tab`.

- [ ] **Step 3: Replace `TabLayout` and tab selection with canonical query cleanup**

```tsx
function InventoryHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasTab = searchParams.has('tab');
  const canonicalParams = new URLSearchParams(searchParams.toString());
  canonicalParams.delete('tab');
  const query = canonicalParams.toString();
  const canonicalHref = query ? `/inventory-hub?${query}` : '/inventory-hub';

  useEffect(() => {
    if (hasTab) router.replace(canonicalHref);
  }, [canonicalHref, hasTab, router]);

  if (hasTab) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-10">
      <InventoryWorkspace />
      <HubSection><StockTransfers /></HubSection>
      <HubSection><ReturnTransfers /></HubSection>
    </div>
  );
}
```

Remove `TabLayout`, `useUrlControlledTab`, tab IDs, icons used only by tabs, the `SellpiaInventoryWorkspace` import, and the old `LEGACY_TAB_TARGETS` map.

- [ ] **Step 4: Run the route test and confirm it passes**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/page.spec.tsx'`

Expected: PASS with one workspace and canonical URL replacement.

### Task 2: Unify URL state, Inventory API params, and export scope

**Files:**
- Create: `apps/web/src/app/(inventory)/inventory-hub/hooks/useInventoryWorkspaceState.ts`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryWorkspace.tsx`
- Modify: `apps/web/src/app/(inventory)/_shared/inventory-api.ts`
- Modify: `apps/web/src/app/(inventory)/_shared/inventory-api.test.ts`
- Modify: `apps/web/src/app/(inventory)/inventory/lib/inventory-export.ts`
- Modify: `apps/web/src/app/(inventory)/inventory/lib/inventory-export.spec.ts`

**Interfaces:**
- Consumes: `useInventoryList(params)`, `SellpiaInventorySkuListParams`, `fetchAllSellpiaInventorySkus(params)`, and Next navigation hooks.
- Produces: `useInventoryWorkspaceState()` with `search`, `stockStatus`, `activeStatus`, `linkStatus`, `page`, data/query states, and URL-updating setters; `fetchAllInventoryForExport(params)` accepts the same non-paging filters as the visible list.

- [ ] **Step 1: Add failing API and export filter tests**

```ts
await listSellpiaInventorySkus({
  page: 2,
  limit: 50,
  query: 'SP 10',
  stockStatus: 'out_of_stock',
  activeStatus: 'inactive',
  linkStatus: 'unlinked',
});

expect(getParsed.mock.calls[0]?.[0]).toBe(
  '/api/inventory/sellpia-skus?page=2&limit=50&query=SP+10&stockStatus=out_of_stock&activeStatus=inactive&linkStatus=unlinked',
);
```

```ts
await fetchAllInventoryForExport({
  query: 'SP-1001',
  stockStatus: 'all',
  activeStatus: 'inactive',
  linkStatus: 'unlinked',
});

expect(fetchAllSellpiaInventorySkus).toHaveBeenCalledWith({
  query: 'SP-1001',
  stockStatus: 'all',
  activeStatus: 'inactive',
  linkStatus: 'unlinked',
});
```

- [ ] **Step 2: Run API and export tests and confirm the type/behavior failures**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/_shared/inventory-api.test.ts' 'src/app/(inventory)/inventory/lib/inventory-export.spec.ts'`

Expected: FAIL because active/link filters and the filter-object export signature are not implemented.

- [ ] **Step 3: Extend the shared frontend request type and export boundary**

```ts
export interface SellpiaInventorySkuListParams {
  page?: number;
  limit?: number;
  query?: string;
  stockStatus?: InventorySkuStockStatus;
  activeStatus?: SellpiaInventorySkuActiveStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
}

export async function fetchAllInventoryForExport(
  params: Omit<SellpiaInventorySkuListParams, 'page' | 'limit'>,
): Promise<InventorySkuSnapshotItem[]> {
  return fetchAllSellpiaInventorySkus(params);
}
```

Import `SellpiaInventorySkuActiveStatus` and `SellpiaInventorySkuLinkStatus` from `@kiditem/shared/inventory`. Do not change the NestJS DTO or shared schema because those filters already exist server-side.

- [ ] **Step 4: Add failing workspace URL-state tests**

```tsx
navigation.params = new URLSearchParams(
  'search=SP-1001&stockStatus=all&activeStatus=inactive&linkStatus=unlinked&page=2',
);
render(<InventoryWorkspace />);

expect(vi.mocked(useQuery).mock.calls[0]?.[0].queryKey).toEqual([
  'inventory',
  'sellpia-skus',
  {
    page: '2',
    limit: '50',
    stockStatus: 'all',
    activeStatus: 'inactive',
    query: 'SP-1001',
    linkStatus: 'unlinked',
  },
]);

fireEvent.click(screen.getByRole('button', { name: '연결됨' }));
expect(pushMock).toHaveBeenCalledWith(
  '/inventory-hub?search=SP-1001&stockStatus=all&activeStatus=inactive&linkStatus=linked&page=1',
);
```

- [ ] **Step 5: Run the workspace test and confirm it fails with local component state**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/components/InventoryWorkspace.spec.tsx'`

Expected: FAIL because `InventoryWorkspace` does not read active/link/page/search state from the URL.

- [ ] **Step 6: Implement the focused URL-state hook**

```ts
export function useInventoryWorkspaceState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const page = positivePage(searchParams.get('page'));
  const stockStatus = parseValue(
    searchParams.get('stockStatus'),
    ['all', 'in_stock', 'out_of_stock'] as const,
    'in_stock',
  );
  const activeStatus = parseValue(
    searchParams.get('activeStatus'),
    ['all', 'active', 'inactive'] as const,
    'all',
  );
  const linkStatus = parseValue(
    searchParams.get('linkStatus'),
    ['all', 'linked', 'unlinked'] as const,
    'all',
  );

  const params = {
    page,
    limit: 50,
    query: urlSearch.trim() || undefined,
    stockStatus,
    activeStatus,
    linkStatus: linkStatus === 'all' ? undefined : linkStatus,
  } satisfies SellpiaInventorySkuListParams;
  const query = useInventoryList(params);

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tab');
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return {
    ...query,
    activeStatus,
    linkStatus,
    page,
    search,
    setSearch,
    stockStatus,
    requestParams: params,
    submitSearch: () => updateParams({ search: search.trim() || undefined, page: '1' }),
    setActiveStatus: (value: SellpiaInventorySkuActiveStatus) =>
      updateParams({ activeStatus: value === 'all' ? undefined : value, page: '1' }),
    setLinkStatus: (value: LinkStatusFilter) =>
      updateParams({ linkStatus: value === 'all' ? undefined : value, page: '1' }),
    setStockStatus: (value: InventorySkuStockStatus) =>
      updateParams({ stockStatus: value === 'in_stock' ? undefined : value, page: '1' }),
    setPage: (value: number) => updateParams({ page: String(Math.max(1, value)) }),
  };
}
```

Add `useEffect(() => setSearch(urlSearch), [urlSearch])`, stable `useCallback`/`useMemo` boundaries, `positivePage`, and generic `parseValue` so render behavior remains deterministic.

- [ ] **Step 7: Wire `InventoryWorkspace` to one state and one export filter object**

```ts
const state = useInventoryWorkspaceState();
const exportParams = {
  query: state.requestParams.query,
  stockStatus: state.stockStatus,
  activeStatus: state.activeStatus,
  linkStatus: state.linkStatus === 'all' ? undefined : state.linkStatus,
};
const exportItems = () => fetchAllInventoryForExport(exportParams);
```

Render stale data with an inline error when available, keep `PageSkeleton` for first load, and use the same state setters for filters and pagination.

- [ ] **Step 8: Run API, export, and workspace tests**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/_shared/inventory-api.test.ts' 'src/app/(inventory)/inventory/lib/inventory-export.spec.ts' 'src/app/(inventory)/inventory-hub/components/InventoryWorkspace.spec.tsx'`

Expected: PASS.

### Task 3: Merge filters and connection details into one operator-safe table

**Files:**
- Create: `apps/web/src/app/(inventory)/inventory/components/InventoryFilters.tsx`
- Create: `apps/web/src/app/(inventory)/inventory/components/InventoryFilters.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryToolbar.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryToolbar.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryTable.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventoryTable.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory/components/InventorySummaryCards.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory/components/InventoryFilterTabs.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryFilters.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryTable.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts`

**Interfaces:**
- Consumes: `InventorySkuSnapshotItem`, `operatorProductReference`, URL-state setters, and `Pagination`.
- Produces: `InventoryFilters` with one control per filter dimension and `InventoryTable` with product/option, Sellpia identifiers, prices, stock, active state, connection targets, and last import—never the internal SKU ID.

- [ ] **Step 1: Write failing filter and unified-table assertions**

```tsx
expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
  '상품명',
  '옵션',
  'Sellpia 코드',
  '바코드',
  '매입가',
  '판매가',
  '현재고',
  '상태',
  '연결 대상',
  '최종 가져오기',
]);
expect(screen.queryByRole('columnheader', { name: 'Sellpia SKU ID' })).not.toBeInTheDocument();
expect(screen.queryByText(item.sellpiaInventorySkuId)).not.toBeInTheDocument();
expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
expect(screen.getByRole('link', { name: '키즈 반팔 티셔츠' })).toHaveAttribute(
  'href',
  '/product-hub/10000000-0000-4000-8000-000000000001',
);
```

```tsx
expect(screen.getByRole('searchbox', { name: 'Sellpia 재고 검색' })).toBeInTheDocument();
expect(screen.getByRole('group', { name: '재고 상태' })).toBeInTheDocument();
expect(screen.getByRole('group', { name: '활성 상태' })).toBeInTheDocument();
expect(screen.getByRole('group', { name: '연결 상태' })).toBeInTheDocument();
expect(screen.queryByRole('checkbox', { name: '품절상품 포함' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run component tests and confirm missing connection/filter behavior**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory/components/InventoryTable.spec.tsx' 'src/app/(inventory)/inventory/components/InventoryFilters.spec.tsx' 'src/app/(inventory)/inventory/components/InventoryToolbar.spec.tsx'`

Expected: FAIL because the basic table has no active/connection columns and the unified filters do not exist.

- [ ] **Step 3: Implement `InventoryFilters` with one non-duplicated stock control**

```tsx
export function InventoryFilters(props: InventoryFiltersProps) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <form role="search" onSubmit={props.onSearchSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          type="search"
          aria-label="Sellpia 재고 검색"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Sellpia 코드 · 상품명 · 옵션명 · 바코드 검색"
          className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] pl-9 pr-3 text-sm"
        />
      </form>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FilterGroup label="재고 상태" options={STOCK_FILTERS} selected={props.stockStatus} onChange={props.onStockStatusChange} />
        <FilterGroup label="활성 상태" options={ACTIVE_FILTERS} selected={props.activeStatus} onChange={props.onActiveStatusChange} />
        <FilterGroup label="연결 상태" options={LINK_FILTERS} selected={props.linkStatus} onChange={props.onLinkStatusChange} />
      </div>
    </div>
  );
}
```

Use typed `FilterGroup<T extends string>`, `aria-pressed`, semantic theme tokens, and no separate out-of-stock checkbox.

- [ ] **Step 4: Simplify the toolbar and implement the unified table**

Change the toolbar heading to `재고 관리`; retain only Sellpia sync, barcode, Excel, read-only source copy, and latest import. Move search and stock controls entirely into `InventoryFilters`.

In `InventoryTable`, keep `sellpiaInventorySkuId` only as the row key. Add active-state badges, linked product and channel-option links from the retired rich table, and last-import formatting from the basic table. Render linked products with:

```tsx
<Link href={`/product-hub/${product.id}`}>
  {operatorProductReference(product.code, product.name)}
</Link>
```

Render `미연결` for an unlinked row, retain read-only behavior, and keep pagination in the table container.

- [ ] **Step 5: Delete duplicate components and strengthen the retirement guard**

Add the retired Sellpia workspace/filter/table and `InventoryFilterTabs.tsx` to `retiredFiles`; remove them from `survivingConsumers`. The guard must also assert that the surviving page imports only `InventoryWorkspace` for the Sellpia list.

- [ ] **Step 6: Run all component and retirement tests**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory/components' 'src/app/(inventory)/inventory-hub/components/InventoryWorkspace.spec.tsx' 'src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts'`

Expected: PASS with one filter set, one table, and all duplicate files absent.

### Task 4: Canonicalize live links and durable ownership docs

**Files:**
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.spec.tsx`
- Modify: `apps/web/src/components/RebuildReadinessBanner.tsx`
- Modify: `apps/web/src/components/__tests__/RebuildReadinessBanner.spec.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx`
- Modify: `apps/server/src/automation/domain/policy/action-seeds.ts`
- Modify: `apps/server/src/automation/domain/policy/__tests__/action-seeds.spec.ts`
- Modify: `apps/server/src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts`
- Modify: `apps/web/src/app/(inventory)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEV_DATA_BUNDLES.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/runbooks/sellpia-inventory-freshness.md`
- Modify: `docs/runbooks/sellpia-rocket-inventory-sync.md`

**Interfaces:**
- Consumes: canonical `/inventory-hub` route and the unchanged inventory refresh behavior.
- Produces: no active code or current ownership documentation that publishes `?tab=status` or `?tab=sellpia-inventory`.

- [ ] **Step 1: Change tests first to require the canonical href**

```ts
expect(screen.getByRole('link', { name: '셀피아 재고 가져오기' }))
  .toHaveAttribute('href', '/inventory-hub');

expect(screen.getByRole('link')).toHaveAttribute('href', '/inventory-hub');

expect(action.href).toBe('/inventory-hub');
```

Update stock-ops moved-tab expectations to `/inventory-hub`. Change the retirement scanner to reject both active tab URLs in all live link consumers.

- [ ] **Step 2: Run link and action-seed tests and confirm failures**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/page.spec.tsx' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx'`

Run: `rtk npm exec vitest -- run apps/server/src/automation/domain/policy/__tests__/action-seeds.spec.ts apps/server/src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts`

Expected: FAIL because live consumers still publish `?tab=status`.

- [ ] **Step 3: Replace live destinations with `/inventory-hub`**

Change only href/destination literals in stock-ops aliases, readiness, dashboard inventory cards/alerts, and automation action seeds. Do not change alert selection, action priority, or any non-inventory destination.

- [ ] **Step 4: Update route ownership and operator documentation**

Document these exact contracts:

```md
- `/inventory-hub` is a tabless Sellpia inventory workspace that composes the
  authoritative SKU list with transfer and return records.
- `/inventory` reuses the same inventory list workspace without redirecting.
- Search, stock, active, link, and page filters are URL-authoritative.
```

Replace current smoke/runbook URLs with `/inventory-hub`, remove exact two-tab ownership language, and retain the read-only Sellpia/source-of-truth rules.

- [ ] **Step 5: Run link tests and instruction hygiene**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/page.spec.tsx' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx' 'src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts'`

Run: `rtk npm exec vitest -- run apps/server/src/automation/domain/policy/__tests__/action-seeds.spec.ts apps/server/src/automation/application/service/__tests__/action-board-inventory-signals.spec.ts`

Run: `rtk npm run check:agents-hygiene`

Expected: all tests and instruction hygiene PASS.

### Task 5: Full verification, browser QA, and implementation commit

**Files:**
- Verify all files modified in Tasks 1–4.

**Interfaces:**
- Consumes: the complete single-workspace implementation.
- Produces: fresh test/build/runtime/browser evidence and a focused KID-23 implementation commit.

- [ ] **Step 1: Run the scoped regression suite**

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(catalog)/product-hub' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardSidePanel.spec.tsx' src/lib/operator-product-reference.spec.ts`

Expected: all selected files PASS.

- [ ] **Step 2: Run repository contracts and frontend build**

Run: `rtk npm run check:agents-hygiene`

Run: `rtk npm run build --workspace=apps/web`

Expected: both commands exit 0.

- [ ] **Step 3: Boot the NestJS server because the automation seed changed**

Run: `rtk npm run dev:server`

Expected: NestJS reports a successful application boot without dependency or route errors; then stop the local process cleanly.

- [ ] **Step 4: Run browser QA at the canonical route**

Verify `/inventory-hub` has no tabs, shows one `재고 관리` heading, one filter set, one table without `Sellpia SKU ID`, and still shows transfer/return sections. Change a link filter and confirm the URL updates; open a linked product and use `이전 화면` to confirm the exact filtered URL returns. Open legacy `?tab=sellpia-inventory&linkStatus=unlinked&page=2` and confirm it becomes `/inventory-hub?linkStatus=unlinked&page=2`.

- [ ] **Step 5: Review the final diff and commit**

Run: `rtk git diff --check`

Run: `rtk git status --short`

Confirm no unrelated changes, no active `inventory-hub?tab=` literals outside historical specs, and no duplicate Sellpia workspace components.

Commit:

```bash
rtk git add apps/web apps/server/src/automation docs/ARCHITECTURE.md docs/DEV_DATA_BUNDLES.md docs/runbooks
rtk git commit -m "refactor: unify inventory hub workspace (KID-23)"
```

Expected: commit succeeds and the worktree is clean.
