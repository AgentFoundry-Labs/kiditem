# Thumbnail Editor v2: ProductSelector + Inline Hub Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1 (HubImagePickerModal) 결과물을 인라인 picker + 헤더 ProductSelector 로 redesign. 단독 진입 시에도 상품 검색 가능.

**Architecture:** 모달 (`HubImagePickerModal`, `hubModalOpen` state, `handleHubApply`) 완전 제거. 헤더에 `ProductSelector` (기존 컴포넌트 재사용) + `useRouter().replace` 로 URL `?productId=...` 동기화. 신규 `HubInlinePicker.tsx` 가 슬롯별로 role-filtered 썸네일 그리드 표시 (single 모드: compose product/box, single 상품, creative 상품 / multi 모드: color-variants).

**Tech Stack:** Next.js App Router (`useSearchParams`, `useRouter`), React, TypeScript, Tailwind + `cn()`, Lucide React, sonner toast, 기존 `useProductImages` hook + `ProductSelector` 컴포넌트 재사용. v1 의 공유 `HUB_ROLE_CONFIG` 그대로 활용.

**Testing convention:** apps/web 는 "Test infrastructure core only" (apps/web/CLAUDE.md). 컴포넌트 behavior 테스트 미작성. 매 태스크 후 `npx tsc --noEmit --skipLibCheck` 가드 + 마지막 build + vitest regression + manual QA 12 시나리오 (Claude Preview).

**Spec reference:** [docs/superpowers/specs/2026-04-16-thumbnail-editor-product-selector-redesign.md](../specs/2026-04-16-thumbnail-editor-product-selector-redesign.md)

**v1 산출물 처리:**
- 유지: `apps/web/src/lib/hub-roles.ts`, `EditorControlPanel.tsx` purpose 제거, `ImageGrid.tsx` 변경
- 삭제: `HubImagePickerModal.tsx` (331줄)
- 수정: `EditorInputPanel.tsx` (hub 버튼 → 인라인 picker), `page.tsx` (모달 state/handler 제거 + ProductSelector 추가)

---

## File Structure

### New (1)

| Path | 책임 |
|---|---|
| `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx` | role 별 hub 썸네일 그리드. single/multi 모드. loading/empty 상태. 부모는 onSelect 콜백으로 클릭 처리 |

### Modified (3)

| Path | 변경 |
|---|---|
| `apps/web/src/app/thumbnail-editor/page.tsx` | 헤더에 ProductSelector + useRouter; modal state/handler/mount 모두 제거; EditorInputPanel props 변경 |
| `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` | hub 버튼 + props 제거; 각 슬롯 아래 HubInlinePicker 마운트; ColorVariantsUploader 아래에도 multi 모드 picker |
| `apps/web/src/app/thumbnail-editor/CLAUDE.md` | v2 redesign 기록 |

### Deleted (1)

| Path | 이유 |
|---|---|
| `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` | 인라인 picker 로 대체 (331줄 삭제) |

### Task dependency

```
T1 (HubInlinePicker 신규) ── T2 에서 사용
T2 (EditorInputPanel 리팩) ── T3 에서 props 흐름
T3 (page.tsx 리팩 + ProductSelector + URL 동기화) ── 통합
T4 (HubImagePickerModal 삭제) ── 독립 cleanup
T5 (CLAUDE.md 업데이트) ── 문서
T6 (build + vitest regression) ── 검증
T7 (manual QA 12 시나리오) ── 검증
```

---

## Task 1: 신규 `HubInlinePicker.tsx` 작성

**Files:**
- Create: `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx`

### Step 1: 컴포넌트 작성

- [ ] 아래 내용으로 `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx` 생성:

