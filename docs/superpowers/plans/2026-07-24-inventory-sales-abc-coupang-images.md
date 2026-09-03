# Inventory Sales ABC and Coupang Destination Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan.

**Goal:** 재고 관리에서 계산하는 Sellpia 판매 소진 기반 ABC 등급을 상품 관리와 대시보드가 동일한 값으로 표시·필터·집계하게 만들고, 재고 관리의 운영상품 목적지마다 매칭된 쿠팡 원본 이미지를 표시한다.

**Architecture:** Analytics가 현재의 이상치 제거 및 ABC 계산을 유일한 등급 원천으로 유지하고, 기존 MasterProduct별 depletion projection에 전체 원천 등급과 대표 등급을 함께 싣는다. Products와 Dashboard는 이 projection을 조회할 뿐 등급을 다시 계산하지 않는다. AI는 전달받은 확정 ChannelListing 후보에서 활성 쿠팡 provider asset을 배치 조회하는 읽기 포트를 제공하고, Sellpia 재고 projection은 SKU의 각 운영상품 목적지에 이미지를 붙인다. 어떤 파생 값도 MasterProduct.abcGrade, MasterProduct.imageUrls, SellpiaInventorySku에 저장하지 않는다.

**Tech Stack:** TypeScript, NestJS, Prisma 7/PostgreSQL, Zod, Next.js/React Query, Vitest, Testing Library.

## Global Constraints

- 구현은 최신 origin/develop에서 새 feature 브랜치를 만들어 시작한다. 현재 작업 브랜치의 커밋을 rebase하거나 버리지 않는다.
- ABC 계산식은 SellpiaProductSalesService.getSummary()의 기본 13개월 창, 완결 월 처리, 이상치 제거, assignAbcGrades()를 그대로 사용한다.
- MasterProduct.abcGrade는 광고·운영용 수동 등급이다. 판매 기반 등급으로 덮어쓰거나 의미를 바꾸지 않는다.
- 파생 필드 이름은 salesAbcGrade와 salesAbcGrades로 고정한다. abcGrade라는 이름으로 수동 등급과 섞지 않는다.
- 하나의 MasterProduct에 여러 판매 행 또는 SKU가 연결되면 salesAbcGrades는 A, B, C 순으로 중복 없이 모두 보존하고, 대표 salesAbcGrade는 첫 값, 즉 A > B > C 우선순위로 정한다.
- 판매 데이터 미수집, SKU 미매칭, 운영상품 미연결은 null과 빈 배열이다. C로 보정하지 않는다. 정상 수집된 판매 행의 판매량이 0이라서 assignAbcGrades()가 C를 준 경우만 C다.
- 재고 화면 abcCounts는 판매 행 개수이고, 상품 관리·대시보드 gradeCount는 중복 제거된 활성 MasterProduct 개수다. 서로 같다고 가정하지 않는다.
- 상품 관리의 salesAbcGrade 필터는 projection hydration 뒤, pagination 전에 적용한다.
- 대시보드 비율 분모는 A+B+C로 분류된 상품 수다. 채널 연결 상품 수를 분모로 사용하지 않는다.
- 대시보드 GradeHistory는 수동 운영 등급 이력이다. 판매 기반 등급 변화처럼 표시하거나 집계하지 않는다.
- 이미지 범위는 이번 요청대로 재고 관리의 운영상품 목적지다. Product Hub의 기존 수동 imageUrls와 Dashboard 상품 이미지는 변경하지 않는다.
- 쿠팡 이미지는 ContentAsset에서 읽기만 한다. MasterProduct.imageUrls, SellpiaInventorySku 또는 새 Prisma 컬럼으로 복사하지 않는다.
- 재고 목적지 이미지는 각 destination에 보존한다. 공유 SKU의 여러 운영상품 중 하나를 행 대표 이미지로 임의 선택하지 않는다.
- 쿠팡 원본의 의미는 sourceType=coupang_catalog인 활성 provider asset이다. 운영자가 고른 생성 이미지일 수 있는 currentThumbnailSelection은 이 화면의 원본 이미지 후보로 쓰지 않는다.
- 모든 Prisma read는 organizationId를 최상위와 관계 필터에 명시한다. 다른 조직의 workspace, group, asset, listing, option은 결과에 포함하지 않는다.
- 외부 이미지 URL 로딩 실패는 웹 placeholder로 처리한다. 이미지 enrichment 실패가 재고·판매 핵심 표 전체를 깨뜨리지 않도록 서버에서 경고 로그 후 이미지 없음으로 축소한다.
- Prisma schema, 데이터 migration, backfill, VERSION 변경은 없다.
- 500줄이 넘는 ProductOutflow와 800줄이 넘는 dashboard/page.tsx에는 새 렌더링 로직을 직접 키우지 않고 작은 컴포넌트로 추출한다.
- TDD 순서는 failing test 확인, 최소 구현, focused pass, slice commit이다. 행동 계약을 설명하는 테스트는 유지한다.
- 새로운 경로를 편집하기 전에 root부터 해당 경로까지 적용되는 AGENTS.md를 다시 확인한다.

## Accepted Data Flow

~~~text
Sellpia monthly sales
  -> anomaly-cleaned row totals
  -> row-level ABC
  -> exact product code / exact option code / unique barcode SKU match
  -> ProductVariantComponent destinations
  -> MasterProduct sales projection
       salesAbcGrades = unique sorted [A, B, C]
       salesAbcGrade  = first grade or null
  -> Product Hub list/detail/filter/summary
  -> Dashboard cards/top-products/warnings

Matched ProductVariant destination
  -> active matched Coupang ChannelListingOption
  -> listing ContentWorkspace
  -> active coupang_catalog option image, else active primary image
  -> destination.displayImage
  -> stock-ops ProductOutflow destination row
~~~

---

### Task 0: Start from a clean develop-based feature branch

**Files:** No source files.

**Step 1: Verify the current checkout without modifying it**

~~~bash
rtk git status --short --branch
rtk git fetch origin develop
rtk git rev-parse origin/develop
~~~

