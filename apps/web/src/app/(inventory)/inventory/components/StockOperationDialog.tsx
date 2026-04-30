'use client';

import { useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdjustStockInputSchema,
  IssueStockInputSchema,
  ReceiveStockInputSchema,
  UpdateInventoryMetadataInputSchema,
} from '@kiditem/shared/inventory';
import type { InventoryListItem } from '@kiditem/shared/inventory';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  useAdjustStock,
  useInventoryMetadataMutation,
  useIssueStock,
  useReceiveStock,
} from '../hooks/useInventory';

export type StockOperationMode = 'receive' | 'issue' | 'adjust' | 'metadata';

interface StockOperationDialogProps {
  item: InventoryListItem | null;
  mode: StockOperationMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODE_TITLES: Record<StockOperationMode, string> = {
  receive: '입고',
  issue: '출고',
  adjust: '재고 조정',
  metadata: '재고 설정',
};

interface QuantityFormState {
  quantity: string;
  unitCost: string;
  note: string;
}

interface AdjustFormState {
  delta: string;
  reason: string;
}

interface MetadataFormState {
  safetyStock: string;
  reorderPoint: string;
  leadTimeDays: string;
  warehouseLocation: string;
}

const EMPTY_QUANTITY: QuantityFormState = { quantity: '', unitCost: '', note: '' };
const EMPTY_ADJUST: AdjustFormState = { delta: '', reason: '' };
const EMPTY_METADATA: MetadataFormState = {
  safetyStock: '',
  reorderPoint: '',
  leadTimeDays: '',
  warehouseLocation: '',
};

function parseOptionalInt(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function StockOperationDialog({ item, mode, open, onOpenChange }: StockOperationDialogProps) {
  const [quantityForm, setQuantityForm] = useState<QuantityFormState>(EMPTY_QUANTITY);
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>(EMPTY_ADJUST);
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>(EMPTY_METADATA);

  const receiveMutation = useReceiveStock();
  const issueMutation = useIssueStock();
  const adjustMutation = useAdjustStock();
  const metadataMutation = useInventoryMetadataMutation();

  useEffect(() => {
    if (!open) {
      setQuantityForm(EMPTY_QUANTITY);
      setAdjustForm(EMPTY_ADJUST);
      setMetadataForm(EMPTY_METADATA);
      return;
    }
    if (mode === 'metadata' && item) {
      setMetadataForm({
        safetyStock: String(item.safetyStock ?? ''),
        reorderPoint: String(item.reorderPoint ?? ''),
        leadTimeDays: item.leadTimeDays != null ? String(item.leadTimeDays) : '',
        warehouseLocation: item.warehouseLocation ?? '',
      });
    }
  }, [open, mode, item]);

  if (!open || !item || !mode) return null;

  const close = () => onOpenChange(false);
  const title = MODE_TITLES[mode];
  const isPending =
    receiveMutation.isPending ||
    issueMutation.isPending ||
    adjustMutation.isPending ||
    metadataMutation.isPending;

  const handleReceiveOrIssue = async () => {
    const quantity = Number(quantityForm.quantity);
    const unitCostNum = parseOptionalInt(quantityForm.unitCost);
    const note = quantityForm.note.trim() || undefined;

    if (mode === 'receive') {
      const parsed = ReceiveStockInputSchema.safeParse({
        quantity,
        unitCost: unitCostNum,
        note,
      });
      if (!parsed.success) {
        toast.error('입고 수량은 1 이상의 정수여야 합니다.');
        return;
      }
      try {
        await receiveMutation.mutateAsync({ id: item.id, input: parsed.data });
        toast.success(`${item.masterName} 입고 완료`);
        close();
      } catch (err) {
        toast.error(isApiError(err) ? err.detail : '입고 처리에 실패했습니다.');
      }
      return;
    }

    const parsed = IssueStockInputSchema.safeParse({
      quantity,
      note,
    });
    if (!parsed.success) {
      toast.error('출고 수량은 1 이상의 정수여야 합니다.');
      return;
    }
    try {
      await issueMutation.mutateAsync({ id: item.id, input: parsed.data });
      toast.success(`${item.masterName} 출고 완료`);
      close();
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '출고 처리에 실패했습니다.');
    }
  };

  const handleAdjust = async () => {
    const delta = Number(adjustForm.delta);
    const parsed = AdjustStockInputSchema.safeParse({
      delta,
      reason: adjustForm.reason.trim(),
    });
    if (!parsed.success) {
      toast.error('조정 수량(0 제외)과 사유를 입력해 주세요.');
      return;
    }
    try {
      await adjustMutation.mutateAsync({ id: item.id, input: parsed.data });
      toast.success(`${item.masterName} 재고 조정 완료`);
      close();
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '재고 조정에 실패했습니다.');
    }
  };

