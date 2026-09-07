# Fixed WING Category Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집상품의 WING 등록 카테고리를 기존 `ChannelListing`이나 런타임 쿠팡 API 없이, `Coupang_detailinfo_260711.xlsx`에서 정리한 KidItem 고정 카테고리 목록에서 결정하고 사용자가 등록 직전에 확인·변경할 수 있게 한다.

**Architecture:** WING 코드·전체 경로만 소유하는 정적 `WingCategoryDefinition` 레지스트리를 web에 둔다. 구매옵션과 상품정보제공고시는 카테고리와 분리된 상품 데이터다. `Coupang_detailinfo_260711.xlsx` 실데이터에서 같은 카테고리 안에서도 구매옵션 조합이 여러 개임이 확인됐으므로, 카테고리 선택이 기존 구매옵션·고시정보를 덮어쓰면 안 된다. 수집상품에 저장된 `registrationInput.wingCategoryKey`를 우선 사용하고, 없으면 원본 `category`의 정확한 alias만 자동 매칭하며, 그래도 없으면 확인 모달에서 사용자가 고른다. 기존 Prisma `ChannelListing` 기반 추천 API와 k-NN 추론은 완전히 제거한다.

**Tech Stack:** Next.js/React, TypeScript, existing `ProductPreparation.registrationInput` JSON, NestJS compatibility cleanup, Vitest.

## Global Constraints

- 런타임 쿠팡 카테고리 API를 추가하지 않는다.
- `ChannelListing`, 등록상품 수, 배포 DB corpus를 카테고리 선택 근거로 사용하지 않는다.
- `Coupang_detailinfo_260711.xlsx`의 유효한 현행 카테고리 102개를 정적 선택 목록의 초기 원본으로 사용한다. `(OLD)` 26개와 `사용하지 않는 카테고리` 1개는 제외한다.
- 상품명 fuzzy matching으로 카테고리를 추측하지 않는다. 저장된 key 또는 정확한 alias만 자동 선택한다.
- 카테고리 선택은 `categoryCell`만 바꾼다. 구매옵션·고시정보는 상품별 draft 값을 보존하며, 카테고리만으로 새 값을 추론하지 않는다.
- 확인 모달에서 카테고리를 선택하기 전에는 WING 시작 버튼을 활성화하지 않는다.
- 선택값은 기존 `ProductPreparation.registrationInput.wingCategoryKey`에 저장한다. Prisma schema 변경과 DB 백필은 없다.
- 기존에 저장된 key가 없는 상품은 정상적인 상태다. 단일 등록은 모달에서 선택하고, 일괄등록은 미선택 상품을 정확히 표시한다.
- 자동 제출 정책은 변경하지 않는다. WING 화면에서 사람이 마지막 검토를 계속한다.

---

## File Structure

### Create

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.ts` — 승인된 카테고리와 alias의 유일한 레지스트리.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.spec.ts` — key/alias/preset 완결성 테스트.

### Modify

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-excel.ts` — preset type만 유지하거나 새 파일에서 import하고 단일 물총 상수 제거.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts` — 저장된 key/alias를 해석하고 category override를 전체 product에 적용.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts` — 등록상품 0건, 미선택, 저장/재사용, 일괄등록 테스트.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.tsx` — 고정 카테고리 select 추가.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.spec.tsx` — 선택 전 차단과 변경 반영 테스트.
- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.ts` — `registrationInput.wingCategoryKey` 정규화 및 저장 helper.
- `apps/server/src/products/categories/categories.controller.ts` — legacy 추천 route 제거.
- `apps/server/src/products/categories/categories.module.ts` — legacy 추천 service 제거.
- `docs/coupang-wing-registration-spec.md` — 고정 레지스트리와 운영 갱신 절차 기록.
- `docs/ARCHITECTURE.md` — WING 등록 preset은 collected-products surface 소유임을 기록.

