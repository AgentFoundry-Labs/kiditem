# web/thumbnail-editor — Use-Case-Driven Generation + Mutation Workflow

11 파일. 썸네일 생성 standalone 페이지 (productId 옵션). **용도 카드 분기 + 3패널 + history sync** 가 핵심.

## Structure

```
thumbnail-editor/
├── page.tsx                       # 상태 기계 (mode + editCase) + 케이스별 payload 조립
├── components/
│   ├── UseCaseSelection.tsx       # 편집 탭 진입 카드 3개 (compose/color-variants/single)
│   ├── EditCaseBreadcrumb.tsx     # InputPanel 상단 "{용도} · ← 용도 변경" 버튼
│   ├── EditorInputPanel.tsx       # editCase 분기 렌더 (2슬롯 / multi-drop / 1슬롯 / creative)
│   ├── ColorVariantsUploader.tsx  # Type 2B — 2~8장 multi-drop + 썸네일 그리드 (X 삭제)
│   ├── ImageUploader.tsx          # 단일 슬롯 FileReader → dataURL
│   ├── EditorResultPanel.tsx
│   ├── EditorResult.tsx
│   ├── EditorHistoryTab.tsx
│   └── EditorControlPanel.tsx     # editCase 분기 (pieceCount · supplementaryLabel · scene presets 5개)
└── hooks/
    ├── useThumbnailEditor.ts      # useGenerateThumbnail (GenerateRequest 타입)
    └── useOriginalImage.ts        # 상품 이미지 fetch
```

## 핵심 패턴

### 1. 용도 카드 분기 (편집 탭 진입 시)

`page.tsx` — 편집 탭 진입 시 `editCase === null` 이면 `UseCaseSelection` 전체 화면 렌더 (3카드: `compose` / `color-variants` / `single`). 카드 클릭 → 3패널 전환. InputPanel 상단 `EditCaseBreadcrumb` 로 "← 용도 변경" (editCase 리셋).

**AI 연출 탭은 용도 분기 없음** — 바로 3패널.

### 2. Case-specific 입력 / 페이로드

| editCase | Input 패널 | 추가 컨트롤 | 전송 필드 |
|---|---|---|---|
| compose | 상품 + 보조 이미지 슬롯 | supplementaryLabel 드롭다운 (5개), pieceCount 숫자 | productImage, packagingImage, supplementaryLabel, pieceCount |
| color-variants | multi-drop 존 (2~8장) | — | colorImages, colorCount=length (productImage 미포함) |
| single | 상품 슬롯 1개 | — | productImage |
| creative | 상품 슬롯 + (custom-reference 선택 시) 참고 이미지 슬롯 | 씬 5프리셋 + 분위기 4프리셋 + productDescription | productImage, sceneType (custom-reference는 undefined), styleType, productDescription, backgroundReference (custom-reference만) |

`sceneType === 'custom-reference'` 는 **UI 전용 값** — 백엔드 `CREATIVE_PROMPT` 는 4개 프리셋만 해석하므로 전송 전 `undefined` 로 스트립.

### 3. State reset 정책

- `← 용도 변경` 클릭 시: editCase, packagingImage, colorImages, supplementaryLabel, pieceCount, userPrompt, result, generationId, selectedCandidateUrl 모두 리셋. `productImage` / `productName` 은 보존 (같은 상품 다른 용도).
- **탭 전환 (edit ↔ creative)**: state 보존. 탭 비교 시 입력이 날아가면 UX 저하.

### 4. Standalone Generation — productId 옵션

productId 는 context 로드용 (없어도 동작). 신규 상품 등록 전에도 썸네일 미리 생성 가능.

### 5. Mutation-Driven Workflow

**Polling 없음**. 흐름:
1. `useGenerateThumbnail()` mutation → `{ candidates, generationId }` 반환
2. 사용자가 candidate 선택 → `useSelectCandidate()` (thumbnails 도메인 hook 공유)
3. Apply 또는 Skip → `useApplyGeneration()` / `useSkipGeneration()`

각 단계는 mutation. 폴링 안 씀 (즉시 응답).

### 6. Immediate History Sync

Generation 후 `queryClient.invalidateQueries(queryKeys.thumbnailAnalysis.generations())` — thumbnails 페이지의 history 탭이 즉시 갱신 (cross-page 일관성).

### 7. ImageUploader — FileReader 추상화

`components/ImageUploader.tsx` — File → dataURL 변환 로직 컴포넌트화. Creative 상품 / 참고 이미지, compose 상품 / 보조 이미지, single 상품 슬롯에서 재사용. Type 2B 색상별은 별도 `ColorVariantsUploader` (multi-drop + 그리드).

## Rules

- `purpose` 필수 (backend DTO). creative 모드는 자동으로 `'quality'` 세팅, edit 모드는 사용자 토글.
- `composition` freeform 필드는 사용하지 않음 (백엔드 DTO 에 없음). 구조화된 `pieceCount` / `colorCount` 로 대체.
- `sceneType: 'custom-reference'` 는 UI-only — payload 조립 시 `undefined` 로 스트립.
- colorImages 는 2장 미만이면 생성 버튼 비활성. `colorCount` 는 배열 length 로 자동 세팅.
- 탭 전환은 state 보존, "← 용도 변경" 만 리셋.
- Image URL 은 data URL 형식 (외부 CDN 업로드 안 함).
- `selectedCandidateUrl` 이 apply/skip 버튼 활성화 게이트.

## Prohibits

- ❌ Result state 폴링 (mutation-driven 의도)
- ❌ Canvas 변형 (generation 은 API only)
- ❌ Upload 이미지 resize/validation (raw 그대로 전송)

## Cross-domain deps

- `@kiditem/shared` — `ThumbnailGenerationItem` (공유 hook 통해)
- `apiClient` — `/api/thumbnail-editor/generate`, `/api/products/{id}`, `/api/thumbnail-analysis/generations/*`
- Thumbnails 도메인 hooks: `useSelectCandidate`, `useApplyGeneration`, `useSkipGeneration` (재사용)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| editCase 타입 / 용도 추가 | `UseCaseSelection.tsx` (카드 + `EditUseCase` export) + `page.tsx` resetEditCase + `EditorInputPanel.tsx` 분기 + `EditorControlPanel.tsx` 분기 |
| supplementaryLabel 옵션 변경 | `EditorInputPanel.tsx` `SUPPLEMENTARY_LABELS` 상수 (export) + `page.tsx` 기본값 |
| 씬 프리셋 추가/변경 | `EditorControlPanel.tsx` `SCENE_PRESETS` + 백엔드 `CREATIVE_PROMPT` scene 블록 (쌍으로) |
| Payload 필드 추가 | `hooks/useThumbnailEditor.ts` `GenerateRequest` + 백엔드 `thumbnail-editor.dto.ts` (DTO whitelisted) + `page.tsx` `handleGenerate` |
| colorImages min/max 변경 | `ColorVariantsUploader.tsx` + 백엔드 `thumbnail-editor.dto.ts` `ArrayMinSize/MaxSize` (쌍으로) |
| Candidate 표시 변경 | `EditorResultPanel.tsx` + `EditorResult.tsx` |
| Image source 추가 (단일 슬롯) | `ImageUploader.tsx` (FileReader 패턴) |
| Multi-drop 업로더 변경 | `ColorVariantsUploader.tsx` (FileReader 패턴, accessibility 유지) |
