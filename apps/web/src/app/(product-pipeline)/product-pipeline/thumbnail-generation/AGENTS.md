# web/thumbnail-generation — Use-Case-Driven Generation + Mutation Workflow

썸네일 생성 standalone 페이지 + edit route. **용도 카드 분기 + 슬롯 기반 입력 + 결과/히스토리 sync** 가 핵심.

## Structure

```
thumbnail-generation/
├── page.tsx                       # standalone hub entry + workspace query state handoff
├── components/
│   ├── hub/                       # standalone hub entry, queues, fix-needed sections
│   │   ├── ModeShowcase.tsx       # 허브 진입 카드 (edit/creative)
│   │   └── HubUploadZone.tsx      # FileReader → dataURL 업로드
│   ├── input/                     # slot/image source workflow
│   │   ├── EditorInputPanel.tsx   # editCase 분기 렌더 (2슬롯 / multi-drop / 1슬롯 / creative)
│   │   ├── SlotCard.tsx           # 슬롯별 이미지 source drawer 진입점
│   │   └── ImageSourceDrawer.tsx  # upload / generated assets / prev-gen / other-product 선택
│   ├── control/                   # mode/use-case/layout controls
│   │   ├── ModeCaseModal.tsx      # edit workspace 모드/케이스 선택
│   │   └── EditorControlPanel.tsx # editCase 분기 (pieceCount · supplementaryLabel · scene presets 5개)
│   ├── result/                    # generated candidate result selection
│   └── shared/                    # route-local presentational primitives
├── edit/                          # mode/editCase 상태 기계 + payload 조립 + slot helpers/history hook
└── hooks/
    └── useThumbnailEditor.ts      # useGenerateThumbnail (GenerateRequest 타입)
```

## 핵심 패턴

### 1. 용도 카드 분기 (편집 탭 진입 시)

`page.tsx` — 허브는 `ModeShowcase` 에서 edit/creative 진입을 고르고,
workspace 에서 넘어온 image/product/subject query state 를 edit route 로 넘긴다.
`edit/page.tsx` 는 `ModeCaseModal` 로 모드/케이스를 바꾼다.
`editCase` 는 `single` 로 시작하고 슬롯 구성에 따라 자동 승격된다.

**AI 연출 탭은 용도 분기 없음** — 바로 3패널.

### 2. Case-specific 입력 / 페이로드

| editCase | Input 패널 | 추가 컨트롤 | 전송 필드 |
|---|---|---|---|
| compose | 상품 + 보조 이미지 슬롯 | supplementaryLabel 드롭다운 (5개), pieceCount 숫자 | productImage, packagingImage, supplementaryLabel, pieceCount |
| color-variants | multi-drop 존 (2~8장) | — | colorImages, colorCount=length (productImage 미포함) |
| single | 상품 슬롯 1개 | — | productImage |
| creative | 상품 슬롯 + 선택 참고 이미지 슬롯 | 씬/분위기 프리셋 + productDescription | productImage, sceneType, styleType, productDescription, backgroundReference |

`sceneType === 'custom-reference'` 는 **UI 전용 값** — 백엔드 `CREATIVE_PROMPT` 는 4개 프리셋만 해석하므로 전송 전 `undefined` 로 스트립.

### 3. State reset 정책

- `← 용도 변경` 클릭 시: editCase, 보조 입력, 결과, generationId,
  selectedCandidateUrl 을 리셋한다. `productImage` / `productName` 은 보존.
- **탭 전환 (edit ↔ creative)**: state 보존. 탭 비교 시 입력이 날아가면 UX 저하.

### 4. Subject Identity

productId / sourceCandidateId / contentWorkspaceId 는 context 와 결과 연결용이다.
신규 상품 등록 전에도 owner 없이 썸네일 미리 생성 가능하지만, workspace 에서
진입한 결과는 contentWorkspaceId 로 기존 workspace 에 연결한다.

### 5. Mutation-Driven Workflow

흐름:
1. `useGenerateThumbnail()` mutation → `{ candidates, generationId, status }` 반환
2. `status === 'pending'` 이면 generation list 를 다시 읽어 Agent OS sink 결과를 반영
3. 사용자가 candidate 선택 → `useSelectCandidate()` (thumbnails 도메인 hook 공유)
4. Apply 또는 Skip → `useApplyGeneration()` / `useSkipGeneration()`

생성 시작/선택/apply 단계는 mutation 이고, 비동기 완료 관찰은
`useGenerationList()` 기반으로 한다.

### 6. 상품 콘텐츠 이미지 자산 임포트 (인라인)

productId/sourceCandidateId/contentWorkspaceId 를 URL query 로 동기화한다.
각 슬롯은 `SlotCard` -> `ImageSourceDrawer` 를 통해 상품 콘텐츠 이미지,
업로드, 이전 생성, 다른 상품 이미지를 선택한다.

- 슬롯-role 매핑: compose 상품 product, 보조 box, single product,
  creative 상품 product, color-variants color_variant.
