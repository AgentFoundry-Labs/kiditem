# web/thumbnail-editor — Standalone Generation + Mutation-Driven Workflow

9 파일. 썸네일 생성 standalone 페이지 (productId 옵션). **Split panel + history sync** 가 핵심.

## Structure

```
thumbnail-editor/
├── page.tsx                # split-panel (input + result)
├── components/
│   ├── EditorInputPanel.tsx
│   ├── EditorResultPanel.tsx
│   ├── EditorResult.tsx
│   ├── EditorHistoryTab.tsx
│   ├── ImageUploader.tsx
│   └── ThumbnailEditorView.tsx
└── hooks/
    ├── useThumbnailEditor.ts   # useGenerateThumbnail
    └── useOriginalImage.ts     # 상품 이미지 fetch (별도 도메인 graphify-out 의 useOriginalImage)
```

## 핵심 패턴

### 1. Standalone Generation — productId 옵션

`page.tsx:39-44, 57-76` — packagingImage / productImage / purpose 만 필수. productId 는 context 로드용 (없어도 동작).

useCase: 신규 상품 등록 전에도 썸네일 미리 생성 가능.

### 2. Mutation-Driven Workflow

**Polling 없음**. 흐름:
1. `useGenerateThumbnail()` mutation → `{ candidates, generationId }` 반환
2. 사용자가 candidate 선택 → `useSelectCandidate()` (thumbnails 도메인 hook 공유)
3. Apply 또는 Skip → `useApplyGeneration()` / `useSkipGeneration()`

각 단계는 mutation. 폴링 안 씀 (즉시 응답).

### 3. Immediate History Sync

page.tsx:70 — generation 후 `queryClient.invalidateQueries(queryKeys.thumbnailAnalysis.generations())`. 

**효과**: thumbnails 페이지의 history 탭이 즉시 갱신됨 (cross-page 일관성).

### 4. Split Panel — 독립 패널

EditorInputPanel + EditorResultPanel 완전 분리. Local state 공유 안 함 (page.tsx 가 props drilling).

### 5. ImageUploader — FileReader 추상화

`components/ImageUploader.tsx` — File → dataURL 변환 로직 컴포넌트화. 다른 도메인에서도 재사용 가능.

## Rules

- `purpose` (compliance | quality) 필수 (generation 호출 시)
- EditorResultPanel 은 page.tsx 의 result state 읽음 (query 아님)
- Image URL 은 data URL 형식 (외부 CDN 업로드 안 함)
- `queryKeys.products.detail(productId)` 는 product context 로드용 만
- `selectedCandidateUrl` 이 apply/skip 버튼 활성화 게이트

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
| Purpose enum 추가 | `page.tsx` purpose state 타입 + 백엔드 `thumbnail-editor.controller.ts` enum |
| Candidate 표시 변경 | `EditorResultPanel.tsx` + `EditorResult.tsx` |
| Generation 응답 형식 | `useThumbnailEditor.ts` + 백엔드 응답 타입 + `EditorResultPanel.tsx` rendering |
| History sync 변경 | `page.tsx:70` invalidate key — thumbnails 페이지 동기화 영향 |
| Image source 추가 | `ImageUploader.tsx` (FileReader 패턴 따르기) |
