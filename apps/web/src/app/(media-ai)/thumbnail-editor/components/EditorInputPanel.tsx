'use client';
import { Download, Scissors, Sparkles, Package, Palette, Layers, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EditUseCase } from './UseCaseSelection';
import type { MasterImageItem } from '@kiditem/shared/product';
import type { EditorMode, HistoryCandidate } from '../edit/page';
import { timeAgo } from '@/lib/utils';
import {
  addPicksToGroup,
  applyPickToSlot,
  clearSlotValueById,
  countByKind,
  removeSlotById,
  type Slot,
  type SlotKind,
  type SlotPick,
} from '../edit/lib/slots';
import { SlotCard, AddSlotTile } from './SlotCard';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import { ImgWithSkeleton } from './ImgWithSkeleton';

const SUPPLEMENTARY_LABELS = ['박스', '세트구성', '포장', '부속품', '기타'] as const;
export type SupplementaryLabel = (typeof SUPPLEMENTARY_LABELS)[number];

interface Props {
  mode: EditorMode;
  editCase?: EditUseCase | null;
  productId: string | null;
  slots: Slot[];
  onSlotsChange: (updater: (prev: Slot[]) => Slot[]) => void;
  fallbackProductImage?: string | null;
  originalImage?: string | null;
  supplementaryLabel?: SupplementaryLabel;
  sceneType?: string;
  hubImages?: MasterImageItem[];
  hubImagesLoading?: boolean;
  historyCandidates?: HistoryCandidate[];
  selectedCandidateUrl?: string | null;
  recommendedCandidateUrl?: string | null;
  onSelectCandidate?: (url: string) => void;
  onSupplementaryLabelChange?: (v: SupplementaryLabel) => void;
  /**
   * `single` 트랙에서 "다른 종류 이미지 추가" 로 editCase 를 승격시킬 때 호출.
   * page.tsx 가 editCase state + slots 레이아웃을 재빌드.
   */
  onPromoteCase?: (nextCase: EditUseCase) => void;
  /** 현재 편집 중인 생성 결과가 있으면 id, 없으면 null — 삭제 버튼 노출 게이트 */
  generationId?: string | null;
  /** 선택된 candidate 1개만 삭제 (히스토리 섹션 하단 destructive 액션) */
  onDeleteSelectedCandidate?: () => void;
}

const GROUP_MAX: Partial<Record<SlotKind, number>> = {
  color_variant: 8,
  bundle_item: 4,
};
const GROUP_MIN: Partial<Record<SlotKind, number>> = {
  color_variant: 2,
  bundle_item: 2,
};

