'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { operatorProductReference } from '../../lib/operator-product-reference';
import { VariantRecipeSummary } from './VariantRecipeSummary';
import { cn } from '@/lib/utils';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import type {
  ChannelRecipeAutomationDecision,
  ChannelRecipeAutomationItem,
  ChannelRecipeAutomationProductGroup,
} from '@kiditem/shared/channel-recipe-automation';

type Props = {
  products: ChannelProductMatchingQueueRow[];
  options: ChannelOptionMatchingQueueRow[];
  productGroups: ChannelRecipeAutomationProductGroup[];
  automationItemsByOptionId: Map<string, ChannelRecipeAutomationItem>;
  onEditProduct: (row: ChannelProductMatchingQueueRow) => void;
  onEditVariant: (row: ChannelOptionMatchingQueueRow) => void;
  onShowRecipeSuggestion: (row: ChannelOptionMatchingQueueRow) => void;
  focusOptionId?: string;
  loading?: boolean;
};

export function ProductInventoryMatchingTable({
  products,
  options,
  productGroups,
  automationItemsByOptionId,
  onEditProduct,
  onEditVariant,
  onShowRecipeSuggestion,
  focusOptionId,
  loading = false,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const optionsByListingId = groupOptions(options);
  const focusedListingId = options.find((row) => row.option.id === focusOptionId)?.listing.id;
  const productGroupsByListingId = new Map(productGroups.map((group) => [
    group.channelListingId,
    group,
  ]));

  useEffect(() => {
    if (!focusedListingId) return;
    setExpandedIds((current) => {
      if (current.has(focusedListingId)) return current;
      const next = new Set(current);
      next.add(focusedListingId);
      return next;
    });
  }, [focusedListingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-14 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" /> 매칭 목록을 불러오는 중입니다.
      </div>
    );
  }

  const toggle = (listingId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[27%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr>
              <th className="px-4 py-3">채널 상품</th>
              <th className="px-4 py-3">KidItem 운영 상품</th>
              <th className="px-4 py-3">하위 옵션</th>
              <th className="px-4 py-3">상품·재고 상태</th>
              <th className="px-4 py-3">확인</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-slate-500">
                  표시할 채널 상품이 없습니다.
                </td>
              </tr>
            ) : products.map((product) => {
              const childOptions = optionsByListingId.get(product.listing.id) ?? [];
              const productGroup = productGroupsByListingId.get(product.listing.id);
              const decision = productMatchingDecision(product, childOptions, productGroup);
              const expanded = expandedIds.has(product.listing.id);
              return (
                <Fragment key={product.listing.id}>
                  <tr className="align-top">
                    <td className="overflow-hidden px-4 py-4">
                      <p className="truncate font-semibold text-slate-900" title={product.listing.displayName ?? undefined}>
                        {product.listing.displayName ?? '상품명 없음'}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500" title={product.channelAccount.name}>
                        {product.channelAccount.name} · {product.channelAccount.channel}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-400">
                        {product.listing.externalId}
                      </p>
                    </td>
                    <td className="overflow-hidden px-4 py-4">
                      {product.linkedProduct ? (
                        <>
                          <p className="truncate font-bold text-slate-900" title={operatorProductReference(product.linkedProduct.code, product.linkedProduct.name)}>
                            {operatorProductReference(product.linkedProduct.code, product.linkedProduct.name)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-emerald-700">상품 연결 완료</p>
                        </>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                          운영 상품 미연결
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-800">옵션 {product.optionCount.toLocaleString('ko-KR')}개</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.linkedOptionCount.toLocaleString('ko-KR')}개 연결
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <ProductDecisionBadge decision={decision} />
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggle(product.listing.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        상품별 확인 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={5} className="bg-slate-50/70 p-0">
                        <ProductDetails
                          product={product}
                          options={childOptions}
                          automationItemsByOptionId={automationItemsByOptionId}
                          focusOptionId={focusOptionId}
                          onEditProduct={onEditProduct}
                          onEditVariant={onEditVariant}
                          onShowRecipeSuggestion={onShowRecipeSuggestion}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function productMatchingDecision(
  product: ChannelProductMatchingQueueRow,
  options: ChannelOptionMatchingQueueRow[],
  productGroup?: ChannelRecipeAutomationProductGroup,
): ChannelRecipeAutomationDecision {
  if (productGroup) return productGroup.decision;
  if (!product.listing.masterProductId || options.some((row) => !row.option.productVariantId)) {
    return 'blocked';
  }
  if (options.length > 0 && options.every((row) => row.recipeStatus === 'matched')) {
    return 'already_configured';
  }
  if (options.some((row) => row.recipeStatus === 'review_required')) {
    return 'operator_review';
  }
  return 'blocked';
}

function ProductDetails({
  product,
  options,
  automationItemsByOptionId,
  focusOptionId,
  onEditProduct,
  onEditVariant,
  onShowRecipeSuggestion,
}: {
  product: ChannelProductMatchingQueueRow;
  options: ChannelOptionMatchingQueueRow[];
  automationItemsByOptionId: Map<string, ChannelRecipeAutomationItem>;
  focusOptionId?: string;
  onEditProduct: (row: ChannelProductMatchingQueueRow) => void;
  onEditVariant: (row: ChannelOptionMatchingQueueRow) => void;
  onShowRecipeSuggestion: (row: ChannelOptionMatchingQueueRow) => void;
}) {
  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">운영 상품 연결</p>
          <p className="mt-1 truncate font-semibold text-slate-900">
            {product.linkedProduct
              ? operatorProductReference(product.linkedProduct.code, product.linkedProduct.name)
              : '연결된 KidItem 운영 상품이 없습니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEditProduct(product)}
          className="shrink-0 rounded-xl border border-[var(--primary,#7048e8)] px-3 py-2 text-xs font-bold text-[var(--primary,#7048e8)]"
        >
          운영 상품 연결
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[920px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[25%]" />
            <col className="w-[27%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead className="bg-slate-100/80 font-bold text-slate-600">
            <tr>
              <th className="px-3 py-2.5">채널 옵션</th>
              <th className="px-3 py-2.5">KidItem 판매 옵션</th>
              <th className="px-3 py-2.5">Sellpia 재고 연결</th>
              <th className="px-3 py-2.5">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {options.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">수집된 하위 옵션이 없습니다.</td></tr>
            ) : options.map((row) => {
              const automationItem = automationItemsByOptionId.get(row.option.id);
              const focused = row.option.id === focusOptionId;
              return (
                <tr
                  key={row.option.id}
                  aria-label={focused ? '선택된 채널 옵션' : undefined}
                  className={cn(
                    'align-top',
                    focused && 'bg-purple-50 ring-1 ring-inset ring-purple-300',
                  )}
                >
                  <td className="overflow-hidden px-3 py-3">
                    <p className="truncate font-semibold text-slate-900" title={row.option.itemName ?? undefined}>
                      {row.option.itemName ?? '옵션명 없음'}
                    </p>
                    <p className="mt-1 break-all font-mono text-slate-500">
                      {row.option.sellerSku ?? row.option.externalOptionId}
                    </p>
                    {focused ? (
                      <span className="mt-1 inline-flex rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                        로켓 발주 대상
                      </span>
                    ) : null}
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    {row.linkedVariant ? (
                      <>
                        <p className="truncate font-bold text-slate-900" title={operatorProductReference(row.linkedVariant.code, row.linkedVariant.name)}>
                          {operatorProductReference(row.linkedVariant.code, row.linkedVariant.name)}
                        </p>
                        <p className="mt-1 truncate text-slate-500" title={row.linkedVariant.optionLabel ?? undefined}>
                          {row.linkedVariant.optionLabel ?? '옵션 설명 없음'}
                        </p>
                      </>
                    ) : <span className="font-semibold text-slate-500">운영 옵션 미연결</span>}
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    {automationItem
                      ? <AutomationRecipeSummary item={automationItem} />
                      : <VariantRecipeSummary row={row} />}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!row.listing.masterProductId}
                        title={!row.listing.masterProductId ? '상품을 먼저 연결해 주세요.' : undefined}
                        onClick={() => onEditVariant(row)}
                        className="rounded-xl border border-[var(--primary,#7048e8)] px-3 py-2 font-bold text-[var(--primary,#7048e8)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        운영 옵션 연결
                      </button>
                      {row.option.productVariantId && row.listing.masterProductId ? (
                        <button
                          type="button"
                          onClick={() => onShowRecipeSuggestion(row)}
                          className="rounded-xl border border-slate-300 px-3 py-2 font-bold text-slate-700"
                        >
                          Sellpia 후보
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductDecisionBadge({ decision }: { decision: ChannelRecipeAutomationDecision }) {
  const presentation = {
    auto_apply: ['자동 매칭 가능', 'bg-emerald-50 text-emerald-800'],
    operator_review: ['운영자 검토', 'bg-amber-50 text-amber-800'],
    blocked: ['연결·매칭 필요', 'bg-slate-100 text-slate-700'],
    already_configured: ['재고 구성 완료', 'bg-purple-50 text-purple-800'],
  }[decision];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${presentation[1]}`}>
      {presentation[0]}
    </span>
  );
}

function AutomationRecipeSummary({ item }: { item: ChannelRecipeAutomationItem }) {
  return (
    <div className="space-y-1.5">
      <p className="break-words font-bold text-slate-800">{automationReasonLabel(item)}</p>
      {item.sellpiaCode ? <p className="break-all font-mono text-slate-500">{item.sellpiaCode}</p> : null}
    </div>
  );
}

function automationReasonLabel(item: ChannelRecipeAutomationItem): string {
  const quantity = item.decision === 'auto_apply' && item.recommendedQuantity
    ? ` · 수량 ${item.recommendedQuantity}`
    : '';
  switch (item.reason) {
    case 'exact_unique_code': return `자동 매칭 가능 · 상품코드 정확 일치${quantity}`;
    case 'unique_physical_barcode': return `자동 매칭 가능 · 고유 바코드 일치${quantity}`;
    case 'exact_unique_name_option': return `자동 매칭 가능 · 상품명+옵션 정확 일치${quantity}`;
    case 'exact_unique_name': return `자동 매칭 가능 · 상품명 완전 일치${quantity}`;
    case 'high_confidence_name': return `자동 매칭 가능 · 고신뢰 상품명 일치${quantity}`;
    case 'identifier_name_mismatch': return '상품코드와 상품명 불일치 검토';
    case 'quantity_review': return '수량 확인 필요';
    case 'ambiguous': return '중복 후보';
    case 'conflict': return '증거 충돌';
    case 'name_review_only': return '상품명 후보 검토';
    case 'no_match': return '매칭 정보 없음';
    case 'already_configured':
      return item.evidenceLabels.includes('source: deterministic')
        ? '자동 구성 완료'
        : '운영자 구성 완료';
  }
}

function groupOptions(options: ChannelOptionMatchingQueueRow[]) {
  const grouped = new Map<string, ChannelOptionMatchingQueueRow[]>();
  for (const option of options) {
    const rows = grouped.get(option.listing.id) ?? [];
    rows.push(option);
    grouped.set(option.listing.id, rows);
  }
  for (const rows of grouped.values()) {
    rows.sort((left, right) => left.option.id.localeCompare(right.option.id));
  }
  return grouped;
}