Expected: the worktree is clean. If it is not clean, stop and preserve the user-owned changes in a separate worktree before continuing.

**Step 2: Create the implementation branch**

~~~bash
rtk git switch -c feat/inventory-sales-abc-images origin/develop
~~~

Expected: HEAD is based directly on the refreshed origin/develop. Do not merge or rebase unrelated branch work into this feature.

---

### Task 1: Make the MasterProduct sales-grade projection a shared contract

**Files:**

- Modify: packages/shared/src/schemas/product-operations.ts
- Modify: packages/shared/src/schemas/product-operations.spec.ts
- Modify: packages/shared/src/schemas/dashboard.ts
- Modify: packages/shared/src/schemas/dashboard.spec.ts
- Modify: packages/shared/src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.spec.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts

**Step 1: Write failing shared-contract tests**

Add contract cases that require the following shapes while proving mutation schemas still expose only the manual abcGrade field:

~~~ts
export const ProductSalesAbcGradeSchema = z.enum(['A', 'B', 'C']);

export const ProductDepletionProjectionSchema = z.object({
  coverage: z.enum(['ready', 'shared', 'no_direct_sales']),
  needsReorder: z.boolean(),
  reorderSkuCount: z.number().int().nonnegative(),
  minMonthsOfAvailableStockLeft: z.number().nonnegative().nullable(),
  salesAbcGrade: ProductSalesAbcGradeSchema.nullable(),
  salesAbcGrades: z.array(ProductSalesAbcGradeSchema).max(3),
}).strict();
~~~

The product operations list query accepts only the explicit derived filter:

~~~ts
export const MasterProductOperationsListQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().trim().min(1).max(200).optional(),
  periodDays: ProductOperationsPeriodDaysSchema.default(30),
  category: z.string().trim().min(1).max(100).optional(),
  activeStatus: ProductOperationsActiveStatusSchema.default('all'),
  inventoryStatus: ProductInventoryStatusSchema.optional(),
  salesAbcGrade: ProductSalesAbcGradeSchema.optional(),
  adStatus: ProductOperationsAdStatusSchema.default('all'),
}).strict();
~~~

Require ProductOperationsListSummary.salesAbcGradeCounts and MasterProductOperationsDetail.depletion. Remove the ambiguous list-query abcGrade field, but keep MasterProductOperationsMetadata.abcGrade and create/update abcGrade unchanged for manual operations.

For dashboard contracts, require:

~~~ts
export const TopProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  organization: z.string(),
  salesAbcGrade: SellpiaProductAbcGradeSchema.nullable(),
  salesAbcGrades: z.array(SellpiaProductAbcGradeSchema).max(3),
  revenue: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
});

export const DashboardInventorySummarySchema = z.object({
  totalProducts: z.number().int().nonnegative(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  channelLinkedProducts: z.number().int().nonnegative(),
  channelUnlinkedProducts: z.number().int().nonnegative(),
  gradeCount: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
  }).strict(),
  mappingStatusCounts: z.object({
    matched: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
  }),
  alerts: z.array(DashboardAlertItemSchema),
  warnings: WarningsSchema,
  gradeChanges: GradeChangesSchema.optional(),
  dataFreshness: DataFreshnessSchema.optional(),
});
~~~

Add a read-only destination image contract:

~~~ts
export const SellpiaProductDestinationDisplayImageSchema = z.object({
  url: z.string().url(),
  source: z.literal('coupang_catalog'),
  channelListingId: z.string().uuid(),
  externalOptionId: z.string().min(1).nullable(),
}).strict();

export const SellpiaProductDestinationSchema = z.object({
  masterProductId: z.string().uuid(),
  masterProductCode: z.string().min(1),
  masterProductName: z.string().min(1),
  productVariantId: z.string().uuid(),
  productVariantCode: z.string().min(1),
  productVariantName: z.string().min(1),
  unitsPerVariant: z.number().int().positive(),
  displayImage: SellpiaProductDestinationDisplayImageSchema.nullable(),
}).strict();
~~~

Run:

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts
~~~

Expected: FAIL because the new fields and renamed query/summary fields do not exist.

**Step 2: Write failing projection tests**

In sellpia-product-depletion-projection.spec.ts cover all of these cases:

- The same matched Sellpia SKU appears in an A row and a C row: one reorder SKU, salesAbcGrades equals [A, C], representative is A.
- A shared SKU points to two MasterProducts: both receive the same complete grade evidence and coverage shared.
- One MasterProduct receives multiple SKUs: it appears once and gets the union of grades.
- not_collected, mapping_required, and matched-with-no-destination rows do not manufacture C.
- Requested products with no direct matched sales return no_direct_sales, null, and an empty grade array.

The source-row contract becomes:

~~~ts
type DepletionSourceRow = Readonly<{
  abcGrade: SellpiaProductAbcGrade;
  needsReorder: boolean;
  monthsOfAvailableStockLeft: number | null;
  inventoryResolution:
    | Readonly<{ status: 'not_collected' | 'mapping_required' }>
    | Readonly<{
      status: 'matched';
      sellpiaInventorySkuId: string;
      destinations: ReadonlyArray<{ masterProductId: string }>;
    }>;
}>;
~~~

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.spec.ts
~~~

Expected: FAIL because the current projection drops abcGrade.

**Step 3: Implement grade union and representative selection**

Use one canonical ordering helper in sellpia-product-depletion-projection.ts:

~~~ts
const SALES_ABC_ORDER = ['A', 'B', 'C'] as const;

function sortedGrades(
  grades: Iterable<SellpiaProductAbcGrade>,
): SellpiaProductAbcGrade[] {
  const present = new Set(grades);
  return SALES_ABC_ORDER.filter((grade) => present.has(grade));
}
~~~

Each per-SKU accumulator must union row grades while preserving the existing SKU deduplication for reorder count and minimum months. The final projection is:

~~~ts
const salesAbcGrades = sortedGrades(
  skus.flatMap((sku) => [...sku.salesAbcGrades]),
);

