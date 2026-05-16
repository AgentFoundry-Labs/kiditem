# Design: Product Pipeline Workspace Tabs

Date: 2026-05-16
Status: Approved for implementation planning
Scope: `product-pipeline` collected product detail workspace

## Problem

The collected product detail workspace currently separates related work across tabs and routes:

- The detail page has `기본정보 / 옵션·판매가 / 상세페이지 / 생성 이력 / 원본 데이터`.
- Thumbnail work opens a separate `/product-pipeline/thumbnail-generation` flow even when the operator is working on one collected product.
- `생성 이력` reads like an activity log, but the actual product need is detail page version management.

The operator should be able to finish one collected product from one workspace without losing product context.

## Goals

- Change the workspace tabs to `기본정보 / 옵션·판매가 / 썸네일 / 상세페이지 / 원본 데이터`.
- Remove the standalone `생성 이력` tab.
- Move useful generation-history behavior into the `상세페이지` tab as finished detail-page version management.
- Move product-bound thumbnail generation/editing into the `썸네일` tab.
- Preserve global thumbnail operations under the sidebar thumbnail area, not inside a single product workspace.

## Non-Goals

- Do not remove global thumbnail operations such as all-product queues, fix-needed products, batch Wing registration, or direct-upload thumbnail work.
- Do not redesign Coupang Wing automation.
- Implementation starts from existing Prisma schema and shared API contracts. Schema or shared contract changes require a separate layer impact check.
- Do not expand this into unrelated registered product, catalog, or sourcing list redesign.

## Final UX

### Tabs

The collected product detail tabs become:

1. `기본정보`
2. `옵션·판매가`
3. `썸네일`
4. `상세페이지`
5. `원본 데이터`

The product header remains the owner of product name, back navigation, registration actions, review flags, and lock/completion controls. Individual tabs should not repeat a product-summary card.

### Thumbnail Tab

The thumbnail tab is a product-scoped workspace, not a mini global hub.

The screen flow is:

1. **기준 이미지 선택**
   - Show this product's source images, uploaded images, and previous generated results.
   - The selected image is the explicit starting point for thumbnail work.

2. **선택한 이미지로 할 작업**
   - Button: `원본 보정하기`
   - Meaning: keep the selected image as the base and clean, compose, recolor, or adjust it.
   - Button: `새 장면 만들기`
   - Meaning: use the selected product image to generate a new studio, usage, or mood scene.

3. **이 상품 생성 결과**
   - Show only thumbnail generations tied to the current product subject.
   - Allow selecting a generated image as the registration representative thumbnail.

4. **상품 썸네일 상태**
   - Show whether a representative image is selected.
   - Show this product's Wing registration state when a generated thumbnail has been applied to the product.

Single-product Wing pending state belongs in this tab. Global Wing queues stay in the global thumbnail area.

### Product-Bound Thumbnail Entry

Product-bound thumbnail editing converges into the thumbnail tab.

- Existing basic-tab thumbnail buttons should be removed or reduced to a simple move-to-thumbnail-tab affordance.
- Links with `sourceCandidateId`, `productId`, or `registrationWorkspaceId` should open the product workspace thumbnail tab when a product workspace can be resolved.
- Direct uploads without product context remain in the global thumbnail route.
- Global thumbnail surfaces link to a specific product's thumbnail tab with the relevant generation selected when the generation has product workspace identity.

### Detail Page Tab

The detail page tab becomes a version manager for completed detail pages.

It contains:

- A compact generation progress/status bar for current pending or failed detail-page generation.
- A version list of completed detail pages only.
- The current registered detail page is visually marked.
- Actions to apply a selected completed version as the registration detail page.
- Actions to delete or clone/edit a selected version, where supported by existing APIs.
- The detail preview area.

`생성 이력` is not shown as a separate activity-log tab. Failed or running generations are not detail-page versions.

### Detail Preview And Minimap

The minimap belongs inside the detail preview component.

- Full preview appears on the left.
- Minimap appears on the right of the full preview.
- The minimap continues to reflect scroll position and supports jump-to-position behavior.
- The detail preview header retains edit and JPEG download actions.

## Architecture

### Frontend Areas

Primary files to change:

- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/detail/ProductEditTabs.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/ProductWorkspaceScreen.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/ProductTabContent.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/DetailPagePreview.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/components/workspace/GenerationHistoryTab.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/page.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation/page.tsx`
- `apps/web/src/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes.ts`

Suggested new components:

- `_shared/components/workspace/thumbnail/ThumbnailWorkspaceTab.tsx`
- `_shared/components/workspace/thumbnail/ThumbnailSourcePicker.tsx`
- `_shared/components/workspace/thumbnail/ThumbnailActionChooser.tsx`
- `_shared/components/workspace/thumbnail/ProductThumbnailResults.tsx`
- `_shared/components/workspace/thumbnail/ProductWingStatusPanel.tsx`
- `_shared/components/workspace/detail/DetailPageVersionRail.tsx`
- `_shared/components/workspace/detail/DetailGenerationStatusBar.tsx`

The existing large files should not receive substantial new behavior directly. `GenerationHistoryTab.tsx` and `thumbnail-generation/edit/page.tsx` are already large; implementation should extract reusable pieces instead of growing them further.

### Thumbnail State

Subject identity remains one of:

- `sourceCandidateId`
- `registrationWorkspaceId`
- `productId`

The thumbnail tab should use existing generation list APIs with product-scoped filters:

- `sourceCandidateId` for collected products that are not promoted.
- `registrationWorkspaceId` when a registration workspace exists.
- `productId` for promoted/master products.

Wing pending status for this product is derived from existing thumbnail generation rows:

- `status === 'succeeded'`
- `phase === 'applied'`
- `registrationStatus == null || registrationStatus === 'failed'`

If a collected product has not been registered/promoted yet, the tab shows a disabled Wing card: `상품 등록 후 Wing 업로드 가능`.

### Detail Page Versions

Completed detail page versions are sourced from the existing candidate-linked content archive and generated detail-page rows.

The version list should include completed/ready versions only. Pending/running/failed generations feed the status bar, not the version list.

The current selected/registered detail page should be resolved from existing workspace state:

- `savedDetailPageGenerationId`
- registration workspace selected detail page, when available
- latest completed fallback only where existing behavior already falls back today

### Routing

Extend product workspace routes with query-param tab selection:

- Thumbnail tab: `/product-pipeline/collected-products/:id?tab=thumbnail`
- Detail page tab: `/product-pipeline/collected-products/:id?tab=detail`
- Optional generation selection: `generationId=...`

Route helper functions should prefer product workspace links for product-bound thumbnail work.

Existing `/product-pipeline/thumbnail-generation` behavior remains for global/direct-upload work. Product-bound `/thumbnail-generation/edit` entry points redirect to the product workspace thumbnail tab once the product workspace can be resolved.

## Error Handling

- If no source image exists, the thumbnail tab shows an empty picker with upload as the primary path.
- If a selected image is unavailable, clear the selection and ask the operator to pick another image.
- If thumbnail generation fails, show the failed generation in product-scoped status/results, not as a global-only error.
- If Wing registration fails, show the error and retry/clear-error affordance for this product.
- If detail page generation fails, show it in the detail generation status bar, not in the completed version list.
- If no completed detail page exists, the detail page tab shows an empty version state and the current preview empty state.

## Tests

Frontend unit/component tests should cover:

- `ProductEditTabs` renders the new tab set and no `생성 이력` tab.
- `ProductTabContent` routes `thumbnail` to the thumbnail workspace tab.
- Basic tab no longer starts product-bound thumbnail editing directly.
- Thumbnail tab selects a source image before enabling `원본 보정하기` and `새 장면 만들기`.
- Product-scoped thumbnail generations filter by `sourceCandidateId` or `registrationWorkspaceId`.
- Product Wing status panel classifies `phase='applied'` plus missing/failed registration as pending.
- Detail page version rail excludes running/failed generations from versions.
- Detail generation status bar displays running/failed generation state.
- Detail preview positions minimap to the right of the full preview.

Verification commands for implementation:

- `npm run build --workspace=apps/web`
- Focused Vitest specs for changed workspace and thumbnail components.

## Implementation Approach

Use the product workspace as the owner of product-bound thumbnail and detail-version UX.

Recommended approach:

- Extract detail history behavior into version/status components before removing the tab.
- Extract product-bound thumbnail editor pieces from the standalone route into reusable components.
- Keep global thumbnail route behavior for product-less direct uploads and global queues.
- Update route helpers so product-bound entry points converge on the thumbnail tab.

This avoids growing existing 700-line components while keeping the backend contracts mostly intact.
