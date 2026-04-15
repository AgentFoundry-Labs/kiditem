# Thumbnail Editor: Hub Import + Quality Toggle Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 썸네일 편집기에 이미지 허브 임포트 모달을 붙이고 '편집 목적' 토글을 제거한다. 백엔드 무변경.

**Architecture:** 공유 `ROLE_CONFIG` 상수 (신규 `apps/web/src/lib/hub-roles.ts`) 로 허브/모달 drift 방지 · Radix Dialog 기반 `HubImagePickerModal.tsx` (role 섹션 그리드 + 체크박스 multi-select + role→slot 자동 매핑) · `page.tsx` 에서 `hubModalOpen` 상태 + `handleHubApply` 로 편집기 슬롯에 반영. purpose 는 edit 모드 payload 에서 `'compliance'` 하드코딩.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind + `cn()`, Lucide React, `@radix-ui/react-dialog@^1.1.15`, `@tanstack/react-query`, `sonner` toast, `useProductImages` hook (기존 재사용).

**Testing convention:** apps/web 는 "Test infrastructure core only" (apps/web/CLAUDE.md). 컴포넌트 behavior 테스트는 작성하지 않음. 매 태스크 후 `npx tsc --noEmit --skipLibCheck` 가드 + 마지막에 `npm run build` + `npx vitest run` regression + 실서버 manual QA 12 시나리오.

**Spec reference:** [docs/superpowers/specs/2026-04-16-thumbnail-editor-hub-import-design.md](../specs/2026-04-16-thumbnail-editor-hub-import-design.md)

**Eng review findings 반영**: 11개 보강 사항 전부 태스크에 embed. `useProductImages` error state 는 `TODOS.md` 로 이월 (이 PR 범위 X).

---

## File Structure

### New files (2)

| Path | 책임 |
|---|---|
| `apps/web/src/lib/hub-roles.ts` | 공유 `ROLE_CONFIG` 상수 (5 role × label × description) + `ProductImageRole` 타입 export |
| `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` | Radix Dialog 기반 허브 이미지 picker. role 섹션 그리드, checkbox multi-select, role→slot 매핑, loading/empty/error state |

### Modified files (4)

| Path | 변경 |
|---|---|
| `apps/web/src/app/image-hub/components/ImageGrid.tsx` | 로컬 `ROLE_CONFIG` 제거 → 공유 상수 import (behavior 무변경) |
| `apps/web/src/app/thumbnail-editor/page.tsx` | `hubModalOpen` 상태 + `handleHubApply` + 모달 렌더. `purpose` state 제거, edit payload `purpose: 'compliance'` 하드코딩 |
| `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx` | 허브 버튼 UI 추가 (breadcrumb 아래 + "이미지 입력" 헤더 위). props: `hasProductId`, `onOpenHubModal` |
| `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx` | edit 모드 "편집 목적" 토글 섹션 제거. props 에서 `purpose`, `onPurposeChange` 제거 |

### Updated docs (1)

| Path | 변경 |
|---|---|
| `apps/web/src/app/thumbnail-editor/CLAUDE.md` | 허브 임포트 섹션 추가 + purpose 토글 제거 기록 |

### Task dependency

```
T1 (shared ROLE_CONFIG) ── T2 (modal) 에서 import / 기존 ImageGrid 도 업데이트
T2 (HubImagePickerModal) ── T5 에서 page 가 mount
T3 (ControlPanel purpose 제거) ── T5 에서 props 정리 (의존 없음, 선후 무관)
T4 (InputPanel 허브 버튼) ── T5 에서 props 전달
T5 (page.tsx 통합) ── T3/T4 완료 후
T6 (CLAUDE.md)
T7 (build + vitest regression)
T8 (manual QA 12 시나리오)
```

---

## Task 1: 공유 `ROLE_CONFIG` 추출 + ImageGrid 업데이트

**Files:**
- Create: `apps/web/src/lib/hub-roles.ts`
- Modify: `apps/web/src/app/image-hub/components/ImageGrid.tsx`

### Step 1: 공유 상수 파일 생성

- [ ] 아래 내용으로 `apps/web/src/lib/hub-roles.ts` 생성:

```ts
/**
 * 상품 이미지 허브의 role 정의.
 * `/image-hub` 페이지와 `HubImagePickerModal` 에서 공유하여 drift 방지.
 */

export const HUB_ROLE_CONFIG = [
  { role: 'box', label: '📦 포장 사진', description: '패키지 박스, 포장 상태' },
  { role: 'product', label: '🛍️ 상품 사진', description: '실제 상품 모습' },
  { role: 'color_variant', label: '🎨 색상별 사진', description: '색상/옵션별 상품' },
  { role: 'size_chart', label: '📐 사이즈 차트', description: '사이즈 가이드' },
  { role: 'detail', label: '📄 상세 이미지', description: '상세 설명 이미지' },
] as const;

export type ProductImageRole = (typeof HUB_ROLE_CONFIG)[number]['role'];
export type HubRoleConfig = (typeof HUB_ROLE_CONFIG)[number];
```