```tsx
'use client';

import { useMemo } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HUB_ROLE_CONFIG, type ProductImageRole } from '@/lib/hub-roles';
import type { ProductImageItem } from '@kiditem/shared';

type SelectMode = 'single' | 'multi';

interface Props {
  images: ProductImageItem[];  // 부모가 useProductImages 로 fetch 한 전체 목록
  loading: boolean;            // 부모의 loading 상태
  productId: string;           // "이미지 허브로 이동" 링크용
  role: ProductImageRole;
  mode: SelectMode;
  selectedUrls: string[];
  onSelect: (url: string) => void;
  maxRemaining?: number;
}

export function HubInlinePicker({
  images,
  loading,
  productId,
  role,
  mode,
  selectedUrls,
  onSelect,
  maxRemaining,
}: Props) {
  const roleImages = useMemo(() => images.filter((img) => img.role === role), [images, role]);
  const roleConfig = useMemo(() => HUB_ROLE_CONFIG.find((c) => c.role === role), [role]);

  const isSelected = (url: string) => selectedUrls.includes(url);

  const handleClick = (url: string) => {
    // multi 모드 cap 검사
    if (mode === 'multi' && maxRemaining !== undefined) {
      if (!isSelected(url) && maxRemaining <= 0) {
        toast.error('이미 최대 장수에 도달했습니다');
        return;
      }
    }
    onSelect(url);
  };

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-2 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-violet-700">
          {roleConfig?.label ?? role} <span className="text-gray-400 font-normal">허브에서 선택</span>
        </div>
        <span className="text-[10px] text-gray-400">{roleImages.length}장</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3 text-gray-400">
          <Loader2 size={12} className="animate-spin mr-1" />
          <span className="text-[10px]">로딩 중...</span>
        </div>
      ) : roleImages.length === 0 ? (
        <div className="text-center py-3">
          <div className="text-[10px] text-gray-500 mb-1">허브에 등록된 이미지 없음</div>
          <a
            href={`/image-hub?productId=${productId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700"
          >
            <ExternalLink size={10} /> 이미지 허브로 이동
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {roleImages.map((img, i) => {
            const selected = isSelected(img.url);
            return (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => handleClick(img.url)}
                className={cn(
                  'relative aspect-square rounded-md overflow-hidden bg-white transition-all duration-150',
                  selected
                    ? 'ring-2 ring-violet-500 border border-violet-500'
                    : 'border border-gray-200 hover:border-violet-300',
                )}
              >
                <img
                  src={img.url}
                  alt={img.label || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {selected && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-violet-600 text-white text-[8px] font-bold flex items-center justify-center">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

주요 설계:
- **useProductImages 호출 없음** — `images` + `loading` 은 부모(page.tsx → EditorInputPanel → HubInlinePicker)에서 props 로 전달. 중복 fetch 제거 (eng review #1).
- `loading="lazy"` on img
- multi 모드 cap: `maxRemaining = 8 - colorImages.length`. 이미 선택된 것 재클릭은 toggle 이라 차단 X.
- 컴팩트 grid 3-col (Input 패널 240px wide 기준).
- 컨테이너 violet tint background 으로 업로드 영역과 시각 구분.

### Step 2: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep HubInlinePicker | head`
- [ ] Expected: 출력 없음 (자체 에러 없음)

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx
git commit -m "feat(thumbnail-editor/ui): HubInlinePicker (슬롯 안 role-필터 썸네일 그리드, single/multi 모드) 신규"
```

---

## Task 2: `EditorInputPanel.tsx` 리팩 — hub 버튼 → 인라인 picker

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx`

### Step 1: 파일 전체 교체

- [ ] `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` 을 아래로 완전 교체:

```tsx
'use client';
import { Package } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { ColorVariantsUploader } from './ColorVariantsUploader';
import { EditCaseBreadcrumb } from './EditCaseBreadcrumb';
import { HubInlinePicker } from './HubInlinePicker';
import type { EditUseCase } from './UseCaseSelection';
import type { ProductImageItem } from '@kiditem/shared';

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
  hubImages: ProductImageItem[];     // page.tsx 에서 useProductImages 1회 fetch 결과
  hubImagesLoading: boolean;          // page.tsx 의 loading 상태
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
  hubImages,
  hubImagesLoading,
  onProductImageChange,
  onPackagingChange,
  onSupplementaryLabelChange,
  onColorImagesChange,
  onBackgroundReferenceChange,
  onResetEditCase,
}: Props) {
  const showBreadcrumb = mode === 'edit' && editCase !== null;

  // multi 모드 toggle 핸들러
  const handleColorVariantToggle = (url: string) => {
    if (colorImages.includes(url)) {
      onColorImagesChange(colorImages.filter((u) => u !== url));
    } else {
      onColorImagesChange([...colorImages, url]);
    }
  };

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
        {/* 편집 모드 — compose */}
        {mode === 'edit' && editCase === 'compose' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 대표 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
              {productId && (
                <HubInlinePicker
                  images={hubImages}
                  loading={hubImagesLoading}
                  productId={productId}
                  role="product"
                  mode="single"
                  selectedUrls={productImage ? [productImage] : []}
                  onSelect={(url) => onProductImageChange(url)}
                />
              )}
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
              {productId && (
                <HubInlinePicker
                  images={hubImages}
                  loading={hubImagesLoading}
                  productId={productId}
                  role="box"
                  mode="single"
                  selectedUrls={packagingImage ? [packagingImage] : []}
                  onSelect={(url) => onPackagingChange(url)}
                />
              )}
            </div>
          </>
        )}

        {/* 편집 모드 — color-variants */}
        {mode === 'edit' && editCase === 'color-variants' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">색상별 상품 사진</div>
            <ColorVariantsUploader values={colorImages} onChange={onColorImagesChange} />
            {productId && (
              <HubInlinePicker
                images={hubImages}
                loading={hubImagesLoading}
                productId={productId}
                role="color_variant"
                mode="multi"
                selectedUrls={colorImages}
                onSelect={handleColorVariantToggle}
                maxRemaining={8 - colorImages.length}
              />
            )}
          </div>
        )}

        {/* 편집 모드 — single */}
        {mode === 'edit' && editCase === 'single' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">상품 사진</div>
            <div className="text-[11px] text-gray-400">정리할 원본 상품 이미지</div>
            <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
            {productId && (
              <HubInlinePicker
                productId={productId}
                role="product"
                mode="single"
                selectedUrls={productImage ? [productImage] : []}
                onSelect={(url) => onProductImageChange(url)}
              />
            )}
          </div>
        )}

        {/* AI 연출 */}
        {mode === 'creative' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
              {productId && (
                <HubInlinePicker
                  images={hubImages}
                  loading={hubImagesLoading}
                  productId={productId}
                  role="product"
                  mode="single"
                  selectedUrls={productImage ? [productImage] : []}
                  onSelect={(url) => onProductImageChange(url)}
                />
              )}
            </div>
            {sceneType === 'custom-reference' && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">분위기 참고 이미지</div>
                <div className="text-[11px] text-gray-400">mood · 팔레트 · 질감 참고용</div>
                <ImageUploader label="" value={backgroundReference} onChange={onBackgroundReferenceChange} />
                {/* backgroundReference 는 매칭 role 없어 hub picker 미노출 */}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

주요 변경 (v1 대비):
- `hasProductId`, `onOpenHubModal` props 제거.
- `FolderOpen`, `cn` import 제거 (HubInlinePicker 안에서 사용).
- 각 ImageUploader 아래에 `productId &&` 가드로 `<HubInlinePicker .../>` 추가.
- color-variants 케이스: `handleColorVariantToggle` 인라인 핸들러로 multi 토글.
- 기존 hub 버튼 JSX 블록 통째로 제거.

### Step 2: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
- [ ] Expected: page.tsx 에서 props 불일치 에러 (Task 3 에서 해결). EditorInputPanel.tsx 자체는 clean.

To verify self-clean: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/EditorInputPanel.tsx"`
- [ ] Expected: 출력 없음.

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx
git commit -m "refactor(thumbnail-editor/input): hub 버튼 제거 + 슬롯별 HubInlinePicker 마운트"
```

---

## Task 3: `page.tsx` 리팩 — ProductSelector + URL 동기화 + 모달 제거

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/page.tsx`

### Step 1: 파일 전체 교체

- [ ] `apps/web/src/app/thumbnail-editor/page.tsx` 을 아래로 완전 교체:

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Scissors, ShoppingBag, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';
import { ProductSelector } from '@/components/product/ProductSelector';
import { useProductImages } from '@/hooks/useProductImages';

import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { EditorInputPanel } from './components/EditorInputPanel';
import { EditorResultPanel } from './components/EditorResultPanel';
import { EditorControlPanel } from './components/EditorControlPanel';
import { UseCaseSelection, type EditUseCase } from './components/UseCaseSelection';
import type { SupplementaryLabel } from './components/EditorInputPanel';

type EditorMode = 'edit' | 'creative';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  // 허브 이미지 (1회 fetch — eng review #1)
  const { images: hubImages, loading: hubImagesLoading } = useProductImages(productId);

  // 결과
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

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
        purpose: mode === 'creative' ? ('quality' as const) : ('compliance' as const),
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
          backgroundReference:
            sceneType === 'custom-reference' ? (backgroundReference ?? undefined) : undefined,
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

  // ProductSelector 핸들러
  const handleProductSelect = (selected: { id: string; name: string; imageUrl: string | null; sku: string | null }) => {
    router.replace(`/thumbnail-editor?productId=${selected.id}`);
  };

  const handleClearProduct = () => {
    router.replace('/thumbnail-editor');
    // 상품 변경 = 새 작업 — 전체 리셋 (eng review #2)
    setEditCase(null);
    setProductImage(null);
    setUserPrompt('');
    setPackagingImage(null);
    setSupplementaryLabel('박스');
    setPieceCount(null);
    setColorImages([]);
    setSceneType('white-studio');
    setStyleType('minimal');
    setProductDescription('');
    setBackgroundReference(null);
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
          <h1 className="text-base font-bold text-gray-900 tracking-tight flex-shrink-0">썸네일 편집기</h1>

          {/* ProductSelector / Compact pill */}
          <div className="ml-auto w-[280px]">
            {productId && productName ? (
              <button
                type="button"
                onClick={handleClearProduct}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors text-xs font-medium text-violet-700"
              >
                <ShoppingBag size={14} className="flex-shrink-0" />
                <span className="truncate flex-1 text-left">{productName}</span>
                <ChevronDown size={12} className="flex-shrink-0 opacity-60" />
              </button>
            ) : (
              <ProductSelector selectedId={null} onSelect={handleProductSelect} />
            )}
          </div>
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

      {/* 본문 */}
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
            hubImages={hubImages}
            hubImagesLoading={hubImagesLoading}
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

주요 변경 (v1 대비):
- 신규 import: `useRouter` from 'next/navigation', `ShoppingBag, ChevronDown` from lucide-react, `ProductSelector` from `@/components/product/ProductSelector`, `useProductImages` from `@/hooks/useProductImages`.
- 제거 import: `HubImagePickerModal`, `HubSelected` 타입.
- 제거 state: `hubModalOpen`, `setHubModalOpen`.
- 제거 함수: `handleHubApply` 전체.
- 신규 함수: `handleProductSelect`, `handleClearProduct` (전체 리셋 — eng review #2).
- 신규: `useProductImages(productId)` 1회 호출 + EditorInputPanel 에 `hubImages` / `hubImagesLoading` 전달 (eng review #1).
- 헤더 우측에 ProductSelector / compact pill toggle 추가 (`w-[280px]` 컨테이너).
- EditorInputPanel props 정리: `hasProductId`, `onOpenHubModal` 제거. `hubImages`, `hubImagesLoading` 추가.
- 본문 끝 `<HubImagePickerModal />` 마운트 제거.
- product name suffix 제거 (헤더 우측 pill 로 대체).

### Step 2: Build (tsc + next build)

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | head -10`
- [ ] Expected: 출력 없음. (HubImagePickerModal import 제거 됐지만 파일 자체가 아직 있어서 OK. Task 4 에서 삭제.)

- [ ] Run: `cd apps/web && npm run build 2>&1 | tail -15`
- [ ] Expected: `✓ Compiled successfully`.

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/page.tsx
git commit -m "refactor(thumbnail-editor/page): ProductSelector + URL 동기화 + hub modal state/handler 제거"
```

---

## Task 4: `HubImagePickerModal.tsx` 삭제

**Files:**
- Delete: `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx`

### Step 1: import 사용처 재확인

- [ ] Run: `grep -rn "HubImagePickerModal\|HubSelected" apps/web/src --include="*.tsx" --include="*.ts"`
- [ ] Expected: 출력 없음 (Task 3 에서 모든 사용처 제거됨). 정의부 자체만 남아 있어야.

만약 다른 import 가 남아 있으면 해당 파일 수정 후 재시도.

### Step 2: 삭제

- [ ] Run:
```bash
git rm apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx
```

### Step 3: Build 재확인

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | head -5`
- [ ] Expected: 출력 없음.

- [ ] Run: `cd apps/web && npm run build 2>&1 | tail -5`
- [ ] Expected: `✓ Compiled successfully`.

### Step 4: Commit

- [ ] Run:
```bash
git commit -m "chore(thumbnail-editor): HubImagePickerModal.tsx 삭제 (인라인 picker 로 대체)"
```

---

## Task 5: `CLAUDE.md` 업데이트 — v2 redesign 반영

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/CLAUDE.md`

### Step 1: Structure 트리 업데이트

- [ ] 파일 트리에서 `HubImagePickerModal.tsx` 라인 제거. `ColorVariantsUploader` 다음 위치에 새 라인 삽입:

기존 (변경 전):
```
│   ├── ColorVariantsUploader.tsx  # Type 2B — 2~8장 multi-drop + 썸네일 그리드 (X 삭제)
│   ├── HubImagePickerModal.tsx    # 이미지 허브 picker — role 섹션 그리드 + checkbox multi-select + role→slot 매핑
│   ├── ImageUploader.tsx          # 단일 슬롯 FileReader → dataURL
```

변경 후:
```
│   ├── ColorVariantsUploader.tsx  # Type 2B — 2~8장 multi-drop + 썸네일 그리드 (X 삭제)
│   ├── HubInlinePicker.tsx        # 슬롯 안 인라인 hub 썸네일 그리드 (single/multi 모드)
│   ├── ImageUploader.tsx          # 단일 슬롯 FileReader → dataURL
```

### Step 2: "이미지 허브 임포트" 섹션 전면 교체

- [ ] 기존 `### 6. 이미지 허브 임포트` 섹션 (모달 기반 설명) 를 아래 v2 버전으로 교체:

```markdown
### 6. 이미지 허브 임포트 (인라인)

페이지 헤더의 `ProductSelector` 로 productId 를 URL `?productId=...` 동기화. 각 슬롯 ImageUploader 아래에 `HubInlinePicker` 가 인라인 노출 — `useProductImages(productId)` 로 fetch, 해당 role 만 필터해서 썸네일 그리드 표시. 클릭 시 부모 setter 호출.

- 헤더: productId 없으면 ProductSelector (검색 input + 드롭다운). 있으면 컴팩트 pill ("🛍️ {상품명} ▾"). pill 클릭 시 productId 해제 + 슬롯 상태 리셋.
- 슬롯-role 매핑: compose 상품 → product / compose 보조 → box / single → product / creative 상품 → product / color-variants → color_variant. backgroundReference 는 매칭 role 없음 (업로드만).
- 모드: 단일 슬롯은 single (클릭 = setSlot). color-variants 는 multi (클릭 = colorImages 토글, max 8).
- 빈 상태: "허브에 등록된 이미지 없음 · 이미지 허브로 이동" 링크 (새 탭).
- URL 동기화: 상품 선택 시 `router.replace('?productId=...')`. 새로고침/공유 안전.
- v1 의 `HubImagePickerModal` 은 사용 안 함 (삭제됨).
```

### Step 3: Rules 섹션 — 추가/수정

- [ ] 다음 두 줄 추가 (적절한 위치):

```markdown
- 헤더 ProductSelector → URL `?productId=...` (router.replace) — 새로고침/공유 안전.
- 슬롯 hub 인라인 picker 는 `productId &&` 가드. productId 없으면 picker 숨김 (헤더에서 선택 유도).
```

### Step 4: "함께 수정할 파일 맵" 정리

- [ ] 기존 `허브 role → 편집기 슬롯 매핑 규칙` 행을 아래로 교체:

기존:
```markdown
| 허브 role → 편집기 슬롯 매핑 규칙 | `HubImagePickerModal.tsx` `matchingRoles()`, `handleApply()` + `page.tsx` `handleHubApply()` (쌍으로) |
```

변경:
```markdown
| 허브 role → 편집기 슬롯 매핑 규칙 | `EditorInputPanel.tsx` 의 `<HubInlinePicker role="...">` prop. role-slot 매핑 변경 시 EditorInputPanel 해당 case 블록 수정 |
| ProductSelector / URL 동기화 | `page.tsx` `handleProductSelect`, `handleClearProduct` + `useRouter`. 검색 컴포넌트 변경 시 `apps/web/src/components/product/ProductSelector.tsx` |
```

### Step 5: Build sanity check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -3`
- [ ] Expected: 출력 없음.

### Step 6: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/CLAUDE.md
git commit -m "docs(thumbnail-editor/CLAUDE.md): v2 redesign — ProductSelector + 인라인 picker 반영"
```

---

## Task 6: Build + vitest regression

### Step 1: 프로덕션 빌드

- [ ] Run: `cd apps/web && npm run build 2>&1 | tail -20`
- [ ] Expected: `✓ Compiled successfully`. thumbnail-editor 관련 warning 0.

### Step 2: apps/web vitest

- [ ] Run: `cd apps/web && npx vitest run 2>&1 | tail -15`
- [ ] Expected: 모두 PASS. (이전 commit 기준 8 파일 / 68 테스트 PASS 확인됨.)

### Step 3: apps/server vitest products

- [ ] Run: `cd apps/server && npx vitest run src/products 2>&1 | tail -10`
- [ ] Expected: 4 파일 / 50 테스트 PASS (백엔드 무변경이라 regression 0).

실패 시 근본 원인 분석 후 수정. skip 금지.

---

## Task 7: Manual QA (Claude Preview MCP, 12 시나리오)

**Precondition:**
- worktree 에서 `cd apps/web && npm run dev` (port 3000)
- Backend (port 4000), PostgreSQL, MinIO 실행 중
- 테스트 상품: `e2f4ff65-2238-5303-bc06-f4dba7f6f136` (색칠하는에어글라이더, 허브에 product role 1장 등록)

### 시나리오 (a) — 단독 진입 (productId 없음)

- [ ] 브라우저: `http://localhost:3000/thumbnail-editor`
- [ ] 헤더 우측에 "검색해서 선택" placeholder 의 ProductSelector 노출
- [ ] 컴팩트 pill 안 보임 (상품 미선택)
- [ ] 편집 탭 활성, 용도 카드 3개 보임

### 시나리오 (b) — 헤더에서 상품 검색·선택

- [ ] ProductSelector input 에 "에어글" 입력
- [ ] 드롭다운에 "색칠하는에어글라이더" 결과 노출 (300ms debounce 후)
- [ ] 결과 클릭 → URL 이 `?productId=e2f4ff65-...` 로 갱신
- [ ] 헤더가 "🛍️ 색칠하는에어글라이더 ▾" pill 로 변환
- [ ] ProductSelector input 사라짐

### 시나리오 (c) — compose 진입 + 인라인 picker 노출

- [ ] '상품+박스/세트 합성' 카드 클릭
- [ ] Input 패널 에 [breadcrumb] [이미지 입력] [상품명] 영역 + 두 슬롯
- [ ] 각 ImageUploader 아래에 "🛍️ 상품 사진 허브에서 선택 (1장)" 헤더 + 썸네일 그리드 (1장) 노출
- [ ] 보조 슬롯 아래에는 "📦 포장 사진 허브에서 선택 (0장)" + "허브에 등록된 이미지 없음 · 이미지 허브로 이동" 링크

### 시나리오 (d) — 인라인 picker single-select (compose 상품)

- [ ] 상품 슬롯 아래 product 썸네일 클릭 → ImageUploader 가 그 이미지를 표시 (✓ badge 우상단)
- [ ] 클릭 다시 (같은 썸네일) → 같은 URL 재선택 = no-op (state 변화 없음 — 부모 setter 가 같은 값으로 호출)
- [ ] 다른 product 썸네일 (있다면) 클릭 → ImageUploader 갱신, 이전 ✓ 사라지고 새 썸네일에 ✓ 표시

### 시나리오 (e) — color-variants 인라인 picker multi 토글

- [ ] '← 용도 변경' → '색상별 상품 배치' 클릭
- [ ] ColorVariantsUploader 아래에 "🎨 색상별 사진 허브에서 선택 (N장)" 인라인 picker
- [ ] color_variant 썸네일 click → ColorVariantsUploader 썸네일 그리드에 추가 (콘솔로 colorImages 길이 +1)
- [ ] 같은 썸네일 재클릭 → 제거 (콘솔 길이 -1)
- [ ] 8장 도달 시 추가 클릭 → toast "이미 최대 장수에 도달했습니다"

### 시나리오 (f) — single 케이스 인라인 picker

- [ ] '단일 상품 정리' 진입
- [ ] 상품 슬롯 아래에만 product role picker (compose 와 동일 동작)

### 시나리오 (g) — creative 케이스 인라인 picker

- [ ] AI 연출 탭 → 상품 슬롯 아래에 product picker
- [ ] 씬 'custom-reference' 선택 → backgroundReference 슬롯 펼침
- [ ] backgroundReference 슬롯 아래에는 picker **없음** (매칭 role 없음, 업로드만)

### 시나리오 (h) — 빈 hub (다른 productId)

- [ ] 헤더 pill 클릭 → URL `/thumbnail-editor` 로 복귀, ProductSelector 다시 노출
- [ ] 허브 이미지 0장인 상품 검색·선택 (예: 신규 상품)
- [ ] 용도 카드 → compose → 슬롯 아래 picker 가 "허브에 등록된 이미지 없음 · 이미지 허브로 이동" 링크 표시
- [ ] 링크 클릭 → 새 탭에서 `/image-hub?productId=...` 열림

### 시나리오 (i) — 상품 변경 시 슬롯 리셋

- [ ] 상품 A 선택 → 슬롯에 hub 이미지 채움
- [ ] 헤더 pill 클릭 → 상품 검색 모드로 → 상품 B 선택
- [ ] productImage / packagingImage / colorImages / backgroundReference 모두 null 또는 [] 로 리셋 (handleClearProduct + 새 productId 진입)

### 시나리오 (j) — HubImagePickerModal 부재

- [ ] DevTools React component tree 에서 `HubImagePickerModal` 검색
- [ ] 결과 0건 (마운트 안 됨)
- [ ] DOM 에서 `[role="dialog"]` 검색 → editor 페이지엔 없음

### 시나리오 (k) — purpose 토글 부재 (v1 regression)

- [ ] 편집 모드 → 어느 케이스든 ControlPanel 에 "편집 목적" 라벨 / "가이드라인 수정" / "품질 개선" 어디에도 없음
- [ ] 편집 시작 시 payload 에 `purpose: "compliance"` (네트워크 탭)

### 시나리오 (l) — URL 직진입 호환성

- [ ] `?productId=...` 가 있는 URL 직접 입력 (북마크 시뮬레이션)
- [ ] 헤더가 곧장 컴팩트 pill 로 렌더 (검색 input 안 거침)
- [ ] 슬롯 picker 즉시 활성

### 마무리

- [ ] Run: `git log --oneline e27bd63..HEAD | head -10` — v1 6 commits + v2 5 commits = 11 commits 누적
- [ ] 문제 발견 시 해당 Task 로 회귀

---

## Spec Coverage Check

| 스펙 요구사항 | 커버 태스크 |
|---|---|
| 헤더 ProductSelector + URL 동기화 | T3 (handleProductSelect / handleClearProduct + useRouter) |
| 컴팩트 pill toggle | T3 (productId && productName ? pill : ProductSelector) |
| HubImagePickerModal 삭제 | T4 |
| modal state/handler/mount 모두 page.tsx 에서 제거 | T3 |
| 슬롯별 인라인 HubInlinePicker (single 모드) | T1 + T2 (compose product/box, single 상품, creative 상품) |
| color-variants 인라인 picker (multi 모드, 8장 cap) | T1 (`maxRemaining` prop) + T2 (`handleColorVariantToggle`) |
| backgroundReference 슬롯엔 picker 없음 | T2 (creative 블록에 picker 안 마운트) |
| 빈 허브 empty state + 링크 | T1 (`roleImages.length === 0` 분기) |
| Loading 상태 spinner | T1 (`loading` 분기) |
| 상품 변경 시 슬롯 리셋 | T3 (handleClearProduct 가 setProductImage 등 null) |
| URL 직진입 호환성 (북마크) | T3 (productId 가 있으면 자동 pill 모드) |
| v1 의 purpose 제거 / 공유 ROLE_CONFIG 유지 | (v1 결과물, regression 만 검증 — T7-k) |
| 백엔드 무변경 | (구현 자체에 백엔드 변경 없음) |
| Manual QA 12 시나리오 | T7 |
| CLAUDE.md 업데이트 | T5 |

Gap: 없음.

## Constraints Observed

- apps/web/CLAUDE.md 준수: `apiClient`, Tailwind + `cn()`, Lucide, `'use client'`, `@tanstack/react-query`, `sonner`, `useRouter` (App Router).
- ProductSelector 변경 없음 (재사용).
- `useProductImages` 변경 없음 (재사용).
- 인라인 picker `loading="lazy"` on img.
- Test 컨벤션: 컴포넌트 behavior 테스트 추가 X. tsc 가드 + build + manual QA.
- companyId / 인증 무관.