return {
  coverage: skus.some(({ shared }) => shared) ? 'shared' : 'ready',
  needsReorder: skus.some(({ needsReorder }) => needsReorder),
  reorderSkuCount: skus.filter(({ needsReorder }) => needsReorder).length,
  minMonthsOfAvailableStockLeft: skus.reduce<number | null>(
    (minimum, sku) => minNullable(minimum, sku.minMonths),
    null,
  ),
  salesAbcGrade: salesAbcGrades[0] ?? null,
  salesAbcGrades,
};
~~~

Update every noDirectSales fixture/helper to return:

~~~ts
{
  coverage: 'no_direct_sales',
  needsReorder: false,
  reorderSkuCount: 0,
  minMonthsOfAvailableStockLeft: null,
  salesAbcGrade: null,
  salesAbcGrades: [],
}
~~~

SellpiaProductSalesService.findByMasterProductIds() continues to call getSummary() exactly once and passes summary.products to this builder. Do not add a second ABC algorithm or a stored grade.

**Step 4: Run the focused grade contract**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts
rtk npm run build --workspace=packages/shared
~~~

Expected: all tests pass and the shared package builds.

**Step 5: Commit the canonical projection**

~~~bash
rtk git add packages/shared/src/schemas apps/server/src/analytics/sellpia-product-sales
rtk git commit -m "feat: expose Sellpia sales grades in product projections"
~~~

---

### Task 2: Add an AI-owned batch reader for strict Coupang provider images

**Files:**

- Create: apps/server/src/ai/application/port/in/workspace/catalog-display-media.port.ts
- Modify: apps/server/src/ai/application/port/in/workspace/index.ts
- Create: apps/server/src/ai/application/port/out/repository/catalog-display-media.repository.port.ts
- Modify: apps/server/src/ai/application/port/out/repository/index.ts
- Create: apps/server/src/ai/application/service/catalog-display-media.service.ts
- Create: apps/server/src/ai/application/service/catalog-display-media.service.spec.ts
- Create: apps/server/src/ai/adapter/out/repository/catalog-display-media.repository.adapter.ts
- Create: apps/server/src/ai/__tests__/catalog-display-media.pg.integration.spec.ts
- Modify: apps/server/src/ai/ai.module.ts
- Modify: apps/server/src/ai/__tests__/ai.module.wiring.spec.ts

**Step 1: Define the incoming and repository contracts in failing tests**

The incoming capability accepts only listing identities already selected by the consumer. It never guesses a product or SKU:

~~~ts
export const CATALOG_DISPLAY_MEDIA_PORT = Symbol('CATALOG_DISPLAY_MEDIA_PORT');

export type CatalogDisplayMediaTarget = Readonly<{
  channelListingId: string;
  externalOptionId: string | null;
}>;

export type CatalogDisplayMediaRequest = Readonly<{
  key: string;
  candidates: CatalogDisplayMediaTarget[];
}>;

export type CatalogDisplayMedia = Readonly<{
  url: string;
  source: 'coupang_catalog';
  channelListingId: string;
  externalOptionId: string | null;
}>;

export interface CatalogDisplayMediaPort {
  findCoupangDisplayMedia(input: {
    organizationId: string;
    requests: CatalogDisplayMediaRequest[];
  }): Promise<Map<string, CatalogDisplayMedia>>;
}
~~~

The outgoing repository returns only active provider candidates:

~~~ts
export const CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT = Symbol(
  'CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT',
);

export type CatalogDisplayMediaCandidate = Readonly<{
  id: string;
  channelListingId: string;
  url: string;
  role: 'primary' | 'option';
  sortOrder: number;
  externalOptionId: string | null;
}>;

export interface CatalogDisplayMediaRepositoryPort {
  findCoupangCandidates(input: {
    organizationId: string;
    channelListingIds: string[];
  }): Promise<CatalogDisplayMediaCandidate[]>;
}
~~~

In the service spec require:

- exact option image before listing primary;
- primary fallback when the exact option image is absent;
- when the first ordered listing has no usable asset, the first usable asset from the next ordered listing wins;
- no arbitrary different-option fallback;
- ties resolved by sortOrder ASC, url ASC, id ASC;
- duplicate request keys are rejected and repeated listing IDs are batched;
- requests with no usable candidate are omitted from the result map.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/catalog-display-media.service.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
~~~

Expected: FAIL because the capability does not exist.

**Step 2: Implement deterministic selection**

The resolver is pure and does not inspect currentThumbnailSelection:

~~~ts
function pickRequestMedia(
  request: CatalogDisplayMediaRequest,
  candidates: CatalogDisplayMediaCandidate[],
): Readonly<{
  target: CatalogDisplayMediaTarget;
  asset: CatalogDisplayMediaCandidate;
}> | undefined {
  for (const target of request.candidates) {
    const ordered = candidates
      .filter(
        (candidate) =>
          candidate.channelListingId === target.channelListingId,
      )
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder
          || left.url.localeCompare(right.url)
          || left.id.localeCompare(right.id),
      );
    const asset = ordered.find(
      (candidate) =>
        candidate.role === 'option'
        && target.externalOptionId !== null
        && candidate.externalOptionId === target.externalOptionId,
    ) ?? ordered.find((candidate) => candidate.role === 'primary');
    if (asset) return { target, asset };
  }
  return undefined;
}
~~~

Return source=coupang_catalog and the winning target listing/option provenance. If the same request key is passed twice, reject it with an explicit error instead of silently choosing one.

**Step 3: Implement the tenant-scoped repository**

Query active listing-owned workspaces in one batch:

~~~ts
await prisma.contentWorkspace.findMany({
  where: {
    organizationId,
    ownerType: 'channel_listing',
    status: 'active',
    isDeleted: false,
    channelListingId: { in: channelListingIds },
    channelListing: {
      is: {
        organizationId,
        isActive: true,
        channelAccount: {
          is: { organizationId, channel: 'coupang', status: 'active' },
        },
      },
    },
  },
  select: {
    channelListingId: true,
    contentGenerationGroups: {
      where: { organizationId, groupType: 'workspace_assets' },
      select: {
        originatingAssets: {
          where: {
            organizationId,
            assetType: 'image',
            role: { in: ['primary', 'option'] },
            isDeleted: false,
          },
          select: {
            id: true,
            url: true,
            role: true,
            sortOrder: true,
            metadata: true,
          },
        },
      },
    },
  },
});
~~~

