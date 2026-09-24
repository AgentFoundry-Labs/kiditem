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
  product?: Pick<MasterProductOperationsMetadata, 'id' | 'code' | 'name' | 'imageUrls'>;
};

type FormState = { imageUrls: string };

export function ProductEditorDialog({ open, onOpenChange, onSaved, product }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toFormState(product));

  useEffect(() => {
    if (open) setForm(toFormState(product));
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('수정할 상품을 선택해주세요.');
      const payload: UpdateMasterProductInput = {
        imageUrls: form.imageUrls.split(',').map((url) => url.trim()).filter(Boolean),
      };
      return apiClient.patch<{ id: string }>(`/api/products/masters/${product.id}`, payload);
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
    if (!product || mutation.isPending) return;
    mutation.mutate();
  };

  const errorMessage = mutation.error
    ? (isApiError(mutation.error) ? mutation.error.message : '상품을 저장하지 못했습니다.')
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-5">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">
                상품 이미지 수정
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                상품 이미지를 관리합니다. 상품 정보와 재고는 Sellpia 수집 결과를 반영합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
              <X size={18} />
            </Dialog.Close>
          </header>

          <form onSubmit={submit} className="space-y-5 p-6">
            <p className="text-sm text-[var(--text-secondary)]">{product?.code} · {product?.name}</p>
            <Field label="이미지 URL" value={form.imageUrls} placeholder="쉼표로 구분" onChange={(imageUrls) => setForm({ imageUrls })} />

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
                disabled={mutation.isPending || !product}
                className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {mutation.isPending ? '저장 중...' : '이미지 저장'}
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
        name="imageUrls"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)]"
      />
    </label>
  );
}

function toFormState(product?: Props['product']): FormState {
  return { imageUrls: product?.imageUrls.join(', ') ?? '' };
}