  const handleMetadata = async () => {
    const safetyStock = parseOptionalInt(metadataForm.safetyStock);
    const reorderPoint = parseOptionalInt(metadataForm.reorderPoint);
    const leadTimeRaw = metadataForm.leadTimeDays.trim();
    const leadTimeDays =
      leadTimeRaw === '' ? undefined : leadTimeRaw === 'null' ? null : parseOptionalInt(leadTimeRaw);
    const warehouseLocation =
      metadataForm.warehouseLocation.trim() === '' ? null : metadataForm.warehouseLocation.trim();

    const parsed = UpdateInventoryMetadataInputSchema.safeParse({
      safetyStock,
      reorderPoint,
      leadTimeDays,
      warehouseLocation,
    });
    if (!parsed.success) {
      toast.error('재고 설정 값을 확인해 주세요.');
      return;
    }
    try {
      await metadataMutation.mutateAsync({ id: item.id, input: parsed.data });
      toast.success(`${item.masterName} 설정 저장 완료`);
      close();
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '재고 설정 저장에 실패했습니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">
              {item.masterName}
              {item.optionName ? ` · ${item.optionName}` : ''} · SKU {item.sku}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded-lg hover:bg-muted"
            aria-label="닫기"
          >
            <XCircle size={18} className="text-muted-foreground" />
          </button>
        </div>

        {(mode === 'receive' || mode === 'issue') && (
          <div className="space-y-3">
            <LabeledInput
              label="수량"
              type="number"
              min="1"
              value={quantityForm.quantity}
              onChange={(v) => setQuantityForm((f) => ({ ...f, quantity: v }))}
            />
            {mode === 'receive' && (
              <LabeledInput
                label="단가 (선택)"
                type="number"
                min="0"
                value={quantityForm.unitCost}
                onChange={(v) => setQuantityForm((f) => ({ ...f, unitCost: v }))}
              />
            )}
            <LabeledInput
              label="메모 (선택)"
              type="text"
              value={quantityForm.note}
              onChange={(v) => setQuantityForm((f) => ({ ...f, note: v }))}
            />
          </div>
        )}

        {mode === 'adjust' && (
          <div className="space-y-3">
            <LabeledInput
              label="증감 수량 (+ / -)"
              type="number"
              value={adjustForm.delta}
              onChange={(v) => setAdjustForm((f) => ({ ...f, delta: v }))}
            />
            <LabeledInput
              label="사유"
              type="text"
              value={adjustForm.reason}
              onChange={(v) => setAdjustForm((f) => ({ ...f, reason: v }))}
            />
          </div>
        )}

        {mode === 'metadata' && (
          <div className="space-y-3">
            <LabeledInput
              label="안전재고"
              type="number"
              min="0"
              value={metadataForm.safetyStock}
              onChange={(v) => setMetadataForm((f) => ({ ...f, safetyStock: v }))}
            />
            <LabeledInput
              label="발주시점"
              type="number"
              min="0"
              value={metadataForm.reorderPoint}
              onChange={(v) => setMetadataForm((f) => ({ ...f, reorderPoint: v }))}
            />
            <LabeledInput
              label="리드타임(일) — 없으면 빈칸"
              type="number"
              min="0"
              value={metadataForm.leadTimeDays}
              onChange={(v) => setMetadataForm((f) => ({ ...f, leadTimeDays: v }))}
            />
            <LabeledInput
              label="창고 위치 (빈칸이면 지움)"
              type="text"
              value={metadataForm.warehouseLocation}
              onChange={(v) => setMetadataForm((f) => ({ ...f, warehouseLocation: v }))}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted"
            disabled={isPending}
          >
            취소
          </button>
          <button
            type="button"
            onClick={
              mode === 'metadata'
                ? handleMetadata
                : mode === 'adjust'
                  ? handleAdjust
                  : handleReceiveOrIssue
            }
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-semibold bg-foreground text-background hover:opacity-90',
              isPending && 'opacity-60 cursor-not-allowed',
            )}
            disabled={isPending}
          >
            {isPending ? '처리 중...' : title}
          </button>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  type,
  value,
  onChange,
  min,
}: {
  label: string;
  type: 'number' | 'text';
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted-foreground mb-1">{label}</span>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
      />
    </label>
  );
}
