'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { ChannelOptionMatchingQueueRow } from '@kiditem/shared/channel-product-matching';
import { queryKeys } from '@/lib/query-keys';
import { getChannelRecipeSuggestion } from '../lib/channel-sku-matching-api';

const STATUS_LABEL: Record<string, string> = {
  already_configured: '이미 구성됨', unique_code: '고유 코드 후보', quantity_review: '수량 검토 필요',
  conflict: '충돌', ambiguous: '복수 후보', name_review_only: '이름 검토만 가능', no_match: '후보 없음',
};

export function RecipeSuggestionDialog({ open, row, onOpenChange }: {
  open: boolean;
  row: ChannelOptionMatchingQueueRow;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const suggestion = useQuery({
    queryKey: queryKeys.channelProductMappings.recipeSuggestion(row.option.id),
    queryFn: () => getChannelRecipeSuggestion(row.option.id),
    enabled: open,
  });
  const data = suggestion.data;
  const canOpenRecipe = Boolean(data?.masterProductId && data.productVariantId);
  const openRecipe = (code?: string) => {
    if (!data?.masterProductId || !data.productVariantId) return;
    const search = new URLSearchParams({ recipeVariant: data.productVariantId });
    if (code) search.set('recipeSearch', code);
    router.push(`/product-hub/${data.masterProductId}?${search}#variant-${data.productVariantId}`);
    onOpenChange(false);
  };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[90vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <Dialog.Title className="text-lg font-extrabold text-slate-900">Sellpia 후보 검토</Dialog.Title>
        <Dialog.Description className="mt-1 text-sm text-slate-600">후보는 읽기 전용입니다. 레시피와 수량은 상품 상세에서 운영자가 확인합니다.</Dialog.Description>
        {suggestion.isLoading ? <p className="mt-5 text-sm text-slate-500">후보를 불러오는 중입니다.</p> : suggestion.error ? <p role="alert" className="mt-5 text-sm text-rose-700">후보를 불러오지 못했습니다.</p> : data ? <div className="mt-5 space-y-4 text-sm">
          <section className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-900">{STATUS_LABEL[data.status] ?? data.status}</p><p className="mt-1 text-slate-600">{data.reason}</p></section>
          <section><h3 className="font-bold text-slate-900">채널 근거</h3>{data.proposals.flatMap((proposal) => proposal.evidence).length ? <ul className="mt-2 space-y-1 text-slate-700">{data.proposals.flatMap((proposal) => proposal.evidence).map((evidence, index) => <li key={`${evidence.kind}-${index}`}>{evidence.kind}: {evidence.channelValue}</li>)}</ul> : <p className="mt-2 text-slate-500">확인 가능한 채널 근거가 없습니다.</p>}</section>
          {data.status === 'already_configured' ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-emerald-800">현재 레시피가 이미 구성되어 있습니다.</p><button type="button" onClick={() => openRecipe()} className="mt-2 text-sm font-bold text-[var(--primary)]">현재 레시피 보기</button></section> : null}
          {data.proposals.map((proposal) => <section key={proposal.sellpiaInventorySkuId} className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{proposal.code} · {proposal.name}</p><p className="mt-1 text-slate-600">{proposal.optionName ?? '옵션 없음'} · 현재고 {proposal.currentStock}</p><p className="mt-2 text-amber-800">수량과 다중 SKU BOM은 상품 상세에서 반드시 확인해야 합니다.</p>{canOpenRecipe ? <button type="button" onClick={() => openRecipe(proposal.code)} className="mt-3 rounded-lg border border-[var(--primary)] px-3 py-2 text-xs font-bold text-[var(--primary)]">상품 상세에서 레시피 확인</button> : null}</section>)}
          {!data.productVariantId ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">옵션을 먼저 운영 판매 옵션에 연결해 주세요.</p> : null}
          {['conflict', 'ambiguous', 'name_review_only'].includes(data.status) ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">충돌 또는 모호한 후보는 확정된 레시피가 아닙니다.</p> : null}
        </div> : null}
      </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