### Step 2: ImageGrid 를 공유 상수로 교체

- [ ] `apps/web/src/app/image-hub/components/ImageGrid.tsx` 을 아래로 완전 교체:

```tsx
'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { ProductImageItem } from '@kiditem/shared';
import { HUB_ROLE_CONFIG, type HubRoleConfig } from '@/lib/hub-roles';

interface Props {
  images: ProductImageItem[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
}

function RoleSection({
  config,
  images,
  onAdd,
  onRemove,
  onLabelChange,
  startIndex,
}: {
  config: HubRoleConfig;
  images: ProductImageItem[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
  startIndex: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    files.forEach((file) => onAdd(config.role, file));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">{config.label}</div>
          <div className="text-xs text-slate-400">{config.description}</div>
        </div>
        <span className="text-xs text-slate-400">{images.length}장</span>
      </div>
      <div
        className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {images.map((img, i) => {
          const globalIndex = startIndex + i;
          return (
            <div key={`${img.url}-${i}`} className="group relative space-y-1">
              <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={img.url}
                  alt={img.label || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => onRemove(globalIndex)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                type="text"
                value={img.label || ''}
                onChange={(e) => onLabelChange(globalIndex, e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200"
                placeholder="라벨 (예: 빨강)"
              />
            </div>
          );
        })}
        <button
          onClick={() => fileRef.current?.click()}
          className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-colors"
        >
          <Plus size={20} />
          <span className="text-xs">추가</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((file) => onAdd(config.role, file));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export function ImageGrid({ images, onAdd, onRemove, onLabelChange }: Props) {
  let offset = 0;
  return (
    <div className="space-y-6">
      {HUB_ROLE_CONFIG.map((config) => {
        const roleImages = images.filter((img) => img.role === config.role);
        const startIndex = images.findIndex((img) => img.role === config.role);
        const section = (
          <RoleSection
            key={config.role}
            config={config}
            images={roleImages}
            onAdd={onAdd}
            onRemove={onRemove}
            onLabelChange={onLabelChange}
            startIndex={startIndex >= 0 ? startIndex : offset}
          />
        );
        offset += roleImages.length;
        return section;
      })}
    </div>
  );
}
```

주요 변경:
- 로컬 `ROLE_CONFIG`, `const ... as const` 선언 제거
- `import { HUB_ROLE_CONFIG, type HubRoleConfig } from '@/lib/hub-roles'` 로 대체
- `<img>` 태그에 `loading="lazy"` 추가 (eng review #11)
- 다른 로직 변경 없음

### Step 3: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(image-hub|hub-roles)" | head`
- [ ] Expected: 출력 없음 (새 파일 타입 에러 없음, ImageGrid 타입 정상)

### Step 4: Commit

- [ ] Run:
```bash
git add apps/web/src/lib/hub-roles.ts apps/web/src/app/image-hub/components/ImageGrid.tsx
git commit -m "refactor(web/hub-roles): ROLE_CONFIG 공유 상수 추출 + ImageGrid img lazy loading"
```

---

## Task 2: `HubImagePickerModal.tsx` 생성

**Files:**
- Create: `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx`

### Step 1: 모달 컴포넌트 작성

- [ ] 아래 내용으로 `apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx` 생성:

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProductImages } from '@/hooks/useProductImages';
import { HUB_ROLE_CONFIG, type ProductImageRole } from '@/lib/hub-roles';
import type { EditUseCase } from './UseCaseSelection';

type EditorMode = 'edit' | 'creative';

export type HubSelected =
  | { kind: 'single'; url: string }
  | { kind: 'compose'; productUrl?: string; boxUrl?: string }
  | { kind: 'color-variants'; urls: string[] };

interface Props {
  open: boolean;
  productId: string;
  productName: string;
  editCase: EditUseCase | null;
  mode: EditorMode;
  existingColorImagesCount: number;
  onClose: () => void;
  onApply: (selected: HubSelected) => void;
}

interface SelectedItem {
  role: ProductImageRole;
  url: string;
}

const CASE_LABELS: Record<string, string> = {
  compose: '상품+박스/세트 합성',
  'color-variants': '색상별 상품 배치',
  single: '단일 상품 정리',
  creative: 'AI 연출',
};

function matchingRoles(editCase: EditUseCase | null, mode: EditorMode): ProductImageRole[] {
  if (mode === 'creative') return ['product'];
  if (editCase === 'compose') return ['product', 'box'];
  if (editCase === 'color-variants') return ['color_variant'];
  if (editCase === 'single') return ['product'];
  return [];
}

function getMaxCount(
  editCase: EditUseCase | null,
  mode: EditorMode,
  existingColorImagesCount: number,
): number {
  if (mode === 'creative') return 1;
  if (editCase === 'compose') return 2;
  if (editCase === 'single') return 1;
  if (editCase === 'color-variants') return Math.max(0, 8 - existingColorImagesCount);
  return 0;
}

function itemId(item: SelectedItem): string {
  return `${item.role}:${item.url}`;
}

