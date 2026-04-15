# Thumbnail Editor Frontend: Type 2/3 UX 연결

## Problem

백엔드는 `POST /api/thumbnail-editor/generate` 에서 이미 Type 2A (상품+박스 합성) / Type 2B (색상별 배치) / Type 3 (AI 연출) 을 모두 지원한다. 그러나 현재 프론트엔드는:

- Type 3 creative 의 핵심 필드 (`mode`, `sceneType`, `styleType`, `productDescription`) 는 연결돼 있으나 `backgroundReference` (분위기 참고 이미지) 는 UI 가 없음.
- Type 2A 의 `supplementaryLabel` (박스/세트구성/포장 라벨) 과 구조화된 `pieceCount` 입력이 없음.
- Type 2B 의 `colorImages` 다중 업로드 UI 가 전혀 없음.
- `ThumbnailEditorView.tsx` (231 줄) 이 어느 곳에서도 import 되지 않는 dead code.

백엔드 Type 2/3 확장이 실제 사용자 가치로 연결되지 않는다. 이 스펙은 그 UX 갭을 메운다.

## Scope

프론트엔드만. 백엔드/DTO/스키마 변경 없음.

- 영향 범위: `apps/web/src/app/thumbnail-editor/` 하위 전체
- 새 기능: 용도 카드 선택, Type 2B 다중 업로드, backgroundReference 슬롯, 보조 라벨 드롭다운, pieceCount 숫자 입력
- Cleanup: `ThumbnailEditorView.tsx` 삭제, `composition` dead field 정리 (UI + hook type)

Non-goals:

- 백엔드 계약 변경 (DTO, controller routing 모두 그대로 활용)
- `thumbnails` / `thumbnail-analysis` 도메인 수정 (편집기 밖)
- Wing 자동 등록 흐름 수정 (apply 동작 유지)

## Key Assumptions

- 백엔드가 현재 지원하는 필드를 그대로 믿고 쓴다 (E2E 테스트로 Type 3 검증 완료).
- 색상별 배치에서 입력은 **1장당 1색상** 원칙. 혼합 사진 (1장에 여러 색) 은 Type 1 또는 Type 3 으로 유도.
- 히어로샷 (`productImage` in Type 2B) 은 UI 미노출. 백엔드 계약상 선택 필드로 남김.
- 1:1 비율, 최대 업로드 수 (colorImages 8, 총 10) 등 제약은 백엔드가 이미 강제.

## Information Architecture

```
[헤더: 탭 "이미지 편집" | "AI 연출"]

이미지 편집 탭:
├── 진입 → 용도 선택 카드 3개 (풀 너비)
│   ├── 📦 상품+박스/세트 합성  (Type 2A)
│   ├── 🎨 색상별 상품 배치     (Type 2B)
│   └── 🧼 단일 상품 정리       (Type 1 기존)
└── 용도 선택 후 → 3패널 [Input | Result | Control]
    └── Input 상단: breadcrumb + "← 용도 변경" 텍스트 버튼

AI 연출 탭:
└── 3패널 [Input | Result | Control] (기존 구조 유지)
    └── Control 씬 프리셋 5개 (기존 4 + "사용자 정의 이미지")
        └── 사용자 정의 선택 시 → 참고 이미지 업로드 슬롯 펼침
```

## Input Specification by Use Case

### 편집 > 상품+박스/세트 합성 (Type 2A)

| Field | Required | UI 형태 |
|---|---|---|
| productImage | **필수** | 슬롯 1 (ImageUploader) |
| packagingImage | 선택 | 슬롯 2 (ImageUploader) |
| supplementaryLabel | 선택 | **NEW**: 보조 슬롯 아래 드롭다운. 기본값 `박스`. 옵션: `박스` / `세트구성` / `포장` / `부속품` / `기타` |
| pieceCount | 선택 | **NEW**: number input. 플레이스홀더 `예: 3` |
| purpose | 'compliance' | 기존 토글 |
| userPrompt | 선택 | 기존 textarea |
| mode | `'edit'` (명시 전송) | — |

Controller 전송 시: `composition` 텍스트는 전송하지 않음 (DTO 에 해당 필드 없음). 백엔드가 `pieceCount`/`colorCount` 를 직접 받아 내부에서 `"N개입, M가지 색상"` 문자열로 조합해 Gemini 프롬프트에 주입.

