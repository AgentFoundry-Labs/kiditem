import { Trophy } from 'lucide-react';
import {
  productAbcDisplayStatus,
  PRODUCT_ABC_DISPLAY_STATUS_LABELS,
  type ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import { cn, formatKRW, formatPercent, getProfitAmountColor, getProfitColor } from '@/lib/utils';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';
import { DashboardCardHeader, DashboardHeaderLink } from './DashboardCardHeader';
import type { DashboardSalesSummary } from '@kiditem/shared/dashboard';

/**
 * The panel holds this many rows whether or not there is data for them.
 *
 * It used to render one centred line when empty and a row per product when not,
 * so the panel — and everything below it — moved as soon as a collection landed.
 * A dashboard an operator reads every day should put each number in the same
 * place; the difference between an empty day and a full one belongs in the
 * values, not in the layout.
 */
const ROW_SLOTS = 6;

/**
 * 등급이 없는 줄은 Products 가 발행한 ABC 근거의 표시 상태를 읽는다. 화면은 등급 부재를
 * 새로 판정하지 않는다.
 */
/** DESIGN.md's grade colours. The shared product-hub badge is a 36px coloured
 *  pill in emerald/amber/rose — a different scale and a different palette from
 *  this table, which is why it read as borrowed. */
const GRADE_CLASS: Record<ProductAbcGrade, string> = {
  A: 'text-primary',
  B: 'text-slate-600',
  C: 'text-orange-600',
};

function gradeLabel(product: DashboardSalesSummary['topProducts'][number]): string {
  if (product.grade) return product.grade;
  const status = product.abc ? productAbcDisplayStatus(product.abc) : null;
  return status ? PRODUCT_ABC_DISPLAY_STATUS_LABELS[status] : '—';
}

function gradeTitle(product: DashboardSalesSummary['topProducts'][number]): string {
  if (product.grade) return `${product.grade}등급`;
  const status = product.abc ? productAbcDisplayStatus(product.abc) : null;
  return status ? PRODUCT_ABC_DISPLAY_STATUS_LABELS[status] : '미분류';
}

/** 1 · 2 · 3 위는 옅은 금빛 칸, 나머지는 회색 칸 — 순위가 먼저 읽힌다. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 flex-none items-center justify-center rounded-md text-[11px] font-bold tabular-nums',
        rank <= 3 ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70' : 'bg-slate-100 text-slate-500',
      )}
      aria-hidden
    >
      {rank}
    </span>
  );
}

/**
 * 옆에 최근 등록된 상품이 서면서 표가 반폭이 됐다. 좁은 화면에서는 상품 이름이 먼저라 이익률 ·
 * 이익 칸을 차례로 접는다. 칸은 DOM 에 남아 줄마다 칸 수가 같다.
 */
const RATE_COLUMN = 'hidden 2xl:table-cell';
const PROFIT_COLUMN = 'hidden min-[1800px]:table-cell';

export function DashboardTopProducts({
  products,
  basis,
  className,
}: {
  className?: string;
  products: DashboardSalesSummary['topProducts'];
  basis?: DashboardMetricBasis | null;
}) {
  const rows = products.slice(0, ROW_SLOTS);
  const blanks = Math.max(0, ROW_SLOTS - rows.length);
  // 한 달을 고르면 셀피아 매입 원가로 낸 매출총이익이고, 그 밖의 기간은 정산 순이익이다.
  // 성격은 서버가 `profitKind` 로 밝힌다 — 칸 이름이 값의 성격을 그대로 말한다(사장님 2026-09-21).
  const gross = rows.some((product) => product.profitKind === 'gross');

  return (
    <section
      aria-label="Top 상품 · 매출순"
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}
    >
      <DashboardCardHeader icon={Trophy} tone="amber" title="Top 상품 · 매출순">
        <DashboardHeaderLink href="/product-hub">전체 보기</DashboardHeaderLink>
        <DashboardBasisDisclosure
          label="Top 상품 근거"
          entries={[{ label: '상품 매출', basis }]}
          meaning={(
            <p>
              선택한 기간의 매출 상위 {ROW_SLOTS}개입니다. 매출과 손익은 서버가 발행한 같은 기간의
              읽기 결과를 그대로 보여 주며, 손익 근거가 없는 행은 <code>—</code>로 남습니다.
              {gross
                ? ' 한 달을 고르면 셀피아 상품별 매출로 세며, 이익은 매출에서 셀피아 매입 원가만 뺀 매출총이익입니다 — 광고비와 몰 수수료는 빠지기 전입니다.'
                : ' 정산까지 끝난 순이익입니다.'}
            </p>
          )}
        />
      </DashboardCardHeader>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th className="pl-4 pr-2 text-[11px] text-slate-400">상품</th>
              <th className="w-12 px-2 text-center text-[11px] text-slate-400">등급</th>
              <th className="w-32 pl-2 pr-4 text-right text-[11px] text-slate-400 2xl:pr-2">매출</th>
              <th
                className={cn('w-28 px-2 text-right text-[11px] text-slate-400', PROFIT_COLUMN)}
                title={gross
                  ? '매출 − 셀피아 매입 원가. 광고비 · 몰 수수료를 빼기 전 값입니다.'
                  : '정산 근거가 갖춰진 상품별 순이익입니다.'}
              >
                {gross ? '매출총이익' : '순이익'}
              </th>
              <th className={cn('w-20 pr-4 pl-2 text-right text-[11px] text-slate-400', RATE_COLUMN)}>
                {gross ? '총이익률' : '이익률'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product, index) => (
              <tr key={product.id} className="border-b border-slate-100 last:border-b-0">
                <td className="pl-4 pr-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <RankBadge rank={index + 1} />
                    <span className="truncate text-sm font-medium text-slate-900" title={product.name}>{product.name}</span>
                  </span>
                </td>
                <td className={cn('px-2 text-center', product.grade ? cn('text-sm font-bold', GRADE_CLASS[product.grade]) : 'text-[11px] font-semibold text-slate-400')}
                    title={gradeTitle(product)}>
                  {gradeLabel(product)}
                </td>
                <td className="pl-2 pr-4 text-right text-sm font-semibold tabular-nums text-slate-900 2xl:pr-2">{formatKRW(product.revenue)}<span className="ml-0.5 font-normal text-slate-400">원</span></td>
                {/* Revenue is always measured; profit is not. A row whose profit
                    the backend withheld shows the absent-value dash rather than a
                    figure the screen cannot account for. */}
                <td className={cn('px-2 text-right text-sm tabular-nums', PROFIT_COLUMN, getProfitAmountColor(product.netProfit))}>
                  {product.netProfit === null ? '—' : <>{formatKRW(product.netProfit)}<span className="ml-0.5 text-slate-400">원</span></>}
                </td>
                <td className={cn('pr-4 pl-2 text-right text-sm font-semibold tabular-nums', RATE_COLUMN, getProfitColor(product.profitRate))}>
                  {product.profitRate === null ? '—' : formatPercent(product.profitRate)}
                </td>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <tr key={`slot-${index}`} className="border-b border-slate-100 last:border-b-0" aria-hidden="true">
                <td className="pl-4 pr-2 text-sm text-slate-300">
                  <span className="flex items-center gap-2.5">
                    <RankBadge rank={rows.length + index + 1} />
                    —
                  </span>
                </td>
                <td className="px-2 text-center text-sm text-slate-300">—</td>
                <td className="pl-2 pr-4 text-right text-sm tabular-nums text-slate-300 2xl:pr-2">—</td>
                <td className={cn('px-2 text-right text-sm tabular-nums text-slate-300', PROFIT_COLUMN)}>—</td>
                <td className={cn('pr-4 pl-2 text-right text-sm tabular-nums text-slate-300', RATE_COLUMN)}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