export function HubImagePickerModal({
  open,
  productId,
  productName,
  editCase,
  mode,
  existingColorImagesCount,
  onClose,
  onApply,
}: Props) {
  const { images, loading } = useProductImages(open ? productId : null);
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  // 모달이 닫히면 selected 리셋 (재오픈 시 빈 상태)
  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const activeRoles = useMemo(() => matchingRoles(editCase, mode), [editCase, mode]);
  const maxCount = useMemo(
    () => getMaxCount(editCase, mode, existingColorImagesCount),
    [editCase, mode, existingColorImagesCount],
  );

  const caseLabel = mode === 'creative' ? CASE_LABELS.creative : editCase ? CASE_LABELS[editCase] : '';

  const roleIsActive = (role: ProductImageRole) => activeRoles.includes(role);

  const handleToggle = (role: ProductImageRole, url: string) => {
    if (!roleIsActive(role)) return;
    const id = itemId({ role, url });
    const existingIdx = selected.findIndex((s) => itemId(s) === id);

    if (existingIdx >= 0) {
      setSelected(selected.filter((_, i) => i !== existingIdx));
      return;
    }

    // single-select cases (single / creative)
    if (maxCount === 1) {
      setSelected([{ role, url }]);
      return;
    }

    // compose: max 2 total, box max 1
    if (editCase === 'compose') {
      if (selected.length >= 2) {
        toast.error('상품+박스 합성은 최대 2장까지 가능합니다');
        return;
      }
      if (role === 'box' && selected.some((s) => s.role === 'box')) {
        toast.error('박스 이미지는 1장만 선택 가능합니다');
        return;
      }
    }

    // color-variants cap
    if (selected.length >= maxCount) {
      if (editCase === 'color-variants' && maxCount === 0) {
        toast.error('이미 8장 (최대) 선택되어 있습니다');
      } else {
        toast.error(`최대 ${maxCount}장까지 가능합니다`);
      }
      return;
    }

    setSelected([...selected, { role, url }]);
  };

  const handleApply = () => {
    if (selected.length === 0) return;

    if (mode === 'creative' || editCase === 'single') {
      onApply({ kind: 'single', url: selected[0].url });
    } else if (editCase === 'compose') {
      // product-preferred routing: product 1번째 → 상품, 2번째 → 보조, box → 보조
      const productItems = selected.filter((s) => s.role === 'product');
      const boxItems = selected.filter((s) => s.role === 'box');
      let productUrl: string | undefined;
      let boxUrl: string | undefined;
      if (productItems.length >= 1) productUrl = productItems[0].url;
      if (productItems.length >= 2) boxUrl = productItems[1].url;
      if (boxItems.length >= 1) boxUrl = boxItems[0].url;
      onApply({ kind: 'compose', productUrl, boxUrl });
    } else if (editCase === 'color-variants') {
      onApply({ kind: 'color-variants', urls: selected.map((s) => s.url) });
    }
    onClose();
  };

  const handleHubLinkClick = () => {
    // eng review #5: 외부 편집 후 stale 방지 — 링크 클릭 시 모달 닫음
    onClose();
  };

  const selectionLabel = (() => {
    if (mode === 'creative' || editCase === 'single') return '상품 슬롯으로';
    if (editCase === 'compose') return 'product → 상품 슬롯 / box → 보조 슬롯';
    if (editCase === 'color-variants') return `colorImages 배열에 append (${maxCount}장 남음)`;
    return '';
  })();

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[min(720px,92vw)] max-h-[85vh] overflow-hidden',
            'bg-white rounded-2xl shadow-2xl flex flex-col',
          )}
        >
          {/* 헤더 */}
          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Dialog.Title className="text-sm font-bold text-gray-900">
                  이미지 허브 — {productName || '상품'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-gray-500 mt-0.5">
                  현재 용도: {caseLabel} · {selectionLabel}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="닫기"
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body (scroll) */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm">이미지 로딩 중...</span>
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-sm text-gray-500 mb-3">등록된 이미지가 없습니다</div>
                <a
                  href={`/image-hub?productId=${productId}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleHubLinkClick}
                  className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
                >
                  <ExternalLink size={12} /> 이미지 허브로 이동
                </a>
              </div>
            ) : (
              <div className="space-y-5">
                {HUB_ROLE_CONFIG.map((config) => {
                  const roleImages = images.filter((img) => img.role === config.role);
                  const active = roleIsActive(config.role);
                  return (
                    <div
                      key={config.role}
                      className={cn(!active && 'opacity-50 pointer-events-none')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-xs font-semibold text-gray-700">{config.label}</div>
                          <div className="text-[10px] text-gray-400">
                            {active ? '선택 가능' : '현재 용도 아님'}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400">{roleImages.length}장</span>
                      </div>
                      {roleImages.length === 0 ? (
                        <div className="text-[11px] text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                          이미지 없음
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
                          {roleImages.map((img, i) => {
                            const selectedIdx = selected.findIndex(
                              (s) => itemId(s) === itemId({ role: config.role, url: img.url }),
                            );
                            const isSelected = selectedIdx >= 0;
                            return (
                              <button
                                key={`${img.url}-${i}`}
                                type="button"
                                onClick={() => handleToggle(config.role, img.url)}
                                disabled={!active}
                                className={cn(
                                  'relative aspect-square rounded-lg overflow-hidden bg-gray-50',
                                  'transition-all duration-150',
                                  isSelected
                                    ? 'ring-2 ring-violet-500 border-violet-500'
                                    : 'border border-gray-200 hover:border-gray-300',
                                )}
                              >
                                <img
                                  src={img.url}
                                  alt={img.label || ''}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                                {isSelected && (
                                  <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
                                    {selectedIdx + 1}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer (sticky) */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600">
                {selected.length > 0 ? `${selected.length}장 선택됨` : '썸네일을 선택하세요'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={selected.length === 0}
                  className={cn(
                    'px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors',
                    selected.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700',
                  )}
                >
                  {selected.length > 0 ? `${selected.length}장 가져오기` : '가져오기'}
                </button>
              </div>
            </div>
            <a
              href={`/image-hub?productId=${productId}`}
              target="_blank"
              rel="noreferrer"
              onClick={handleHubLinkClick}
              className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-violet-600 transition-colors mt-2"
            >
              <ExternalLink size={10} /> 이미지 허브에서 편집
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

주요 설계 (eng review 반영):
- `HUB_ROLE_CONFIG` 공유 상수 import (#1)
- `productId: string` non-null — 상위에서 narrow 해서 mount (#2)
- `loading` 상태 분기 + Loader2 스피너 (#3)
- `max-h-[85vh]` + body `overflow-y-auto` + footer sticky (#4)
- 허브 링크 클릭 `handleHubLinkClick` → `onClose()` 호출 (#5)
- compose mapping: product-preferred routing — product 첫 → 상품, 둘째 → 보조, box → 보조 (#6)
- 모든 `<img>` `loading="lazy"` (#11)
- 선택 시 `selectedIdx + 1` 번호 badge (spec compose 순번)
- 모달 닫힐 때 `selected` 자동 리셋 (useEffect)

### Step 2: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | grep HubImagePickerModal | head`
- [ ] Expected: 출력 없음

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/components/HubImagePickerModal.tsx
git commit -m "feat(thumbnail-editor/ui): HubImagePickerModal (role 그리드 + 체크박스 multi-select + role→slot 매핑) 신규"
```

---

## Task 3: `EditorControlPanel.tsx` — 편집 목적 토글 제거

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx`

### Step 1: Props 와 렌더 수정

- [ ] 파일 내 `Props` interface 에서 `purpose` 와 `onPurposeChange` 라인 제거:

```tsx
// 제거 전:
//   purpose: 'compliance' | 'quality';
//   ...
//   onPurposeChange: (v: 'compliance' | 'quality') => void;
```

- [ ] 함수 시그니처 destructure 에서 `purpose`, `onPurposeChange` 제거.

- [ ] edit 모드 렌더 블록에서 "편집 목적" 섹션 통째로 삭제. 구체적으로 아래 JSX 블록 제거:

```tsx
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
```

제거 후 edit 모드 렌더 흐름은: (compose 일 때만 pieceCount 입력) → 편집 지시사항 textarea → 편집 시작 버튼.

### Step 2: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
- [ ] Expected: `page.tsx` 에서 `purpose` / `onPurposeChange` 관련 prop 전달 에러 (Task 5 에서 해결). `EditorControlPanel.tsx` 자체 에러 없음.

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/components/EditorControlPanel.tsx
git commit -m "refactor(thumbnail-editor/control): '편집 목적' 토글 섹션 제거 (compose/color-variants/single 모두)"
```

---

## Task 4: `EditorInputPanel.tsx` — 허브 버튼 추가

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx`

### Step 1: Props 확장

- [ ] 파일 상단 `import { ArrowLeft, FolderOpen } from 'lucide-react';` 또는 `import { FolderOpen } from 'lucide-react';` 추가 (이미 있는 `Package` import 와 합쳐도 됨):

```tsx
import { Package, FolderOpen } from 'lucide-react';
```

- [ ] `Props` interface 에 두 필드 추가:

```tsx
interface Props {
  // ... 기존 props
  hasProductId: boolean;
  onOpenHubModal: () => void;
}
```

- [ ] 함수 시그니처 destructure 에 추가:

```tsx
export function EditorInputPanel({
  // ... 기존
  hasProductId,
  onOpenHubModal,
}: Props) {
```

### Step 2: 버튼 렌더 추가

- [ ] breadcrumb 바로 아래, "이미지 입력" 헤더 위에 버튼 블록 삽입. 기존 코드에서 breadcrumb 다음 위치에 아래 JSX 삽입:

```tsx
{/* 이미지 허브 버튼 */}
<div
  className="flex-shrink-0 px-4 py-3"
  style={{ borderBottom: '1px solid #e5e7eb' }}
>
  <button
    type="button"
    onClick={onOpenHubModal}
    disabled={!hasProductId}
    title={!hasProductId ? '상품 선택 후 사용 가능' : undefined}
    className={cn(
      'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all',
      hasProductId
        ? 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
        : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed',
    )}
  >
    <FolderOpen size={14} />
    이미지 허브에서 불러오기
  </button>
</div>
```

위치 주의: breadcrumb 가 렌더되는 `{showBreadcrumb && editCase && (...)}` 블록 다음, "이미지 입력" 헤더 `<div className="flex-shrink-0 px-4 py-3.5">` 블록 앞.

- [ ] 파일 상단 import 에 `import { cn } from '@/lib/utils';` 가 없으면 추가.

### Step 3: Build check

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
- [ ] Expected: `page.tsx` 에서 `hasProductId`, `onOpenHubModal` prop 누락 에러 (Task 5 에서 해결). `EditorInputPanel.tsx` 자체 에러 없음.

### Step 4: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx
git commit -m "feat(thumbnail-editor/input): 이미지 허브 버튼 추가 (breadcrumb 아래 · productId 없으면 disabled)"
```

---

## Task 5: `page.tsx` 통합 — 모달 state + purpose 제거

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/page.tsx`

### Step 1: 파일 완전 교체

- [ ] `apps/web/src/app/thumbnail-editor/page.tsx` 을 아래로 완전 교체:

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
import { HubImagePickerModal, type HubSelected } from './components/HubImagePickerModal';

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

  // 허브 모달
  const [hubModalOpen, setHubModalOpen] = useState(false);

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

  const handleHubApply = (selected: HubSelected) => {
    if (selected.kind === 'single') {
      setProductImage(selected.url);
    } else if (selected.kind === 'compose') {
      if (selected.productUrl !== undefined) setProductImage(selected.productUrl);
      if (selected.boxUrl !== undefined) setPackagingImage(selected.boxUrl);
    } else if (selected.kind === 'color-variants') {
      const next = [...colorImages, ...selected.urls];
      if (next.length > 8) {
        toast.error('최대 8장까지 가능합니다 (초과분 무시)');
      }
      setColorImages(next.slice(0, 8));
    }
  };

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
            hasProductId={!!productId}
            onOpenHubModal={() => setHubModalOpen(true)}
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

      {/* 이미지 허브 모달 */}
      {productId && (
        <HubImagePickerModal
          open={hubModalOpen}
          productId={productId}
          productName={productName}
          editCase={editCase}
          mode={mode}
          existingColorImagesCount={colorImages.length}
          onClose={() => setHubModalOpen(false)}
          onApply={handleHubApply}
        />
      )}
    </div>
  );
}
```

주요 변경:
- `purpose` 상태 삭제 (useState, handler, EditorControlPanel props 전달 모두)
- `handleGenerate` 내부 `purpose` 는 mode 기반으로 inline (`mode === 'creative' ? 'quality' : 'compliance'`)
- `hubModalOpen` state 신규
- `handleHubApply` 신규 — HubSelected 분기 처리 (eng review #5 의 stale 대응 포함)
- `HubImagePickerModal` mount — `productId` 가드 (`{productId && <Modal ... />}`) 로 non-null 보장 (eng review #2)
- EditorInputPanel 에 `hasProductId`, `onOpenHubModal` prop 전달

### Step 2: Build (tsc + next build)

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | tail -10`
- [ ] Expected: 출력 없음 (clean)

