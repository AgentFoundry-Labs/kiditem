# Thumbnail Editor: Hub Import + Quality Toggle Removal

## Problem

썸네일 편집기에서 두 개의 개선이 필요하다.

1. **'편집 목적' 토글의 실제 가치가 애매하다.** `purpose: 'compliance'` 는 정책 위반 제거 (텍스트 오버레이/배지/흰배경 정리) 목적이 명확하지만, `purpose: 'quality'` 는 "깨끗한 흰배경 사진을 Gemini 에 다시 태워 조명·샤픈만 살짝" 을 노리는데 결과물 차별성이 약하다. 품질 향상이 진짜 필요하면 'AI 연출' 탭의 씬/분위기 프리셋이 훨씬 효과적이다. 편집 탭에 두 선택지를 제공하는 것은 결정 피로 (decision fatigue) 만 만든다.
2. **편집기가 이미지 허브와 단절돼 있다.** 사용자는 `/image-hub` 에 상품별로 이미지를 role (product/box/color_variant/size_chart/detail) 별로 관리·저장한다. 그러나 편집기에서 생성을 돌릴 때는 매번 파일을 다시 업로드해야 한다. 허브에 이미 있는 이미지를 바로 선택할 수 있어야 한다.

## Scope

프론트엔드만. 백엔드 API·DTO·프롬프트 변경 없음.

- 영향 범위: `apps/web/src/app/thumbnail-editor/` 일체
- 제거: 편집 모드 '편집 목적' 토글 섹션 (UI 한정)
- 신규: Input 패널 상단 "이미지 허브에서 불러오기" 버튼 + 모달 + role→slot 자동 매핑
- 재사용: `useProductImages(productId)` hook (기존)

Non-goals:

- 허브 내용 편집 (모달에서는 읽기 전용, 수정은 `/image-hub` 에서)
- 모달에서 허브 업로드 지원 (편집기 외부에서 업로드 후 재진입)
- creative 탭의 `backgroundReference` 슬롯 허브 연동 (허브에 분위기 참고 role 없음)
- 백엔드 DTO 에서 `purpose` 필드 제거 (다른 호출자 [thumbnail-edit.service.ts] 에서 여전히 사용)
- 백엔드 `QUALITY_EDIT_PROMPT` 상수 삭제 (batch 편집에서 사용)

## Key Assumptions

- `productId` query param 으로 편집기에 진입하면 허브 임포트가 활성화된다. 없으면 버튼 비활성.
- 허브 이미지는 MinIO URL 형식 (`http://localhost:9000/kiditem/product-images/...`). 편집기가 기대하는 payload 는 data URL 또는 URL — 컨트롤러의 `resolveImage()` 가 `http*` 로 시작하면 base64 로 fetch 한다. 따라서 허브 URL 그대로 전송 가능.
- 편집기 내부 상태는 `productImage: string | null` / `packagingImage: string | null` / `colorImages: string[]` — URL 또는 data URL 모두 허용.
- 허브에 이미지가 0장인 경우 모달은 "등록된 이미지 없음" 상태로 표시.

## Information Architecture

### 1️⃣ 품질 개선 토글 제거

**편집 모드 ControlPanel 에서:**

기존:
```
편집 설정
├── 편집 목적 [🔘 가이드라인 수정 ⚪ 품질 개선]  ← 제거
├── 개입 수 (compose 에만)
├── 편집 지시사항
└── 편집 시작
```

변경 후:
```
편집 설정
├── 개입 수 (compose 에만)
├── 편집 지시사항
└── 편집 시작
```

페이로드 구성 시 편집 모드는 항상 `purpose: 'compliance'`. 상태 `purpose` 및 핸들러 `onPurposeChange` 는 `EditorControlPanel` props 에서 제거. `page.tsx` 의 `useState` 도 제거.

### 2️⃣ 허브 임포트 엔트리

**Input 패널 상단에 버튼 추가** (breadcrumb 바로 아래):

```
┌──────────────────────────────┐
│ 상품+박스/세트 합성 · ← 용도 변경 │  ← breadcrumb (기존)
├──────────────────────────────┤
│ 📂 이미지 허브에서 불러오기      │  ← NEW (풀 너비)
├──────────────────────────────┤
│ 이미지 입력                   │  ← 기존 헤더
│ ...                          │
```

- `productId` 없음 → 버튼 비활성 (`disabled=true`) + 툴팁 "상품 선택 후 사용 가능"
- `productId` 있음 + 허브 이미지 0장 → 버튼은 활성, 클릭 시 모달에서 empty state 노출
- 버튼은 creative 탭에서도 노출 (creative 상품 슬롯용). 단 `backgroundReference` 연동은 없음.

