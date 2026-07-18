'use client';

import { Loader2 } from 'lucide-react';
import { VariantRecipeSummary } from './VariantRecipeSummary';
import { operatorProductReference } from '../../lib/operator-product-reference';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import type { ChannelRecipeAutomationItem } from '@kiditem/shared/channel-recipe-automation';

type Props = {
  level: 'products' | 'options';
  products: ChannelProductMatchingQueueRow[];
  options: ChannelOptionMatchingQueueRow[];
  onEditProduct: (row: ChannelProductMatchingQueueRow) => void;
  onEditVariant: (row: ChannelOptionMatchingQueueRow) => void;
  onShowRecipeSuggestion?: (row: ChannelOptionMatchingQueueRow) => void;
  automationItemsByOptionId?: Map<string, ChannelRecipeAutomationItem>;
  loading?: boolean;
};

export function ChannelSkuMappingTable({
  level,
  products,
  options,
  onEditProduct,
  onEditVariant,
  onShowRecipeSuggestion,
  automationItemsByOptionId,
  loading = false,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-14 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" /> 매칭 목록을 불러오는 중입니다.
      </div>
    );
  }

  return level === 'products' ? (
    <ProductRows rows={products} onEdit={onEditProduct} />
  ) : (
    <OptionRows
      rows={options}
      onEdit={onEditVariant}
      onShowRecipeSuggestion={onShowRecipeSuggestion}
      automationItemsByOptionId={automationItemsByOptionId}
    />
  );
}

function ProductRows({ rows, onEdit }: {
  rows: ChannelProductMatchingQueueRow[];
  onEdit: (row: ChannelProductMatchingQueueRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[28%]" />
            <col className="w-[28%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr><th className="px-4 py-3">채널 계정</th><th className="px-4 py-3">채널 상품</th><th className="px-4 py-3">KidItem 상품</th><th className="px-4 py-3">옵션 진행</th><th className="px-4 py-3">작업</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-500">표시할 채널 상품이 없습니다.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.listing.id} className="align-top">
                <td className="overflow-hidden px-4 py-4"><p className="break-words font-bold text-slate-900">{row.channelAccount.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.channelAccount.channel}</p></td>
                <td className="overflow-hidden px-4 py-4"><p className="break-words font-semibold text-slate-900">{row.listing.displayName ?? '상품명 없음'}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.listing.externalId}</p></td>
                <td className="overflow-hidden px-4 py-4">{row.linkedProduct ? <><p className="break-words font-bold text-slate-900">{operatorProductReference(row.linkedProduct.code, row.linkedProduct.name)}</p><p className="mt-1 text-xs font-semibold text-emerald-700">연결 완료</p></> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">미매칭</span>}</td>
                <td className="px-4 py-4 font-semibold text-slate-700">{row.linkedOptionCount} / {row.optionCount} 연결</td>
                <td className="px-4 py-4"><button type="button" onClick={() => onEdit(row)} className="rounded-xl border border-[var(--primary,#7048e8)] px-3 py-2 text-xs font-bold text-[var(--primary,#7048e8)]">상품 연결</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionRows({ rows, onEdit, onShowRecipeSuggestion, automationItemsByOptionId }: {
  rows: ChannelOptionMatchingQueueRow[];
  onEdit: (row: ChannelOptionMatchingQueueRow) => void;
  onShowRecipeSuggestion?: (row: ChannelOptionMatchingQueueRow) => void;
  automationItemsByOptionId?: Map<string, ChannelRecipeAutomationItem>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
            <col className="w-[21%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr><th className="px-4 py-3">채널 계정</th><th className="px-4 py-3">채널 상품</th><th className="px-4 py-3">채널 옵션</th><th className="px-4 py-3">KidItem 판매 옵션</th><th className="px-4 py-3">레시피 상태</th><th className="px-4 py-3">작업</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-500">표시할 채널 옵션이 없습니다.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.option.id} className="align-top">
                <td className="overflow-hidden px-4 py-4"><p className="break-words font-bold text-slate-900">{row.channelAccount.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.channelAccount.channel}</p></td>
                <td className="overflow-hidden break-all px-4 py-4 font-mono text-xs text-slate-600">{row.listing.externalId}</td>
                <td className="overflow-hidden px-4 py-4"><p className="break-words font-semibold text-slate-900">{row.option.itemName ?? '옵션명 없음'}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.option.sellerSku ?? row.option.externalOptionId}</p></td>
                <td className="overflow-hidden px-4 py-4">{row.linkedVariant ? <><p className="break-words font-bold text-slate-900">{operatorProductReference(row.linkedVariant.code, row.linkedVariant.name)}</p><p className="mt-1 break-words text-xs text-slate-500">{row.linkedVariant.optionLabel ?? '옵션 설명 없음'}</p></> : <span className="text-xs font-semibold text-slate-500">미연결</span>}</td>
                <td className="overflow-hidden px-4 py-4">
                  {automationItemsByOptionId?.get(row.option.id) ? (
                    <AutomationRecipeSummary
                      item={automationItemsByOptionId.get(row.option.id)!}
                    />
                  ) : (
                    <VariantRecipeSummary row={row} />
                  )}
                </td>
                <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button type="button" aria-label="옵션 연결" disabled={!row.listing.masterProductId} title={!row.listing.masterProductId ? '상품을 먼저 연결해 주세요.' : undefined} onClick={() => onEdit(row)} className="rounded-xl border border-[var(--primary,#7048e8)] px-3 py-2 text-xs font-bold text-[var(--primary,#7048e8)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">운영 옵션 연결</button>{row.option.productVariantId && row.listing.masterProductId && onShowRecipeSuggestion ? <button type="button" onClick={() => onShowRecipeSuggestion(row)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Sellpia 후보</button> : null}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutomationRecipeSummary({ item }: { item: ChannelRecipeAutomationItem }) {
  return (
    <div className="space-y-1.5 text-xs">
      <p className="break-words font-bold text-slate-800">
        {automationReasonLabel(item)}
      </p>
      {item.sellpiaCode ? (
        <p className="break-all font-mono text-slate-500">{item.sellpiaCode}</p>
      ) : null}
    </div>
  );
}

function automationReasonLabel(item: ChannelRecipeAutomationItem): string {
  switch (item.reason) {
    case 'exact_unique_code': return '자동 매칭 가능 · 상품코드 정확 일치';
    case 'unique_physical_barcode': return '자동 매칭 가능 · 고유 바코드 일치';
    case 'exact_unique_name_option': return '자동 매칭 가능 · 상품명+옵션 정확 일치';
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