- [ ] Run: `cd apps/web && npm run build 2>&1 | tail -15`
- [ ] Expected: `✓ Compiled successfully` 또는 동등. 에러 없음.

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/page.tsx
git commit -m "refactor(thumbnail-editor/page): 허브 모달 state + handleHubApply + purpose 토글 제거 (compliance 하드코딩)"
```

---

## Task 6: `CLAUDE.md` 업데이트

**Files:**
- Modify: `apps/web/src/app/thumbnail-editor/CLAUDE.md`

### Step 1: Structure / Rules 섹션 보강

- [ ] 파일 상단 `## Structure` 섹션의 파일 트리에 `HubImagePickerModal.tsx` 추가. 기존 트리 다음 위치에 한 줄 삽입 (순서: ColorVariantsUploader 다음):

```
│   ├── ColorVariantsUploader.tsx  # Type 2B — 2~8장 multi-drop + 썸네일 그리드 (X 삭제)
│   ├── HubImagePickerModal.tsx    # 이미지 허브 picker — role 섹션 그리드 + checkbox multi-select + role→slot 매핑
│   ├── ImageUploader.tsx          # 단일 슬롯 FileReader → dataURL
```

- [ ] `## 핵심 패턴` 섹션에 새 패턴 블록 추가 (기존 "5. Mutation-Driven Workflow" 다음에):