function normalizeDownloadFilename(filename: string | null | undefined, imageUrl: string, mimeType: string): string {
  const urlName = (() => {
    try {
      const pathname = new URL(imageUrl, window.location.href).pathname;
      return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return '';
    }
  })();
  const inferredExt = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : 'png';
  const baseName = (filename?.trim() || urlName || `thumbnail-${Date.now()}.${inferredExt}`)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');
  return /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.${inferredExt}`;
}

async function downloadImageFile(imageUrl: string, filename?: string | null): Promise<void> {
  const response = await fetch(
    imageUrl,
    imageUrl.startsWith('data:') ? undefined : { credentials: 'include' },
  );
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = normalizeDownloadFilename(filename, imageUrl, blob.type);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function EditorInputPanel({
  mode,
  editCase = null,
  productId,
  slots,
  onSlotsChange,
  fallbackProductImage = null,
  originalImage = null,
  supplementaryLabel = '박스',
  sceneType = 'white-studio',
  hubImages = [],
  hubImagesLoading = false,
  historyCandidates = [],
  selectedCandidateUrl = null,
  recommendedCandidateUrl = null,
  onSelectCandidate = () => {},
  onSupplementaryLabelChange = () => {},
  onPromoteCase,
  generationId = null,
  onDeleteSelectedCandidate,
}: Props) {
  const pickSlot = (id: string, pick: SlotPick) => {
    onSlotsChange((prev) => applyPickToSlot(prev, id, pick));
  };
  const clearSlot = (id: string) => {
    onSlotsChange((prev) => clearSlotValueById(prev, id));
  };
  const removeSlot = (id: string) => {
    onSlotsChange((prev) => removeSlotById(prev, id));
  };
  const addPicks = (kind: SlotKind, picks: SlotPick[]) => {
    onSlotsChange((prev) => addPicksToGroup(prev, kind, picks));
  };

  const productSlot = slots.find((s) => s.kind === 'product');
  const packagingSlot = slots.find((s) => s.kind === 'packaging');
  const referenceSlot = slots.find((s) => s.kind === 'reference');
  const colorSlots = slots.filter((s) => s.kind === 'color_variant');
  const bundleSlots = slots.filter((s) => s.kind === 'bundle_item');
  const bundleOwnerId = bundleSlots.find((s) => s.value)?.sourceProductId;
  const selectedCandidate = selectedCandidateUrl
    ? historyCandidates.find((c) => (resolveImageUrl(c.url) ?? '') === selectedCandidateUrl)
    : null;
  const handleDownloadSelected = async () => {
    if (!selectedCandidateUrl) return;
    try {
      await downloadImageFile(selectedCandidateUrl, selectedCandidate?.filename);
    } catch (err) {
      console.error('[thumbnail-editor] download failed', err);
      toast.error('이미지 다운로드에 실패했어요. 다시 시도해주세요.');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-shrink-0 px-5 pt-6 pb-3">
        <h2 className="text-[15px] font-bold text-gray-900">이미지 입력</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        {/* 편집 모드 — compose (상품 + 보조) */}
        {mode === 'edit' && editCase === 'compose' && (
          <>
            {productSlot && (
              <div className="bg-white rounded-2xl p-4 space-y-2.5">
                <div>
                  <h3 className="text-[13px] font-bold text-gray-900">상품 사진</h3>
                  <p className="text-[12px] text-gray-500 mt-0.5">흰배경 대표 상품 이미지</p>
                </div>
                <SlotCard
                  slot={productSlot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  fallbackValue={fallbackProductImage}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                />
              </div>
            )}

            {packagingSlot && (
              <div className="bg-white rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-gray-900">보조 이미지</h3>
                  <select
                    value={supplementaryLabel}
                    onChange={(e) => onSupplementaryLabelChange(e.target.value as SupplementaryLabel)}
                    className="text-[12px] font-semibold text-gray-700 bg-[#f2f4f6] border-0 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    {SUPPLEMENTARY_LABELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[12px] text-gray-500">패키지·세트구성 등 보조 이미지</p>
                <SlotCard
                  slot={packagingSlot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                />
              </div>
            )}
          </>
        )}

        {/* 편집 모드 — color-variants */}
        {mode === 'edit' && editCase === 'color-variants' && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <GroupHeader
              title="색상별 상품 사진"
              count={colorSlots.filter((s) => s.value).length}
              max={GROUP_MAX.color_variant ?? 8}
              min={GROUP_MIN.color_variant ?? 2}
            />
            <div className="grid grid-cols-3 gap-2">
              {colorSlots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                  onRemoveSlot={removeSlot}
                  allowRemove
                />
              ))}
              {countByKind(slots, 'color_variant') < (GROUP_MAX.color_variant ?? 8) && (
                <AddSlotTile
                  role="color_variant"
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  remainingSlots={(GROUP_MAX.color_variant ?? 8) - countByKind(slots, 'color_variant')}
                  onAddPicks={(picks) => addPicks('color_variant', picks)}
                />
              )}
            </div>
          </div>
        )}

        {/* 편집 모드 — bundle */}
        {mode === 'edit' && editCase === 'bundle' && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <GroupHeader
              title="번들 구성 상품"
              count={bundleSlots.filter((s) => s.value).length}
              max={GROUP_MAX.bundle_item ?? 4}
              min={GROUP_MIN.bundle_item ?? 2}
            />
            <p className="text-[11px] text-gray-500 -mt-1">
              서로 다른 상품의 이미지를 선택하세요. 첫 번째 상품이 결과물 저장 기준입니다
              {bundleOwnerId ? ' (현재 기준: 첫 번째 슬롯)' : ''}.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {bundleSlots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  availableTabs={['upload', 'other']}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                  onRemoveSlot={removeSlot}
                  allowRemove={bundleSlots.length > (GROUP_MIN.bundle_item ?? 2)}
                />
              ))}
              {countByKind(slots, 'bundle_item') < (GROUP_MAX.bundle_item ?? 4) && (
                <AddSlotTile
                  role="bundle_item"
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  availableTabs={['upload', 'other']}
                  remainingSlots={(GROUP_MAX.bundle_item ?? 4) - countByKind(slots, 'bundle_item')}
                  onAddPicks={(picks) => addPicks('bundle_item', picks)}
                />
              )}
            </div>
          </div>
        )}

        {/* 편집 모드 — single (+ "다른 종류 이미지 추가" 승격) */}
        {mode === 'edit' && editCase === 'single' && productSlot && (
          <>
            <div className="bg-white rounded-2xl p-4 space-y-2.5">
              <div>
                <h3 className="text-[13px] font-bold text-gray-900">상품 사진</h3>
                <p className="text-[12px] text-gray-500 mt-0.5">정리할 원본 상품 이미지</p>
              </div>
              <SlotCard
                slot={productSlot}
                productId={productId}
                hubImages={hubImages}
                hubImagesLoading={hubImagesLoading}
                fallbackValue={fallbackProductImage}
                onPickSlot={pickSlot}
                onClearSlot={clearSlot}
              />
            </div>

            {onPromoteCase && (
              <div className="bg-white rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Plus size={13} className="text-gray-500" />
                  <h3 className="text-[13px] font-bold text-gray-900">이미지 더 추가</h3>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  올리는 종류에 맞춰 AI 프롬프트가 자동으로 바뀝니다
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <PromoteTile
                    icon={Package}
                    title="박스·패키지"
                    desc="상품+박스 합성"
                    onClick={() => onPromoteCase('compose')}
                  />
                  <PromoteTile
                    icon={Palette}
                    title="색상별 사진"
                    desc="색상 여러 장"
                    onClick={() => onPromoteCase('color-variants')}
                  />
                  <PromoteTile
                    icon={Layers}
                    title="다른 상품"
                    desc="번들 구성"
                    onClick={() => onPromoteCase('bundle')}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* 편집 모드 — editCase 미정 (generationId 경유 작업 이어보기) → 원본 이미지 read-only 표시 */}
        {mode === 'edit' && editCase === null && (
          <div className="bg-white rounded-2xl p-4 space-y-2.5">
            <div>
              <h3 className="text-[13px] font-bold text-gray-900">원본 이미지</h3>
              <p className="text-[12px] text-gray-500 mt-0.5">편집 전 대표 이미지</p>
            </div>
            {originalImage ? (
              <div className="aspect-square overflow-hidden bg-gray-100">
                <ImgWithSkeleton
                  src={resolveImageUrl(originalImage) ?? originalImage}
                  alt="원본"
                  fit="contain"
                  priority
                />
              </div>
            ) : (
              <div className="aspect-square bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-[12px] text-gray-400">
                원본 이미지 없음
              </div>
            )}
          </div>
        )}

        {/* AI 연출 */}
        {mode === 'creative' && (
          <>
            <div className="bg-white rounded-2xl p-4 space-y-2.5">
              <div>
                <h3 className="text-[13px] font-bold text-gray-900">원본 이미지</h3>
                <p className="text-[12px] text-gray-500 mt-0.5">편집 전 대표 이미지</p>
              </div>
              {originalImage ? (
                <div className="aspect-square overflow-hidden bg-gray-100">
                  <ImgWithSkeleton
                    src={resolveImageUrl(originalImage) ?? originalImage}
                    alt="원본"
                    fit="contain"
                    priority
                  />
                </div>
              ) : (
                <div className="aspect-square bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-[12px] text-gray-400">
                  원본 이미지 없음
                </div>
              )}
            </div>
            {productSlot && (
              <div className="bg-white rounded-2xl p-4 space-y-2.5">
                <div>
                  <h3 className="text-[13px] font-bold text-gray-900">상품 사진</h3>
                  <p className="text-[12px] text-gray-500 mt-0.5">흰배경 상품 이미지</p>
                </div>
                <SlotCard
                  slot={productSlot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  fallbackValue={fallbackProductImage}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                />
              </div>
            )}
            {sceneType === 'custom-reference' && referenceSlot && (
              <div className="bg-white rounded-2xl p-4 space-y-2.5">
                <div>
                  <h3 className="text-[13px] font-bold text-gray-900">분위기 참고 이미지</h3>
                  <p className="text-[12px] text-gray-500 mt-0.5">mood · 팔레트 · 질감 참고용</p>
                </div>
                <SlotCard
                  slot={referenceSlot}
                  productId={productId}
                  hubImages={hubImages}
                  hubImagesLoading={hubImagesLoading}
                  onPickSlot={pickSlot}
                  onClearSlot={clearSlot}
                />
              </div>
            )}
          </>
        )}
      </div>

      {historyCandidates.length > 0 && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-4 pt-3 pb-4">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              이미지 히스토리 · 최신순 · {historyCandidates.length}
            </span>
            {selectedCandidateUrl ? (
              <button
                type="button"
                onClick={handleDownloadSelected}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 transition-colors"
                title="선택한 이미지 다운로드"
              >
                <Download size={12} /> 다운로드
              </button>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-white border border-gray-200 rounded-lg px-2 py-1 opacity-50 cursor-not-allowed">
                <Download size={12} /> 다운로드
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-[432px] overflow-y-auto p-0.5 pr-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
            {historyCandidates.map((c, idx) => {
              const url = resolveImageUrl(c.url) ?? '';
              const label = String.fromCharCode(65 + idx);
              const active = selectedCandidateUrl === url;
              const recommended = recommendedCandidateUrl && recommendedCandidateUrl === url;
              const isCreative = c.method === 'creative';
              const modeLabel = isCreative ? '연출' : '편집';
              const modeTitle = isCreative ? 'AI 연출 생성' : '이미지 편집';
              const createdLabel = c.createdAt ? timeAgo(c.createdAt) : null;
              return (
                <button
                  key={`${c.generationId ?? 'cur'}-${c.filename}-${idx}`}
                  type="button"
                  onClick={() => onSelectCandidate(url)}
                  className={cn(
                    'relative aspect-square overflow-hidden bg-white transition-all',
                    active
                      ? 'ring-2 ring-inset ring-violet-500'
                      : 'hover:ring-1 hover:ring-inset hover:ring-gray-400',
                  )}
                  title={`${modeTitle} · 후보 ${label}${createdLabel ? ` · ${createdLabel}` : ''}${recommended ? ' · 추천' : ''}`}
                >
                  {url ? (
                    <ImgWithSkeleton
                      src={url}
                      alt={`후보 ${label}`}
                      fit="cover"
                    />
                  ) : null}
                  <span
                    className={cn(
                      'absolute top-1 left-1 w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold',
                      active ? 'bg-violet-600 text-white' : 'bg-white/90 text-gray-700',
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      'absolute top-1 right-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9px] font-bold shadow-sm',
                      isCreative ? 'bg-fuchsia-500 text-white' : 'bg-violet-500 text-white',
                    )}
                  >
                    {isCreative ? <Sparkles size={8} /> : <Scissors size={8} />}
                    {modeLabel}
                  </span>
                  {(createdLabel || recommended) && (
                    <span className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                      {createdLabel ? (
                        <span className="px-1 py-0.5 rounded-md bg-black/55 text-white text-[9px] font-semibold">
                          {createdLabel}
                        </span>
                      ) : (
                        <span />
                      )}
                      {recommended && (
                        <span className="px-1 py-0.5 rounded-md bg-amber-400 text-white text-[8px] font-black uppercase tracking-wide shadow-sm">
                          ★ 추천
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {generationId && onDeleteSelectedCandidate && (
            <button
              type="button"
              onClick={onDeleteSelectedCandidate}
              disabled={!selectedCandidateUrl}
              className={cn(
                'mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all',
                selectedCandidateUrl
                  ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 active:scale-[0.99]'
                  : 'bg-white border border-gray-200 text-gray-400 cursor-not-allowed',
              )}
              title={selectedCandidateUrl ? '선택한 이미지 1장만 삭제합니다' : '먼저 삭제할 이미지를 선택하세요'}
            >
              <Trash2 size={15} />
              선택 이미지 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PromoteTile({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Package;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1.5 p-2.5 rounded-xl bg-white text-left',
        'border border-gray-200 hover:border-violet-300 hover:bg-violet-50/40',
        'transition-colors',
      )}
    >
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
        <Icon size={13} className="text-gray-600" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <div className="text-[11px] font-bold text-gray-800 truncate">{title}</div>
        <div className="text-[10px] text-gray-500 truncate">{desc}</div>
      </div>
    </button>
  );
}

function GroupHeader({ title, count, max, min }: { title: string; count: number; max: number; min: number }) {
  const belowMin = count < min;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[13px] font-bold text-gray-900">{title}</h3>
      <span
        className={cn(
          'text-[11px] rounded-md px-1.5 py-0.5 font-semibold',
          belowMin ? 'bg-amber-100 text-amber-700' : 'text-gray-500',
        )}
      >
        {count} / {max}
        {belowMin && <> · 최소 {min}장 필요</>}
        {!belowMin && <> · 최소 {min}장</>}
      </span>
    </div>
  );
}
