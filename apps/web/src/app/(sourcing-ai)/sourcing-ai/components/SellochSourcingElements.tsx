import Link from 'next/link';
import {
  ArrowRight,
  ExternalLink,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  topSellingProducts,
  trendKeywords,
  type SourcingDecisionRow,
  type SourcingReport,
  type WholesaleProduct,
} from '../lib/sourcing-ai-dashboard';

export function HomeCard({
  href,
  icon: Icon,
  title,
  description,
  stat,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  stat: string;
}) {
  return (
    <Link href={href} className="group rounded-2xl border border-[#e2e8f0] bg-white p-7 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-[#8b5cf6] hover:shadow-[0_24px_54px_rgba(15,23,42,0.12)]">
      <div className="flex items-start gap-6">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#7c3aed] ring-1 ring-[#e2e8f0]">
          <Icon size={28} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-[#111827]">{title}</h2>
          <p className="mt-3 min-h-11 text-sm font-semibold leading-6 text-[#475569]">{description}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#7c3aed]">
            {stat}
            <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
          </p>
        </div>
      </div>
    </Link>
  );
}

export function Panel({ title, rightText, children }: { title: string; rightText?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] px-5 py-4">
        <h2 className="text-base font-black text-[#111827]">{title}</h2>
        {rightText && <span className="text-xs font-black text-[#94a3b8]">{rightText}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SidePanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#111827]">{title}</h2>
          <p className="mt-1 text-xs font-bold text-[#94a3b8]">{subtitle}</p>
        </div>
        <Sparkles size={18} className="text-[#8b5cf6]" />
      </div>
      <div className="mt-5">{children}</div>
    </aside>
  );
}

export function StatusPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 text-xs font-black text-[#64748b] shadow-sm">
      <Icon size={15} className="text-[#7c3aed]" />
      {label}
      <span className="text-[#111827]">{value}</span>
    </span>
  );
}

export function CandidateMiniCard({ index, report }: { index: number; report: SourcingReport }) {
  return (
    <article className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-4">
      <div className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed] text-sm font-black text-white">{index}</span>
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-black text-[#111827]">{report.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#475569]">{report.summary}</p>
        </div>
      </div>
    </article>
  );
}

export function ReportCard({ report, compact = false }: { report: SourcingReport; compact?: boolean }) {
  return (
    <article className="rounded-xl border border-[#e2e8f0] bg-[#fbfdff] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={report.status === 'ready' ? 'green' : 'red'}>{report.status === 'ready' ? '지금 가능' : '관찰 필요'}</Badge>
        <Badge tone="gray">{report.category}</Badge>
        <span className="text-xs font-bold text-[#94a3b8]">{report.dateLabel}</span>
      </div>
      <h2 className="mt-4 text-lg font-black text-[#111827]">{report.title}</h2>
      <p className={cn('mt-2 text-sm font-semibold leading-6 text-[#475569]', compact ? 'line-clamp-2' : 'line-clamp-3')}>{report.summary}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <SmallMetric label="판매가" value={`${formatKRW(report.priceAnalysis.naverAvgKrw)}원`} />
        <SmallMetric label="도매가" value={`${formatKRW(report.priceAnalysis.wholesaleAvgKrw)}원`} />
        <SmallMetric label="마진" value={`${report.priceAnalysis.estimatedMarginRate}%`} />
      </div>
    </article>
  );
}

