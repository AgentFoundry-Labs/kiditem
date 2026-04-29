'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Star,
  Megaphone,
  Truck,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ExposureAnalysisData, ExposureFactorScore, ExposureProductScore } from '@kiditem/shared/advertising';

const FACTOR_META: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  sales: { label: '판매 실적', icon: TrendingUp, color: '#2563eb' },
  review: { label: '리뷰 활성도', icon: Star, color: '#7c3aed' },
  ad: { label: '광고 효율', icon: Megaphone, color: '#059669' },
  fulfillment: { label: '가격·출고', icon: Truck, color: '#d97706' },
  info: { label: '상품 정보', icon: FileText, color: '#475569' },
};

function scoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#2563eb';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

function factorScore(product: ExposureProductScore, factor: string): ExposureFactorScore | null {
  return product.factors.find((f) => f.factor === factor) ?? null;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: `${color}18` }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, score)}%`, background: color }} />
    </div>
  );
}

function FactorCards({ scores }: { scores: ExposureProductScore[] }) {
  const summary = useMemo(() => {
    const factors = Object.keys(FACTOR_META);
    return factors.map((factor) => {
      const values = scores.map((s) => factorScore(s, factor)?.score ?? 0);
      const avg = values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
      return { factor, score: avg };
    });
  }, [scores]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {summary.map(({ factor, score }) => {
        const meta = FACTOR_META[factor];
        const Icon = meta.icon;
        const color = scoreColor(score);
        return (
          <div key={factor} className="rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-1.5">
              <Icon size={14} style={{ color: meta.color }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular-nums" style={{ color }}>{score}</span>
              <span className="text-sm font-semibold" style={{ color, opacity: 0.5 }}>점</span>
            </div>
            <ScoreBar score={score} color={color} />
          </div>
        );
      })}
    </div>
  );
}

function UrgentActions({ data }: { data: ExposureAnalysisData }) {
  if (data.urgentActions.length === 0) {
    return (
      <div className="rounded-2xl p-5 text-center text-sm" style={{ background: 'var(--card-bg)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}>
        긴급 개선 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {data.urgentActions.slice(0, 8).map((action) => (
        <div key={`${action.listing.listingId}-${action.issue}`} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <div className="min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{action.listing.channelName ?? action.listing.masterProduct.name}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{action.issue}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{action.suggestedAction}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductTable({ products }: { products: ExposureProductScore[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const filtered = products
    .filter((p) => gradeFilter === 'all' || p.grade === gradeFilter)
    .slice(0, 80);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>상품별 노출 진단</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>낮은 점수 순으로 표시</div>
        </div>
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-sunken)' }}>
          {(['all', 'A', 'B', 'C'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className="px-3 py-1 rounded-md text-xs font-semibold"
              style={gradeFilter === g ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-tertiary)' }}
            >
              {g === 'all' ? '전체' : g}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>상품</th>
              <th>등급</th>
              <th className="text-right">총점</th>
              <th>주요 이슈</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isOpen = expanded === p.listing.listingId;
              const color = scoreColor(p.totalScore);
              return (
                <>
                  <tr key={p.listing.listingId}>
                    <td className="font-medium max-w-[260px] truncate" style={{ color: 'var(--text-primary)' }}>{p.listing.channelName ?? p.listing.masterProduct.name}</td>
                    <td>{p.grade ?? '-'}</td>
                    <td className="text-right font-black tabular-nums" style={{ color }}>{p.totalScore}</td>
                    <td className="text-xs" style={{ color: p.topIssue ? 'var(--danger)' : 'var(--text-tertiary)' }}>{p.topIssue ?? '양호'}</td>
                    <td>
                      <button onClick={() => setExpanded(isOpen ? null : p.listing.listingId)} className="p-1 rounded hover:bg-[var(--surface-sunken)]">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${p.listing.listingId}-detail`}>
                      <td colSpan={5} className="p-0">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3" style={{ background: 'var(--surface-sunken)' }}>
                          {p.factors.map((factor) => {
                            const meta = FACTOR_META[factor.factor] ?? FACTOR_META.info;
                            const factorColor = scoreColor(factor.score);
                            return (
                              <div key={factor.factor} className="rounded-xl p-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
                                <div className="text-[11px] font-bold mb-1" style={{ color: meta.color }}>{meta.label}</div>
                                <div className="text-lg font-black tabular-nums mb-1" style={{ color: factorColor }}>{factor.score}</div>
                                <ScoreBar score={factor.score} color={factorColor} />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ExposureAnalysis({ data }: { data: ExposureAnalysisData | null }) {
  if (!data) {
    return (
      <div className="py-16 text-center space-y-2">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>분석 중...</div>
      </div>
    );
  }

  const avgTotal = data.scores.length > 0
    ? Math.round(data.scores.reduce((sum, p) => sum + p.totalScore, 0) / data.scores.length)
    : 0;
  const avgColor = scoreColor(avgTotal);

  return (
    <div className="space-y-4 animate-in">
      <div className="rounded-2xl px-5 py-3 flex items-center gap-4" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>전체 노출 적합도</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: avgColor }}>{avgTotal}</span>
            <span className="text-lg font-semibold" style={{ color: avgColor, opacity: 0.5 }}>/ 100</span>
          </div>
        </div>
        <div className="flex-1 max-w-[240px]">
          <ScoreBar score={avgTotal} color={avgColor} />
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>분석 상품</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{data.scores.length}개</div>
        </div>
      </div>

      <FactorCards scores={data.scores} />

      <div>
        <div className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>개선 우선순위</div>
        <UrgentActions data={data} />
      </div>

      <ProductTable products={data.scores} />
    </div>
  );
}