### 3️⃣ 모달 내부 레이아웃

```
┌────────────────────────────────────────────┐
│ 이미지 허브 — 색칠하는에어글라이더            │
│ 현재 용도: 색상별 상품 배치                    │
├────────────────────────────────────────────┤
│                                            │
│  🛍️ product (2)                            │  ← 모든 role 섹션 노출
│  [img] [img] [+]                           │
│                                            │
│  📦 box (1)                                │
│  [img]                                     │
│                                            │
│  🎨 color_variant (3)  ← 매칭 (활성)        │
│  [✓①img] [✓②img] [✓③img]                  │
│                                            │
│  📐 size_chart (0)                         │  ← 흐리게
│  (이미지 없음)                               │
│                                            │
│  📄 detail (5)                             │  ← 흐리게
│  [img] [img] [img] [img] [img]            │
│                                            │
├────────────────────────────────────────────┤
│ 3장 선택됨           [취소]  [3장 가져오기 ▸] │
│                                            │
│ 🔗 이미지 허브에서 편집 →                    │
└────────────────────────────────────────────┘
```

- **헤더**: 상품명 + 현재 용도 (editCase → 한글 라벨). creative 탭일 땐 "현재 용도: AI 연출" 표시.
- **role 섹션**: 5개 role 모두 섹션으로 노출. 각 섹션 헤더에 role 라벨 + 이미지 수.
- **활성 vs 흐림**: 현재 용도에 매칭되는 role 섹션만 선택 가능 (썸네일 hover 반응, 체크박스 가능). 나머지 role 섹션은 `opacity-50 pointer-events-none` 으로 흐리게.
- **썸네일 체크박스**: 클릭 시 보라 테두리 + 좌상단 순번 badge (선택된 순서). 같은 썸네일 재클릭 → 선택 해제.
- **하단 액션 바**: "N장 선택됨 | [취소] [N장 가져오기]". `N === 0` 시 "가져오기" 비활성.
- **허브 편집 링크**: 하단에 `/image-hub?productId={id}` 링크 작은 글씨. **`target="_blank" rel="noreferrer"` 로 새 탭에서 열림** (현재 편집 상태 보존).

### role → slot 매핑 규칙

| editCase | 매칭 role | 슬롯 규칙 |
|---|---|---|
| `compose` | `product` + `box` | 총 최대 2장. 순번 1번 썸네일 role 이 그 슬롯으로 → product 1번째는 상품, box 1번째는 보조. 순번 2번은 남은 슬롯으로 배정 (product 2장 = 상품+보조, box 2장 금지). 순번 badge 가 시각적 매핑 안내. |
| `color-variants` | `color_variant` | 2~8장 → colorImages 배열에 **append**. 기존 + 신규 합계가 8 초과 시 초과분 버리고 toast 경고 "최대 8장까지 가능합니다". |
| `single` | `product` | 1장만 → 상품 슬롯. 2장 이상 체크하려 하면 기존 체크 해제 후 새로 선택 (single-select 동작). |
| `creative` (탭 전체) | `product` | 1장만 → 상품 슬롯. color-variants 와 동일 single-select. |

**모달 적용 시 editCase/tab 별 count 상한:**
- `single` / `creative` (상품 슬롯): **총 최대 1장**. 이미 1장 체크된 상태에서 다른 썸네일 체크 시 기존 체크 자동 해제 (single-select 라디오 동작).
- `compose`: **총 최대 2장** (상품 슬롯 + 보조 슬롯 합계). 유효 조합은 `product 1`, `product 2`, `product 1 + box 1`, `box 1`. **`box` role 은 최대 1장** (2장째 체크 차단). 2장 차면 "가져오기" 버튼 라벨 "2장 가져오기" 로 확정, 추가 썸네일 체크 차단 + hint "상품+박스 합성은 최대 2장".
- `color-variants`: **총 최대 `8 - colorImages.length` 장**. 남은 슬롯이 0이면 체크 불가 + hint "이미 8장 (최대)".

## Component Design

### New Components

1. **`HubImagePickerModal.tsx`**
   - Props:
     ```ts
     interface Props {
       open: boolean;
       productId: string;
       productName: string;
       editCase: EditUseCase | null;
       mode: 'edit' | 'creative';
       existingColorImagesCount: number;  // color-variants append 상한 계산용
       onClose: () => void;
       onApply: (selected: Selected) => void;
     }

     type Selected =
       | { kind: 'single'; url: string }                             // single / creative
       | { kind: 'compose'; productUrl?: string; boxUrl?: string }   // compose
       | { kind: 'color-variants'; urls: string[] };                 // color-variants
     ```
   - 내부 상태: `selectedIds: string[]` (role+URL 조합 기반 id 또는 index 기반).
   - 자식: role 섹션 렌더러 (`RoleSection` 내부 컴포넌트 또는 인라인).
   - `useProductImages(productId)` 로 이미지 로드.