### Delete

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-resolution.ts`
- `apps/server/src/products/categories/coupang-category-suggestion.service.ts`
- `apps/server/src/products/categories/coupang-category-suggestion.service.spec.ts`
- `apps/server/src/products/domain/coupang-category-inference.ts`
- `apps/server/src/products/domain/coupang-category-inference.spec.ts`
- `packages/shared/src/schemas/coupang-category.ts`
- `packages/shared/src/coupang-category.ts`
- `packages/shared/package.json`의 `./coupang-category` export 항목

---

### Task 1: Audit the Fixed Business Category Set

**Files:**
- Modify: `docs/coupang-wing-registration-spec.md`

**Deliverable:** 승인된 각 카테고리에 대해 다음 값이 모두 확인된 표. 빈 값이나 추정값은 허용하지 않는다.

```text
key
운영 표시명
displayCategoryCode
fullPath
원본 category exact aliases
동일 카테고리 실상품 수와 구매옵션 signature 분포
상품군별로 검증된 구매옵션 기본값(없음 허용)
카테고리 검색옵션 정의
브랜드/제조사 정책
검증한 WING 화면/카테고리 파일 날짜
```

- [ ] **Step 1: Start from repository-confirmed category candidates**

`Coupang_detailinfo_260711.xlsx`에는 1,227개 등록상품, 2,244개 옵션행, 129개 고유 카테고리가 있다. 이 중 `[숫자] 경로` 형식이면서 `(OLD)`가 아닌 현행 후보는 102개다. 이 102개를 정적 선택 목록의 초기 원본으로 삼고, `(OLD)` 26개와 `사용하지 않는 카테고리` 1개는 넣지 않는다.

현재 회귀 테스트의 핵심 네 카테고리는 다음과 같다.

```text
watergun       [77390] 완구/취미>스포츠/야외완구>물총
boardgame      [77448] 완구/취미>보드게임>기타보드게임
stationery_set [79914] 문구/오피스>문구/학용품>과목별준비물>학용품세트/문구세트
keyholder      [64687] 생활용품>생활소품>열쇠고리/키홀더
```

- [ ] **Step 2: Verify categories and product-family evidence**

For each approved category, open WING 신규등록, select the exact path, and record the rendered mandatory purchase-option labels and product-notice category/field order. Cross-check the WING V4.6 category input file. Do not infer one category's metadata from another.

2026-07-22 1차 실화면 점검에서는 네 경로 선택과 수수료(10.8%)는 확인했지만, 현재 WING `formV2` 번들(`20260722103448`)이 `_.filter is not a function`, `_.isEmpty is not a function` 오류를 반복 발생시켰다. 이 상태에서는 고시 유형 드롭다운이 `선택하세요`만 표시하고 카테고리 변경 뒤 고시 행이 이전 선택 상태를 유지하므로 고시 preset을 확정하면 안 된다. 구매옵션 입력은 학용품세트에서만 필수 표시된 `색상`·`수량`이 보였고, 키홀더·물총·기타보드게임은 입력 행 0개였지만 같은 런타임 오류의 영향 가능성이 있으므로 정상 WING 화면에서 재확인한다. 런타임 오류가 남아 있거나 고시 유형이 비어 있으면 이 단계는 미완료다.

`docs/references/Coupang_detailinfo_260711.xlsx` 교차검증 결과는 카테고리와 구매옵션을 분리해야 함을 보여준다.

```text
keyholder      28상품: 색상+수량 25, 옵션 없음 3
watergun       25상품: 색상 14, 색상+수량 8, 옵션 없음 3
boardgame     107상품/198행: 색상 99, 선택 48, 색상+수량 38, 기타/없음 13
stationery    107상품/246행: 색상 72, 선택 58, 색상+수량 99, 수량 7, 없음 10
```

이 파일에는 상품정보제공고시 열이 없으므로 고시 preset의 근거로 사용하지 않는다. 반면 `딸깍`이 포함된 키링 13건은 모두 `[64687] 생활용품>생활소품>열쇠고리/키홀더`이며 구매옵션은 `[2439]색상(필수)` + `[7652]수량(필수)`로 동일하다. 따라서 현재 회귀 상품은 이 상품군 근거를 사용할 수 있지만, 다른 키홀더나 다른 카테고리에 같은 옵션을 일반화하지 않는다.

- [ ] **Step 3: Review the fixed list with the operator**

The review is complete only when every allowed category has a stable `key`, code, and full path. Product-family option defaults require their own evidence; missing option evidence does not get filled from another category or product family.

- [ ] **Step 4: Commit the audited catalogue section**

```bash
git add docs/coupang-wing-registration-spec.md
git commit -m "docs: define supported WING category presets"
```

---

### Task 2: Build the Static Preset Registry

**Files:**
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.spec.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-excel.ts`

**Interfaces:**
- Produces: `WingCategoryKey`, `WingCategoryDefinition`, `WING_CATEGORY_DEFINITIONS`, `getWingCategoryDefinition()`, `matchWingCategoryAlias()`.

- [ ] **Step 1: Write the failing registry tests**

