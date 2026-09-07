# Inventory Hub UI Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/inventory-hub` the sole UI owner of read-only Sellpia inventory, with only `재고 현황` and `셀피아 재고` tabs, and remove the obsolete Sellpia sync, Rocket manual, and Product Hub options screens.

**Architecture:** Promote the shared product-reference formatter out of Product Hub, then move the complete read-only Sellpia SKU workspace and its local table/filter components into `inventory-hub/components`. Make the hub route render the moved workspace under `sellpia-inventory`; retire obsolete tab-only code and the former `/product-hub/options` route, while preserving harmless legacy `tab` values by normalizing them to `status`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, TanStack React Query, Vitest, Testing Library, Tailwind CSS, Lucide React.

## Global Constraints

- Frontend data remains behind NestJS `apiClient`; do not add direct database clients.
- Sellpia physical stock remains read-only in this UI and changes only through Sellpia import.
- `/stock-ops` continues to own only product-outflow and channel-zero analysis.
- `/rocket-orders` and purchase-order workflows are outside this change.
- Keep only one business domain: inventory UI ownership. Moving the cross-route product-reference formatter is the narrow shared-boundary exception required by the move.
- Use `Object.hasOwn` for raw legacy query-key lookup.
- Update all active scoped guides and `docs/ARCHITECTURE.md`; run `npm run check:agents-hygiene` after changing guides.
- Use TDD: each behavioral change starts with a new failing test and ends with the relevant passing test command.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/web/src/lib/operator-product-reference.ts` | Shared product display formatter used by catalog and inventory UI. |
| `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.tsx` | URL-controlled, read-only Sellpia SKU inventory workspace for the inventory hub. |
| `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx` | Workspace contract: table, API scope, filters, refresh, pagination, and tab-preserving URL state. |
| `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryFilters.tsx` | Sellpia SKU search and status filter controls. |
| `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryTable.tsx` | Read-only Sellpia SKU table and linked product/option destinations. |
| `apps/web/src/app/(inventory)/inventory-hub/page.tsx` | Two-tab inventory hub composition and safe legacy tab normalization. |
| `apps/web/src/app/(inventory)/inventory-hub/page.spec.tsx` | Hub tab composition and retired-tab behavior. |
| `apps/web/src/app/__tests__/retired-sidebar-routes.spec.ts` | Repository-wide assertion that `/product-hub/options` has no nav item or App Router page. |
| `apps/web/src/components/layout/sidebar-menu.ts` | Primary sidebar navigation without Product Hub Sellpia inventory item. |
| `apps/web/src/components/RebuildReadinessBanner.tsx` | Canonical readiness link to the inventory status tab. |
| `apps/web/src/app/(inventory)/stock-ops/page.tsx` | Canonical historical freshness target to inventory status. |
| `apps/web/src/app/(inventory)/AGENTS.md` | Exact inventory-hub tab and Sellpia SKU ownership contract. |
| `apps/web/src/app/(catalog)/AGENTS.md` | Catalog boundary that no longer owns the complete Sellpia SKU collection. |
| `apps/web/src/app/(catalog)/product-hub/AGENTS.md` | Product Hub route list without `/product-hub/options`. |
| `docs/ARCHITECTURE.md` | Active route map and exact inventory tab contract. |

## Task 1: Establish the moved Sellpia inventory workspace contract

**Files:**

- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryFilters.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryTable.tsx`
- Create: `apps/web/src/lib/operator-product-reference.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ProductInventoryMatchingTable.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/components/ProductOptionsWorkspace.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/components/ProductOptionsWorkspace.spec.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/components/SellpiaOptionFilters.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/components/SellpiaOptionTable.tsx`

**Interfaces:**

- Consumes: `InventorySkuSnapshotListResponseSchema`, `InventorySkuStockStatus`, `SellpiaInventorySkuActiveStatus`, `SellpiaInventorySkuLinkStatus`, `queryKeys.inventory.snapshot`, and `apiClient.getParsed`.
- Produces: `SellpiaInventoryWorkspace({ headingLevel?: 1 | 2 })`, which consumes URL keys `tab`, `search`, `page`, `stockStatus`, `activeStatus`, and `linkStatus`.
- Produces: `operatorProductReference(code: string, name: string): string` from `@/lib/operator-product-reference`.