After the Prisma read, keep only metadata objects where sourceType is coupang_catalog and active is not false. Parse externalOptionId from metadata as a non-empty string or null. Do not treat currentThumbnailSelection as provider proof.

The PostgreSQL integration test must create:

- two organizations with look-alike listing/workspace/asset data;
- an exact option asset, a primary asset, a deleted asset, and metadata.active=false;
- a custom/generated current selection that must not win;
- a non-Coupang listing that must not leak.

Assert only the requested organization's active Coupang candidates are returned.

**Step 4: Wire and export the incoming port**

Bind the repository adapter with useExisting, bind CATALOG_DISPLAY_MEDIA_PORT to CatalogDisplayMediaService, and export only the incoming port from AiModule. Consumers must not import the adapter or repository token.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/catalog-display-media.service.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts
rtk npm exec --workspace=apps/server vitest -- run --config vitest.config.integration.ts src/ai/__tests__/catalog-display-media.pg.integration.spec.ts
~~~

Expected: unit, wiring, and real-PostgreSQL tenant tests pass.

**Step 5: Commit the reusable image reader**

~~~bash
rtk git add apps/server/src/ai
rtk git commit -m "feat: add Coupang catalog display media reader"
~~~

---

### Task 3: Attach exact Coupang images to Sellpia inventory destinations

**Files:**

- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.module.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts
- Modify: apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
- Create: apps/web/src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.tsx
- Create: apps/web/src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx
- Modify: apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.tsx
- Modify: apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx

**Step 1: Write failing destination-image tests**

Extend the projection and PG integration suites to prove:

- one matched SKU with two destinations keeps two different destination images;
- each image follows the exact ProductVariant -> active ChannelListingOption association;
- inactive option, inactive listing, inactive account, non-Coupang listing, foreign organization, and listing linked to a different MasterProduct are excluded;
- the origin ChannelListing is the first candidate when it is a valid option target;
- otherwise candidate order is active primary Coupang account first, followed by listing externalId ASC, listing id ASC, and option externalOptionId ASC;
- an active origin listing with no usable asset falls through to a later primary-account listing that has an exact option or primary image;
- no image candidate produces displayImage: null without changing inventory metrics;
- an image-port exception logs a warning and returns the core inventory projection with null images.

The destination projection row includes the selected media target temporarily and emits only the public displayImage:

~~~ts
export type SellpiaProductDestinationRow = SellpiaProductDestination & {
  sellpiaInventorySkuId: string;
};
~~~

Write a ProductOutflowDestinations component test for:

- image, product name, and variant name displayed together per destination;
- two destinations never collapse to one image;
- at most two destinations rendered, preserving the existing 외 N개 behavior;
- img onError replaces the broken image with the existing package placeholder;
- no destination and no image states remain accessible text.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx' 'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx'
~~~

Expected: FAIL because destinations do not carry displayImage and the extracted component does not exist.

**Step 2: Select a deterministic listing target in the inventory reader**

Extend the existing ProductVariantComponent read rather than adding a per-row query. Select MasterProduct.originChannelListingId and active channelListingOptions with their listing/account identity. Keep explicit organization filters at every hop.

Use a pure selector with this ordering:

~~~ts
function compareOptionTargets(
  left: DestinationOptionTarget,
  right: DestinationOptionTarget,
): number {
  return Number(right.isOrigin) - Number(left.isOrigin)
    || Number(right.isPrimaryAccount) - Number(left.isPrimaryAccount)
    || left.listingExternalId.localeCompare(right.listingExternalId)
    || left.channelListingId.localeCompare(right.channelListingId)
    || left.externalOptionId.localeCompare(right.externalOptionId);
}
~~~

A candidate is valid only when:

- option.organizationId, listing.organizationId, account.organizationId equal the request organization;
- option.isActive and listing.isActive;
- account.channel is coupang and account.status is active;
- listing.masterProductId equals the destination MasterProduct;
- option.productVariantId equals the destination ProductVariant.

Pass one request per destination to CATALOG_DISPLAY_MEDIA_PORT, using productVariantId as the stable result key and the full ordered option-target array as candidates. The AI port batch-loads assets for the union of listing IDs and returns the first usable image in candidate order. If duplicate recipe rows can produce the same variant, deduplicate them before the media call.

**Step 3: Attach images without changing matching or stock math**

Import AiModule into SellpiaProductSalesModule and inject CATALOG_DISPLAY_MEDIA_PORT into SellpiaProductInventoryReader. The reader flow becomes:

1. Read destination rows and their candidate listing options in the existing batched ProductVariantComponent query.
2. Apply compareOptionTargets(), retain the full ordered candidate list, and deduplicate one media request per ProductVariant.
3. Call findCoupangDisplayMedia() once. Wrap only this optional enrichment call in try/catch, log organizationId plus target count, and use an empty map on failure.
4. Map every destination exactly as today, adding displayImage: mediaByVariantId.get(productVariant.id) ?? null.
5. Pass the enriched destinations to projectSellpiaProductInventory().

Do not change resolveSellpiaProductInventoryRows(), aggregateCompleteQuantities(), reorder calculations, dead-stock calculations, or destination sorting.

**Step 4: Render destination images in an extracted component**

ProductOutflowDestinations receives only the destination array:

~~~tsx
export type ProductOutflowDestinationsProps = {
  destinations: SellpiaProductDestination[];
};
~~~

The complete component renders destinations.slice(0, 2), placing that destination's displayImage beside its own link. It keeps the full destination list in the title, shows 외 N개, and owns local image-error state keyed by productVariantId. Use a 36–40px square thumbnail so the table remains dense. The image alt text should identify the MasterProduct and variant. Keep the link target /product-hub/{masterProductId}. ProductOutflow.tsx replaces only the existing inline destination cell with this component.