```markdown
### 6. 이미지 허브 임포트

Input 패널 상단 "📂 이미지 허브에서 불러오기" 버튼 → `HubImagePickerModal` 오픈. `useProductImages(productId)` 로 허브 이미지 로드, `HUB_ROLE_CONFIG` (apps/web/src/lib/hub-roles.ts) 5 role 섹션 그리드.

- 현재 용도(`editCase` + `mode`) 에 매칭되는 role 섹션만 선택 가능, 나머지는 `opacity-50 pointer-events-none`
- 선택 UX: 체크박스 + 순번 badge (compose 에서 product/보조 매핑 시각화)
- role → slot 매핑 (product-preferred): `product` → 상품 슬롯, `box` → 보조 슬롯. product 2장 시 첫번째 상품 / 두번째 보조. box 최대 1장 강제.
- color-variants: append + `slice(0, 8)` + toast on overflow
- 허브 편집 링크 클릭 시 모달 닫음 (stale 방지). 재오픈하면 useEffect 가 fresh fetch.
- `productId` 없으면 Input 패널의 허브 버튼 disabled + "상품 선택 후 사용 가능" 툴팁
- creative `backgroundReference` 는 허브 매칭 role 없어 지원 제외 (업로드만)
```

- [ ] `## Rules` 섹션에 추가:

```markdown
- `purpose` 토글 제거 (2026-04-16 이후). edit 모드는 항상 `purpose: 'compliance'` 하드코딩. creative 는 자동 `'quality'`. 백엔드 DTO `purpose` 필드는 batch edit 에서 여전히 사용.
```

- [ ] `## 함께 수정할 파일 맵` 섹션에 추가:

```markdown
| ROLE_CONFIG 변경 (role 추가 등) | `apps/web/src/lib/hub-roles.ts` (단일 source) + `image-hub/components/ImageGrid.tsx` + `HubImagePickerModal.tsx` (양쪽에서 import, drift 확인) |
| 허브 role → 편집기 슬롯 매핑 규칙 | `HubImagePickerModal.tsx` `matchingRoles()`, `handleApply()` + `page.tsx` `handleHubApply()` (쌍으로) |
```

### Step 2: Build check (docs 변경이라 skip — 그래도 sanity)

- [ ] Run: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -5`
- [ ] Expected: 출력 없음

### Step 3: Commit

- [ ] Run:
```bash
git add apps/web/src/app/thumbnail-editor/CLAUDE.md
git commit -m "docs(thumbnail-editor/CLAUDE.md): 허브 임포트 패턴 + purpose 토글 제거 기록"
```

---

## Task 7: Build + vitest regression

### Step 1: apps/web 프로덕션 빌드

- [ ] Run: `cd apps/web && npm run build 2>&1 | tail -20`
- [ ] Expected: `✓ Compiled successfully`. thumbnail-editor, image-hub 관련 warning 0.

### Step 2: apps/web 기존 테스트 regression

- [ ] Run: `cd apps/web && npx vitest run 2>&1 | tail -15`
- [ ] Expected: 모든 파일 PASS. 기존 api-client / api-error / useProductImages 테스트 영향 없음.

### Step 3: apps/server 기존 테스트 regression (백엔드 무변경이지만 보험)

- [ ] Run: `cd apps/server && npx vitest run src/products 2>&1 | tail -15`
- [ ] Expected: `thumbnail-editor-generate.spec.ts` 10/10 PASS. 다른 products 도메인 테스트 PASS.

실패 시: 각 에러 근본 원인 분석 후 해결. 단순 skip 금지.

---

## Task 8: Manual QA — 12 시나리오 (실서버)

**Precondition:**

- worktree 에서 `cd apps/web && npm run dev` (port 3000)
- 백엔드 (port 4000), PostgreSQL, MinIO 실행 중
- 실 테스트용 상품 ID: `e2f4ff65-2238-5303-bc06-f4dba7f6f136` (색칠하는에어글라이더) — 허브에 몇 장 이미지 등록된 상품이어야 의미 있음
- 허브가 비어있다면 `/image-hub?productId=<id>` 에서 각 role 별 최소 1~3장씩 업로드 해둘 것

시나리오 (a)~(h) 는 스펙의 8개 + (i)~(l) 은 eng review 에서 추가한 4개.

### 시나리오 (a) — productId 없이 진입

- [ ] 브라우저: `http://localhost:3000/thumbnail-editor`
- [ ] 편집 탭 기본. "어떤 편집이 필요하세요?" 카드 3개 노출.
- [ ] '상품+박스/세트 합성' 클릭 → 3패널 렌더
- [ ] Input 패널 breadcrumb 아래 "📂 이미지 허브에서 불러오기" 버튼이 **비활성** + hover 시 tooltip "상품 선택 후 사용 가능"
- [ ] 상단에 상품명 suffix 없음

### 시나리오 (b) — compose 허브 임포트 (product + box)

