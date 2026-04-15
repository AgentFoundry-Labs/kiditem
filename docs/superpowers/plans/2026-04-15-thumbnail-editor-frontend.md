# Thumbnail Editor Frontend (Type 2/3 UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트엔드 썸네일 편집기에 Type 2A(상품+박스) / Type 2B(색상별 배치) / Type 3(AI 연출 custom reference) UX 를 붙인다. 백엔드 변경 없음.

**Architecture:** '이미지 편집' 탭 진입 시 용도 카드 3개 선택 → 케이스별 Input/Control 패널 분기. 'AI 연출' 탭은 씬 프리셋에 '사용자 정의 이미지' 추가로 backgroundReference 지원. `composition` dead field 제거 + `ThumbnailEditorView.tsx` dead code 삭제.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS + `cn()` 유틸, Lucide React 아이콘, `@tanstack/react-query` mutation, `apiClient` (raw fetch 금지), sonner toast.

**Testing convention:** apps/web 는 "Test infrastructure core only (api-client, api-error). No implementation detail tests." (apps/web/CLAUDE.md). 컴포넌트 behavior 테스트는 프로젝트 컨벤션상 작성하지 않는다. 대신 매 태스크 후 `npm run build` + 기존 `npx vitest run` regression 확인 + 최종 Task 10 manual QA.

**Spec reference:** [docs/superpowers/specs/2026-04-15-thumbnail-editor-frontend-design.md](../specs/2026-04-15-thumbnail-editor-frontend-design.md)

---

## File Structure

### New files (3)

| Path | 책임 |
|---|---|
| `apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx` | 편집 탭 진입 시 용도 카드 3개 표시. 선택 콜백 하나만 받는 프레젠테이션 컴포넌트. |
| `apps/web/src/app/thumbnail-editor/components/ColorVariantsUploader.tsx` | Type 2B multi-drop 업로더. 2~8장 썸네일 그리드. 개별 X 삭제. |
| `apps/web/src/app/thumbnail-editor/components/EditCaseBreadcrumb.tsx` | Input 패널 상단 '{용도명} · ← 용도 변경' 텍스트 버튼. |

### Modified files (4)

| Path | 변경 |
|---|---|
| `apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts` | `GenerateRequest` 에 `colorImages/supplementaryLabel/backgroundReference` 추가. `composition` 제거. |
| `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` | `editCase` 기준 분기 렌더: compose(2슬롯+라벨) / color-variants(multi-drop) / single(1슬롯) / creative(1슬롯+선택 reference). 상단 breadcrumb. |
| `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx` | `editCase` 기준 분기 렌더. compose: supplementaryLabel 드롭다운 + pieceCount input. creative: 씬 5프리셋 + custom-reference 업로드. 기존 `composition` textarea 제거. |
| `apps/web/src/app/thumbnail-editor/page.tsx` | editCase 상태 추가 + 신규 상태 (colorImages, supplementaryLabel, pieceCount, backgroundReference). 탭 진입 시 UseCaseSelection 또는 3패널 분기. handleGenerate payload 분기. 리셋 핸들러. |

### Deleted files (1)

| Path | 이유 |
|---|---|
| `apps/web/src/app/thumbnail-editor/components/ThumbnailEditorView.tsx` | 어디서도 import 안 됨. 231 줄 dead code. |

### Task dependency

```
T1 (hook type) ── 모든 태스크의 타입 시그니처 기반
T2 (Breadcrumb) ── T5 에서 사용
T3 (UseCaseSelection) ── T7 에서 사용
T4 (ColorVariantsUploader) ── T5 에서 사용
T5 (EditorInputPanel 리팩) ── T7 에서 props 흐름
T6 (EditorControlPanel 리팩) ── T7 에서 props 흐름
T7 (page.tsx 리팩) ── 최종 통합
T8 (Delete ThumbnailEditorView) ── 독립
T9 (Build + 기존 test regression) ── 통합 검증
T10 (Manual QA + commit) ── 최종
```

---

## Task 1: Update `useThumbnailEditor.ts` hook type

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts`

- [ ] **Step 1: Rewrite the GenerateRequest interface**

`apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts` 파일을 아래로 완전 교체:

```ts
'use client';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface GenerateRequest {
  productId?: string;
  productImage?: string;
  packagingImage?: string;
  supplementaryLabel?: string;
  colorImages?: string[];
  pieceCount?: number;
  colorCount?: number;
  backgroundReference?: string;
  userPrompt?: string;
  purpose: 'compliance' | 'quality';
  mode?: 'edit' | 'creative';
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
}

interface GenerateResponse {
  candidates: Array<{ url: string; filename: string }>;
  generationId: string | null;
}

export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: (data: GenerateRequest) =>
      apiClient.post<GenerateResponse>('/api/thumbnail-editor/generate', data),
  });
}
```

주요 변경:
- **제거**: `composition?: string` (백엔드 DTO 에 없는 dead field).
- **추가**: `supplementaryLabel`, `colorImages`, `backgroundReference`.
- 필드 순서는 영향 영역별로 그룹화 (product 계열 → multi-image → count → creative → common).

- [ ] **Step 2: Build check (타입 에러 확인)**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: `composition` 참조가 남아있는 곳(`page.tsx` 등)에서 타입 에러가 뜬다 — 아직 남은 임포터가 해결되지 않았으므로 **정상**. 다음 태스크에서 page.tsx 가 `composition` 제거되면 사라진다.

가드: `useThumbnailEditor.ts` 자체는 에러 없어야 한다.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/hooks/useThumbnailEditor.ts
git commit -m "refactor(thumbnail-editor/hook): GenerateRequest 타입 개편 (colorImages/backgroundReference/supplementaryLabel 추가, composition dead field 제거)"
```

