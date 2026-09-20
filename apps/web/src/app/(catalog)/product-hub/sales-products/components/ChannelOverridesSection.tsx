'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  mallDefaultPriceRateBp,
  SALES_PRODUCT_SABANGNET_VALUE_KEYS,
  type SalesProduct,
  type SalesProductChannelOverride,
} from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { formatWon } from '../lib/sales-product-labels';
import { nextAdapterValues, SUPPLY_PRICE_MALLS } from '../lib/mall-supply-price';

interface OverrideDraft {
  salePrice: string;
  ratePercent: string;
  name: string;
  /** 이 몰에 넘기는 공급가(온채널처럼 공급가와 판매가가 따로인 몰). 몰별 값 `supplyPrice` 로 저장한다. */
  supplyPrice: string;
}

function draftOf(override: SalesProductChannelOverride | undefined): OverrideDraft {
  return {
    salePrice: override?.salePrice !== null && override?.salePrice !== undefined ? String(override.salePrice) : '',
    ratePercent: override?.priceRateBp ? String(override.priceRateBp / 100) : '',
    name: override?.name ?? '',
    supplyPrice: override?.adapterValues?.supplyPrice ?? '',
  };
}



function hasSabangnetValues(override: SalesProductChannelOverride | undefined): boolean {
  return Object.keys(override?.adapterValues ?? {}).some((key) => key.startsWith('sabangnet'));
}

/** 사방넷 송신 기록에서 옮긴 이 몰의 분류 · 부가정보 한 줄. 없으면 null. */
function SabangnetMallNote({ override }: { override: SalesProductChannelOverride | undefined }) {
  const values = override?.adapterValues ?? {};
  const keys = SALES_PRODUCT_SABANGNET_VALUE_KEYS;
  const category = values[keys.categoryPath];
  const template = values[keys.templateTitle];
  if (!category && !template) return null;
  return (
    <p className="mt-0.5 max-w-[16rem] text-[11px] font-normal leading-snug text-slate-500">
      {category && <span className="block truncate" title={category}>분류 {category}</span>}
      {template && <span className="block truncate" title={template}>부가정보 {template}</span>}
    </p>
  );
}

/**
 * 몰별 값(사방넷 쇼핑몰별별도정보) — 몰마다 판매가(금액 또는 %)와 상품명을 따로 둔다. 비워 두면 판매상품의
 * 값이 그대로 간다. 금액이 있으면 %보다 먼저다. 사방넷에서 쓰던 그 몰의 분류 · 부가정보는 몰 이름 아래에 남는다.
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
        mallKey: override.mallKey,
        mallName: override.mallName,
        override,
      })),
      ...extra.map((account) => ({
        channelAccountId: account.channelAccountId,
        mallKey: account.mallKey,
        mallName: account.mallName,
        override: undefined,
      })),
    ];
  }, [product.channelOverrides, adding, accounts.data]);

  const available = (accounts.data ?? []).filter((account) => !rows.some((row) => row.channelAccountId === account.channelAccountId));

  const save = useMutation({
    mutationFn: ({ channelAccountId, draft }: { channelAccountId: string; draft: OverrideDraft }) =>
      salesProductApi.upsertChannelOverride(product.id, channelAccountId, {
        salePrice: draft.salePrice.trim() ? Math.round(Number(draft.salePrice)) : null,
        priceRateBp: draft.ratePercent.trim() ? Math.round(Number(draft.ratePercent) * 100) : null,
        name: draft.name.trim() || null,
        // 보낸 값이 통째로 덮어쓰므로 사방넷에서 옮긴 분류 · 부가정보를 그대로 들고 간다.
        adapterValues: nextAdapterValues(
          product.channelOverrides.find((item) => item.channelAccountId === channelAccountId),
          draft.supplyPrice,
        ),
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
    // 사방넷에서 옮긴 분류 · 부가정보가 있는 줄은 지우지 않고 판매가 · 상품명만 비운다 — 해지하면 다시 받을 수 없다.
    mutationFn: (channelAccountId: string) => {
      const override = product.channelOverrides.find((item) => item.channelAccountId === channelAccountId);
      return hasSabangnetValues(override)
        ? salesProductApi.upsertChannelOverride(product.id, channelAccountId, { salePrice: null, priceRateBp: null, name: null })
        : salesProductApi.deleteChannelOverride(product.id, channelAccountId);
    },
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
              <th className="w-28 px-2 py-2 text-right font-semibold" title="온채널처럼 공급가와 판매가가 따로인 몰">공급가</th>
              <th className="px-2 py-2 text-left font-semibold">몰 상품명</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">실제로 갈 값</th>
              <th className="w-28 px-3 py-2" aria-label="저장" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  몰별 값이 없습니다. 모든 몰에 판매상품 값({formatWon(product.salePrice)})이 그대로 갑니다.
                </td>
              </tr>
            ) : rows.map(({ channelAccountId, mallKey, mallName, override }) => {
              const draft = drafts[channelAccountId] ?? draftOf(override);
              const dirty = drafts[channelAccountId] !== undefined || !override;
              const set = (patch: Partial<OverrideDraft>) =>
                setDrafts((current) => ({ ...current, [channelAccountId]: { ...draft, ...patch } }));
              // 둘 다 비우면 그 몰 기본 적용율(사방넷 적용율을 되살린 값)로 간다. 몰 엑셀이 쓰는 값과 같다.
              const defaultRateBp = mallDefaultPriceRateBp(mallKey);
              const effective = draft.salePrice.trim()
                ? Math.round(Number(draft.salePrice))
                : draft.ratePercent.trim()
                  ? Math.round(product.salePrice * Number(draft.ratePercent) / 100)
                  : defaultRateBp
                    ? Math.round(product.salePrice * defaultRateBp / 10_000 / 10) * 10
                    : product.salePrice;
              return (
                <tr key={channelAccountId} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 align-top font-medium text-slate-800">
                    {mallName}
                    <SabangnetMallNote override={override} />
                  </td>
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
                    {SUPPLY_PRICE_MALLS.has(mallKey) ? (
                      <input
                        type="number"
                        value={draft.supplyPrice}
                        onChange={(event) => set({ supplyPrice: event.target.value })}
                        placeholder="공급가"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                        aria-label={`${mallName} 공급가`}
                      />
                    ) : (
                      <span className="block text-right text-xs text-slate-300" aria-hidden>—</span>
                    )}
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
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {formatWon(effective)}
                    {!draft.salePrice.trim() && !draft.ratePercent.trim() && defaultRateBp && (
                      <span className="block text-[11px] font-normal text-slate-400">기본 {defaultRateBp / 100}%</span>
                    )}
                  </td>
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