- [ ] **Step 1: Write the failing workspace test at its new inventory-owned path**

  Copy the existing realistic `data` fixture and mocking setup from `ProductOptionsWorkspace.spec.tsx`, but import the new symbol and use the hub path:

  ```tsx
  import { SellpiaInventoryWorkspace } from './SellpiaInventoryWorkspace';

  vi.mock('next/navigation', () => ({
    usePathname: () => '/inventory-hub',
    useRouter: () => ({ push: pushMock }),
    useSearchParams: () => navigation.params,
  }));

  it('keeps Sellpia filters and tab selection in the inventory hub URL', () => {
    navigation.params = new URLSearchParams('tab=sellpia-inventory&campaign=summer');
    render(<SellpiaInventoryWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '미연결' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?tab=sellpia-inventory&campaign=summer&linkStatus=unlinked&page=1',
    );
  });
  ```

  Retain the existing assertions for the ten table columns, read-only status, exact inventory query, refresh button, connected product links, and pagination.

- [ ] **Step 2: Run the new test and verify it fails because the workspace does not exist**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx'
  ```

  Expected: FAIL with an unresolved `./SellpiaInventoryWorkspace` import.

- [ ] **Step 3: Move the workspace under inventory ownership with the existing read-only behavior**

  Move the complete current `ProductOptionsWorkspace.tsx` source to `SellpiaInventoryWorkspace.tsx`. Make only the ownership substitutions below; preserve its schema, `useSellpiaInventorySkuPageState` query, read-only policy, copy, and controls:

  ```tsx
  import SellpiaInventoryFilters from './SellpiaInventoryFilters';
  import SellpiaInventoryTable from './SellpiaInventoryTable';

  export const SELLPIA_PAGE_SIZE = 50;

  export function SellpiaInventoryWorkspace({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
    const state = useSellpiaInventorySkuPageState();
    const Heading = headingLevel === 1 ? 'h1' : 'h2';

    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600"><Layers size={20} className="text-white" /></div>
            <div><Heading className="text-2xl font-extrabold tracking-tight text-slate-900">셀피아 재고</Heading><p className="mt-0.5 text-xs text-slate-500">Sellpia 상품코드 단위 읽기 전용 재고와 확인된 상품·옵션 연결 상태</p></div>
          </div>
          <button type="button" onClick={() => void state.refetch()} disabled={state.isFetching} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={14} className={state.isFetching ? 'animate-spin' : ''} />새로고침</button>
        </header>
        <SellpiaInventoryFilters activeStatus={state.activeStatus} linkStatus={state.linkStatus} search={state.search} stockStatus={state.stockStatus} includeOutOfStock={state.stockStatus !== 'in_stock'} onActiveStatusChange={state.setActiveStatus} onLinkStatusChange={state.setLinkStatus} onSearchChange={state.setSearch} onSearchSubmit={state.handleSearch} onStockStatusChange={state.setStockStatus} onIncludeOutOfStockChange={(include) => state.setStockStatus(include ? 'all' : 'in_stock')} />
        {state.data ? <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="Sellpia 레시피 연결 현황"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700"><span className="font-semibold text-slate-900">현재 상태 범위 Sellpia SKU {state.data.summary.totalSkus}개</span><span>레시피 연결 {state.data.summary.linkedSkus}개</span><span>연결 필요 {state.data.summary.unlinkedSkus}개</span></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">읽기 전용</span></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>최근 성공 가져오기: {state.data.latestImport ? `${formatDateTime(state.data.latestImport.importedAt, { dateStyle: 'medium', timeStyle: 'short' })} · ${importStatusLabel(state.data.latestImport.status)}` : '없음'}</span><Link href="/product-hub/matching?level=options" className="font-medium text-purple-700 hover:text-purple-800 hover:underline">레시피 구성 안내</Link></div></section> : null}
        <div className="px-1 text-xs text-slate-500">{state.isLoading && !state.data ? '불러오는 중...' : `${state.data?.total ?? 0}개 Sellpia SKU`}</div>
        {state.isFetching && !state.isLoading ? <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><RefreshCw size={14} className="animate-spin text-purple-600" />Sellpia 재고를 최신 조건으로 갱신하는 중입니다.</div> : null}
        {state.errorMessage ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Sellpia 재고를 불러오지 못했어요. {state.errorMessage}</div> : <SellpiaInventoryTable items={state.data?.items ?? []} isLoading={state.isLoading && !state.data} />}
        {state.data ? <Pagination page={state.page} limit={SELLPIA_PAGE_SIZE} total={state.data.total} onPageChange={state.goToPage} /> : null}
      </div>
    );
  }
  ```

  Preserve the URL update function exactly so it starts with `new URLSearchParams(searchParams.toString())`; this preserves `tab=sellpia-inventory` while changing a filter. Copy the full former filter and table source to the two new inventory component files, renaming their React component identifiers only from `SellpiaOptionFilters`/`SellpiaOptionTable` to `SellpiaInventoryFilters`/`SellpiaInventoryTable`. In the table, import the promoted formatter:

  ```tsx
  import { operatorProductReference } from '@/lib/operator-product-reference';
  ```

  Promote the unchanged formatter:

  ```ts
  const CHANNEL_ORIGIN_INTERNAL_CODE = /^CP-(?:SKU-)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

  export function operatorProductReference(code: string, name: string): string {
    return CHANNEL_ORIGIN_INTERNAL_CODE.test(code.trim()) ? name : `${code} · ${name}`;
  }
  ```

  Update `ProductInventoryMatchingTable.tsx` to import the same formatter from `@/lib/operator-product-reference`, then delete the Product Hub-only workspace, test, and option table/filter sources listed above.

- [ ] **Step 4: Run the moved workspace test and matching route tests**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx' 'src/app/(catalog)/product-hub/matching'
  ```

  Expected: PASS; the workspace calls only `/api/inventory/sellpia-skus`, renders no stock mutation controls, and filter navigation retains `tab=sellpia-inventory`.