- 모드: 단일 슬롯은 single (클릭 = setSlot). color-variants 는 multi (클릭 = colorImages 토글, max 8).
- 빈 상태: "허브에 등록된 이미지 없음 · 상품 콘텐츠에서 등록" 링크.
- URL 동기화: route helper 로 subject query 를 유지한다. 새로고침/공유 안전.
- `HubImagePickerModal` 은 사용하지 않는다.

### 7. Immediate History Sync

Generation 후 `queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all })` — thumbnails 페이지의 history 탭과 direct-upload scope 가 즉시 갱신 (cross-page 일관성).

### 8. SlotCard / ImageSourceDrawer — 이미지 source 추상화

`components/input/SlotCard.tsx` — 슬롯 UI 와 source badge / clear / remove 동작을 소유한다.
`components/input/ImageSourceDrawer.tsx` — upload / generated assets / prev-gen / other-product source 선택을 소유한다.
`components/hub/HubUploadZone.tsx` — File → dataURL 변환을 소유한다.
색상별/번들 multi-add 는 `EditorInputPanel` 의 `AddSlotTile` + `ImageSourceDrawer` multi 모드로 처리한다.

## Rules

- edit 모드는 항상 `purpose: 'compliance'`, creative 는 자동 `'quality'`.
  백엔드 DTO `purpose` 필드는 batch edit 에서 여전히 사용한다.
- `composition` freeform 필드는 사용하지 않음 (백엔드 DTO 에 없음). 구조화된 `pieceCount` / `colorCount` 로 대체.
- `sceneType: 'custom-reference'` 는 UI-only — payload 조립 시 `undefined` 로 스트립.
- colorImages 는 2장 미만이면 생성 버튼 비활성. `colorCount` 는 배열 length 로 자동 세팅.
- 탭 전환은 state 보존, "← 용도 변경" 만 리셋.
- Image URL 은 URL query 또는 uploadKey session handoff 로 전달한다.
- `selectedCandidateUrl` 이 apply/skip 버튼 활성화 게이트.
- subject query 는 `productId` / `sourceCandidateId` / `contentWorkspaceId` 중
  하나를 canonical identity 로 둔다.
- 슬롯 자산 인라인 picker 는 subject identity 가 있을 때 표시한다.

## Prohibits

- ❌ Canvas 변형 (generation 은 API only)
- ❌ Upload 이미지 resize/validation (raw 그대로 전송)

## Cross-domain deps

- `@kiditem/shared` — `ThumbnailGenerationItem` (공유 hook 통해)
- `apiClient` — `/api/thumbnail-editor/generate`, `/api/products/{id}`, `/api/thumbnail-analysis/generations/*`
- Thumbnails 도메인 hooks: `useSelectCandidate`, `useApplyGeneration`, `useSkipGeneration` (재사용)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| editCase 타입 / 용도 추가 | `UseCaseSelection.tsx`, `ModeCaseModal.tsx`, `edit/page.tsx`, `EditorInputPanel.tsx`, `EditorControlPanel.tsx` |
| supplementaryLabel 옵션 변경 | `components/input/EditorInputPanel.tsx` `SUPPLEMENTARY_LABELS` 상수 (export) + `edit/page.tsx` 기본값 |
| 씬 프리셋 추가/변경 | `components/control/EditorControlPanel.tsx` `SCENE_PRESETS` + 백엔드 `CREATIVE_PROMPT` scene 블록 (쌍으로) |
| Payload 필드 추가 | `hooks/useThumbnailEditor.ts` `GenerateRequest` + 백엔드 `thumbnail-editor.dto.ts` (DTO whitelisted) + `edit/page.tsx` `handleGenerate` |
| colorImages min/max 변경 | `components/input/EditorInputPanel.tsx` 의 `GROUP_MIN/GROUP_MAX` + 백엔드 `thumbnail-editor.dto.ts` `ArrayMinSize/MaxSize` (쌍으로) |
| Candidate 표시 변경 | `components/result/EditorResultPanel.tsx` |
| Image source 추가 (단일 슬롯) | `components/input/SlotCard.tsx` + `components/input/ImageSourceDrawer.tsx` + `components/hub/HubUploadZone.tsx` |
| Multi-drop 업로더 변경 | `components/input/EditorInputPanel.tsx` `AddSlotTile` + `components/input/ImageSourceDrawer.tsx` multi 모드 |
| ROLE_CONFIG 변경 (role 추가 등) | `../_shared/lib/hub-roles.ts` (단일 source) + `components/input/ImageSourceDrawer.tsx` |
| 허브 role → 편집기 슬롯 매핑 규칙 | `components/input/EditorInputPanel.tsx` 의 `SlotCard` / `AddSlotTile` role prop. role-slot 매핑 변경 시 EditorInputPanel 해당 case 블록 수정 |
| subject / URL 동기화 | `_shared/lib/product-pipeline-routes.ts`, `_shared/lib/thumbnail-subject.ts`, `page.tsx`, `edit/page.tsx` |