### 편집 > 색상별 상품 배치 (Type 2B)

| Field | Required | UI 형태 |
|---|---|---|
| colorImages | **필수 (2~8)** | **NEW**: 단일 드롭존 + 썸네일 그리드 (개별 X 삭제) |
| colorCount | 자동 | UI 입력 없음. 페이로드 전송 시 `colorImages.length` 로 채워 Gemini 프롬프트 힌트("N가지 색상") 확보 |
| productImage | — | UI 노출 없음 (히어로샷 미사용). 페이로드에도 포함 안 함 |
| purpose | 'compliance' | 기존 토글 |
| userPrompt | 선택 | 기존 textarea |
| mode | `'edit'` (명시 전송) | — |

드롭존 안내 문구: "색상별로 1장씩 (흰배경 권장)".
장수 카운터: `N / 8` 표시.
2장 미만이면 생성 버튼 비활성.

### 편집 > 단일 상품 정리 (Type 1)

| Field | Required | UI 형태 |
|---|---|---|
| productImage | **필수** | 슬롯 1 (기존) |
| purpose | 'compliance' | 기존 토글 |
| userPrompt | 선택 | 기존 textarea |
| mode | `'edit'` (명시 전송) | — |

**기존 `composition` freeform 텍스트 필드 제거.** 현재 프론트엔드는 `composition` 을 페이로드에 포함시키고 있으나 백엔드 DTO(`thumbnail-editor.dto.ts`)에 해당 필드가 없어 NestJS `ValidationPipe({ whitelist: true })` 가 필드 자체를 drop — 사용자 입력이 Gemini 에 전혀 전달되지 않는 dead field. 이번 개편에서 함께 정리. 부가 지시가 필요한 사용자는 `userPrompt` 사용 (두 필드의 의미 중복도 해소됨).

### AI 연출 (Type 3)

| Field | Required | UI 형태 |
|---|---|---|
| productImage | **필수** | 기존 슬롯 |
| sceneType | 선택 | 프리셋 5개. 기본 `white-studio`. 옵션: `white-studio` / `lifestyle` / `outdoor` / `concept` / **`custom-reference`** (NEW) |
| backgroundReference | 선택 | **NEW**: `sceneType === 'custom-reference'` 일 때만 펼쳐지는 업로드 슬롯 |
| styleType | 선택 | 프리셋 4개 (기존) |
| productDescription | 선택 | 기존 textarea |
| userPrompt | 선택 | 기존 textarea |
| mode | `'creative'` | — |

`custom-reference` 선택 후 `backgroundReference` 가 비어 있으면 생성 버튼 비활성 (사용자 의도상 참고 이미지 없이 `custom-reference` 전송은 모호해서 비활성이 안전).

`custom-reference` 는 UI 전용 값 — 백엔드 `CREATIVE_PROMPT` 템플릿은 `{white-studio, lifestyle, outdoor, concept}` 4개만 이해한다. `sceneType: 'custom-reference'` 를 그대로 전송하면 Gemini 프롬프트에 "Scene: custom-reference" 라고 박혀 모델 혼란을 유발. 따라서 페이로드 전송 직전 **`sceneType === 'custom-reference' ? undefined : sceneType`** 로 반드시 스트립한다. 백엔드는 `sceneType` 미전송 시 `'white-studio'` 로 폴백하지만, 이 케이스에서는 `backgroundReference` 이미지가 `label: 'Style reference'` 로 프롬프트에 함께 전달돼 Gemini 가 참고 이미지의 mood/팔레트로 씬을 재해석한다 (백엔드 `generateCreative` 내 `hasReference` 조건 확인).

## Component Design

### New Components

1. **`UseCaseSelection.tsx`**
   - Props: `onSelect(useCase: 'compose' | 'color-variants' | 'single')`
   - 풀너비 3카드. Lucide 아이콘 + 제목 + 짧은 설명.

2. **`ColorVariantsUploader.tsx`**
   - Props: `{ values: string[]; onChange: (urls: string[]) => void; max?: number }`
   - 단일 multi-drop 존 + 썸네일 그리드. `FileReader` 로 data URL 변환 (기존 `ImageUploader` 패턴 재사용).
   - 각 썸네일 우상단 X 버튼으로 개별 삭제. 드래그 정렬 없음.
   - `values.length === max` 이면 드롭존 비활성 + 안내 "8장 모두 업로드됨".