2. **`HubImportButton.tsx`** (선택 사항 — 버튼 로직 분리)
   - Input 패널 상단의 "허브에서 불러오기" 버튼 컴포넌트.
   - 사실상 간단한 button 이라 별도 컴포넌트 필요 없음. EditorInputPanel 안에 인라인 구현 권장 (YAGNI).

### Changed Components

1. **`page.tsx`**
   - 상태 추가: `hubModalOpen: boolean`.
   - 상태 제거: `purpose: 'compliance'|'quality'`, 관련 핸들러 `onPurposeChange`, 전파 props.
   - 새 핸들러 `handleHubApply(selected: Selected)`:
     - `single` / creative: `setProductImage(selected.url)`
     - `compose`: `setProductImage(selected.productUrl ?? productImage); setPackagingImage(selected.boxUrl ?? packagingImage)`
     - `color-variants`: `setColorImages(prev => [...prev, ...selected.urls].slice(0, 8))` + toast if trimmed
   - `handleGenerate` payload: edit 모드 `purpose: 'compliance'` 하드코딩 (분기 제거).
   - EditorControlPanel props 에서 `purpose`, `onPurposeChange` 제거.

2. **`EditorInputPanel.tsx`**
   - 새 props: `hasProductId: boolean`, `onOpenHubModal: () => void`.
   - breadcrumb 아래, "이미지 입력" 헤더 위에 허브 버튼 렌더.
   - `hasProductId === false` 시 비활성.

3. **`EditorControlPanel.tsx`**
   - Props 에서 `purpose`, `onPurposeChange` 제거.
   - edit 모드 렌더에서 "편집 목적" 토글 섹션 통째로 삭제.
   - 나머지는 동일 (pieceCount / userPrompt / 편집 시작 버튼).

## Data Flow

```
사용자 편집 탭 → 용도 카드 선택 → 3패널
                                ↓
            Input 패널 상단: [📂 이미지 허브에서 불러오기]
                                ↓ 클릭
                hubModalOpen = true → HubImagePickerModal 렌더
                                ↓
             useProductImages(productId) 로 images 로드
                                ↓
                역할 섹션 그리드 (모든 role), 현재 용도 매칭만 활성
                                ↓ 사용자 체크박스 선택
                하단 "N장 가져오기" 클릭 → onApply(selected)
                                ↓
              page.handleHubApply(selected):
                - single/creative: setProductImage(url)
                - compose: setProductImage / setPackagingImage
                - color-variants: setColorImages(prev + urls, max 8)
                                ↓
                hubModalOpen = false → 모달 닫힘
                                ↓
        기존 흐름 (생성 버튼 → POST /api/thumbnail-editor/generate)
```

### Slot state before/after apply

- **single 예**: `productImage: null` → hub img URL 선택 → `productImage: 'http://.../product-images/{id}/uuid.jpg'`. 컨트롤러가 `resolveImage` 로 fetch.
- **compose 예**: `productImage: null, packagingImage: null` → product 2장 체크 → 각각 상품/보조 슬롯.
- **color-variants 예 (append)**: `colorImages: ['data:image/png;base64,abc']` (1장 업로드) → 허브에서 2장 추가 선택 → `colorImages: ['data:image/png;base64,abc', 'http://.../c1.jpg', 'http://.../c2.jpg']` (3장).

## Error Handling

- **productId 없이 버튼 클릭 시도**: 버튼이 비활성이라 일어나지 않음. 방어적으로 `handleHubApply` 호출 시 productId null 이면 no-op.
- **허브 로드 실패**: `useProductImages` 가 `catch(() => setImages([]))` 처리 중. 모달에선 "등록된 이미지 없음" 표시.
- **8장 초과 (color-variants)**: append 시 `[...prev, ...newUrls].slice(0, 8)` + `toast.error('최대 8장까지 가능합니다 (초과분 무시)')`.
- **선택 0장으로 "가져오기" 클릭**: 버튼 자체 비활성 (`disabled={selectedCount === 0}`).
- **역할 불일치 선택 시도**: 흐린 섹션은 `pointer-events-none` 이라 클릭 자체가 안 됨.
- **같은 이미지 체크 2번**: toggle 로 해제.

## Testing