- [ ] `?productId=e2f4ff65-2238-5303-bc06-f4dba7f6f136` 로 진입
- [ ] '상품+박스/세트 합성' 카드 클릭
- [ ] "📂 이미지 허브에서 불러오기" 버튼 활성 상태
- [ ] 버튼 클릭 → 모달 오픈
- [ ] 헤더: "이미지 허브 — 색칠하는에어글라이더" / "현재 용도: 상품+박스/세트 합성 · product → 상품 슬롯 / box → 보조 슬롯"
- [ ] 5 role 섹션 보임. product 와 box 섹션만 **활성 (선명)**, 나머지 (color_variant, size_chart, detail) 는 `opacity-50` **흐리게**
- [ ] product role 썸네일 1장 클릭 → 보라 테두리 + 좌상단 "1" badge
- [ ] box role 썸네일 1장 클릭 → 보라 테두리 + "2" badge
- [ ] 하단 "2장 선택됨 | [취소] [2장 가져오기]"
- [ ] "2장 가져오기" 클릭 → 모달 닫힘
- [ ] Input 패널 상품 슬롯 / 보조 슬롯에 각각 허브 이미지 미리보기 확인
- [ ] 편집 시작 → 생성 성공
- [ ] DB 확인:
  ```bash
  docker exec kiditem-postgres psql -U kiditem -d kiditem -c "SELECT method, status FROM thumbnail_generations ORDER BY created_at DESC LIMIT 1;"
  ```
- [ ] Expected: `method='generate'`, `status='ready'`

### 시나리오 (c) — color-variants 허브 append

- [ ] 위 모달에서 용도 변경 → '색상별 상품 배치' 진입
- [ ] 업로드로 1장 드롭 (color-variants 드롭존)
- [ ] "📂 이미지 허브에서 불러오기" 클릭 → 모달 오픈
- [ ] color_variant role 만 활성. product/box/size_chart/detail 흐리게.
- [ ] color_variant 2장 체크 (순번 1, 2 badge)
- [ ] "2장 가져오기" → 모달 닫힘
- [ ] Input 드롭존 썸네일 그리드에 총 **3장** (업로드 1 + 허브 2) 표시 확인

### 시나리오 (d) — color-variants 8장 초과 방지

- [ ] 시나리오 (c) 이어서 드롭존에 이미지 5장 더 추가 업로드 → 총 8장
- [ ] "📂 이미지 허브에서 불러오기" 클릭 → 모달 오픈
- [ ] color_variant 섹션 활성은 유지되나, 썸네일 클릭 시 **체크 안 되고** toast "이미 8장 (최대) 선택되어 있습니다"
- [ ] 드롭존 "9/8" 이 되지 않는지 확인 (`slice(0, 8)` 동작)

### 시나리오 (e) — single 라디오 동작

- [ ] 용도 변경 → '단일 상품 정리'
- [ ] 모달 오픈 → product role 만 활성
- [ ] 썸네일 A 체크 → "1" badge
- [ ] 썸네일 B 체크 → **A 자동 해제, B 에만 "1" badge**
- [ ] "1장 가져오기" → 상품 슬롯에 B 세팅 + 모달 닫힘

### 시나리오 (f) — creative 상품 슬롯 허브 임포트

- [ ] 상단 탭 'AI 연출 생성' 클릭 (editCase state 는 보존되지만 creative 모드로 전환)
- [ ] "📂 이미지 허브에서 불러오기" 버튼 활성 (creative 탭에서도 노출)
- [ ] 모달 오픈 → 헤더 "현재 용도: AI 연출 · 상품 슬롯으로"
- [ ] product role 만 활성
- [ ] 썸네일 1장 선택 → "1장 가져오기" → 창 닫힘
- [ ] Input 패널 상품 슬롯에 허브 이미지 표시
- [ ] 씬 'custom-reference' 선택 → backgroundReference 슬롯 펼침 (허브 연동 X, 업로드만) 확인
- [ ] 기본 'white-studio' 로 되돌리고 생성 → creative 성공 (`method='creative'`)

### 시나리오 (g) — ControlPanel '편집 목적' 섹션 완전 삭제

- [ ] 편집 탭 → 각 용도 카드 (compose/color-variants/single) 모두 진입해서 Right 패널 확인
- [ ] "편집 목적" 라벨 / "가이드라인 수정" / "품질 개선" 버튼 **어디에도 안 보임**
- [ ] compose 에서 pieceCount 숫자 입력, 편집 지시사항 textarea, 편집 시작 버튼만 있음
- [ ] color-variants / single 에서 편집 지시사항 textarea, 편집 시작 버튼만 있음

### 시나리오 (h) — payload `purpose: 'compliance'` 하드코딩 검증

- [ ] Chrome DevTools 열기 → Network 탭
- [ ] 편집 모드 (아무 케이스) 에서 "편집 시작" 클릭
- [ ] `/api/thumbnail-editor/generate` POST 요청 request body 확인
- [ ] `purpose` 필드 값이 **항상 `"compliance"`** (사용자가 이전에 'quality' 선택할 방법이 없으므로)
- [ ] creative 모드에서는 `purpose: "quality"` (기존 자동 세팅 유지)

### 시나리오 (i) — 로딩 상태 UI (eng review #3)

