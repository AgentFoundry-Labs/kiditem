import { CheckCircle2, ExternalLink, PackageCheck } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import type { Sourcing1688NewProductModelCandidate } from '../lib/sourcing-1688-new-product-model-api';

export function FinalCandidateCard({
  row,
  selected,
  onToggleSelection,
}: {
  row: Sourcing1688NewProductModelCandidate;
  selected: boolean;
  onToggleSelection: (row: Sourcing1688NewProductModelCandidate) => void;
}) {
  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white transition', selected ? 'border-[#5b52e6] ring-2 ring-[#d8d6ff]' : 'border-[#e4eaf3]')}>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#f1f5fb]">
        {row.imageUrl ? (
          <img src={row.imageUrl} alt={row.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PackageCheck size={30} className="text-[#9aa8ba]" />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-[#ff5a1f] ring-1 ring-[#f0d4c7]">
          {row.grade}
        </span>
        {selected && (
          <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#5b52e6] text-white shadow">
            <CheckCircle2 size={17} />
          </span>
        )}
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-[#111827]">{row.title}</p>
          <p className="mt-1 truncate text-[11px] font-black text-[#6d5dfc]">
            {row.keyword || row.wholesale.supplierName || '1688 상품'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f8fafc] p-2 text-[11px] font-bold text-[#667085]">
          <MetricMini label="모델" value={`${formatNumber(row.score)}점`} />
          <MetricMini label="1688 단가" value={formatCny(row.wholesale.priceCny)} />
          <MetricMini label="배송률" value={row.wholesale.shippingFulfillmentRate ?? '-'} />
          <MetricMini label="48시간" value={row.wholesale.shippingPickupRate ?? '-'} />
          <MetricMini label="예상이익" value={formatKrwPrice(row.wholesale.estimatedProfitKrw)} />
          <MetricMini label="마진" value={formatPercent(row.wholesale.estimatedMarginRate)} />
          <MetricMini label="월거래" value={formatNumber(row.wholesale.monthlySales ?? 0)} />
          <MetricMini label="쿠팡매칭" value={row.matchedCoupang ? `${formatNumber(row.matchedCoupang.matchScore)}점` : '-'} />
        </div>
        {row.matchedCoupang && (
          <div className="rounded-xl border border-[#eef1f5] bg-white px-3 py-2">
            <p className="text-[10px] font-black text-[#8a95a6]">쿠팡 근거</p>
            <p className="mt-1 line-clamp-2 text-[11px] font-black leading-4 text-[#111827]">{row.matchedCoupang.productName}</p>
            <p className="mt-1 text-[10px] font-bold text-[#667085]">
              3일 {formatNumber(row.matchedCoupang.salesLast3d)}개 · 리뷰 {formatNumber(row.matchedCoupang.reviews)}개 · {formatKrwPrice(row.matchedCoupang.salePrice)}
            </p>
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => onToggleSelection(row)}
            className={cn(
              'flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-black transition',
              selected
                ? 'border-[#5b52e6] bg-[#f2f5ff] text-[#4e6cf5]'
                : 'border-[#e3eaf5] bg-white text-[#667085] hover:bg-[#f8fafc]',
            )}
          >
            <CheckCircle2 size={14} />
            {selected ? '선택됨' : '선택'}
          </button>
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e3eaf5] bg-white text-[#667085] transition hover:bg-[#f8fafc] hover:text-[#4e6cf5]"
            aria-label="1688 상품 열기"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[#8a95a6]">{label}</p>
      <p className="truncate font-black text-[#111827]">{value}</p>
    </div>
  );
}

function formatCny(value: number | null): string {
  if (value == null) return '-';
  return `¥${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
}

function formatKrwPrice(value: number | null): string {
  if (value == null) return '-';
  return `${formatKRW(value)}원`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '-';
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
}