```ts
it('maps only exact normalized aliases', () => {
  expect(matchWingCategoryAlias('키링')?.key).toBe('keyholder');
  expect(matchWingCategoryAlias(' 열쇠고리/키홀더 ')?.key).toBe('keyholder');
  expect(matchWingCategoryAlias('과일바구니 딸깍이')).toBeNull();
});

it('keeps every category definition complete and unique', () => {
  const keys = WING_CATEGORY_DEFINITIONS.map((item) => item.key);
  const cells = WING_CATEGORY_DEFINITIONS.map((item) => item.categoryCell);
  expect(WING_CATEGORY_DEFINITIONS).toHaveLength(102);
  expect(new Set(keys).size).toBe(keys.length);
  expect(new Set(cells).size).toBe(cells.length);
  for (const item of WING_CATEGORY_DEFINITIONS) {
    expect(item.label).not.toBe('');
    expect(Array.isArray(item.aliases)).toBe(true);
    expect(item.categoryCell).toMatch(/^\[\d+\]\s+.+>.+$/);
    expect(item.categoryCell.toLocaleLowerCase('ko-KR')).not.toContain('(old)');
  }
  expect(cells).not.toContain('사용하지 않는 카테고리');
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.spec.ts'
```

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement the registry from the audited table**

Use this shape. Task 1's approved table is the literal source for every array object; unsupported candidates are omitted rather than represented incompletely:

```ts
export interface WingCategoryDefinition {
  key: WingCategoryKey;
  label: string;
  aliases: readonly string[];
  categoryCell: string;
}

const normalizeAlias = (value: string) => value.trim().replace(/\s+/g, '').toLocaleLowerCase('ko-KR');

export function matchWingCategoryAlias(value: string): WingCategoryDefinition | null {
  const normalized = normalizeAlias(value);
  if (!normalized) return null;
  const matches = WING_CATEGORY_DEFINITIONS.filter((item) =>
    item.aliases.some((alias) => normalizeAlias(alias) === normalized));
  return matches.length === 1 ? matches[0] : null;
}
```

The final implementation must contain no comment-only entries or incomplete category objects. Split `categoryCell` out of `WING_TOY_WATERGUN_PRESET`; keep purchase options and notice values in the product draft path instead of moving them into the category registry.

- [ ] **Step 4: Run registry tests**

```bash
npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.spec.ts'
```

Expected: all registry tests PASS.

- [ ] **Step 5: Commit the registry**

```bash
git add 'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-category-presets.spec.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-excel.ts'
git commit -m "feat: add fixed WING category presets"
```

---

### Task 3: Make Category Selection Part of the Confirmation Draft

**Files:**
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts`

**Interfaces:**
- Adds: `WingRegistrationOverrides.categoryKey: WingCategoryKey | ''`.
- Changes: `applyWingRegistrationOverrides(detail, product, overrides)` rebuilds category-dependent fields from the selected preset.

- [ ] **Step 1: Write failing flow tests**

Cover these cases:

```ts
it('reuses a saved wingCategoryKey before considering source category', async () => {
  // registrationInput.wingCategoryKey='keyholder' wins even when basicInfo.category='완구'.
});

it('uses a unique exact source-category alias when no key is saved', async () => {
  // basicInfo.category='키링' selects keyholder.
});

it('opens a draft with an empty category instead of throwing', async () => {
  // unknown category produces overrides.categoryKey === ''.
});

it('changes only the selected category', () => {
  // categoryCell comes from the selected definition.
  // existing purchase options, notice category/values, and user-edited fields stay intact.
});
```

- [ ] **Step 2: Run and verify the old resolver fails the new contract**

```bash
npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts'
```

Expected: FAIL because prepare currently calls the backend suggestion API and throws before creating a draft.

- [ ] **Step 3: Implement deterministic initial selection**

Selection priority:

```text
registrationInput.wingCategoryKey
→ exact alias match of ProductBasics.category
→ empty string
```

Do not examine the product name, registered products, tags, or keywords. `prepareWingRegistration()` must still validate extension, detail image, and channel account, but category absence must no longer throw.

- [ ] **Step 4: Apply only the selected category**

When `categoryKey` changes, replace only `WingProduct.categoryCell`. Preserve purchase options, notice category/values, user-edited name/price/stock, and candidate image/detail values. Validate an empty or unknown key as `카테고리를 선택하세요.`.

- [ ] **Step 5: Run the flow tests**

Expected: saved-key, exact-alias, empty-draft, and full-preset tests PASS.

- [ ] **Step 6: Commit draft behavior**

```bash
git add 'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts'
git commit -m "fix: choose WING category from fixed presets"
```

---

### Task 4: Add the Category Select and Persist the Choice

**Files:**
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.tsx`
- Modify/Create: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.ts`

**Interfaces:**
- Consumes: `WING_CATEGORY_DEFINITIONS`.
- Persists: `registrationInput.wingCategoryKey` through the existing ProductPreparation update API.

- [ ] **Step 1: Write failing dialog tests**

Verify the category select lists only registry entries, a missing selection disables confirmation and shows `카테고리를 선택하세요.`, and changing from watergun to keyholder is returned in `onConfirm`.

- [ ] **Step 2: Implement the controlled select**

Place it before product name and options. Use `categoryKey` as the value and the registry's `label` plus full path as the visible option. Do not allow arbitrary text.

- [ ] **Step 3: Persist only after explicit confirmation**

Before starting the extension execution, merge:

```ts
registrationInput: {
  ...currentRegistrationInput,
  wingCategoryKey: overrides.categoryKey,
}
```

through the existing preparation update endpoint. If persistence fails, do not open WING; show the existing actionable API error so a later retry does not lose the selected category.

- [ ] **Step 4: Run dialog and sourcing API tests**

```bash
npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.spec.tsx' \
  'src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.spec.ts'