---

## Task 2: Create `EditCaseBreadcrumb.tsx`

**Files:**
- Create: `apps/web/src/app/thumbnail-editor/components/EditCaseBreadcrumb.tsx`

- [ ] **Step 1: Write the full component**

`apps/web/src/app/thumbnail-editor/components/EditCaseBreadcrumb.tsx` 새 파일:

```tsx
'use client';
import { ArrowLeft } from 'lucide-react';

interface Props {
  caseName: string;
  onChange: () => void;
}

export function EditCaseBreadcrumb({ caseName, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-gray-50"
      style={{ borderBottom: '1px solid #e5e7eb' }}
    >
      <span className="text-[11px] font-semibold text-gray-700">{caseName}</span>
      <button
        type="button"
        onClick={onChange}
        className="ml-auto flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={10} />
        용도 변경
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "EditCaseBreadcrumb" | head`
Expected: 출력 없음 (새 파일 타입 에러 없음).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/components/EditCaseBreadcrumb.tsx
git commit -m "feat(thumbnail-editor/ui): EditCaseBreadcrumb 컴포넌트 신규"
```

---

## Task 3: Create `UseCaseSelection.tsx`

**Files:**
- Create: `apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx`

- [ ] **Step 1: Write the full component**

`apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx` 새 파일:

```tsx
'use client';
import { Package, Palette, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditUseCase = 'compose' | 'color-variants' | 'single';

interface Props {
  onSelect: (useCase: EditUseCase) => void;
}

const CASES: Array<{ key: EditUseCase; icon: typeof Package; title: string; desc: string; accent: string }> = [
  {
    key: 'compose',
    icon: Package,
    title: '상품+박스/세트 합성',
    desc: '박스·세트 구성·포장을 상품과 함께 자연스럽게 배치',
    accent: 'text-violet-600 bg-violet-100',
  },
  {
    key: 'color-variants',
    icon: Palette,
    title: '색상별 상품 배치',
    desc: '같은 제품의 여러 색상 사진을 한 장에 합성',
    accent: 'text-rose-600 bg-rose-100',
  },
  {
    key: 'single',
    icon: Scissors,
    title: '단일 상품 정리',
    desc: '쿠팡 가이드라인 준수 흰배경 상품 사진',
    accent: 'text-sky-600 bg-sky-100',
  },
];

export function UseCaseSelection({ onSelect }: Props) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8 bg-white">
      <div className="w-full max-w-4xl space-y-4">
        <div className="text-center space-y-1">
          <div className="text-sm font-semibold text-gray-900">어떤 편집이 필요하세요?</div>
          <div className="text-xs text-gray-500">용도를 선택하면 맞춤 편집 화면으로 이동합니다</div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {CASES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c.key)}
              className={cn(
                'flex flex-col items-center text-center gap-3 p-6 rounded-2xl bg-white',
                'border border-gray-200 hover:border-gray-300 hover:shadow-sm',
                'transition-all duration-150',
              )}
            >
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', c.accent)}>
                <c.icon size={22} />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "UseCaseSelection" | head`
Expected: 출력 없음.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx
git commit -m "feat(thumbnail-editor/ui): UseCaseSelection 3카드 진입 화면 신규"
```

---

## Task 4: Create `ColorVariantsUploader.tsx`

**Files:**
- Create: `apps/web/src/app/thumbnail-editor/components/ColorVariantsUploader.tsx`

- [ ] **Step 1: Write the full component**

`apps/web/src/app/thumbnail-editor/components/ColorVariantsUploader.tsx` 새 파일:

```tsx
'use client';
import { useCallback, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  values: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

export function ColorVariantsUploader({ values, onChange, max = 8 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const readFiles = useCallback(async (files: FileList) => {
    const remaining = max - values.length;
    if (remaining <= 0) {
      toast.error(`최대 ${max}장까지 가능합니다`);
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    if (files.length > accepted.length) {
      toast.error(`최대 ${max}장까지 가능합니다 (초과분 무시)`);
    }
    const next: string[] = [];
    for (const file of accepted) {
      if (!file.type.startsWith('image/')) continue;
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push(url);
    }
    if (next.length > 0) onChange([...values, ...next]);
  }, [values, onChange, max]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!atMax && e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void readFiles(e.target.files);
    e.target.value = '';
  };

  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const atMax = values.length >= max;

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !atMax && inputRef.current?.click()}
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors select-none',
          atMax
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-violet-50/30 border-violet-300 text-violet-700 hover:bg-violet-50 cursor-pointer',
        )}
      >
        <Upload size={20} className="mx-auto mb-2" />
        <div className="text-xs font-medium">
          {atMax ? `${max}장 모두 업로드됨` : '이미지를 드래그하거나 클릭'}
        </div>
        <div className="text-[10px] text-gray-400 mt-1">색상별로 1장씩 (흰배경 권장)</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInput}
          className="hidden"
        />
      </div>

      {values.length > 0 && (
        <>
          <div className="text-[10px] text-gray-400 font-medium">
            {values.length} / {max} · 최소 2장 이상
          </div>
          <div className="grid grid-cols-4 gap-2">
            {values.map((url, i) => (
              <div key={`${i}-${url.slice(-12)}`} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
                  aria-label="삭제"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "ColorVariantsUploader" | head`
Expected: 출력 없음.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/components/ColorVariantsUploader.tsx
git commit -m "feat(thumbnail-editor/ui): ColorVariantsUploader (2~8장 multi-drop + 썸네일 그리드) 신규"
```

---

## Task 5: Refactor `EditorInputPanel.tsx` — editCase 분기 + breadcrumb

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx`

