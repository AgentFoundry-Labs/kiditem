'use client';

import { Plus, ChevronDown, Eraser, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MasterImageItem } from '@kiditem/shared';
import type { Slot, SlotPick, SlotSource } from '../edit/lib/slots';
import { ImageSourceDrawer, type DrawerTabKey } from './ImageSourceDrawer';
import { ImgWithSkeleton } from './ImgWithSkeleton';

const SOURCE_LABELS: Record<SlotSource, string> = {
  upload: '업로드',
  hub: '허브',
  'prev-gen': '이전 생성',
  'other-product': '다른 상품',
};

interface SlotCardProps {
  slot: Slot;
  productId: string | null;
  hubImages: MasterImageItem[];
  hubImagesLoading: boolean;
  fallbackValue?: string | null;
  fallbackLabel?: string;
  availableTabs?: DrawerTabKey[];
  onPickSlot: (id: string, pick: SlotPick) => void;
  onClearSlot: (id: string) => void;
  onRemoveSlot?: (id: string) => void;
  allowRemove?: boolean;
}

export function SlotCard({
  slot,
  productId,
  hubImages,
  hubImagesLoading,
  fallbackValue = null,
  fallbackLabel = '기본 상품 이미지',
  availableTabs,
  onPickSlot,
  onClearSlot,
  onRemoveSlot,
  allowRemove = false,
}: SlotCardProps) {
  const displayValue = slot.value ?? fallbackValue;
  const usingFallback = !slot.value && !!fallbackValue;
  const sourceBadge = slot.value && slot.source ? SOURCE_LABELS[slot.source] : usingFallback ? fallbackLabel : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[12px] font-semibold text-gray-700">{slot.label}</span>
        {sourceBadge && (
          <span className="text-[10px] text-gray-500 bg-gray-100 rounded-md px-1.5 py-0.5">
            {sourceBadge}
          </span>
        )}
      </div>

      {displayValue ? (
        <div className="relative w-full aspect-square overflow-hidden border border-gray-200 bg-gray-50 group">
          <ImgWithSkeleton src={displayValue} alt={slot.label} fit="cover" priority />

          <ImageSourceDrawer
            role={slot.role}
            productId={productId}
            hubImages={hubImages}
            hubImagesLoading={hubImagesLoading}
            availableTabs={availableTabs}
            onPick={(pick) => onPickSlot(slot.id, pick)}
          >
            <button
              type="button"
              className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-white bg-black/60 hover:bg-black/75 rounded-md transition-colors"
            >
              변경 <ChevronDown size={11} />
            </button>
          </ImageSourceDrawer>

          {slot.value && (
            <button
              type="button"
              onClick={() => onClearSlot(slot.id)}
              className="absolute top-2 right-2 p-1 rounded-full bg-white/90 hover:bg-white transition-colors"
              aria-label="이미지 지우기"
              title="이미지 지우기 (슬롯 유지)"
            >
              <Eraser size={14} className="text-slate-500" />
            </button>
          )}
          {allowRemove && onRemoveSlot && (
            <button
              type="button"
              onClick={() => onRemoveSlot(slot.id)}
              className="absolute top-2 left-2 p-1 rounded-full bg-white/90 hover:bg-white transition-colors"
              aria-label="슬롯 삭제"
              title="슬롯 삭제 (완전 제거)"
            >
              <Trash2 size={14} className="text-red-500" />
            </button>
          )}
        </div>
      ) : (
        <ImageSourceDrawer
          role={slot.role}
          productId={productId}
          hubImages={hubImages}
          hubImagesLoading={hubImagesLoading}
          availableTabs={availableTabs}
          onPick={(pick) => onPickSlot(slot.id, pick)}
        >
          <button
            type="button"
            className={cn(
              'flex flex-col items-center justify-center w-full aspect-square border-2 border-dashed',
              'cursor-pointer transition-colors bg-[#f8fafc] border-[#cbd5e1]',
              'hover:border-violet-400 hover:bg-violet-50/40',
            )}
          >
            <Plus size={24} className="mb-1.5 text-slate-300" />
            <span className="text-[11px] text-slate-500">이미지 추가</span>
          </button>
        </ImageSourceDrawer>
      )}
    </div>
  );
}

interface AddSlotTileProps {
  role: 'color_variant' | 'bundle_item';
  productId: string | null;
  hubImages: MasterImageItem[];
  hubImagesLoading: boolean;
  remainingSlots: number;
  availableTabs?: DrawerTabKey[];
  onAddPicks: (picks: SlotPick[]) => void;
}

export function AddSlotTile({
  role,
  productId,
  hubImages,
  hubImagesLoading,
  remainingSlots,
  availableTabs,
  onAddPicks,
}: AddSlotTileProps) {
  const atCap = remainingSlots <= 0;
  const drawerRole: 'color_variant' | 'product' = role === 'color_variant' ? 'color_variant' : 'product';

  return (
    <ImageSourceDrawer
      role={drawerRole}
      productId={productId}
      hubImages={hubImages}
      hubImagesLoading={hubImagesLoading}
      availableTabs={availableTabs}
      multi
      remainingSlots={remainingSlots}
      onPick={(pick) => onAddPicks([pick])}
      onPickMany={(picks) => onAddPicks(picks)}
    >
      <button
        type="button"
        disabled={atCap}
        className={cn(
          'flex flex-col items-center justify-center w-full aspect-square border-2 border-dashed transition-colors',
          atCap
            ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
            : 'bg-violet-50/30 border-violet-300 text-violet-700 hover:bg-violet-50 cursor-pointer',
        )}
      >
        <Plus size={18} />
        <span className="text-[10px] mt-0.5">추가</span>
      </button>
    </ImageSourceDrawer>
  );
}
