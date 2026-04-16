# Thumbnail Editor: ProductSelector + Inline Hub Picker (v2 Redesign)

> **Supersedes**: [2026-04-16-thumbnail-editor-hub-import-design.md](2026-04-16-thumbnail-editor-hub-import-design.md) (모달 기반 hub picker → 인라인 슬롯 hub picker)

## Problem

v1 (hub-import 모달) 머지 직전 사용자 시연 중 두 가지 UX 문제 발견:

1. **상품 선택 진입 경로 부재** — `/thumbnail-editor` 단독 진입 시 productId 가 없어 hub 버튼 disabled. 사용자는 다른 페이지(`/products`, `/image-hub`)로 가서 deep link 로만 진입 가능. 편집기 안에서 상품을 직접 검색·선택할 방법이 없다.
2. **모달 friction** — productId 가 있어도 hub 사용을 위해 "버튼 클릭 → 모달 → role 섹션 스크롤 → 선택 → 가져오기 → 모달 닫힘" 5단계. productId 가 자동으로 있는 상황이라면 슬롯 옆에 hub 썸네일이 직접 보이는 게 더 자연스럽다.

## Scope

프론트엔드만. 백엔드 API/DTO/프롬프트 변경 없음.

영향 범위: `apps/web/src/app/thumbnail-editor/` 하위 + 헤더 영역.

**v1 결과물 중 제거**:
- `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` (331줄, 전체 삭제)
- `EditorInputPanel.tsx` 의 "📂 이미지 허브에서 불러오기" 버튼 + `hasProductId`/`onOpenHubModal` props
- `page.tsx` 의 `hubModalOpen` state + `handleHubApply` 함수 + 모달 mount JSX
- `useThumbnailEditor.ts` 는 변화 없음 (hook은 그대로)

**v1 결과물 유지**:
- `apps/web/src/lib/hub-roles.ts` (`HUB_ROLE_CONFIG` 공유 상수) — 인라인 picker 에서도 재사용
- `EditorControlPanel.tsx` 의 purpose 토글 제거 — 이번 v2 와 무관, 그대로 유지
- `ImageGrid.tsx` 의 공유 상수 import + img lazy loading

**v2 신규**:
- 페이지 헤더에 `ProductSelector` 통합. 상품 선택 시 URL `?productId=...` 자동 업데이트.
- 새 컴포넌트 `HubInlinePicker.tsx` — 슬롯 안에 표시되는 인라인 허브 썸네일 그리드. role 별 필터, single/multi-select 모드.
- `EditorInputPanel.tsx` 각 case 에서 슬롯마다 `HubInlinePicker` 추가 호출.
- color-variants 드롭존 아래에 multi-toggle `HubInlinePicker`.

Non-goals (v1 과 동일):
- 백엔드 DTO/스키마 변경 없음
- creative `backgroundReference` 슬롯 허브 연동 (매칭 role 없음)
- 허브 내용 편집 (모달에서든 인라인에서든 읽기 전용. 수정은 `/image-hub`)
- React Query 전환 (`useProductImages` 그대로 — TODOS.md 에 follow-up 등재됨)

## Key Assumptions

- `ProductSelector` (`apps/web/src/components/product/ProductSelector.tsx`) 기존 컴포넌트 그대로 사용. Props `{ selectedId, onSelect: (product) => void }`.
- 상품 선택 시 `useRouter` (Next.js App Router) 의 `router.replace('?productId=' + id)` 로 URL 갱신. 새로고침/공유 안전.
- `useProductImages(productId)` 그대로 활용. 인라인 picker 에서도 동일 hook 호출 — productId 같으면 React 가 중복 fetch 안 함.
- 인라인 picker 는 컴팩트 (가로 스크롤 또는 3-4열 그리드, 슬롯 폭 ~240px 기준).

## Information Architecture

### 헤더 (변경)