- [ ] **Step 1: Rewrite the full component**

기존 69줄 파일을 아래로 완전 교체:

```tsx
'use client';
import { Package } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { ColorVariantsUploader } from './ColorVariantsUploader';
import { EditCaseBreadcrumb } from './EditCaseBreadcrumb';
import type { EditUseCase } from './UseCaseSelection';

type EditorMode = 'edit' | 'creative';

const SUPPLEMENTARY_LABELS = ['박스', '세트구성', '포장', '부속품', '기타'] as const;
export type SupplementaryLabel = (typeof SUPPLEMENTARY_LABELS)[number];

const CASE_NAMES: Record<EditUseCase, string> = {
  compose: '상품+박스/세트 합성',
  'color-variants': '색상별 상품 배치',
  single: '단일 상품 정리',
};

interface Props {
  mode: EditorMode;
  editCase: EditUseCase | null;
  productId: string | null;
  productName: string;
  productImage: string | null;
  packagingImage: string | null;
  supplementaryLabel: SupplementaryLabel;
  colorImages: string[];
  backgroundReference: string | null;
  sceneType: string;
  onProductImageChange: (v: string | null) => void;
  onPackagingChange: (v: string | null) => void;
  onSupplementaryLabelChange: (v: SupplementaryLabel) => void;
  onColorImagesChange: (v: string[]) => void;
  onBackgroundReferenceChange: (v: string | null) => void;
  onResetEditCase: () => void;
}

export function EditorInputPanel({
  mode,
  editCase,
  productId,
  productName,
  productImage,
  packagingImage,
  supplementaryLabel,
  colorImages,
  backgroundReference,
  sceneType,
  onProductImageChange,
  onPackagingChange,
  onSupplementaryLabelChange,
  onColorImagesChange,
  onBackgroundReferenceChange,
  onResetEditCase,
}: Props) {
  const showBreadcrumb = mode === 'edit' && editCase !== null;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto bg-gray-50"
      style={{ borderRight: '1px solid #e5e7eb' }}
    >
      {showBreadcrumb && editCase && (
        <EditCaseBreadcrumb caseName={CASE_NAMES[editCase]} onChange={onResetEditCase} />
      )}

      <div
        className="flex-shrink-0 px-4 py-3.5"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          이미지 입력
        </div>
      </div>

      {productId && productName && (
        <div
          className="flex items-center gap-2 px-4 py-3 bg-white"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          <Package size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium truncate text-gray-700">{productName}</span>
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-6">
        {/* 편집 모드 분기 */}
        {mode === 'edit' && editCase === 'compose' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 대표 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">보조 이미지</div>
                <select
                  value={supplementaryLabel}
                  onChange={(e) => onSupplementaryLabelChange(e.target.value as SupplementaryLabel)}
                  className="text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1"
                >
                  {SUPPLEMENTARY_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="text-[11px] text-gray-400">패키지/세트구성 등 보조 이미지</div>
              <ImageUploader label="" value={packagingImage} onChange={onPackagingChange} />
            </div>
          </>
        )}

        {mode === 'edit' && editCase === 'color-variants' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">색상별 상품 사진</div>
            <ColorVariantsUploader values={colorImages} onChange={onColorImagesChange} />
          </div>
        )}

        {mode === 'edit' && editCase === 'single' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">상품 사진</div>
            <div className="text-[11px] text-gray-400">정리할 원본 상품 이미지</div>
            <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
          </div>
        )}

        {mode === 'creative' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
            </div>
            {sceneType === 'custom-reference' && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">분위기 참고 이미지</div>
                <div className="text-[11px] text-gray-400">mood · 팔레트 · 질감 참고용</div>
                <ImageUploader label="" value={backgroundReference} onChange={onBackgroundReferenceChange} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

주요 설계:
- `SUPPLEMENTARY_LABELS` 상수 정의 + `SupplementaryLabel` export (page.tsx, ControlPanel 양쪽에서 재사용).
- `editCase` 가 `null` 이면 `UseCaseSelection` 을 상위(page.tsx)에서 렌더하므로, InputPanel 은 `editCase !== null` 가정.
- `onResetEditCase` prop 은 breadcrumb 클릭 시 page 의 리셋 로직 호출.

- [ ] **Step 2: Build check (page.tsx 가 아직 수정 안 된 상태라 에러 예상)**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
Expected: `page.tsx` 에서 `EditorInputPanel` props 불일치 에러. Task 7 에서 해결.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx
git commit -m "refactor(thumbnail-editor/input): editCase 분기 렌더 + breadcrumb + supplementaryLabel 드롭다운"
```

---

## Task 6: Refactor `EditorControlPanel.tsx` — editCase 분기 + custom-reference

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx`

- [ ] **Step 1: Rewrite the full component**

기존 316줄 파일을 아래로 완전 교체:

```tsx
'use client';
import { Loader2, Wand2, Download, ExternalLink, SkipForward, Sparkles, Scissors } from 'lucide-react';
import type { EditUseCase } from './UseCaseSelection';

type EditorMode = 'edit' | 'creative';

interface Props {
  mode: EditorMode;
  editCase: EditUseCase | null;
  purpose: 'compliance' | 'quality';
  pieceCount: number | null;
  userPrompt: string;
  sceneType: string;
  styleType: string;
  productDescription: string;
  isPending: boolean;
  hasInput: boolean;
  selectedCandidateUrl: string | null;
  generationId: string | null;
  isApplying: boolean;
  isSkipping: boolean;
  onPurposeChange: (v: 'compliance' | 'quality') => void;
  onPieceCountChange: (v: number | null) => void;
  onUserPromptChange: (v: string) => void;
  onSceneTypeChange: (v: string) => void;
  onStyleTypeChange: (v: string) => void;
  onProductDescriptionChange: (v: string) => void;
  onGenerate: () => void;
  onCoupang: () => void;
  onSkip: () => void;
}