- [ ] **Step 5: Commit the isolated workspace ownership move**

  ```bash
  git add apps/web/src/lib/operator-product-reference.ts apps/web/src/app/'(inventory)'/inventory-hub/components apps/web/src/app/'(catalog)'/product-hub
  git commit -m "refactor: move Sellpia inventory workspace to inventory hub (KID-23)"
  ```

## Task 2: Recompose Inventory Hub as exactly two tabs

**Files:**

- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/ChannelAvailability.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/ImportFreshness.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/ImportFreshness.spec.tsx`

**Interfaces:**

- Consumes: `SellpiaInventoryWorkspace`, `InventoryWorkspace`, `StockTransfers`, `ReturnTransfers`, `useUrlControlledTab`.
- Produces: only `status` and `sellpia-inventory` tab IDs in `/inventory-hub`.
- Produces: `LEGACY_TAB_TARGETS: Readonly<Record<string, TabId>>`, where all removed tab IDs normalize to `status`.

- [ ] **Step 1: Replace the hub page regression test with the two-tab contract**

  Replace old sync/Rocket mocks with the new workspace mock:

  ```tsx
  vi.mock('./components/SellpiaInventoryWorkspace', () => ({
    SellpiaInventoryWorkspace: () => <div>sellpia inventory</div>,
  }));

  it('renders only 재고 현황 and 셀피아 재고 without a nested tab strip', () => {
    render(<InventoryHubPage />);

    expect(within(screen.getByTestId('tab-layout-tabs')).getAllByRole('tab')
      .map((tab) => tab.textContent)).toEqual(['재고 현황', '셀피아 재고']);
    expect(screen.getAllByTestId('tab-layout-tabs')).toHaveLength(1);
    expect(screen.queryByRole('tab', { name: 'Sellpia 동기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '로켓 수동 처리' })).not.toBeInTheDocument();
  });

  it('renders the inventory-owned Sellpia table tab', () => {
    navigation.params = new URLSearchParams('tab=sellpia-inventory');
    render(<InventoryHubPage />);

    expect(screen.getByText('sellpia inventory')).toBeInTheDocument();
    expect(selectedTabLabel()).toBe('셀피아 재고');
  });
  ```

  Change every removed-ID case (`sellpia-sync`, `rocket-events`, `overview`, `audits`, `freshness`, and `attention`) to expect `/inventory-hub?tab=status`.

- [ ] **Step 2: Run the hub test and verify it fails against the old three-tab implementation**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/page.spec.tsx'
  ```

  Expected: FAIL because the existing tab labels are `Sellpia 동기화` and `로켓 수동 처리` and no new workspace is rendered.

- [ ] **Step 3: Implement the two-tab composition and delete tab-only screens**

  Replace the route imports and tab definitions with:

  ```tsx
  import { Layers, Warehouse } from 'lucide-react';
  import { SellpiaInventoryWorkspace } from './components/SellpiaInventoryWorkspace';

  const TAB_IDS = ['status', 'sellpia-inventory'] as const;

  tabs={[
    { id: 'status', label: '재고 현황', icon: Warehouse, content: <StatusWorkspace /> },
    { id: 'sellpia-inventory', label: '셀피아 재고', icon: Layers, content: <SellpiaInventoryWorkspace /> },
  ]}
  ```

  Remove `ImportFreshness`, `RocketInventoryWorkspace`, `SellpiaSyncWorkspace`, `RefreshCw`, and `RotateCcw`. Preserve `StatusWorkspace` and `HubSection` unchanged. Set every old removed tab ID in `LEGACY_TAB_TARGETS` to `status`, and retain the `Object.hasOwn` guard. Delete the exact tab-only files listed above.

- [ ] **Step 4: Extend retirement assertions and verify the hub regression suite**

  In `retired-inventory-checks.spec.ts`, include the deleted tab-only files in `retiredFiles`; remove their source paths from `survivingConsumers`; assert that live inventory source does not include `SellpiaSyncWorkspace`, `RocketInventoryWorkspace`, `ImportFreshness`, or `ChannelAvailability`.

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub/page.spec.tsx' 'src/app/(inventory)/inventory-hub/retired-inventory-checks.spec.ts'
  ```

  Expected: PASS, with exactly two hub tabs and no tab-only source files remaining.

- [ ] **Step 5: Commit the hub composition and retired tab cleanup**

  ```bash
  git add apps/web/src/app/'(inventory)'/inventory-hub apps/web/src/app/'(inventory)'/stock-ops/components
  git commit -m "refactor: simplify inventory hub to status and Sellpia tabs (KID-23)"
  ```

## Task 3: Retire the former Product Hub URL and normalize active links

**Files:**

- Modify: `apps/web/src/app/__tests__/retired-sidebar-routes.spec.ts`
- Modify: `apps/web/src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts`
- Modify: `apps/web/src/components/layout/sidebar-menu.ts`
- Modify: `apps/web/src/components/RebuildReadinessBanner.tsx`
- Modify: `apps/web/src/components/__tests__/RebuildReadinessBanner.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/page.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/catalog-inventory-boundary.spec.ts`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/page.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/page.spec.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/AGENTS.md`
- Delete: `apps/web/src/app/(catalog)/product-hub/options/CLAUDE.md`

**Interfaces:**

- Consumes: `retiredSidebarRoutes`, sidebar `menuSections`, and the `MOVED_TABS` deep-link map.
- Produces: no sidebar link or App Router entrypoint for `/product-hub/options`; active freshness links land on `/inventory-hub?tab=status`.

- [ ] **Step 1: Make the route retirement test fail before deleting the route**

  Add the exact legacy public URL to the central list:

  ```ts
  const retiredSidebarRoutes = [
    '/outbound',
    '/unshipped-items',
    '/warehouses',
    '/order-hub',
    '/cs-management',
    '/order-status-hub',
    '/returns',
    '/return-scan',
    '/finance-hub',
    '/supplier-hub',
    '/suppliers',
    '/product-hub/options',
  ] as const;
  ```

  Change the sidebar expected `상품 관리` items to omit `['/product-hub/options', '셀피아 재고']`.

- [ ] **Step 2: Run the navigation/route tests and verify they fail**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/__tests__/retired-sidebar-routes.spec.ts' 'src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts'
  ```

  Expected: FAIL because the sidebar still contains `/product-hub/options` and the App Router scanner still finds its `page.tsx`.

- [ ] **Step 3: Remove the former route and canonicalize active links**

  Delete the six route-only files listed above. Remove the `셀피아 재고` menu item from `sidebar-menu.ts`. Update readiness and historical freshness navigation to the status tab:

  ```tsx
  href="/inventory-hub?tab=status"
  ```

  ```ts
  freshness: '/inventory-hub?tab=status',
  ```

  Update their exact test expectations. In `catalog-inventory-boundary.spec.ts`, remove the former options-page test and remove the `options` directory and `ProductOptionsWorkspace.tsx` exceptions from `productionSource`; the remaining catalog scan must continue to reject `/api/inventory/sellpia-skus`.

- [ ] **Step 4: Run all retirement and direct-link tests**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/__tests__/retired-sidebar-routes.spec.ts' 'src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' 'src/app/(inventory)/stock-ops/page.spec.tsx' 'src/app/(catalog)/product-hub/lib/catalog-inventory-boundary.spec.ts'
  ```

  Expected: PASS; `/product-hub/options` has neither sidebar navigation nor an App Router entrypoint, and freshness links use `status`.

- [ ] **Step 5: Commit route and navigation retirement**

  ```bash
  git add apps/web/src/app/__tests__/retired-sidebar-routes.spec.ts apps/web/src/components/layout apps/web/src/components/RebuildReadinessBanner.tsx apps/web/src/components/__tests__/RebuildReadinessBanner.spec.tsx apps/web/src/app/'(inventory)'/stock-ops apps/web/src/app/'(catalog)'/product-hub
  git commit -m "refactor: retire Product Hub Sellpia inventory route (KID-23)"
  ```

## Task 4: Update ownership documents and enforce their integrity

**Files:**

- Modify: `apps/web/src/app/(inventory)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: the implemented two-tab route and moved inventory workspace.
- Produces: durable frontend ownership documentation matching live routes and source locations.

- [ ] **Step 1: Record the new exact ownership contracts**

  Replace the inventory tab rule with:

  ```md
  - `/inventory-hub` has exactly `status` and `sellpia-inventory` tabs, without a nested tab strip. `sellpia-inventory` owns the complete read-only Sellpia SKU table, its URL-authoritative filters, and confirmed product/channel-option destination facts.
  ```

  In catalog guides, remove every claim that `/product-hub/options` reads or owns the complete Sellpia collection. Preserve Product Hub’s product detail and matching ownership. In `docs/ARCHITECTURE.md`, remove the dedicated `/product-hub/options` route from the catalog route map and describe it as the inventory hub’s `sellpia-inventory` tab. Replace both the stale four-tab inventory statement and the later claim that Product Hub owns “read-only options” with the exact two-tab contract.

- [ ] **Step 2: Check the edited guide chain and architecture text before running hygiene**

  Run:

  ```bash
  rg -n -S "product-hub/options|sellpia-sync|rocket-events" apps/web/src/app/'(inventory)'/AGENTS.md apps/web/src/app/'(catalog)'/AGENTS.md apps/web/src/app/'(catalog)'/product-hub/AGENTS.md docs/ARCHITECTURE.md
  ```

  Expected: no stale ownership statement remains; references to Sellpia sync API infrastructure outside route documentation are not part of this command’s target files.

- [ ] **Step 3: Run AGENTS hygiene and the inventory-focused test suite**

  Run:

  ```bash
  npm run check:agents-hygiene
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/inventory-hub' 'src/app/(inventory)/stock-ops/page.spec.tsx' 'src/app/__tests__/retired-sidebar-routes.spec.ts'
  ```

  Expected: PASS with no stale route/tab contract in guides and no failing inventory regression tests.

- [ ] **Step 4: Commit documentation ownership changes**

  ```bash
  git add apps/web/src/app/'(inventory)'/AGENTS.md apps/web/src/app/'(catalog)'/AGENTS.md apps/web/src/app/'(catalog)'/product-hub/AGENTS.md docs/ARCHITECTURE.md
  git commit -m "docs: align inventory UI ownership contracts (KID-23)"
  ```

## Task 5: Run final verification and perform browser QA

**Files:**

- Modify only if verification exposes a defect in the files named in Tasks 1–4.

**Interfaces:**

- Consumes: completed route, UI, test, and documentation changes.
- Produces: fresh evidence for the final handoff.

- [ ] **Step 1: Run static stale-reference checks**

  Run:

  ```bash
  rg -n -S "ProductOptionsWorkspace|SellpiaOptionFilters|SellpiaOptionTable|RocketInventoryWorkspace|ChannelAvailability|ImportFreshness|/product-hub/options|tab=sellpia-sync|tab=rocket-events" apps/web/src --glob '*.{ts,tsx}' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx'
  ```

  Expected: no production route/UI references to retired workspace, tab, or Product Hub URL. The known shared Sellpia sync API files may retain `sellpia-sync` in endpoint paths and are inspected separately rather than deleted.

- [ ] **Step 2: Run the full relevant frontend test suite**

  Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(catalog)/product-hub' 'src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts' 'src/components/__tests__/RebuildReadinessBanner.spec.tsx' 'src/app/__tests__/retired-sidebar-routes.spec.ts'
  ```

  Expected: PASS with zero test failures.

- [ ] **Step 3: Run required frontend build**

  Run:

  ```bash
  npm run build --workspace=apps/web
  ```

  Expected: exit code 0.

- [ ] **Step 4: Verify the running UI in the browser**

  At `http://localhost:3000/inventory-hub`, confirm:

  1. The page title is `재고 관리`.
  2. The tab strip contains only `재고 현황` and `셀피아 재고`.
  3. `재고 현황` continues to show the current-stock workspace and its existing sync action.
  4. Selecting `셀피아 재고` shows the read-only Sellpia SKU table and preserves `tab=sellpia-inventory` while changing a filter.
  5. The Product Management sidebar section has no `셀피아 재고` link.
  6. Direct navigation to `/product-hub/options` does not expose the former Sellpia inventory screen or a compatibility redirect. The generic `/product-hub/[id]` missing-product response is not a dedicated options route.

- [ ] **Step 5: Inspect the final diff and commit any verification-only fixes**

  Run:

  ```bash
  git diff develop...HEAD --check
  git status --short
  ```

  Expected: no whitespace errors and no uncommitted files after any correction commit.
