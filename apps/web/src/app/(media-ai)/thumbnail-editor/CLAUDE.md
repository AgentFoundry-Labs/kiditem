# web/thumbnail-editor — Use-Case-Driven Generation + Mutation Workflow

썸네일 생성 standalone 페이지 (productId 옵션) + edit route. **용도 카드 분기 + 슬롯 기반 입력 + 결과/히스토리 sync** 가 핵심.

## Structure

```
thumbnail-editor/
├── page.tsx                       # 상태 기계 (mode + editCase) + 케이스별 payload 조립
├── components/
│   ├── ModeShowcase.tsx           # 허브 진입 카드 (edit/creative)
│   ├── ModeCaseModal.tsx          # edit workspace 모드/케이스 선택
│   ├── EditorInputPanel.tsx       # editCase 분기 렌더 (2슬롯 / multi-drop / 1슬롯 / creative)
│   ├── EditorResultPanel.tsx
│   ├── SlotCard.tsx               # 슬롯별 이미지 source drawer 진입점
│   ├── ImageSourceDrawer.tsx      # upload / hub / prev-gen / other-product 선택
│   ├── HubUploadZone.tsx          # FileReader → dataURL 업로드
│   └── EditorControlPanel.tsx     # editCase 분기 (pieceCount · supplementaryLabel · scene presets 5개)
├── edit/                          # generationId 기반 edit page + slot helpers/history hook
└── hooks/
    └── useThumbnailEditor.ts      # useGenerateThumbnail (GenerateRequest 타입)
```

## 핵심 패턴

### 1. 용도 카드 분기 (편집 탭 진입 시)

`page.tsx` — 허브는 `ModeShowcase` 에서 edit/creative 업로드 진입을 고르고, `edit/page.tsx` 는 `ModeCaseModal` 로 모드/케이스를 바꾼다. `editCase` 는 처음엔 `single` 로 시작하고, 슬롯에 packaging/color/bundle 이미지를 추가하면 슬롯 구성 기준으로 자동 승격된다.

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

### 6. 이미지 허브 임포트 (인라인)

페이지 헤더의 `ProductSelector` 로 productId 를 URL `?productId=...` 동기화. 각 슬롯은 `SlotCard` → `ImageSourceDrawer` 를 통해 허브 이미지, 업로드, 이전 생성 이미지, 다른 상품 이미지를 선택한다. 허브 이미지는 role 필터로 표시하고 클릭 시 slot setter 로 반영한다.

- 헤더: productId 없으면 ProductSelector (검색 input + 드롭다운). 있으면 컴팩트 pill ("🛍️ {상품명} ▾"). pill 클릭 시 productId 해제 + 슬롯 상태 리셋.
- 슬롯-role 매핑: compose 상품 → product / compose 보조 → box / single → product / creative 상품 → product / color-variants → color_variant. backgroundReference 는 매칭 role 없음 (업로드만).
- 모드: 단일 슬롯은 single (클릭 = setSlot). color-variants 는 multi (클릭 = colorImages 토글, max 8).
- 빈 상태: "허브에 등록된 이미지 없음 · 이미지 허브로 이동" 링크 (새 탭).
- URL 동기화: 상품 선택 시 `router.replace('?productId=...')`. 새로고침/공유 안전.
- v1 의 `HubImagePickerModal` 은 사용 안 함 (삭제됨).

### 7. Immediate History Sync

Generation 후 `queryClient.invalidateQueries(queryKeys.thumbnailAnalysis.generations())` — thumbnails 페이지의 history 탭이 즉시 갱신 (cross-page 일관성).

### 8. SlotCard / ImageSourceDrawer — 이미지 source 추상화

`components/SlotCard.tsx` — 슬롯 UI 와 source badge / clear / remove 동작을 소유한다.
`components/ImageSourceDrawer.tsx` — upload / hub / prev-gen / other-product source 선택을 소유한다.
`components/HubUploadZone.tsx` — File → dataURL 변환을 소유한다.
색상별/번들 multi-add 는 `EditorInputPanel` 의 `AddSlotTile` + `ImageSourceDrawer` multi 모드로 처리한다.

## Rules

- `purpose` 토글 제거 (2026-04-16 이후). edit 모드는 항상 `purpose: 'compliance'` 하드코딩. creative 는 자동 `'quality'`. 백엔드 DTO `purpose` 필드는 batch edit 에서 여전히 사용.
- `composition` freeform 필드는 사용하지 않음 (백엔드 DTO 에 없음). 구조화된 `pieceCount` / `colorCount` 로 대체.
- `sceneType: 'custom-reference'` 는 UI-only — payload 조립 시 `undefined` 로 스트립.
- colorImages 는 2장 미만이면 생성 버튼 비활성. `colorCount` 는 배열 length 로 자동 세팅.
- 탭 전환은 state 보존, "← 용도 변경" 만 리셋.
- Image URL 은 data URL 형식 (외부 CDN 업로드 안 함).
- `selectedCandidateUrl` 이 apply/skip 버튼 활성화 게이트.
- 헤더 ProductSelector → URL `?productId=...` (router.replace) — 새로고침/공유 안전.
- 슬롯 hub 인라인 picker 는 `productId &&` 가드. productId 없으면 picker 숨김 (헤더에서 선택 유도).

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
| editCase 타입 / 용도 추가 | `UseCaseSelection.tsx` (`EditUseCase` type boundary) + `ModeCaseModal.tsx` + `edit/page.tsx` mode/case 전환 + `EditorInputPanel.tsx` 분기 + `EditorControlPanel.tsx` 분기 |
| supplementaryLabel 옵션 변경 | `EditorInputPanel.tsx` `SUPPLEMENTARY_LABELS` 상수 (export) + `page.tsx` 기본값 |
| 씬 프리셋 추가/변경 | `EditorControlPanel.tsx` `SCENE_PRESETS` + 백엔드 `CREATIVE_PROMPT` scene 블록 (쌍으로) |
| Payload 필드 추가 | `hooks/useThumbnailEditor.ts` `GenerateRequest` + 백엔드 `thumbnail-editor.dto.ts` (DTO whitelisted) + `page.tsx` `handleGenerate` |
| colorImages min/max 변경 | `EditorInputPanel.tsx` 의 `GROUP_MIN/GROUP_MAX` + 백엔드 `thumbnail-editor.dto.ts` `ArrayMinSize/MaxSize` (쌍으로) |
| Candidate 표시 변경 | `EditorResultPanel.tsx` |
| Image source 추가 (단일 슬롯) | `SlotCard.tsx` + `ImageSourceDrawer.tsx` + `HubUploadZone.tsx` |
| Multi-drop 업로더 변경 | `EditorInputPanel.tsx` `AddSlotTile` + `ImageSourceDrawer.tsx` multi 모드 |
| ROLE_CONFIG 변경 (role 추가 등) | `apps/web/src/lib/hub-roles.ts` (단일 source) + `image-hub/components/ImageGrid.tsx` + `ImageSourceDrawer.tsx` |
| 허브 role → 편집기 슬롯 매핑 규칙 | `EditorInputPanel.tsx` 의 `SlotCard` / `AddSlotTile` role prop. role-slot 매핑 변경 시 EditorInputPanel 해당 case 블록 수정 |
| ProductSelector / URL 동기화 | `page.tsx` `handleProductSelect`, `handleClearProduct` + `useRouter`. 검색 컴포넌트 변경 시 `apps/web/src/components/product/ProductSelector.tsx` |