export function DecisionCard({ row }: { row: SourcingDecisionRow }) {
  return (
    <article className="rounded-xl border border-[#e2e8f0] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={row.action === 'source_now' ? 'green' : 'yellow'}>{actionLabel(row.action)}</Badge>
            <Badge tone="gray">{row.category}</Badge>
          </div>
          <h3 className="mt-3 text-base font-black text-[#111827]">{row.keyword}</h3>
          <p className="mt-1 text-sm font-semibold text-[#64748b]">{row.demand.signal}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-black text-[#7c3aed]">{row.score}</p>
          <p className="text-xs font-bold text-[#94a3b8]">score</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <SmallMetric label="검색량" value={formatNumber(row.demand.searchVolume)} />
        <SmallMetric label="예상마진" value={`${Math.round(row.cost.marginRate)}%`} />
        <SmallMetric label="매입가" value={`${formatKRW(row.source.landedCostKrw)}원`} />
      </div>
    </article>
  );
}

export function KeywordTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-black text-[#94a3b8]">
            <th className="px-4 py-3">순위</th>
            <th className="px-4 py-3">키워드</th>
            <th className="px-4 py-3">카테고리</th>
            <th className="px-4 py-3">검색수</th>
            <th className="px-4 py-3">상품수</th>
            <th className="px-4 py-3">경쟁</th>
            <th className="px-4 py-3">변동</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] text-sm font-semibold text-[#475569]">
          {trendKeywords.map((item) => (
            <tr key={item.keyword} className="bg-white">
              <td className="px-4 py-4"><RankBadge rank={item.rank} /></td>
              <td className="px-4 py-4 font-black text-[#111827]">{item.keyword}</td>
              <td className="px-4 py-4">{item.category}</td>
              <td className="px-4 py-4">{formatNumber(item.searchVolume)}</td>
              <td className="px-4 py-4">{formatNumber(item.productCount)}</td>
              <td className="px-4 py-4 font-black text-[#7c3aed]">{item.competition.toFixed(2)}</td>
              <td className="px-4 py-4 font-black text-[#2563eb]">{item.movement >= 0 ? `+${item.movement}` : item.movement}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar() {
  const groups = [
    { label: '기간', items: ['주간', '일간'] },
    { label: '카테고리', items: ['전체', '패션의류', '패션잡화', '완구/물놀이', '출산/육아', '문구', '생활/건강'] },
    { label: '연령/성별', items: ['전체', '10대 여성', '20대 여성', '30대 여성', '40대 여성', '키즈'] },
  ];

  return (
    <Panel title="분석 조건" rightText="필터">
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-black text-[#94a3b8]">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    'h-10 rounded-xl border px-4 text-sm font-black',
                    index === 0
                      ? 'border-[#111827] bg-[#111827] text-white'
                      : 'border-[#e2e8f0] bg-white text-[#475569]',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function TopProductRow({ product }: { product: (typeof topSellingProducts)[number] }) {
  return (
    <article className="flex gap-3 rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0]">
        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center bg-[#3b82f6] text-xs font-black text-white">{product.rank}</span>
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-black leading-5 text-[#111827]">{product.title}</h3>
        <p className="mt-1 text-xs font-bold text-[#94a3b8]">{product.category}</p>
        <p className="mt-2 text-xs font-black text-[#475569]">{formatKRW(product.priceKrw)}원 · 리뷰 {formatNumber(product.reviewCount)}</p>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: WholesaleProduct[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <article key={product.id} className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="relative aspect-[4/3] bg-[#f1f5f9]">
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute right-3 top-3 rounded-lg bg-[#3b82f6] px-2.5 py-1.5 text-xs font-black text-white">
              최소 {formatNumber(product.minOrder)}개
            </span>
          </div>
          <div className="p-4">
            <h3 className="line-clamp-2 min-h-11 text-sm font-black leading-6 text-[#111827]">{product.title}</h3>
            <p className="mt-2 text-xs font-bold text-[#94a3b8]">{product.category}</p>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-lg font-black text-[#111827]">{formatKRW(product.priceKrw)}원</p>
                <p className="text-xs font-bold text-[#94a3b8]">배송비 {formatKRW(product.shippingKrw)}원</p>
              </div>
              <button type="button" className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#3b82f6] px-3 text-xs font-black text-white">
                비교
                <ExternalLink size={13} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

export function ValidationRow({ row }: { row: SourcingDecisionRow }) {
  return (
    <article className="rounded-xl border border-[#e2e8f0] bg-[#fbfdff] p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={row.action === 'source_now' ? 'green' : 'red'}>{actionLabel(row.action)}</Badge>
            <Badge tone="gray">{row.category}</Badge>
          </div>
          <h2 className="mt-3 text-lg font-black text-[#111827]">{row.keyword}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">{row.nextStep}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.risks.map((risk) => (
              <span key={risk} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#64748b] ring-1 ring-[#e2e8f0]">
                {risk}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <SmallMetric label="점수" value={`${row.score}점`} />
          <SmallMetric label="예상 마진" value={`${Math.round(row.cost.marginRate)}%`} />
          <SmallMetric label="랜딩 단가" value={`${formatKRW(row.source.landedCostKrw)}원`} />
        </div>
      </div>
    </article>
  );
}

export function ProductCompareRow({ product }: { product: WholesaleProduct }) {
  return (
    <article className="flex gap-3 rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3">
      <img src={product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-[#e2e8f0] object-cover" />
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-black text-[#111827]">{product.title}</h3>
        <p className="mt-1 text-xs font-bold text-[#94a3b8]">{product.category}</p>
        <p className="mt-2 text-sm font-black text-[#7c3aed]">{formatKRW(product.priceKrw)}원 · 최소 {formatNumber(product.minOrder)}개</p>
      </div>
    </article>
  );
}

export function MetricCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="rounded-2xl border border-[#e2e8f0] bg-white p-5 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <p className="text-xs font-black text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#111827]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#64748b]">{caption}</p>
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-center ring-1 ring-[#e2e8f0]">
      <p className="text-[11px] font-black text-[#94a3b8]">{label}</p>
      <p className="mt-1 text-sm font-black text-[#111827]">{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'red' | 'yellow' | 'gray'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-black',
        tone === 'green' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
        tone === 'red' && 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
        tone === 'yellow' && 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
        tone === 'gray' && 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      )}
    >
      {children}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-sm font-black',
        rank === 1 && 'bg-[#f59e0b] text-white',
        rank === 2 && 'bg-[#64748b] text-white',
        rank === 3 && 'bg-[#c2410c] text-white',
        rank > 3 && 'bg-[#f1f5f9] text-[#64748b]',
      )}
    >
      {rank}
    </span>
  );
}

export function KeywordRow({ keyword, category, value }: { keyword: string; category: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#111827]">{keyword}</p>
        <p className="mt-0.5 text-xs font-bold text-[#94a3b8]">{category}</p>
      </div>
      <span className="shrink-0 text-xs font-black text-[#7c3aed]">{value}</span>
    </div>
  );
}

export function ChipGrid({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button key={item} type="button" className="h-9 rounded-xl border border-[#e2e8f0] bg-white px-3 text-xs font-black text-[#475569] hover:border-[#8b5cf6] hover:text-[#5b21b6]">
          {item}
        </button>
      ))}
    </div>
  );
}

function actionLabel(action: SourcingDecisionRow['action']) {
  if (action === 'source_now') return '바로 소싱';
  if (action === 'track') return '추적';
  if (action === 'hold') return '보류';
  return '제외';
}