```

Expected: tests PASS.

- [ ] **Step 5: Commit UI and persistence**

```bash
git add 'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.tsx' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/components/wing/WingRegistrationConfirmDialog.spec.tsx' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api.ts'
git commit -m "feat: confirm and save WING category"
```

---

### Task 5: Remove the Listing-Based Recommendation Stack

**Files:**
- Delete the legacy files listed in File Structure.
- Modify: `apps/server/src/products/categories/categories.controller.ts`
- Modify: `apps/server/src/products/categories/categories.module.ts`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Add a durable architecture assertion**

In the nearest Products architecture spec, assert the Products category surface contains none of:

```text
CoupangCategorySuggestionService
channelListing
inferCoupangCategory
coupang-suggestions
```

- [ ] **Step 2: Delete the old route, service, inference, and shared contract**

Keep `/api/categories` CRUD intact. Remove `resolveWingCategories` from web and all imports. Do not add an API fallback.

- [ ] **Step 3: Prove the dependency is gone**

```bash
rg -n "coupang-suggestions|inferCoupangCategory|corpusSize|resolveWingCategories" \
  apps/server apps/web packages/shared
```

Expected: no hits.

- [ ] **Step 4: Run server/shared tests**

```bash
npm exec --workspace=apps/server vitest -- run src/products
npm run build --workspace=packages/shared
```

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add apps/server/src/products apps/web packages/shared
git commit -m "refactor: remove listing-based WING category suggestion"
```

---

### Task 6: Batch Behavior, Documentation, and Acceptance

**Files:**
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.spec.ts`
- Modify: `docs/coupang-wing-registration-spec.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Make batch registration deterministic**

Bulk workbook generation must use each candidate's saved `wingCategoryKey` or unique exact alias. If any item remains unselected, do not create a partly wrong workbook. Return the first three product names and this instruction:

```text
WING 카테고리가 선택되지 않은 상품이 N건 있습니다.
각 상품의 WING 등록 확인에서 카테고리를 먼저 선택해 주세요.
```

- [ ] **Step 2: Add batch tests**

Verify mixed saved categories generate different category cells without rewriting each row's purchase options or notice values, and one missing key blocks the workbook without reading `ChannelListing` or calling an API.

- [ ] **Step 3: Update durable docs**

Document:

```text
saved wingCategoryKey → exact source-category alias → confirmation select
```

State that adding a supported category requires one audited category entry and tests; no DB import/backfill or runtime provider integration is required. Product option defaults require separate product-family evidence and must not be inferred from the category alone.

- [ ] **Step 4: Run full gates**

```bash
npm exec --workspace=apps/server vitest -- run src/products
npm exec --workspace=apps/web vitest -- run \
  'src/app/(product-pipeline)/product-pipeline/collected-products'
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run dev:server
git diff --check
```

Expected: tests/builds exit 0; Nest logs `Nest application successfully started`. Stop the server after boot confirmation.

- [ ] **Step 5: Verify the deployed regression case**

With deployed `channel_listings = 0`, click WING registration for `4000과일바구니딸깍이키링`.

Acceptance criteria:

- No category suggestion API is called.
- The confirmation modal opens even if no category key is saved.
- `열쇠고리/키홀더` can be selected from the fixed list.
- Confirmation sends `[64687] 생활용품>생활소품>열쇠고리/키홀더` while preserving the draft's `색상`·`수량` options and notice values.
- Reopening the same candidate preselects the saved category.
- Existing registered-product data remains irrelevant.

- [ ] **Step 6: Record release decision**

```text
Release decision: keep the current open train VERSION; no Prisma schema change.
DB/backfill: none. Existing ProductPreparation JSON stores wingCategoryKey on future confirmation.
Dev data: no bundle update required.
```

---

## Self-Review Results

- **Business fit:** The plan treats WING categories as a controlled KidItem catalogue, not something inferred from unrelated registered products.
- **No runtime dependency:** It adds neither Coupang category API calls nor category-tree caching.
- **Safety:** A category change only replaces `categoryCell`; it cannot silently rewrite product-specific purchase options or notice values.
- **Existing data:** Old candidates need no migration; they select once in the confirmation modal and save the key naturally.
- **Extensibility:** A new category is one audited registry entry plus tests, not a new database import process.