```
이전:
[✨] 썸네일 편집기 — 색칠하는에어글라이더

이후:
[✨] 썸네일 편집기                          [🔍 상품 검색...           ▾]
                                            (선택 시 → [🛍️ 색칠하는에어글라이더 (변경 ▾)])
```

- 좌측: icon + "썸네일 편집기" 타이틀 (그대로)
- 우측: ProductSelector (검색 input + 드롭다운)
- 상품 선택 후엔 컴팩트 카드 모드: "🛍️ {상품명} ▾" — 클릭 시 다시 검색 모드로 전환 (productId 변경 가능)

### 슬롯 인라인 hub picker (신규)

각 ImageUploader 아래에 conditional 로 렌더:

```
[ 상품 사진 ]
[ ImageUploader ]   ← 기존 업로드 영역
┌─────────────────┐
│ 🛍️ 허브에서 선택 │   ← 인라인 picker 시작
│ [🖼️][🖼️][🖼️]   │   ← role-filtered 썸네일 그리드 (3-4열)
└─────────────────┘
```

조건:
- `productId` 없으면 picker 자체 안 렌더 (헤더에서 선택하라는 의미)
- `productId` 있고 해당 role 이미지 0장이면: "허브에 등록된 이미지 없음 · [이미지 허브로 이동]" 링크 (새 탭)
- `productId` 있고 1장 이상: 썸네일 그리드 표시. 클릭 = single-select (해당 슬롯 setter 호출).

### color-variants 인라인 hub picker (multi-toggle)

```
[ 색상별 사진 (3 / 8) ]
[ ColorVariantsUploader ]   ← 기존 multi-drop + 썸네일 그리드
┌─────────────────────┐
│ 🎨 허브에서 선택     │
│ [✓v1][v2][✓v3][v4]  │   ← color_variant role, 토글 add/remove
└─────────────────────┘
```

- 단일 picker 인스턴스. mode prop 으로 single/multi 구분.
- multi 모드: 클릭 = colorImages 배열에 add (이미 있으면 remove). 8장 cap.

### Use case 분기별 인라인 picker 매핑

| Case | 슬롯 → role 매핑 |
|---|---|
| compose | 상품 슬롯 → product · 보조 슬롯 → box (모드: single 둘 다) |
| color-variants | 드롭존 아래 → color_variant (모드: multi) |
| single | 상품 슬롯 → product (모드: single) |
| creative (탭) | 상품 슬롯 → product (모드: single). backgroundReference 슬롯엔 picker 없음 |

## Component Design

### New Component: `HubInlinePicker.tsx`

Path: `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx`

```tsx
type SelectMode = 'single' | 'multi';

interface Props {
  productId: string;       // non-null (caller guards)
  role: ProductImageRole;  // box / product / color_variant / size_chart / detail
  mode: SelectMode;
  selectedUrls: string[];  // currently selected URLs (for highlight + multi toggle)
  onSelect: (url: string) => void;  // called on click
                                    // single mode: caller does setSlot(url)
                                    // multi mode: caller does add/remove from array
  maxRemaining?: number;   // multi mode only — block click if remaining = 0
}
```

내부:
- `useProductImages(productId)` 로 images 로드 (React Query 수준의 캐싱 없지만, 같은 productId 호출 시 react state 별로 중복은 minor)
- `images.filter(img => img.role === role)` 결과 표시
- loading 시 작은 spinner
- 0장 시 "허브에 이미지 없음 · 이미지 허브로 이동" 링크 (`target="_blank"` `/image-hub?productId=...`)
- 썸네일 click → `onSelect(url)`. 부모가 single/multi 의미 부여.
- multi 모드 + maxRemaining === 0 시 클릭 차단 + toast `"최대 N장 (이미 가득)"`

### Changed Components

