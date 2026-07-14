'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleMinus,
  Eye,
  Plus,
  Search,
  Target,
  TriangleAlert,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import {
  rankMovement,
  rankTrackingRows,
  visibilityShare,
  type RankStatus,
  type RankTrackingRow,
} from '../lib/market-intelligence';

type StatusFilter = 'all' | RankStatus;

const dates = ['07.06', '07.07', '07.08', '07.09', '07.10', '07.11', '07.12'];
const pressable = 'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

export function RankTrackingSection({ onAddTracking }: { onAddTracking: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState(rankTrackingRows[0].id);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return rankTrackingRows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!normalizedQuery) return true;
      return [row.keyword, row.productName, row.sku]
        .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery));
    });
  }, [query, status]);

  const selected = rankTrackingRows.find((row) => row.id === selectedId) ?? rankTrackingRows[0];
  const chartData = dates.map((date, index) => ({ date, rank: selected.history[index] }));
  const fallingCount = rankTrackingRows.filter((row) => row.status === 'falling').length;
  const averageRank = Math.round(
    rankTrackingRows.reduce((sum, row) => sum + row.organicRank, 0) / rankTrackingRows.length,
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="순위 추적 요약">
        <RankMetric icon={Target} label="평균 자연순위" value={`${formatNumber(averageRank)}위`} detail="전일 대비 2.4계단 상승" tone="purple" />
        <RankMetric icon={Eye} label="TOP 20 노출점유" value={formatPercent(visibilityShare(rankTrackingRows))} detail="추적 키워드 5개 기준" tone="green" />
        <RankMetric icon={TriangleAlert} label="하락 알림" value={`${formatNumber(fallingCount)}건`} detail="10계단 이상 하락 1건" tone="red" />
        <RankMetric icon={Search} label="추적 환경" value="PC · 서울" detail="관련도순 · 로그인 · 1일 2회" tone="slate" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--primary)]">자연순위 7일 이력</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{selected.keyword}</h2>
              <p className="mt-1 max-w-xl truncate text-sm text-[var(--text-secondary)]">{selected.productName}</p>
            </div>
            <MovementPill current={selected.organicRank} previous={selected.previousRank} />
          </div>
          <div className="h-[300px] px-2 pb-3 pt-5 sm:px-5">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 300 }}>
              <LineChart data={chartData} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                <YAxis
                  reversed
                  domain={[1, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  width={44}
                  tickFormatter={(value: number) => `${value}위`}
                />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                  contentStyle={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${formatNumber(Number(value))}위`, '자연순위']}
                />
                <Line
                  type="monotone"
                  dataKey="rank"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  dot={{ r: 3, fill: '#7c3aed', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <ChartFootStat label="현재 자연순위" value={`${formatNumber(selected.organicRank)}위`} />
            <ChartFootStat label="광고순위" value={selected.sponsoredRank ? `${formatNumber(selected.sponsoredRank)}위` : '-'} />
            <ChartFootStat label="28일 전환율" value={formatPercent(selected.conversionRate)} />
            <ChartFootStat label="28일 판매" value={`${formatNumber(selected.sales)}개`} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--primary)]">순위 변동 진단</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">다음 액션</h2>
            </div>
            <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">자동 제안</span>
          </div>

          <div className="mt-5 space-y-3">
            <ActionDiagnosis
              state="urgent"
              title="크런치슬랑이 자연순위 7계단 하락"
              description="광고순위는 8위를 유지하고 있어 썸네일·가격·리뷰 경쟁력을 먼저 비교해야 합니다."
              action="경쟁상품 비교"
            />
            <ActionDiagnosis
              state="positive"
              title="왁뿌볼 TOP 20 진입"
              description="세트 전환율이 10.9%입니다. 광고 예산을 늘리기 전 자연순위 상승이 유지되는지 3일 더 확인하세요."
              action="3일 관찰"
            />
            <ActionDiagnosis
              state="neutral"
              title="펄러비즈 국내 수요 초기"
              description="중국 선행 신호는 강하지만 조회가 작습니다. 상세페이지보다 소량 재고와 숏폼 반응을 먼저 검증하세요."
              action="소량 테스트"
            />
          </div>

          <button
            type="button"
            onClick={onAddTracking}
            className={cn(
              'mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
              pressable,
            )}
          >
            <Plus size={16} />
            추적 키워드 추가
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="tracking-table-title">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="tracking-table-title" className="text-base font-bold text-[var(--text-primary)]">자사 상품 키워드 순위</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">자연순위와 광고순위를 분리하고 같은 환경에서 관측합니다.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:w-64">
              <span className="sr-only">추적 상품 검색</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="키워드, 상품명, SKU"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[var(--text-quaternary)] focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              aria-label="순위 상태 필터"
              className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--text-secondary)] outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            >
              <option value="all">전체 상태</option>
              <option value="rising">상승</option>
              <option value="falling">하락</option>
              <option value="steady">유지</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full">
            <thead>
              <tr>
                <th>키워드·상품</th>
                <th className="text-right">자연순위</th>
                <th className="text-right">변동</th>
                <th className="text-right">광고순위</th>
                <th className="text-right">전환율</th>
                <th className="text-right">조회</th>
                <th className="text-right">판매</th>
                <th>7일 흐름</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <RankRow
                  key={row.id}
                  row={row}
                  selected={selected.id === row.id}
                  onSelect={() => setSelectedId(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">조건에 맞는 추적 상품이 없습니다.</div>
        )}
      </section>
    </div>
  );
}

function RankRow({ row, selected, onSelect }: { row: RankTrackingRow; selected: boolean; onSelect: () => void }) {
  const movement = rankMovement(row.organicRank, row.previousRank);

  return (
    <tr className={cn(selected ? 'bg-purple-50/70 hover:bg-purple-50' : 'hover:bg-[var(--surface-sunken)]')}>
      <td>
        <button
          type="button"
          onClick={onSelect}
          className="max-w-[360px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <span className="block font-semibold text-[var(--text-primary)]">{row.keyword}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">{row.productName} · {row.sku}</span>
        </button>
      </td>
      <td className="text-right text-base font-bold tabular-nums text-[var(--text-primary)]">{formatNumber(row.organicRank)}위</td>
      <td className={cn('text-right font-semibold tabular-nums', movement > 0 ? 'text-green-600' : movement < 0 ? 'text-red-600' : 'text-slate-500')}>
        {movement > 0 ? `+${formatNumber(movement)}` : formatNumber(movement)}
      </td>
      <td className="text-right tabular-nums">{row.sponsoredRank ? `${formatNumber(row.sponsoredRank)}위` : '-'}</td>
      <td className="text-right font-medium tabular-nums">{formatPercent(row.conversionRate)}</td>
      <td className="text-right tabular-nums">{formatNumber(row.views)}</td>
      <td className="text-right tabular-nums">{formatNumber(row.sales)}</td>
      <td><RankSparkline values={row.history} status={row.status} /></td>
      <td><StatusBadge status={row.status} /></td>
    </tr>
  );
}

function RankSparkline({ values, status }: { values: number[]; status: RankStatus }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 88 + 2;
    const y = ((value - min) / range) * 24 + 4;
    return `${x},${y}`;
  }).join(' ');
  const stroke = status === 'rising' ? '#16a34a' : status === 'falling' ? '#dc2626' : '#64748b';

  return (
    <svg viewBox="0 0 92 32" className="h-8 w-[92px]" role="img" aria-label={`7일 순위 ${status === 'rising' ? '상승' : status === 'falling' ? '하락' : '유지'}`}>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function MovementPill({ current, previous }: { current: number; previous: number }) {
  const movement = rankMovement(current, previous);
  const improved = movement > 0;

  return (
    <div className={cn(
      'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
      improved ? 'bg-green-50 text-green-700' : movement < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700',
    )}>
      {improved ? <ArrowUp size={15} /> : movement < 0 ? <ArrowDown size={15} /> : <CircleMinus size={15} />}
      <span className="tabular-nums">{formatNumber(Math.abs(movement))}계단 {improved ? '상승' : movement < 0 ? '하락' : '유지'}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: RankStatus }) {
  const meta = {
    rising: { label: '상승', className: 'bg-green-50 text-green-700 ring-green-200' },
    falling: { label: '하락', className: 'bg-red-50 text-red-700 ring-red-200' },
    steady: { label: '유지', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  }[status];

  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', meta.className)}>{meta.label}</span>;
}

function RankMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail: string;
  tone: 'purple' | 'green' | 'red' | 'slate';
}) {
  const toneClass = {
    purple: 'bg-purple-50 text-purple-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
        </div>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClass)}><Icon size={18} /></span>
      </div>
      <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">{detail}</p>
    </article>
  );
}

function ChartFootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ActionDiagnosis({
  state,
  title,
  description,
  action,
}: {
  state: 'urgent' | 'positive' | 'neutral';
  title: string;
  description: string;
  action: string;
}) {
  const dotClass = state === 'urgent' ? 'bg-red-500' : state === 'positive' ? 'bg-green-500' : 'bg-slate-400';

  return (
    <article className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dotClass)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            <span className="rounded bg-[var(--surface-sunken)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">{action}</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
    </article>
  );
}
