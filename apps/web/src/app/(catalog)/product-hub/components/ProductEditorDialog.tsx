'use client';

import { useEffect, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import type {
  MasterProductOperationsMetadata,
  UpdateMasterProductInput,
} from '@kiditem/shared/product-operations';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (productId: string) => void;
  product?: MasterProductOperationsMetadata;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  tags: string;
  imageUrls: string;
  profitTag: string;
  adTier: string;
  adBudgetLimit: string;
  healthScore: string;
  isActive: boolean;
};

export function ProductEditorDialog({ open, onOpenChange, onSaved, product }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toFormState(product));

  useEffect(() => {
    if (open) setForm(toFormState(product));
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if (product) {
        return apiClient.patch<{ id: string }>(
          `/api/products/masters/${product.id}`,
          payload satisfies UpdateMasterProductInput,
        );
      }
      return apiClient.post<{ id: string }>('/api/products/masters', payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.lists() });
      if (product) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.products.operations.detail(product.id),
        });
      }
      onSaved(saved.id);
      onOpenChange(false);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    mutation.mutate();
  };

  const errorMessage = mutation.error
    ? (isApiError(mutation.error) ? mutation.error.detail : '상품을 저장하지 못했습니다.')
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-5">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">
                {product ? '상품 정보 수정' : '상품 만들기'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                KidItem 상품 정보를 관리합니다. 재고 수량은 Sellpia 동기화에서만 변경됩니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </header>

          <form onSubmit={submit} className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {product?.displayReference.type === 'channel_product' ? (
                <div className="block text-sm font-semibold text-[var(--text-secondary)]">
                  <p>{product.displayReference.label}</p>
                  <p className="mt-1.5 flex h-10 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 font-mono text-sm text-[var(--text-primary)]">
                    {product.displayReference.value}
                  </p>
                </div>
              ) : (
                <Field label="상품 코드" required value={form.code} onChange={(code) => setForm((value) => ({ ...value, code }))} />
              )}
              <Field label="상품명" required value={form.name} onChange={(name) => setForm((value) => ({ ...value, name }))} />
              <Field label="카테고리" value={form.category} onChange={(category) => setForm((value) => ({ ...value, category }))} />
              <Field label="브랜드" value={form.brand} onChange={(brand) => setForm((value) => ({ ...value, brand }))} />
              <Field label="손익 태그" value={form.profitTag} onChange={(profitTag) => setForm((value) => ({ ...value, profitTag }))} />
              <Field label="광고 등급" value={form.adTier} onChange={(adTier) => setForm((value) => ({ ...value, adTier }))} />
              <NumberField label="광고 예산 한도" value={form.adBudgetLimit} min={0} onChange={(adBudgetLimit) => setForm((value) => ({ ...value, adBudgetLimit }))} />
              <NumberField label="상품 건강도" value={form.healthScore} min={0} max={100} onChange={(healthScore) => setForm((value) => ({ ...value, healthScore }))} />
              <Field label="태그" value={form.tags} placeholder="쉼표로 구분" onChange={(tags) => setForm((value) => ({ ...value, tags }))} />
              <Field label="이미지 URL" value={form.imageUrls} placeholder="쉼표로 구분" onChange={(imageUrls) => setForm((value) => ({ ...value, imageUrls }))} />
            </div>
            <label className="block text-sm font-semibold text-[var(--text-secondary)]">
              설명
              <textarea
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked }))}
              />
              판매 활성
            </label>

            {errorMessage ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </p>
            ) : null}

            <footer className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <Dialog.Close asChild>
                <button type="button" disabled={mutation.isPending} className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">
                  취소
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={mutation.isPending || !form.code.trim() || !form.name.trim()}
                className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {mutation.isPending ? '저장 중...' : product ? '변경 저장' : '상품 만들기'}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, value, onChange, required, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--text-secondary)]">
      {label}
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)]"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max?: number;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--text-secondary)]">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)]"
      />
    </label>
  );
}

function toFormState(product?: MasterProductOperationsMetadata): FormState {
  return {
    code: product?.code ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? '',
    brand: product?.brand ?? '',
    tags: product?.tags.join(', ') ?? '',
    imageUrls: product?.imageUrls.join(', ') ?? '',
    profitTag: product?.profitTag ?? '',
    adTier: product?.adTier ?? '',
    adBudgetLimit: product?.adBudgetLimit?.toString() ?? '',
    healthScore: product?.healthScore?.toString() ?? '',
    isActive: product?.isActive ?? true,
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}

function toPayload(form: FormState) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: nullable(form.description),
    category: nullable(form.category),
    brand: nullable(form.brand),
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    imageUrls: form.imageUrls.split(',').map((url) => url.trim()).filter(Boolean),
    profitTag: nullable(form.profitTag),
    adTier: nullable(form.adTier),
    adBudgetLimit: nullableNumber(form.adBudgetLimit),
    healthScore: nullableNumber(form.healthScore),
    isActive: form.isActive,
  };
}