3. **`EditCaseBreadcrumb.tsx`**
   - Props: `{ caseName: string; onChange: () => void }`
   - Input 패널 상단 고정. 작은 텍스트: "{caseName} · ← 용도 변경".

### Changed Components

1. **`page.tsx`**
   - 새 상태: `editCase: 'none' | 'compose' | 'color-variants' | 'single'`
   - `mode === 'edit' && editCase === 'none'` → `<UseCaseSelection />` 렌더.
   - `mode === 'edit' && editCase !== 'none'` → 3패널 + breadcrumb.
   - `mode === 'creative'` → 3패널 (기존).
   - 새 상태: `colorImages: string[]`, `supplementaryLabel: string`, `pieceCount: number | null`, `backgroundReference: string | null`.
   - `handleGenerate` 에서 `editCase` 에 따라 페이로드 분기.

2. **`EditorInputPanel.tsx`**
   - `mode` + `editCase` 조합 기반 분기:
     - compose: 2 슬롯 + 보조 라벨 드롭다운
     - color-variants: `ColorVariantsUploader`
     - single: 1 슬롯
     - creative: 1 슬롯 (기존)
   - Breadcrumb (edit 모드이고 editCase != 'none' 일 때만).

3. **`EditorControlPanel.tsx`**
   - edit 모드 + compose 케이스: 보조 라벨 드롭다운 + pieceCount number input + purpose + userPrompt.
   - edit 모드 + color-variants: purpose + userPrompt 만.
   - edit 모드 + single: purpose + userPrompt 만 (기존 `composition` freeform textarea 제거).
   - creative 모드: 씬 프리셋 5개 + (custom-reference 선택 시) backgroundReference 슬롯 펼침.

4. **`hooks/useThumbnailEditor.ts`**
   - `GenerateRequest` 에 추가: `colorImages?: string[]`, `supplementaryLabel?: string`, `backgroundReference?: string`.
   - `GenerateRequest` 에서 제거: `composition?: string` (백엔드 DTO 에 없는 dead field).
   - `pieceCount`, `colorCount` 는 이미 타입에 있음.

### Deleted

- **`components/ThumbnailEditorView.tsx`** — 어디서도 import 안 됨. 231 줄 삭제.

## Data Flow

```
사용자 이미지 편집 탭 클릭
  ↓
editCase 'none' 이면 UseCaseSelection
  ↓ (카드 클릭)
editCase 상태 세팅
  ↓
3패널 렌더 + Input 상단 breadcrumb
  ↓
사용자 입력 (editCase 별 다른 필드)
  ↓
handleGenerate() — editCase 로 payload 구성
  ↓
POST /api/thumbnail-editor/generate
  ↓ (201 + { candidates, generationId })
ResultPanel 에 썸네일 카드, Control 에 apply/skip
  ↓ (기존 흐름: select → apply → Wing)
```

### Entry via query params (productId / imageUrl)

기존 동작: `?productId=<id>&imageUrl=<url>` 으로 들어오면 상품 정보 + productImage 자동 세팅.

용도별 처리:

- **'단일 상품 정리'** 및 **AI 연출**: 자동 세팅한 productImage 를 그대로 기본값으로 사용 (기존 동작).
- **'상품+박스/세트 합성'**: 자동 세팅한 productImage 를 1번 슬롯 기본값으로 사용 (기존과 동일).
- **'색상별 상품 배치'**: productImage 무관 (히어로샷 미노출). colorImages 는 빈 배열로 시작.

탭 진입 시 기본 `editCase = 'none'` → UseCaseSelection 표시. 자동 세팅은 사용자가 카드를 선택한 뒤에만 해당 케이스 기본값으로 흘러들어감.

### State reset on 용도 변경

`EditCaseBreadcrumb` 의 "← 용도 변경" 클릭 시 다음 상태를 리셋한다 (다음 용도의 입력 오염 방지):

- `editCase` → `'none'`
- `packagingImage` → `null`
- `colorImages` → `[]`
- `supplementaryLabel` → `'박스'` (기본값)
- `pieceCount` → `null`
- `userPrompt` → `''`
- `result`, `generationId`, `selectedCandidateUrl` → null/빈값

`productImage` 와 `productName` 는 **유지**: 같은 상품을 다른 용도로 다시 편집하는 자연스러운 워크플로우.