Because the extracted component owns image-error state, begin ProductOutflowDestinations.tsx with the use client directive.

Also broaden the successful Sellpia sales ingest invalidation:

~~~ts
const invalidate = useCallback(() => {
  void Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.inventory.productSalesAll(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.products.operations.all,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.all,
    }),
  ]);
}, [queryClient]);
~~~

The ProductOutflow spec must assert that manual and automatic successful ingest paths invalidate inventory sales, Product Operations, and Dashboard queries. A failed ingest must invalidate none.

**Step 5: Run unit, web, and database integration tests**

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts
rtk npm exec --workspace=apps/server vitest -- run --config vitest.config.integration.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx' 'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx'
~~~

Expected: shared-SKU destination images, fallback behavior, tenant isolation, existing stock math, and cache invalidation tests all pass.

**Step 6: Commit the inventory image slice**

~~~bash
rtk git add apps/server/src/analytics/sellpia-product-sales 'apps/web/src/app/(inventory)/stock-ops/components'
rtk git commit -m "feat: show matched Coupang images in inventory outflow"
~~~

---

### Task 4: Switch Product Operations display, filtering, summary, and detail to sales ABC

**Files:**

- Modify: apps/server/src/products/adapter/in/http/dto/product-operations.dto.ts
- Create: apps/server/src/products/adapter/in/http/dto/product-operations.dto.spec.ts
- Modify: apps/server/src/products/application/port/out/repository/product-operations.repository.port.ts
- Modify: apps/server/src/products/application/service/product-operations.service.ts
- Modify: apps/server/src/products/application/service/product-operations.service.spec.ts
- Modify: apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts
- Modify: apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts
- Modify: apps/server/src/products/mapper/product-operations-inventory.mapper.ts
- Modify: apps/server/src/products/mapper/product-operations-inventory.mapper.spec.ts
- Modify: apps/server/src/products/adapter/in/http/product-operations.controller.spec.ts
- Modify: apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts
- Modify: apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductOperationsCommandCenter.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx
- Create: apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx
- Create: apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx
- Modify: apps/web/src/app/(catalog)/product-hub/[id]/page.spec.tsx

**Step 1: Write failing backend behavior tests**

In product-operations.service.spec.ts create products whose manual abcGrade and salesAbcGrade intentionally disagree. Require:

- the row exposes both values without mutation;
- summary.salesAbcGradeCounts uses depletion.salesAbcGrade only;
- salesAbcGrade=A filters by the derived representative before pagination;
- a page size of one still reports the full filtered total;
- inventoryStatus and salesAbcGrade filters compose;
- a product with salesAbcGrade=null is excluded from A/B/C filters and remains visible with no grade filter;
- the unfiltered overview request is independent from the row filter;
- getProduct() hydrates the same depletion projection as listProducts();
- createProduct() and updateProduct() also return a complete detail response with the current depletion projection;
- manual create/update abcGrade behavior remains unchanged.

In the repository integration test prove the repository no longer adds MasterProduct.abcGrade to its list where clause when salesAbcGrade is present. The repository may still return the manual field as metadata.

Add a DTO whitelist regression test using the same transform/validation options as the global ValidationPipe. Replace the query DTO's abcGrade member with:

~~~ts
const SALES_ABC_GRADES = ['A', 'B', 'C'] as const;

@IsOptional()
@IsIn(SALES_ABC_GRADES)
salesAbcGrade?: (typeof SALES_ABC_GRADES)[number];
~~~

Prove salesAbcGrade=A survives transformation, an invalid grade is rejected, and the old abcGrade query key is not accepted as the derived filter. Without this DTO change Nest's whitelist would remove the new query before the Zod parser sees it.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/products/adapter/in/http/dto/product-operations.dto.spec.ts src/products/application/service/product-operations.service.spec.ts src/products/mapper/product-operations-inventory.mapper.spec.ts src/products/adapter/in/http/product-operations.controller.spec.ts
~~~

Expected: FAIL because list/detail/summary currently use manual abcGrade.

**Step 2: Hydrate derived grade before filtering and pagination**

Refactor listProducts() into this explicit order:

~~~ts
const raw = await repository.listProducts(organizationId, query);
const inventoryBySkuId = await loadInventory(
  organizationId,
  raw.items.flatMap(({ variants }) => variants),
);
const inventoryHydrated = raw.items.map((item) =>
  mapProductOperationsListItem(item, inventoryBySkuId, noDirectSales()),
);
const inventoryFiltered = query.inventoryStatus
  ? inventoryHydrated.filter(
      (item) => item.inventoryStatus === query.inventoryStatus,
    )
  : inventoryHydrated;
const projectionByProductId = await depletion.findByMasterProductIds({
  organizationId,
  masterProductIds: inventoryFiltered.map(({ id }) => id),
});
const projected = inventoryFiltered.map((item) => ({
  ...item,
  depletion: projectionByProductId.get(item.id) ?? noDirectSales(),
}));
const filtered = query.salesAbcGrade
  ? projected.filter(
      (item) => item.depletion.salesAbcGrade === query.salesAbcGrade,
    )
  : projected;
const offset = (query.page - 1) * query.limit;
return {
  items: filtered.slice(offset, offset + query.limit),
  total: filtered.length,
  page: query.page,
  limit: query.limit,
  summary: summarizeProducts(filtered),
};
~~~

The repository does not own Analytics hydration, so exclude depletion from its detail row type:

~~~ts
export type ProductOperationsRepositoryDetail = Omit<
  MasterProductOperationsDetail,
  'depletion' | 'inventoryStatus' | 'inventoryUnits' | 'variants'
> & {
  variants: ProductOperationsRepositoryVariant[];
};
~~~

Make mapProductOperationsDetail() accept a ProductDepletionProjection and return it on the public detail. Add one private service helper that loads inventory and the one-item depletion map, then reuse that helper from getProduct(), createProduct(), and updateProduct(). This keeps every endpoint that returns MasterProductOperationsDetail valid:

~~~ts
private async hydrateDetail(
  organizationId: string,
  product: ProductOperationsRepositoryDetail,
): Promise<MasterProductOperationsDetail> {
  const [inventoryBySkuId, projectionByProductId] = await Promise.all([
    this.loadInventory(organizationId, product.variants),
    this.depletion.findByMasterProductIds({
      organizationId,
      masterProductIds: [product.id],
    }),
  ]);
  return mapProductOperationsDetail(
    product,
    inventoryBySkuId,
    projectionByProductId.get(product.id) ?? noDirectSales(),
  );
}
~~~

summarizeProducts() increments salesAbcGradeCounts from product.depletion.salesAbcGrade. productListWhere() removes its stored abcGrade predicate and ignores query.salesAbcGrade because the service owns that derived filter.

**Step 3: Migrate the Product Hub route and labels**

Rename hook state, URL, and request parameter from abcGrade to salesAbcGrade. Accept only A, B, C; invalid URL values become no filter. Dashboard deep links must be able to land on:

~~~text
/product-hub?salesAbcGrade=A
/product-hub?salesAbcGrade=B
/product-hub?salesAbcGrade=C
~~~

Update labels:

- row badge: 판매 ABC, value product.depletion.salesAbcGrade or 미수집;
- tooltip: list all product.depletion.salesAbcGrades when more than one source grade exists;
- list filter: 판매 소진 등급;
- command center counts: summary.salesAbcGradeCounts;
- detail inventory card: 판매 소진 ABC and the coverage/shared-SKU evidence;
- detail operating metadata card: 수동 운영 등급, value product.abcGrade or 미설정;
- editor field: 수동 운영 등급. It still writes abcGrade.

ProductRowCard keeps imageUrls behavior unchanged; the Coupang fallback in this plan is inventory-only.

**Step 4: Run Product Operations tests**

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/products/adapter/in/http/dto/product-operations.dto.spec.ts src/products/application/service/product-operations.service.spec.ts src/products/mapper/product-operations-inventory.mapper.spec.ts src/products/adapter/in/http/product-operations.controller.spec.ts
rtk npm exec --workspace=apps/server vitest -- run --config vitest.config.integration.ts src/products/__tests__/product-operations.repository.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx' 'src/app/(catalog)/product-hub/[id]/page.spec.tsx'
~~~

Expected: derived filter/summary/detail tests pass, manual metadata mutation tests remain green, and the dashboard URL contract is covered.

**Step 5: Commit the Product Hub slice**

~~~bash
rtk git add apps/server/src/products 'apps/web/src/app/(catalog)/product-hub'
rtk git commit -m "feat: use sales ABC grades in product operations"
~~~

---

### Task 5: Make Dashboard grade cards, Top Products, and A-grade warnings use the same projection

**Files:**

- Modify: apps/server/src/analytics/dashboard/application/port/out/repository/dashboard-inventory.repository.port.ts
- Modify: apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-inventory.repository.adapter.ts
- Modify: apps/server/src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts
- Modify: apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.ts
- Modify: apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts
- Modify: apps/server/src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts
- Modify: apps/server/src/analytics/dashboard/application/port/out/repository/dashboard-sales.repository.port.ts
- Modify: apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-sales.repository.adapter.ts
- Modify: apps/server/src/analytics/dashboard/application/service/dashboard-sales.service.ts
- Modify: apps/server/src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts
- Modify: apps/server/src/analytics/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts
- Modify: apps/server/src/analytics/dashboard/dashboard.module.ts
- Modify: apps/server/src/analytics/dashboard/__tests__/dashboard.module.wiring.spec.ts
- Modify: apps/server/src/analytics/dashboard/__tests__/test-helpers/build-mock-ports.ts
- Create: apps/web/src/app/(analytics)/dashboard/components/DashboardGradeCards.tsx
- Create: apps/web/src/app/(analytics)/dashboard/components/DashboardGradeCards.spec.tsx
- Modify: apps/web/src/app/(analytics)/dashboard/components/DashboardTopProducts.tsx
- Create: apps/web/src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx
- Modify: apps/web/src/app/(analytics)/dashboard/page.tsx

**Step 1: Write failing inventory-dashboard service tests**

Replace countActiveProductsByGrade() with a repository read that returns active MasterProduct IDs:

~~~ts
export interface DashboardInventoryRepositoryPort {
  findActiveProductIds(organizationId: string): Promise<string[]>;
  findReviewCountsByMasterProductIds(
    organizationId: string,
    masterProductIds: string[],
  ): Promise<Array<{ masterProductId: string; reviewCount: number }>>;
}
~~~

These are the two grade-related method signatures to add/replace. Preserve all existing non-grade methods in DashboardInventoryRepositoryPort unchanged.

The service spec must prove:

- manual MasterProduct.abcGrade is never read for the dashboard grade cards;
- duplicate source rows and multiple SKUs still count one MasterProduct once;
- representative A > B > C makes grade buckets mutually exclusive;
- A+B+C equals classifiedProductCount;
- unclassifiedProductCount equals active IDs minus classified IDs;
- missing projection and no_direct_sales/null are unclassified, not C;
- totalProducts equals the active ID count;
- lowReviewProducts uses the derived A product ID set, not manual A;
- an empty organization returns zero counts without division assumptions;
- existing warnings, channel counts, alerts, mapping status, freshness, and manual GradeHistory behavior remain intact.

Update buildMockDashboardInventoryRepo() to expose findActiveProductIds and findReviewCountsByMasterProductIds and remove the two retired grade methods. Add a typed mock factory for SellpiaProductDepletionReadPort so both dashboard service specs configure findByMasterProductIds explicitly.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts
~~~

Expected: FAIL because the repository groups stored MasterProduct.abcGrade.

**Step 2: Assemble Dashboard inventory grades from the Analytics port**

Import SellpiaProductSalesModule into DashboardModule and inject SELLPIA_PRODUCT_DEPLETION_READ_PORT into DashboardInventoryService.

Use fixed buckets and derive A IDs from the same projection:

