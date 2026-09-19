'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesProduct, SalesProductChannelOverride } from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { formatWon } from '../lib/sales-product-labels';

interface OverrideDraft {
  salePrice: string;
  ratePercent: string;
  name: string;
}

function draftOf(override: SalesProductChannelOverride | undefined): OverrideDraft {
  return {
    salePrice: override?.salePrice !== null && override?.salePrice !== undefined ? String(override.salePrice) : '',
    ratePercent: override?.priceRateBp ? String(override.priceRateBp / 100) : '',
    name: override?.name ?? '',
  };
}

/**
 * 몰별 값(사방넷 쇼핑몰별별도정보) — 몰마다 판매가(금액 또는 %)와 상품명을 따로 둔다. 비워 두면 판매상품의
 * 값이 그대로 간다. 금액이 있으면 %보다 먼저다.
 */
export function ChannelOverridesSection({ product }: { product: SalesProduct }) {
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: salesProductKeys.mallAccounts(),
    queryFn: salesProductApi.mallAccounts,
    staleTime: 5 * 60_000,
  });
  const [adding, setAdding] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OverrideDraft>>({});

  const rows = useMemo(() => {
    const byAccount = new Map(product.channelOverrides.map((override) => [override.channelAccountId, override]));
    const extra = adding
      .filter((id) => !byAccount.has(id))
      .map((id) => accounts.data?.find((account) => account.channelAccountId === id))
      .filter(Boolean) as { channelAccountId: string; mallKey: string; mallName: string }[];
    return [
      ...product.channelOverrides.map((override) => ({
        channelAccountId: override.channelAccountId,
        mallName: override.mallName,
        override,
      })),
      ...extra.map((account) => ({ channelAccountId: account.channelAccountId, mallName: account.mallName, override: undefined })),
    ];
  }, [product.channelOverrides, adding, accounts.data]);

  const available = (accounts.data ?? []).filter((account) => !rows.some((row) => row.channelAccountId === account.channelAccountId));

  const save = useMutation({
    mutationFn: ({ channelAccountId, draft }: { channelAccountId: string; draft: OverrideDraft }) =>
      salesProductApi.upsertChannelOverride(product.id, channelAccountId, {
        salePrice: draft.salePrice.trim() ? Math.round(Number(draft.salePrice)) : null,
        priceRateBp: draft.ratePercent.trim() ? Math.round(Number(draft.ratePercent) * 100) : null,
        name: draft.name.trim() || null,
      }),
    onSuccess: (next, { channelAccountId }) => {
      queryClient.setQueryData(salesProductKeys.detail(product.id), next);
      setDrafts((current) => {
        const { [channelAccountId]: _saved, ...rest } = current;
        return rest;
      });
      setAdding((current) => current.filter((id) => id !== channelAccountId));
      toast.success('몰별 값을 저장했습니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '몰별 값을 저장하지 못했습니다.'),
  });

  const remove = useMutation({
    mutationFn: (channelAccountId: string) => salesProductApi.deleteChannelOverride(product.id, channelAccountId),
    onSuccess: (next) => {
      queryClient.setQueryData(salesProductKeys.detail(product.id), next);
      toast.success('몰별 값을 지웠습니다. 이 몰에는 판매상품 값이 그대로 갑니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '몰별 값을 지우지 못했습니다.'),
  });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-40 px-3 py-2 text-left font-semibold">쇼핑몰</th>
              <th className="w-32 px-2 py-2 text-right font-semibold">몰 판매가</th>
              <th className="w-24 px-2 py-2 text-right font-semibold">또는 %</th>
              <th className="px-2 py-2 text-left font-semibold">몰 상품명</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">실제로 갈 값</th>
              <th className="w-28 px-3 py-2" aria-label="저장" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  몰별 값이 없습니다. 모든 몰에 판매상품 값({formatWon(product.salePrice)})이 그대로 갑니다.
                </td>
              </tr>
            ) : rows.map(({ channelAccountId, mallName, override }) => {
              const draft = drafts[channelAccountId] ?? draftOf(override);
              const dirty = drafts[channelAccountId] !== undefined || !override;
              const set = (patch: Partial<OverrideDraft>) =>
                setDrafts((current) => ({ ...current, [channelAccountId]: { ...draft, ...patch } }));
              const effective = draft.salePrice.trim()
                ? Math.round(Number(draft.salePrice))
                : draft.ratePercent.trim()
                  ? Math.round(product.salePrice * Number(draft.ratePercent) / 100)
                  : product.salePrice;
              return (
                <tr key={channelAccountId} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 font-medium text-slate-800">{mallName}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={draft.salePrice}
                      onChange={(event) => set({ salePrice: event.target.value })}
                      placeholder={String(product.salePrice)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                      aria-label={`${mallName} 판매가`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={draft.ratePercent}
                      onChange={(event) => set({ ratePercent: event.target.value })}
                      placeholder="110"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                      aria-label={`${mallName} 판매가 비율(%)`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={draft.name}
                      onChange={(event) => set({ name: event.target.value })}
                      placeholder={product.name}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      aria-label={`${mallName} 상품명`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{formatWon(effective)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-primary btn-sm disabled:opacity-40"
                        disabled={!dirty || save.isPending}
                        onClick={() => save.mutate({ channelAccountId, draft })}
                      >
                        저장
                      </button>
                      {override && (
                        <button
                          type="button"
                          onClick={() => remove.mutate(channelAccountId)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                          aria-label={`${mallName} 몰별 값 지우기`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {available.length > 0 && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Plus size={14} aria-hidden />
          몰 더하기
          <select
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id) setAdding((current) => [...current, id]);
            }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          >
            <option value="">몰 고르기</option>
            {available.map((account) => (
              <option key={account.channelAccountId} value={account.channelAccountId}>{account.mallName}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
