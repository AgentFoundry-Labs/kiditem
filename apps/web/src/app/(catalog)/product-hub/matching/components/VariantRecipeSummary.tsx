'use client';

import Link from 'next/link';
import { cn, formatNumber } from '@/lib/utils';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelOptionRecipeStatus,
} from '@kiditem/shared/channel-product-matching';

type Props = { row: ChannelOptionMatchingQueueRow };

const STATUS: Record<ChannelOptionRecipeStatus, { label: string; className: string }> = {
  unmatched: { label: '미매칭', className: 'bg-slate-100 text-slate-700' },
  configuration_required: { label: '구성 필요', className: 'bg-amber-100 text-amber-800' },
  review_required: { label: '검토 필요', className: 'bg-orange-100 text-orange-800' },
  matched: { label: '구성 완료', className: 'bg-emerald-100 text-emerald-800' },
};

export function VariantRecipeSummary({ row }: Props) {
  const status = STATUS[row.recipeStatus];
  return (
    <div className="space-y-2 text-xs">
      <span className={cn('inline-flex rounded-full px-2.5 py-1 font-bold', status.className)}>
        {status.label}
      </span>
      <p className="font-semibold text-slate-700">
        판매 가능 {row.capacity === null ? '미확정' : formatNumber(row.capacity)}
      </p>
      {row.linkedVariant && row.listing.masterProductId ? (
        <Link
          href={`/product-hub/${row.listing.masterProductId}#variants`}
          className="inline-flex font-bold text-[var(--primary,#7048e8)] hover:underline"
        >
          중앙 레시피 보기
        </Link>
      ) : null}
    </div>
  );
}