~~~ts
const projectionByProductId = await depletion.findByMasterProductIds({
  organizationId,
  masterProductIds: activeProductIds,
});
const gradeCount = { A: 0, B: 0, C: 0 };
const aGradeProductIds: string[] = [];

for (const masterProductId of activeProductIds) {
  const grade =
    projectionByProductId.get(masterProductId)?.salesAbcGrade ?? null;
  if (grade === null) continue;
  gradeCount[grade] += 1;
  if (grade === 'A') aGradeProductIds.push(masterProductId);
}

const classifiedProductCount =
  gradeCount.A + gradeCount.B + gradeCount.C;
const unclassifiedProductCount =
  Math.max(activeProductIds.length - classifiedProductCount, 0);
~~~

Call findReviewCountsByMasterProductIds() with only aGradeProductIds. Keep GradeHistory calls and output isolated as manual operational history; do not use them to alter sales grade buckets.

The repository adapter removes its MasterProduct.groupBy({ abcGrade }) query. findActiveProductIds() selects id with organizationId and isActive=true. The review query accepts explicit IDs and binds organizationId on MasterProduct, ChannelListing, and Review relations.

The Dashboard Inventory PG TestingModule must register SELLPIA_PRODUCT_DEPLETION_READ_PORT with an organization-aware deterministic test double. Its TEST and OTHER maps must differ so the PG suite still proves that repository rows cannot leak across organizations. dashboard.module.wiring.spec.ts separately proves the production DashboardModule resolves the real port exported by SellpiaProductSalesModule.

**Step 3: Write failing Top Products grade tests**

Change the repository's internal result, not the public response:

~~~ts
export type DashboardTopProductRow = Readonly<{
  id: string;
  masterProductId: string | null;
  name: string;
  organization: string;
  revenue: number;
  netProfit: number;
  profitRate: number;
}>;
~~~

The repository SQL must return mp.id as masterProductId and must stop selecting mp.abc_grade. Remove every null-to-C fallback.

The service spec must prove:

- a Top Product whose manual grade is C but sales projection is A returns A;
- multiple underlying grades return salesAbcGrades in A/B/C order and representative A;
- null MasterProduct or unclassified projection returns null and an empty array;
- unique non-null MasterProduct IDs are sent to the depletion port once;
- ranking, revenue, profit, and profit rate are unchanged.

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts
~~~

Expected: FAIL because Top Products currently returns the stored grade and defaults null to C.

**Step 4: Hydrate Top Products after the ranking query**

After the existing parallel dashboard reads complete, hydrate only the ranked rows:

~~~ts
const topMasterProductIds = [
  ...new Set(
    topProductRows.flatMap((row) =>
      row.masterProductId === null ? [] : [row.masterProductId],
    ),
  ),
];
const projectionByProductId = await depletion.findByMasterProductIds({
  organizationId,
  masterProductIds: topMasterProductIds,
});
const topProducts = topProductRows.map(
  ({ masterProductId, ...row }) => {
    const projection = masterProductId === null
      ? undefined
      : projectionByProductId.get(masterProductId);
    return {
      ...row,
      salesAbcGrade: projection?.salesAbcGrade ?? null,
      salesAbcGrades: projection?.salesAbcGrades ?? [],
    };
  },
);
~~~

Return topProducts in DashboardSalesSummary. DashboardSalesService and DashboardInventoryService share the same imported token and never call assignAbcGrades() themselves.

The Dashboard Sales PG TestingModule must also register the organization-aware SELLPIA_PRODUCT_DEPLETION_READ_PORT test double. Seed manual grades that disagree with the test-double projections and assert the response uses the projection. The Sellpia Product Sales PG suite remains the end-to-end database proof for constructing that projection; the Dashboard PG suites prove database ranking/count reads plus correct port consumption and tenant isolation.

**Step 5: Extract and test Dashboard grade UI**

DashboardGradeCards receives:

~~~tsx
type DashboardGradeCardsProps = {
  gradeCount: { A: number; B: number; C: number };
  classifiedProductCount: number;
  unclassifiedProductCount: number;
};
~~~

For each A/B/C card:

- percentage is count / classifiedProductCount;
- width is clamped to 0–100 defensively;
- link is /product-hub?salesAbcGrade={grade};
- heading explicitly says 판매 소진 ABC;
- unclassifiedProductCount is shown as 미수집/미연결 rather than folded into C.

DashboardTopProducts reads salesAbcGrade. A null grade renders — with neutral styling. When salesAbcGrades has more than one value, expose the full list in title/accessible text. It must never display C merely because the value is missing.

Replace only the inline grade-card block in dashboard/page.tsx with the extracted component.

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(analytics)/dashboard/components/DashboardGradeCards.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx'
~~~

Expected: links, percentages, unclassified count, derived badges, and null rendering all pass.

**Step 6: Run Dashboard unit and integration suites**

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts src/analytics/dashboard/__tests__/dashboard.module.wiring.spec.ts
rtk npm exec --workspace=apps/server vitest -- run --config vitest.config.integration.ts src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts src/analytics/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(analytics)/dashboard/components/DashboardGradeCards.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx'
~~~

Expected: dashboard grade counts and Top Products match the inventory projection under real PostgreSQL, including tenant isolation and manual/derived disagreement.

**Step 7: Commit the Dashboard slice**

~~~bash
rtk git add apps/server/src/analytics/dashboard 'apps/web/src/app/(analytics)/dashboard'
rtk git commit -m "feat: align dashboard grades with inventory sales"
~~~

---

### Task 6: Document the contracts and run the complete verification gate

**Files:**

- Modify: apps/server/src/ai/AGENTS.md
- Modify: apps/server/src/analytics/AGENTS.md
- Modify: apps/server/src/analytics/dashboard/AGENTS.md
- Modify: apps/server/src/products/AGENTS.md
- Modify: apps/web/src/app/(inventory)/stock-ops/AGENTS.md
- Modify: apps/web/src/app/(catalog)/product-hub/AGENTS.md
- Modify: apps/web/src/app/(analytics)/dashboard/AGENTS.md