1. `cd apps/web && npm run build` — 성공
2. `cd apps/web && npx vitest run` — 기존 regression 없음
3. 수동 QA (Claude Preview):
   - (a) `?productId=<id>` 없이 진입 → 편집 모드 진입 → 용도 카드 선택 → "📂 허브" 버튼 비활성 + 툴팁 확인
   - (b) productId 있음 → compose 카드 선택 → 모달 오픈 → product/box role 만 활성 / 다른 role 흐리게 → product 1장 + box 1장 선택 → "2장 가져오기" → 상품/보조 슬롯 둘 다 세팅 확인
   - (c) color-variants → 허브에서 3장 선택 → append → 드롭존에 3장 썸네일 뜨는지 확인
   - (d) color-variants 에서 이미 8장 있는 상태 → 허브 모달 → 체크 불가 + hint 표시
   - (e) single → 허브 product 1장 선택 → 슬롯 세팅 후 모달 닫힘
   - (f) creative → 허브 product 1장 선택 → creative 상품 슬롯 세팅. `sceneType` / `backgroundReference` 기존 상태 보존
   - (g) edit 모드 ControlPanel 에 "편집 목적" 섹션 없어진 것 확인 (모든 editCase)
   - (h) 편집 생성 API 호출 시 payload 에 항상 `purpose: 'compliance'` 전송 확인 (devtools Network)

## Constraints

- `apiClient` 사용 (raw fetch 금지). `useProductImages` hook 이 이미 준수.
- Tailwind + `cn()` + Lucide 아이콘.
- `'use client'` 필수.
- 모달 — Radix UI Dialog 사용 권장 (기존 `components/ui` 에 Dialog 있는지 확인). 없으면 단순 포털 + overlay 직접 구현.
- 이미지 URL 처리 — 허브 URL (`http://*`) 을 그대로 편집기 상태 · payload 로 사용. 서버 `resolveImage` 가 처리.

## File Impact Map

| 유형 | 파일 |
|---|---|
| 신규 | `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` |
| 수정 | `apps/web/src/app/thumbnail-editor/page.tsx` (상태 + 모달 트리거 + 적용 핸들러, purpose 제거) |
| 수정 | `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` (허브 버튼 + modal open prop) |
| 수정 | `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx` (purpose 토글 섹션 제거) |
| 수정 | `apps/web/src/app/thumbnail-editor/CLAUDE.md` (허브 연동 문서화) |

백엔드·DTO·스키마: **무변경**.

## Open Questions

없음. 모든 결정 브레인스토밍 단계에서 확정.

---

## Eng Review Findings (2026-04-16)

`/plan-eng-review` 통과. 11개 이슈 · 0 critical gaps · 0 unresolved. Plan 에 반영 필요한 보강:

**Architecture:**
1. `ROLE_CONFIG` 공유 상수 추출 (`apps/web/src/lib/hub-roles.ts` 신규) — `image-hub/components/ImageGrid.tsx` + `HubImagePickerModal.tsx` 양쪽에서 import. drift 방지.
2. `productId` null 가드: `{hubModalOpen && productId && <HubImagePickerModal productId={productId} ... />}` 로 narrowing.

**Code Quality:**
3. 로딩 상태 UI: 모달 content 에 `loading` 시 Loader2 스피너 (`/image-hub/page.tsx:167-170` 패턴 재사용).
4. Modal max-height: Dialog.Content `max-h-[85vh] overflow-hidden`, body `overflow-y-auto`, footer sticky.
5. Stale 데이터 refresh: "🔗 이미지 허브에서 편집 →" 링크 클릭 시 `onClose()` 호출 → 재오픈 시 useEffect 재실행되며 fresh fetch.
6. Compose role→slot 매핑 규칙 명확화: product → 상품 슬롯 (기본), box → 보조 슬롯 (기본), product 2장 시 첫번째 상품 / 두번째 보조.

**Test:**
7. QA 시나리오 (i) 로딩 상태 — 네트워크 throttle 로 스피너 확인
8. QA 시나리오 (j) 단일 선택 라디오 — single/creative 에서 A→B 체크 시 A 자동 해제
9. QA 시나리오 (k) "가져오기" disabled — 0장 선택 상태
10. QA 시나리오 (l) 취소 → 재오픈 시 state 리셋

**Performance:**
11. 모든 `<img>` 에 `loading="lazy"` 속성.

**Critical gap (NOT blocking, TODO 로 이월)**: `useProductImages` silent fail → `TODOS.md` 에 후속 PR 등록.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR (PLAN) | 11 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0 decisions.
**VERDICT:** ENG CLEARED — 11 보강 사항을 plan (`writing-plans` 단계) 에 반영하면 구현 가능.