const primaryColor = { edit: '#8b5cf6', creative: '#d946ef' };

const lightInput: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  borderRadius: 12,
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
};

const SCENE_PRESETS = [
  { value: 'white-studio', label: '화이트 스튜디오' },
  { value: 'lifestyle', label: '생활 인테리어' },
  { value: 'outdoor', label: '야외 / 자연' },
  { value: 'concept', label: '컨셉 / 무드' },
  { value: 'custom-reference', label: '🖼️ 사용자 정의 이미지' },
] as const;

const STYLE_PRESETS = [
  { value: 'minimal', label: '미니멀' },
  { value: 'warm', label: '따뜻한 생활감' },
  { value: 'vivid', label: '선명한 제품샷' },
  { value: 'luxury', label: '고급스러운' },
] as const;

export function EditorControlPanel({
  mode,
  editCase,
  purpose,
  pieceCount,
  userPrompt,
  sceneType,
  styleType,
  productDescription,
  isPending,
  hasInput,
  selectedCandidateUrl,
  generationId,
  isApplying,
  isSkipping,
  onPurposeChange,
  onPieceCountChange,
  onUserPromptChange,
  onSceneTypeChange,
  onStyleTypeChange,
  onProductDescriptionChange,
  onGenerate,
  onCoupang,
  onSkip,
}: Props) {
  const accent = primaryColor[mode];
  const generateDisabled = !hasInput || isPending;

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-white"
      style={{ borderLeft: '1px solid #e5e7eb' }}
    >
      <div
        className="flex-shrink-0 px-5 py-3.5 flex items-center gap-2"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        {mode === 'edit' ? <Scissors size={11} style={{ color: accent }} /> : <Sparkles size={11} style={{ color: accent }} />}
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {mode === 'edit' ? '편집 설정' : 'AI 연출 설정'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {mode === 'edit' ? (
          <>
            {/* 편집 목적 (공통) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">편집 목적</label>
              <div className="flex flex-col gap-2">
                {[
                  { value: 'compliance', label: '가이드라인 수정', sub: '쿠팡 광고 기준 준수' },
                  { value: 'quality',    label: '품질 개선',       sub: '시각적 완성도 향상' },
                ].map((opt) => {
                  const active = purpose === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onPurposeChange(opt.value as 'compliance' | 'quality')}
                      className="w-full px-4 py-2.5 rounded-xl text-left transition-all duration-200"
                      style={{
                        background: active ? `${accent}12` : '#f9fafb',
                        border: active ? `1px solid ${accent}55` : '1px solid #e5e7eb',
                        color: active ? accent : '#6b7280',
                      }}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* compose 전용: 개입 수 */}
            {editCase === 'compose' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold block text-gray-600">
                  개입 수 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={pieceCount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onPieceCountChange(v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
                  }}
                  placeholder="예: 3"
                  style={{ ...lightInput }}
                />
                <div className="text-[10px] text-gray-400">세트/묶음 수량 (예: 3개입)</div>
              </div>
            )}

            {/* 편집 지시사항 (공통) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                편집 지시사항 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={4}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 배경을 순백색으로, 제품이 화면의 75%를 채우도록"
                style={{ ...lightInput, resize: 'none' }}
              />
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={generateDisabled}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: accent }}
            >
              {isPending ? <><Loader2 size={15} className="animate-spin" /> 편집 중...</> : <><Wand2 size={15} /> 편집 시작</>}
            </button>
          </>
        ) : (
          <>
            {/* 씬 프리셋 (5개 — 마지막은 사용자 정의) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">촬영 씬</label>
              <div className="grid grid-cols-2 gap-2">
                {SCENE_PRESETS.slice(0, 4).map((opt) => {
                  const active = sceneType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onSceneTypeChange(opt.value)}
                      className="flex items-center justify-center px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                      style={{
                        background: active ? `${accent}12` : '#f9fafb',
                        border: active ? `1px solid ${accent}55` : '1px solid #e5e7eb',
                        color: active ? accent : '#6b7280',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const opt = SCENE_PRESETS[4];
                const active = sceneType === opt.value;
                return (
                  <button
                    type="button"
                    onClick={() => onSceneTypeChange(opt.value)}
                    className="w-full flex items-center justify-center px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                    style={{
                      background: active ? `${accent}12` : '#f9fafb',
                      border: active ? `1.5px dashed ${accent}` : '1.5px dashed #d8b4fe',
                      color: active ? accent : '#c026d3',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })()}
            </div>

            {/* 분위기 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">분위기</label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((opt) => {
                  const active = styleType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onStyleTypeChange(opt.value)}
                      className="px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                      style={{
                        background: active ? `${accent}12` : '#f9fafb',
                        border: active ? `1px solid ${accent}55` : '1px solid #e5e7eb',
                        color: active ? accent : '#6b7280',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 제품 설명 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                제품 설명 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={3}
                value={productDescription}
                onChange={(e) => onProductDescriptionChange(e.target.value)}
                placeholder="예: 영아용 딸랑이. 파스텔 컬러. 안전 인증 완료."
                style={{ ...lightInput, resize: 'none' }}
              />
            </div>

            {/* 추가 지시사항 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                추가 지시사항 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={3}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 아이가 장난감을 쥐고 있는 손 클로즈업"
                style={{ ...lightInput, resize: 'none' }}
              />
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={generateDisabled}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: accent }}
            >
              {isPending ? <><Loader2 size={15} className="animate-spin" /> 생성 중...</> : <><Sparkles size={15} /> AI 연출 생성</>}
            </button>
          </>
        )}

        {!hasInput && (
          <p className="text-center text-xs text-gray-400">왼쪽에서 이미지를 업로드하세요</p>
        )}
      </div>

      {/* 결과 처리 (generationId 가 있을 때만) */}
      {generationId && (
        <div
          className="flex-shrink-0 px-5 py-4 space-y-2 bg-gray-50"
          style={{ borderTop: '1px solid #e5e7eb' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-400">
            결과 처리
          </div>

          <button
            type="button"
            onClick={onCoupang}
            disabled={!selectedCandidateUrl || isApplying}
            className="w-full flex items-center justify-center gap-2 text-white rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-40"
            style={{ background: accent }}
          >
            {isApplying ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            쿠팡 등록하러가기
          </button>

          {selectedCandidateUrl ? (
            <a
              href={selectedCandidateUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151' }}
            >
              <Download size={14} /> 다운로드
            </a>
          ) : (
            <div
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium opacity-40 cursor-not-allowed"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#9ca3af' }}
            >
              <Download size={14} /> 다운로드
            </div>
          )}

          <button
            type="button"
            onClick={onSkip}
            disabled={isSkipping}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-40 text-gray-500 hover:bg-gray-100"
          >
            {isSkipping ? <Loader2 size={14} className="animate-spin" /> : <SkipForward size={14} />}
            건너뛰기
          </button>

          {!selectedCandidateUrl && (
            <p className="text-center text-[11px] text-gray-400">가운데에서 이미지를 선택하세요</p>
          )}
        </div>
      )}
    </div>
  );
}
```

주요 변경:
- Props 에서 `composition` 제거 + `pieceCount` 추가.
- `editCase` prop 추가 (compose 케이스에서 pieceCount 노출).
- `SCENE_PRESETS` 5개 (마지막 'custom-reference' 는 full-width 점선 border 로 구분 스타일).
- 다운로드 버튼 라이트 테마 색상 보정 (기존 검은색 계열 스타일이 회색 배경과 어울리지 않아 연한 gray 로).
- `onPieceCountChange` 를 통해 숫자 입력 관리 (음수 방지 `Math.max(1, ...)`).

- [ ] **Step 2: Build check**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
Expected: `page.tsx` 에서 props 불일치 에러 (Task 7 에서 해결). `EditorControlPanel.tsx` 자체 에러는 없어야 함.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx
git commit -m "refactor(thumbnail-editor/control): editCase 분기 + pieceCount 숫자 + 씬 5프리셋(사용자 정의) + composition 제거"
```

---

## Task 7: Refactor `page.tsx` — editCase 상태 기계 + 페이로드 분기

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/page.tsx`

- [ ] **Step 1: Rewrite the full page**

기존 248줄 파일을 아래로 완전 교체:

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Scissors } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';

import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { EditorInputPanel } from './components/EditorInputPanel';
import { EditorResultPanel } from './components/EditorResultPanel';
import { EditorControlPanel } from './components/EditorControlPanel';
import { UseCaseSelection, type EditUseCase } from './components/UseCaseSelection';
import type { SupplementaryLabel } from './components/EditorInputPanel';

type EditorMode = 'edit' | 'creative';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const queryClient = useQueryClient();

  const { data: product } = useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: () => apiClient.get<{ id: string; name: string; imageUrl: string | null }>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const productName = product?.name ?? '';
  const originalImageUrl = product?.imageUrl ?? null;

  // 모드 / 용도
  const [mode, setMode] = useState<EditorMode>('edit');
  const [editCase, setEditCase] = useState<EditUseCase | null>(null);

  // 공통 입력
  const [productImage, setProductImage] = useState<string | null>(() => imageUrlParam);
  const [userPrompt, setUserPrompt] = useState('');
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');

  // compose (Type 2A)
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [supplementaryLabel, setSupplementaryLabel] = useState<SupplementaryLabel>('박스');
  const [pieceCount, setPieceCount] = useState<number | null>(null);

  // color-variants (Type 2B)
  const [colorImages, setColorImages] = useState<string[]>([]);

  // creative (Type 3)
  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');
  const [backgroundReference, setBackgroundReference] = useState<string | null>(null);

  // 결과
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  // productId 진입 시 imageUrl 파라미터 없으면 상품 이미지 사용
  const effectiveProductImage = productImage ?? (imageUrlParam ? null : originalImageUrl);

  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();

  const resetEditCase = () => {
    setEditCase(null);
    setPackagingImage(null);
    setColorImages([]);
    setSupplementaryLabel('박스');
    setPieceCount(null);
    setUserPrompt('');
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const hasInput = (() => {
    if (mode === 'creative') {
      if (sceneType === 'custom-reference') {
        return !!effectiveProductImage && !!backgroundReference;
      }
      return !!effectiveProductImage;
    }
    if (editCase === 'compose') return !!effectiveProductImage;
    if (editCase === 'color-variants') return colorImages.length >= 2;
    if (editCase === 'single') return !!effectiveProductImage;
    return false;
  })();

  const handleGenerate = async () => {
    try {
      const base = {
        productId: productId ?? undefined,
        mode,
        userPrompt: userPrompt || undefined,
        purpose: mode === 'creative' ? 'quality' as const : purpose,
      };

      let payload: Parameters<typeof generateMutation.mutateAsync>[0];

      if (mode === 'creative') {
        const sceneForBackend = sceneType === 'custom-reference' ? undefined : sceneType;
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
          sceneType: sceneForBackend,
          styleType,
          productDescription: productDescription || undefined,
          backgroundReference: sceneType === 'custom-reference' ? (backgroundReference ?? undefined) : undefined,
        };
      } else if (editCase === 'compose') {
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
          packagingImage: packagingImage ?? undefined,
          supplementaryLabel,
          pieceCount: pieceCount ?? undefined,
        };
      } else if (editCase === 'color-variants') {
        payload = {
          ...base,
          colorImages,
          colorCount: colorImages.length,
        };
      } else if (editCase === 'single') {
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
        };
      } else {
        toast.error('용도를 먼저 선택해주세요');
        return;
      }

      const data = await generateMutation.mutateAsync(payload);
      if (data?.candidates) {
        setResult(data.candidates);
        setGenerationId(data.generationId ?? null);
        setSelectedCandidateUrl(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
        toast.success(`썸네일 ${data.candidates.length}장 생성 완료`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '썸네일 생성 실패');
    }
  };

  const handleSelectCandidate = (url: string) => {
    setSelectedCandidateUrl(url || null);
    if (generationId && url) {
      selectCandidateMutation.mutate({ id: generationId, selectedUrl: url });
    }
  };

  const handleCoupang = async () => {
    try {
      const status = await apiClient.get<{ connected: boolean; error?: string }>(
        '/api/thumbnail-analysis/playwriter-status',
      );
      if (!status.connected) {
        toast.error('Playwriter가 연결되어 있지 않습니다. Playwriter를 실행한 후 다시 시도하세요.');
        return;
      }
    } catch {
      toast.error('Playwriter 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.');
      return;
    }
    openCoupangWingInventory();
    if (generationId) {
      applyGenerationMutation.mutate(generationId);
    }
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const handleSkip = async () => {
    if (generationId) {
      await skipGenerationMutation.mutateAsync(generationId);
    }
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const showUseCaseSelection = mode === 'edit' && editCase === null;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ── 헤더 + 모드 선택 ── */}
      <div
        className="flex-shrink-0 bg-gray-50"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center px-4 pt-3 pb-2 gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#eef0f2', border: '1px solid #e5e7eb' }}
          >
            <Sparkles size={15} className="text-violet-600" />
          </div>
          <h1 className="text-base font-bold text-gray-900 tracking-tight">썸네일 편집기</h1>
          {productName && <span className="text-xs text-gray-400 truncate">— {productName}</span>}
        </div>

        <div className="grid grid-cols-2 gap-0" style={{ borderTop: '1px solid #e5e7eb' }}>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="flex items-center gap-3 px-5 py-5 text-left transition-all duration-200"
            style={{
              background: mode === 'edit' ? 'rgba(139,92,246,0.08)' : 'transparent',
              borderRight: '1px solid #e5e7eb',
              borderBottom: mode === 'edit' ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: mode === 'edit' ? 'rgba(139,92,246,0.15)' : '#f3f4f6' }}
            >
              <Scissors size={16} style={{ color: mode === 'edit' ? '#7c3aed' : '#9ca3af' }} />
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: mode === 'edit' ? '#6d28d9' : '#374151' }}>이미지 편집</div>
              <div className="text-[11px] mt-0.5 text-gray-400">박스/세트 · 색상별 · 가이드라인</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('creative')}
            className="flex items-center gap-3 px-5 py-5 text-left transition-all duration-200"
            style={{
              background: mode === 'creative' ? 'rgba(217,70,239,0.07)' : 'transparent',
              borderBottom: mode === 'creative' ? '2px solid #c026d3' : '2px solid transparent',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: mode === 'creative' ? 'rgba(217,70,239,0.12)' : '#f3f4f6' }}
            >
              <Sparkles size={16} style={{ color: mode === 'creative' ? '#c026d3' : '#9ca3af' }} />
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: mode === 'creative' ? '#a21caf' : '#374151' }}>AI 연출 생성</div>
              <div className="text-[11px] mt-0.5 text-gray-400">컨셉씬 · 라이프스타일 · 무드샷</div>
            </div>
          </button>
        </div>
      </div>

      {/* ── 본문 ── */}
      {showUseCaseSelection ? (
        <UseCaseSelection onSelect={setEditCase} />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px]">
          <EditorInputPanel
            mode={mode}
            editCase={editCase}
            productId={productId}
            productName={productName}
            productImage={effectiveProductImage}
            packagingImage={packagingImage}
            supplementaryLabel={supplementaryLabel}
            colorImages={colorImages}
            backgroundReference={backgroundReference}
            sceneType={sceneType}
            onProductImageChange={setProductImage}
            onPackagingChange={setPackagingImage}
            onSupplementaryLabelChange={setSupplementaryLabel}
            onColorImagesChange={setColorImages}
            onBackgroundReferenceChange={setBackgroundReference}
            onResetEditCase={resetEditCase}
          />

          <EditorResultPanel
            mode={mode}
            originalImage={originalImageUrl ?? productImage}
            candidates={result}
            selectedCandidateUrl={selectedCandidateUrl}
            isGenerating={generateMutation.isPending}
            onSelectCandidate={handleSelectCandidate}
          />

          <EditorControlPanel
            mode={mode}
            editCase={editCase}
            purpose={purpose}
            pieceCount={pieceCount}
            userPrompt={userPrompt}
            sceneType={sceneType}
            styleType={styleType}
            productDescription={productDescription}
            isPending={generateMutation.isPending}
            hasInput={hasInput}
            selectedCandidateUrl={selectedCandidateUrl}
            generationId={generationId}
            isApplying={applyGenerationMutation.isPending}
            isSkipping={skipGenerationMutation.isPending}
            onPurposeChange={setPurpose}
            onPieceCountChange={setPieceCount}
            onUserPromptChange={setUserPrompt}
            onSceneTypeChange={setSceneType}
            onStyleTypeChange={setStyleType}
            onProductDescriptionChange={setProductDescription}
            onGenerate={handleGenerate}
            onCoupang={handleCoupang}
            onSkip={handleSkip}
          />
        </div>
      )}
    </div>
  );
}
```

주요 설계:
- `editCase: EditUseCase | null` — null 이면 `UseCaseSelection` 렌더.
- Creative 모드는 `editCase` 무시 — 바로 3패널로.
- `hasInput` 계산을 IIFE 로 케이스별 분기 (creative custom-reference 는 참고 이미지도 필요).
- `handleGenerate` 페이로드 구성이 케이스별 명시적. `editCase` 가 `null` 인 edit 모드에 들어오면 toast 후 조기 리턴 (정상 UI 흐름에서는 발생하지 않지만 가드).
- `resetEditCase` — 스펙의 state reset 정책 그대로.
- `sceneType === 'custom-reference'` 는 UI 전용: 백엔드로 보낼 땐 `undefined` 로 치환.
- Sub-title 문구 "박스/세트 · 색상별 · 가이드라인" 로 편집 탭 범위 확장을 시사.

- [ ] **Step 2: Build (전체 타입 + 프로덕션 빌드)**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | tail -10`
Expected: 출력 없음 (clean).

Run: `cd apps/web && npm run build 2>&1 | tail -15`
Expected: `✓ Compiled successfully` 또는 동등. 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/thumbnail-editor/page.tsx
git commit -m "refactor(thumbnail-editor/page): editCase 상태 기계 + 케이스별 페이로드 분기 + composition 제거"
```

---

## Task 8: Delete `ThumbnailEditorView.tsx`

**Files:**
- Delete: `apps/web/src/app/thumbnail-editor/components/ThumbnailEditorView.tsx`

- [ ] **Step 1: 재확인 — 진짜 import 안 되는지**

Run: `grep -rn "ThumbnailEditorView" apps/web/src --include="*.tsx" --include="*.ts"`
Expected: 정의부만 출력 (`components/ThumbnailEditorView.tsx:28:export function ThumbnailEditorView() {`). 다른 import 없음.

다른 import 가 있다면: 삭제 보류하고 사용처를 확인 → 스펙에 반영 후 재검토.

- [ ] **Step 2: 삭제**

Run:
```bash
git rm apps/web/src/app/thumbnail-editor/components/ThumbnailEditorView.tsx
```

- [ ] **Step 3: Build 재확인 (삭제로 인한 깨짐 없는지)**

Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | tail -5`
Expected: 출력 없음.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(thumbnail-editor): dead code 제거 — ThumbnailEditorView.tsx (import 없음, 231줄)"
```

---

## Task 9: Build + 기존 vitest regression 검증

- [ ] **Step 1: apps/web 프로덕션 빌드**

Run: `cd apps/web && npm run build 2>&1 | tail -20`
Expected: `✓ Compiled successfully`. `thumbnail-editor` 관련 warning 0.

- [ ] **Step 2: apps/web 기존 테스트 regression**

Run: `cd apps/web && npx vitest run 2>&1 | tail -15`
Expected: 모두 PASS. 이 변경은 `thumbnail-editor` 만 건드리므로 기존 테스트 (api-client/api-error 중심) 에 영향 없음.

- [ ] **Step 3: apps/server 기존 테스트 regression (백엔드 변경 없지만 보험)**

Run: `cd apps/server && npx vitest run src/products 2>&1 | tail -15`
Expected: `thumbnail-editor-generate.spec.ts` 10/10 PASS. 다른 기존 테스트도 PASS.

실패 시: 각 에러를 근본 원인 분석 후 해결. 단순히 테스트 무시 금지.

---

## Task 10: Manual QA (실서버 대응)

**Precondition:**

- 로컬에서 `npm run dev` (또는 기존 `nest start --watch`) 로 server:4000, web:3000 실행 중.
- GEMINI_API_KEY 유효 (루트 `.env`).
- PostgreSQL + MinIO Docker 기동.

각 시나리오마다 **(1) UI 동작 확인** + **(2) DB `thumbnail_generations.method` 확인** 두 단계.

- [ ] **시나리오 A — 편집 탭 진입 + 용도 카드 렌더**

브라우저: `http://localhost:3000/thumbnail-editor?productId=e2f4ff65-2238-5303-bc06-f4dba7f6f136`
기대:
- '이미지 편집' 탭 활성.
- 본문에 카드 3개 ("상품+박스/세트 합성", "색상별 상품 배치", "단일 상품 정리") 만 보임. Input/Result/Control 3패널 **안 보임**.

- [ ] **시나리오 B — Type 2A (상품+박스) 생성**

1. '상품+박스/세트 합성' 카드 클릭
2. 3패널 + 상단 breadcrumb ("상품+박스/세트 합성 · ← 용도 변경") 확인
3. 상품 슬롯: 상품 이미지 업로드. 보조 슬롯: 박스 이미지 업로드. 보조 라벨 드롭다운 '박스' 유지.
4. pieceCount = 3 입력
5. purpose = '가이드라인 수정'
6. '편집 시작' 클릭 → ~20~40초 대기
7. Result 패널에 썸네일 1장 표시

DB 확인:
```bash
docker exec kiditem-postgres psql -U kiditem -d kiditem -c "SELECT id, method, status, created_at FROM thumbnail_generations ORDER BY created_at DESC LIMIT 1;"
```
기대: `method='generate'`, `status='ready'`.

- [ ] **시나리오 C — Type 2B (색상별) 생성**

1. breadcrumb '← 용도 변경' 클릭 → 카드 3개 복귀
2. '색상별 상품 배치' 클릭
3. 드롭존에 이미지 3장 한 번에 드래그 → 썸네일 그리드에 3개 (X 버튼 포함).
4. 2번 이미지 X 클릭 → 썸네일 2개로 줄어듦.
5. 이미지 1장 더 추가 → 3개.
6. 카운터 "3 / 8 · 최소 2장 이상" 확인.
7. '편집 시작' → Result 에 합성 썸네일.

DB 확인: `method='generate'`.

- [ ] **시나리오 D — 용도 변경 리셋 검증**

1. 시나리오 C 직후 상태에서 '← 용도 변경' 클릭.
2. 카드 3개 복귀.
3. '색상별 상품 배치' 재진입 → **드롭존이 비어 있어야 함** (이전 3장 사라짐).
4. 추가 검증: '상품+박스' 진입 → packagingImage, pieceCount, supplementaryLabel 모두 초기값 ('박스' / 빈값).

- [ ] **시나리오 E — Type 3 기존 프리셋 regression**

1. 상단 'AI 연출' 탭 클릭 (edit 탭 state 는 보존돼야 함 — 탭 전환만으로 리셋되면 FAIL).
2. 상품 슬롯 업로드.
3. 씬 'white-studio' 유지, 분위기 'minimal' 유지.
4. 'AI 연출 생성' → ~30초 → Result 에 썸네일.

DB 확인: `method='creative'`.

- [ ] **시나리오 F — Type 3 custom-reference 생성**

1. AI 연출 탭, 씬 프리셋에서 '🖼️ 사용자 정의 이미지' 점선 버튼 클릭.
2. Input 패널에 '분위기 참고 이미지' 슬롯이 **펼쳐짐** 확인.
3. 상품 이미지 + 참고 이미지 둘 다 업로드.
4. 'AI 연출 생성' → ~30초.

DB 확인: `method='creative'`. 네트워크 탭에서 request body 에 `backgroundReference` 키 있고 `sceneType` 키는 **없음** 확인 (custom-reference 는 스트립돼야 함).

- [ ] **시나리오 G — Type 3 custom-reference 가드**

1. 씬 'custom-reference' 선택, 참고 이미지 업로드 **안 함**.
2. 'AI 연출 생성' 버튼이 **비활성** (`disabled`) 상태인지 확인.

- [ ] **시나리오 H — 탭 간 state 보존**

1. AI 연출 탭에서 상품 + 참고 이미지 업로드 + 스타일 선택.
2. 편집 탭으로 전환 → 카드 3개 화면 (기존 edit state 초기화 상태면 카드).
3. AI 연출 탭 복귀 → **입력한 이미지/스타일이 그대로 있어야 함**.

- [ ] **시나리오 I — `composition` dead field 제거 검증**

1. '단일 상품 정리' 진입.
2. ControlPanel 에 **"상품 구성" freeform textarea 가 없어야 함**. 보이는 필드: "편집 목적" 라디오 + "편집 지시사항" textarea 뿐.
3. Request body 네트워크 검사 → `composition` 키 없음.

- [ ] **최종 Commit (QA 로그 + 완료 마킹용)**

QA 에서 문제 없으면 별도 코드 변경 없이 프로젝트 진행 기록용 태그 가능:
```bash
git log --oneline -10   # 커밋 로그 확인
```

문제 있으면: 각 시나리오 실패 원인을 찾아 해당 Task 로 돌아가 수정 후 재시도.

---

## Spec Coverage Check

스펙의 요구사항 각각이 위 태스크로 커버되는지:

| 스펙 항목 | 커버 태스크 |
|---|---|
| UseCaseSelection 3카드 | T3 + T7 (렌더 조건) |
| compose 슬롯2 + supplementaryLabel 드롭다운 | T5 |
| compose pieceCount 숫자 입력 | T6 |
| color-variants multi-drop + 썸네일 그리드 | T4 + T5 |
| color-variants `colorCount = length` 자동 전송 | T7 (handleGenerate) |
| single 케이스 (기존 유지 + composition 제거) | T5 + T6 + T7 |
| creative 씬 5프리셋 (+ 사용자 정의) | T6 |
| creative custom-reference 선택 시 backgroundReference 슬롯 펼침 | T5 |
| custom-reference → sceneType undefined 로 스트립 | T7 (handleGenerate) |
| custom-reference 참고 이미지 없으면 생성 비활성 | T7 (hasInput) |
| breadcrumb + 용도 변경 | T2 + T5 |
| 용도 변경 state 리셋 정책 | T7 (resetEditCase) |
| 탭 전환 시 state 보존 | T7 (setMode 만 호출, 리셋 안 함) |
| composition dead field 제거 (hook + UI + payload) | T1 + T6 + T7 |
| ThumbnailEditorView dead code 삭제 | T8 |
| hook 타입 시그니처 (`colorImages`, `supplementaryLabel`, `backgroundReference` 추가) | T1 |
| Manual QA 6+ 시나리오 | T10 |

Gap: 없음. 전 스펙 커버.

## Constraints Observed

- apps/web/CLAUDE.md 준수: `apiClient` 사용 (raw fetch 금지), `cn()` 유틸, Lucide, `@tanstack/react-query` mutation, `sonner` toast, `'use client'`, no SSE (ADR-0010).
- 드래그 정렬 라이브러리 추가 없음.
- 이미지 업로드 data URL 방식 유지.
- 테스트: apps/web 컨벤션 "core infra only" 존중. 컴포넌트 behavior 테스트 추가 안 함.
- companyId 서버 측 `@CurrentCompany()` 경유 — 프론트엔드는 건드리지 않음 (ADR-0006).