docs/ARCHITECTURE.md does not need a change because domain ownership is unchanged: Analytics still owns sales grades, AI still owns content assets, Products still owns Product Hub reads, and Dashboard still owns its aggregation response.

**Step 1: Consolidate durable rules in scoped guides**

Record these rules without appending duplicate history:

- Analytics: product-level salesAbcGrade is the representative of all matched row grades, with A > B > C; missing evidence stays unclassified.
- AI: catalog display media is a tenant-scoped read capability over provider assets and never writes provider URLs into product/inventory metadata.
- Products/Product Hub: manual abcGrade is editable operating metadata; row/detail/filter/summary sales grade comes from depletion.salesAbcGrade.
- Dashboard: grade cards, Top Products, and A-grade review warnings use the Analytics projection; percentage denominator is classifiedProductCount.
- Stock Ops: display each destination's own strict Coupang provider image; do not collapse shared-SKU destinations.

Run:

~~~bash
rtk npm run check:agents-hygiene
~~~

Expected: all root-to-leaf instruction chains pass the size and shim checks.

**Step 2: Run all focused unit and contract tests**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/ai/application/service/catalog-display-media.service.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts src/analytics/sellpia-product-sales/sellpia-product-depletion-projection.spec.ts src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts src/products/adapter/in/http/dto/product-operations.dto.spec.ts src/products/application/service/product-operations.service.spec.ts src/products/mapper/product-operations-inventory.mapper.spec.ts src/products/adapter/in/http/product-operations.controller.spec.ts src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts src/analytics/dashboard/__tests__/dashboard.module.wiring.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx' 'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx' 'src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx' 'src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductEditorDialog.spec.tsx' 'src/app/(catalog)/product-hub/[id]/page.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardGradeCards.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx'
~~~

Expected: all focused tests pass with no snapshot update that masks a behavior change.

**Step 3: Run real-PostgreSQL integration tests**

~~~bash
rtk npm exec --workspace=apps/server vitest -- run --config vitest.config.integration.ts src/ai/__tests__/catalog-display-media.pg.integration.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts src/products/__tests__/product-operations.repository.pg.integration.spec.ts src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts src/analytics/dashboard/__tests__/dashboard-sales.pg.integration.spec.ts
~~~

Expected: all database tests pass, including organization isolation and manual/derived grade disagreement.

**Step 4: Run static ownership, build, and boot gates**

~~~bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:agents-hygiene
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git diff --check
~~~

Expected: scanners and all builds pass; git diff has no whitespace errors.

Start the Nest server:

~~~bash
rtk npm run dev:server
~~~

Expected: Nest reports a successful application boot with Product, Analytics, Dashboard, Inventory, and AI modules wired. Stop it with Ctrl-C after confirming boot; do not leave a watcher running.

No db:push or prisma generate is required because the Prisma schema is unchanged.

**Step 5: Self-review contract completeness**

Inspect the final diff and explicitly verify:

- no write to MasterProduct.abcGrade or MasterProduct.imageUrls was added;
- no new inventory image column or schema migration exists;
- no dashboard or Product Hub call to assignAbcGrades() exists;
- every new Prisma path contains organizationId;
- missing grades render null/미수집/—, never C;
- A+B+C equals classifiedProductCount in tests;
- salesAbcGrade filtering occurs before slice();
- shared SKU destinations retain separate displayImage values;
- currentThumbnailSelection is not used as strict Coupang-provider proof;
- sales ingest invalidates inventory, Product Operations, and Dashboard query families.

Run a placeholder scan against the changed files:

~~~bash
rtk rg -n 'TBD|TODO|implement later|add tests|similar to|appropriate' packages/shared/src/schemas apps/server/src/ai apps/server/src/analytics apps/server/src/products 'apps/web/src/app/(inventory)/stock-ops' 'apps/web/src/app/(catalog)/product-hub' 'apps/web/src/app/(analytics)/dashboard'
~~~

Expected: no placeholder introduced by this change. Existing unrelated matches must be inspected and left untouched.

**Step 6: Commit documentation and verify release disposition**

~~~bash
rtk git add apps/server/src/ai/AGENTS.md apps/server/src/analytics/AGENTS.md apps/server/src/analytics/dashboard/AGENTS.md apps/server/src/products/AGENTS.md 'apps/web/src/app/(inventory)/stock-ops/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/AGENTS.md' 'apps/web/src/app/(analytics)/dashboard/AGENTS.md'
rtk git commit -m "docs: document sales grade and image projections"
rtk git status --short --branch
rtk git diff --name-only origin/develop...HEAD
~~~

Expected: the worktree is clean; Prisma files and VERSION are absent from the diff.

Before creating a PR, run:

~~~bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
~~~

Expected: both develop-targeted PR guards pass. The PR release decision states: no Prisma change, no db:push, no backfill, no dev-data change.

## Acceptance Checklist

- 재고 관리의 기존 판매 행 ABC는 변하지 않는다.
- 같은 판매 근거가 상품 관리 행·상세·필터·전체 요약에 표시된다.
- 대시보드 카드와 Top Products가 같은 파생 등급을 사용한다.
- 수동 운영 등급은 유지되고 편집 화면에서 명확히 구분된다.
- 미수집/미매칭 상품은 C가 아니라 미분류다.
- 대시보드 A/B/C 비율은 분류 상품을 분모로 하며 100%를 넘지 않는다.
- 대시보드 A/B/C 링크가 정확한 Product Hub 필터로 이동한다.
- 재고 화면은 매칭된 각 운영상품의 정확한 쿠팡 option 이미지, 없으면 listing primary 이미지를 보여준다.
- 공유 SKU의 복수 목적지 이미지가 서로 덮어쓰이지 않는다.
- 쿠팡 URL은 읽기 projection에만 존재하고 어떤 운영 데이터에도 저장되지 않는다.
- 외부 이미지 실패나 이미지 enrichment 오류가 핵심 재고 표를 차단하지 않는다.
- shared, server, web tests/build, tenant scanners, Nest boot가 모두 통과한다.
