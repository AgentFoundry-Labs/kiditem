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

const CASE_LABELS: Record<EditUseCase | 'creative', string> = {
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
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51]',
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