**탭(edit ↔ creative) 전환은 state 를 보존**한다. 사용자가 두 탭을 비교·전환하다가 의도적으로 "용도 변경"을 눌렀을 때만 리셋. 탭 전환만으로 업로드/입력이 날아가면 심각한 UX 저하.

색상별 케이스 payload 예 (3장 업로드):
```json
{
  "productId": "...",
  "mode": "edit",
  "colorImages": ["data:image/png;base64,...", "data:image/png;base64,...", "data:image/png;base64,..."],
  "colorCount": 3,
  "purpose": "compliance",
  "userPrompt": "밝은 조명으로"
}
```

creative + 참고 이미지 payload 예:
```json
{
  "productId": "...",
  "mode": "creative",
  "productImage": "data:image/jpeg;base64,...",
  "backgroundReference": "data:image/jpeg;base64,...",
  "styleType": "warm",
  "productDescription": "영아 욕실 장난감"
}
```
(`sceneType` 은 전송 안 함 — `custom-reference` 로 선택했으므로 백엔드에서 `white-studio` 기본값 먹지만 의미는 `backgroundReference` 라벨이 Gemini 에 이미 전달돼 커스텀 씬으로 해석됨.)

## Error Handling

- colorImages < 2 : 생성 버튼 비활성 + "2장 이상 업로드" 안내.
- colorImages > 8 : 업로드 시점에 toast `"최대 8장까지만 가능합니다"` + 드롭존 비활성.
- creative `custom-reference` + backgroundReference 없음 : 생성 버튼 비활성.
- 파일 업로드 실패 : 기존 `ImageUploader` 의 FileReader onerror → toast (기존 패턴).
- 백엔드 에러 : `handleGenerate` try/catch 로 `isApiError` 분기 (`@/lib/api-error` 이미 사용 중).

## Testing

1. `apps/web`
   - `npm run build` 성공
   - `npx vitest run` regression 없음
2. 수동 QA 시나리오 (모두 실 서버에 대고):
   - (a) 편집 탭 진입 → 용도 카드 3개 보임 → '상품+박스' 클릭 → 슬롯2 + 보조 라벨 드롭다운 + pieceCount 입력 렌더 → 생성 성공 (method='generate' on DB)
   - (b) '색상별' 클릭 → multi-drop 3장 업로드 → 생성 → ThumbnailGeneration.candidates 에 합성 결과 URL (method='generate')
   - (c) '← 용도 변경' → 카드로 돌아감 → 상태 초기화 여부 확인 (업로드한 이미지는 클리어)
   - (d) AI 연출 탭 → 씬 '사용자 정의 이미지' 클릭 → backgroundReference 슬롯 펼침 → 이미지 업로드 → 생성 (method='creative')
   - (e) Type 3 기존 프리셋 (lifestyle 등) : backgroundReference 슬롯 안 보임 → 생성 정상
   - (f) Regression: 단일 상품 정리 케이스 생성 성공 (purpose + userPrompt 만. `composition` 필드가 UI 에서 사라졌음을 확인)

## Constraints

- Next.js App Router, Tailwind + `cn()` utility, Lucide React 아이콘, `@tanstack/react-query`, `apiClient` 사용 (모두 apps/web/CLAUDE.md 준수).
- 새 `'use client'` 디렉티브 필수 (상태 훅 사용).
- 이미지 업로드 data URL 방식 유지 (외부 CDN 업로드 없음) — 기존 `ImageUploader` 패턴.
- 드래그 정렬 라이브러리 추가 없음 (`react-dnd` 등). 순서 무관이라 불필요.
- 삭제되는 `ThumbnailEditorView.tsx` 의 any 의존성 (다른 파일에서 import 되는지) 한 번 더 grep 후 삭제.

## File Impact Map

| 수정 | 파일 |
|---|---|
| 수정 | `apps/web/src/app/thumbnail-editor/page.tsx` |
| 수정 | `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` |
| 수정 | `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx` |
| 수정 | `apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts` |
| 신규 | `apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx` |
| 신규 | `apps/web/src/app/thumbnail-editor/components/ColorVariantsUploader.tsx` |
| 신규 | `apps/web/src/app/thumbnail-editor/components/EditCaseBreadcrumb.tsx` |
| 삭제 | `apps/web/src/app/thumbnail-editor/components/ThumbnailEditorView.tsx` |

## Open Questions

없음. 모든 결정 브레인스토밍 단계에서 확정.