- [ ] DevTools Network 탭 → Throttling "Slow 3G"
- [ ] productId 있는 편집기 재진입 → 용도 카드 선택 → 허브 버튼 클릭 → 모달 오픈
- [ ] **Loader2 스피너 + "이미지 로딩 중..." 텍스트 표시 확인** (fetch 완료 전)
- [ ] fetch 완료되면 role 섹션으로 자연 전환
- [ ] Throttling 해제

### 시나리오 (j) — 허브 편집 링크 → stale 방지 (eng review #5)

- [ ] 모달 열린 상태
- [ ] 하단 "🔗 이미지 허브에서 편집" 링크 클릭
- [ ] 새 탭에서 `/image-hub?productId=...` 열림 **그리고 편집기 탭의 모달은 닫힘**
- [ ] 새 탭에서 해당 상품에 이미지 1장 추가 후 저장
- [ ] 편집기 탭 복귀 → 허브 버튼 다시 클릭 → 모달 오픈
- [ ] **새로 추가한 이미지가 해당 role 섹션에 보임** (fresh fetch 확인)

### 시나리오 (k) — "가져오기" disabled 상태

- [ ] 모달 오픈 (아무 상태)
- [ ] 아무 썸네일도 선택하지 않은 상태에서 하단 "가져오기" 버튼 **비활성** (`disabled` 시각)
- [ ] label 이 "가져오기" 또는 빈 카운트. 좌측 hint "썸네일을 선택하세요"
- [ ] 1장 선택하면 "1장 가져오기" 로 활성화

### 시나리오 (l) — 취소 → 재오픈 시 selected 리셋

- [ ] 모달에서 썸네일 2장 선택 (badges 1, 2)
- [ ] "취소" 버튼 클릭 → 모달 닫힘
- [ ] 허브 버튼 다시 클릭 → 모달 재오픈
- [ ] **이전 선택이 해제된 상태** (모든 썸네일 외곽선 / badge 없음)
- [ ] Input 슬롯에도 허브 이미지 반영 안 됨 (취소였으므로)

### 최종 commit (QA 완료 마킹 목적, optional)

문제 없으면 별도 커밋 없이 진행 가능. 문제 있으면 해당 Task 로 돌아가 수정.

- [ ] Run: `git log --oneline 1176cd2..HEAD | head -10`
- [ ] 예상 커밋 수: 6~7 (Task 1~6 각각 1 + 필요 시 fix 커밋)

---

## Spec Coverage Check

| 스펙 요구사항 | 커버 태스크 |
|---|---|
| '편집 목적' 토글 제거 (UI) | T3 + T5 (state 제거) |
| `purpose: 'compliance'` 하드코딩 | T5 (handleGenerate) |
| Input 패널 허브 버튼 추가 | T4 |
| productId 없음 → 버튼 비활성 | T4 (disabled + title) + T5 (`hasProductId={!!productId}`) |
| 허브 모달 헤더: 상품명 + 용도 | T2 (Dialog.Title / Description) |
| 5 role 섹션 렌더 | T2 (HUB_ROLE_CONFIG.map) |
| 매칭 role 만 활성 / 나머지 흐리게 | T2 (`opacity-50 pointer-events-none`) |
| 체크박스 + 순번 badge | T2 (`selectedIdx + 1` badge) |
| 하단 "N장 가져오기" 버튼 | T2 (footer) |
| 0장 empty state | T2 (loading/empty 분기) |
| 허브 편집 링크 (새 탭, 모달 닫음) | T2 (`handleHubLinkClick`) |
| role → slot 매핑 규칙 | T2 (`handleApply` product-preferred) + T5 (`handleHubApply`) |
| color-variants append (max 8) | T5 (`slice(0, 8)` + toast) |
| compose 순번 badge + max 2 | T2 (`handleToggle` guard) |
| single/creative 라디오 동작 | T2 (`maxCount === 1` 분기) |
| ROLE_CONFIG 공유 상수 | T1 |
| productId null 가드 | T5 (`{productId && <Modal ...>}`) |
| 로딩 상태 UI | T2 (Loader2) |
| Modal max-height + 스크롤 | T2 (`max-h-[85vh]` + body overflow) |
| Stale 데이터 close on link | T2 (`handleHubLinkClick`) |
| img lazy loading | T1 (ImageGrid) + T2 (Modal img) |
| Manual QA 12 시나리오 | T8 |
| CLAUDE.md 업데이트 | T6 |

Gap: 없음. 전 스펙 + 11 eng review 보강 사항 커버.

## Constraints Observed

- apps/web/CLAUDE.md 준수: `apiClient`, Tailwind + `cn()`, Lucide, `@tanstack/react-query`, `sonner`.
- Radix Dialog 기존 패턴 (`PanelSheet.tsx`) 따름.
- 이미지 URL: data URL / http URL 모두 그대로 payload 에 사용 (backend `resolveImage` 호환).
- Test 컨벤션: 컴포넌트 behavior 테스트 추가 X. 매 태스크 tsc 가드 + 마지막 build + manual QA.
- companyId / 인증: 건드리지 않음.
