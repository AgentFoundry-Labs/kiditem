'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import type { MallPreflightProduct, MallPreflightResult } from '@kiditem/shared/mall-publishing';
import { cn, formatNumber } from '@/lib/utils';
import { PREFLIGHT_RULE_LABEL } from '../../_shared/mall-presentation';

interface PreflightTableProps {
  products: MallPreflightProduct[];
  mallCount: number;
}

export function PreflightTable({ products, mallCount }: PreflightTableProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
        조건에 맞는 상품이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">상품</th>
            <th className="px-3 py-3 text-center">올릴 수 있는 몰</th>
            <th className="px-3 py-3">막고 있는 것</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.masterProductId} className="border-b border-slate-50 align-top last:border-b-0">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{product.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {product.code}
                  {product.salePrice !== null ? ` · ${formatNumber(product.salePrice)}원` : ' · 판매가 없음'}
                  {product.optionNames.length > 0 ? ` · 옵션 ${product.optionNames.length}` : ''}
                </div>
              </td>
              <td className="px-3 py-3 text-center">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold',
                    product.eligibleMallCount > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-400',
                  )}
                >
                  {product.eligibleMallCount > 0 ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {product.eligibleMallCount} / {mallCount}
                </span>
              </td>
              <td className="px-3 py-3">
                <BlockerSummary results={product.results} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 몰마다 같은 사유가 반복되므로 규칙별로 접어서 보여준다.
 *
 * "고시 미입력" 이 28줄 나오는 화면은 무엇을 먼저 고쳐야 하는지 알려주지 못한다.
 */
function BlockerSummary({ results }: { results: MallPreflightResult[] }) {
  const failing = results.filter((result) => !result.ok);
  if (failing.length === 0) {
    return <span className="text-xs text-emerald-600">모든 몰 통과</span>;
  }

  const byRule = new Map<string, { message: string; malls: string[] }>();
  for (const result of failing) {
    for (const violation of result.violations) {
      const entry = byRule.get(violation.rule) ?? { message: violation.message, malls: [] };
      entry.malls.push(result.mallName);
      byRule.set(violation.rule, entry);
    }
  }

  return (
    <ul className="space-y-1">
      {[...byRule.entries()]
        .sort((left, right) => right[1].malls.length - left[1].malls.length)
        .map(([rule, entry]) => (
          <li key={rule} className="flex flex-wrap items-baseline gap-1.5 text-xs">
            <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
              {PREFLIGHT_RULE_LABEL[rule as keyof typeof PREFLIGHT_RULE_LABEL] ?? rule}
            </span>
            <span className="text-slate-400">{entry.malls.length}개 몰</span>
            <span className="text-slate-500" title={entry.malls.join(', ')}>
              {entry.message}
            </span>
          </li>
        ))}
    </ul>
  );
}