1. **`page.tsx`**
   - 신규 import: `ProductSelector`, `useRouter` from 'next/navigation'.
   - 제거: `import { HubImagePickerModal, type HubSelected }`.
   - 제거: `hubModalOpen` state + `setHubModalOpen`.
   - 제거: `handleHubApply` 함수 전체.
   - 제거: 본문 끝 `{productId && <HubImagePickerModal .../>}` 마운트.
   - 변경: 헤더 영역에 `ProductSelector` 추가. `selectedId={productId}`, `onSelect={(product) => router.replace(`/thumbnail-editor?productId=${product.id}`)}`.
   - `EditorInputPanel` props 정리: `hasProductId`, `onOpenHubModal` 제거. 새 props 추가:
     - `hubImagesByRole: { product: string[]; box: string[]; color_variant: string[]; size_chart: string[]; detail: string[] }` — 역할별 URL 배열. page.tsx 에서 `useProductImages(productId)` 호출하고 가공.
     - 또는 단순화: `productId: string | null` 그대로 전달 + InputPanel 안에서 `useProductImages` 직접 호출 (DRY 살짝 깨지지만 같은 productId 면 일관).

2. **`EditorInputPanel.tsx`**
   - 제거: hub button JSX (eng review #1 의 buttonSlot 블록).
   - 제거: `hasProductId`, `onOpenHubModal`, `FolderOpen` import (cn 은 유지).
   - 추가: 신규 import `HubInlinePicker` + `ProductImageRole` from `@/lib/hub-roles`.
   - 각 case 의 ImageUploader 아래에 `productId &&` 가드로 `<HubInlinePicker productId={productId} role="..." mode="single" selectedUrls={[productImage]} onSelect={onProductImageChange} />` 추가.
   - color-variants case: ColorVariantsUploader 아래에 `<HubInlinePicker mode="multi" role="color_variant" selectedUrls={colorImages} onSelect={...} maxRemaining={8 - colorImages.length} />`.

3. **`EditorControlPanel.tsx`** — 변화 없음 (purpose 제거는 v1 에서 완료).

### Header restructure pseudo-code

`page.tsx` header section:

```tsx
<div className="ed-header">
  <div className="ed-icon">...</div>
  <h1>썸네일 편집기</h1>
  <div className="ml-auto w-[280px]">
    {productId && productName ? (
      <CompactProductPill
        productName={productName}
        onChange={() => router.replace('/thumbnail-editor')}  // clears productId
      />
    ) : (
      <ProductSelector
        selectedId={null}
        onSelect={(p) => router.replace(`/thumbnail-editor?productId=${p.id}`)}
      />
    )}
  </div>
</div>
```

**채택 안: toggle 방식** — 상품 선택 전엔 ProductSelector (검색 input + 드롭다운). 선택 후엔 컴팩트 pill ("🛍️ {상품명} ▾") 로 변환. pill 클릭 시 URL 에서 productId 제거하고 다시 검색 모드로 복귀.

`CompactProductPill` 은 page.tsx 안에 인라인 컴포넌트 또는 작은 별도 파일 (취향). 인라인 권장 (YAGNI).

## Data Flow

```
사용자 /thumbnail-editor 진입 (productId 없음)
  ↓
헤더 ProductSelector 노출. 슬롯 인라인 picker 는 안 보임.
  ↓ 사용자 검색 → 선택
router.replace('?productId=...')
  ↓ Next 가 URL 변경 감지, page 재렌더
useQuery(products.detail) 가 productId 로 fetch → product 정보 헤더에 표시
  ↓ 사용자 용도 카드 선택
3패널 렌더. 각 슬롯 ImageUploader 아래 HubInlinePicker 노출.
  ↓ HubInlinePicker 가 useProductImages(productId) 호출 → role 별 썸네일
  ↓ 사용자 썸네일 클릭
single 모드: setProductImage / setPackagingImage 직접 호출 (props 경유)
multi 모드: setColorImages([...prev, url]) 또는 remove
  ↓ 편집 시작 → POST /api/thumbnail-editor/generate (변화 없음)
```

### URL state 동기화

- `productId` 는 URL query 가 single source of truth.
- 선택 / 변경 / 해제 모두 `router.replace` 로 URL 만 갱신. React state 동기화는 `useSearchParams` 가 자동 처리.
- 새로고침/공유 안전: `?productId=...` 가 URL 에 있으면 같은 상품 + hub picker 작동.

## Error Handling

- **상품 검색 실패**: ProductSelector 가 `catch(() => setResults([]))`. 결과 0장 = "검색 결과 없음" 표시 (현재 동작).
- **허브 fetch 실패**: `useProductImages` silent fallback to []. 인라인 picker 는 0장 empty state 표시. (TODOS.md 의 useProductImages error state 도입 시 별도 처리.)
- **multi-select cap (color-variants)**: maxRemaining=0 일 때 click 차단 + toast `"이미 8장 (최대)"`.
- **same image 두 번 click (multi 모드)**: toggle (remove).
- **single 모드에서 redundant click**: 같은 URL 재선택 = no-op (state 변화 없음).

## Testing

1. `cd apps/web && npm run build` — 성공
2. `cd apps/web && npx vitest run` — regression 없음
3. 수동 QA (Claude Preview 또는 직접):
   - (a) `/thumbnail-editor` 단독 진입 → 헤더에 검색 input 보임. 슬롯 인라인 picker 안 보임 (productId 없음).
   - (b) 검색 → 상품 선택 → URL 에 `?productId=...` 추가됨. 헤더가 "🛍️ {상품명}" 카드로 변환.
   - (c) 용도 카드 선택 (compose) → 각 슬롯 아래 인라인 hub picker 노출. product role / box role 각각 해당 슬롯 아래.
   - (d) product role 썸네일 1장 click → 상품 슬롯에 즉시 set. 헤더 변화 없음.
   - (e) box role 썸네일 1장 click → 보조 슬롯에 set.
   - (f) color-variants → 인라인 picker multi-toggle → colorImages 배열 add/remove. 8장 cap 검증.
   - (g) creative 탭 → 상품 슬롯 아래 product role picker 만 노출 (backgroundReference 없음).
   - (h) 허브 0장 인 case → "허브에 이미지 없음 · [이미지 허브로 이동]" 링크 표시.
   - (i) productId 변경 (헤더 카드 클릭 → 다시 검색 → 다른 상품) → URL 갱신 + 모든 인라인 picker 재로드.
   - (j) creative 의 backgroundReference 슬롯엔 picker 없음 (업로드만).
   - (k) HubImagePickerModal 어디서도 마운트 안 됨 (devtools React component tree).
   - (l) 편집 모드 ControlPanel 에 "편집 목적" 섹션 부재 (v1 에서 이미 처리, regression 검증).

## Constraints

- Next.js App Router `useRouter` + `router.replace`. 클라이언트 전용 (`'use client'`).
- ProductSelector 재사용 (변경 없음).
- `useProductImages` 재사용 (변경 없음).
- Tailwind + `cn()` + Lucide.
- 인라인 picker thumbnail 크기 ~50-60px (3-4 col grid in 240px wide panel).
- `loading="lazy"` on all img tags.

## File Impact Map

| 유형 | 파일 |
|---|---|
| 신규 | `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx` |
| 수정 | `apps/web/src/app/thumbnail-editor/page.tsx` (header에 ProductSelector + useRouter, hub modal state/handler/mount 모두 제거) |
| 수정 | `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` (hub 버튼 제거, 각 슬롯 아래 HubInlinePicker 마운트) |
| 수정 | `apps/web/src/app/thumbnail-editor/CLAUDE.md` (v2 redesign 기록) |
| 삭제 | `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` |

유지 (변화 없음):
- `apps/web/src/lib/hub-roles.ts`
- `apps/web/src/app/image-hub/components/ImageGrid.tsx` (v1 의 lazy + 공유상수 변경 그대로)
- `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx` (v1 purpose 제거 그대로)
- `apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts`

백엔드: 무변경.

## Open Questions

없음. 슬롯-role 매핑은 v1 에서 결정된 룰 그대로 적용 (compose: product+box / color-variants: color_variant / single: product / creative: product).
