'use client';

import { useState } from 'react';
import {
  TrendingUp, Star, Megaphone, Truck, FileText,
  AlertTriangle, ChevronUp, ChevronDown,
} from 'lucide-react';
import { getGradeColor } from '@/lib/utils';
import type { ExposureAnalysisData, ExposureProductScore, ExposureUrgentAction } from '@kiditem/shared';

const FACTOR_META: Record<string, { label: string; icon: typeof TrendingUp; colorKey: string }> = {
  sales:       { label: '판매 실적',  icon: TrendingUp, colorKey: 'blue' },
  review:      { label: '리뷰 활성도', icon: Star,       colorKey: 'purple' },
  ad:          { label: '광고 효율',  icon: Megaphone,  colorKey: 'emerald' },
  fulfillment: { label: '가격·출고',  icon: Truck,      colorKey: 'amber' },
  info:        { label: '상품 정보',  icon: FileText,   colorKey: 'slate' },
};

const COLOR_MAP: Record<string, { accent: string; bg: string; bar: string }> = {
  emerald: { accent: '#059669', bg: 'rgba(5,150,105,0.08)', bar: 'linear-gradient(90deg, rgba(5,150,105,0.4), #059669)' },
  blue:    { accent: '#2563eb', bg: 'rgba(37,99,235,0.08)',  bar: 'linear-gradient(90deg, rgba(37,99,235,0.4), #2563eb)' },
  amber:   { accent: '#d97706', bg: 'rgba(217,119,6,0.08)',  bar: 'linear-gradient(90deg, rgba(217,119,6,0.4), #d97706)' },
  purple:  { accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)', bar: 'linear-gradient(90deg, rgba(124,58,237,0.4), #7c3aed)' },
  slate:   { accent: '#475569', bg: 'rgba(71,85,105,0.08)',  bar: 'linear-gradient(90deg, rgba(71,85,105,0.4), #475569)' },
  red:     { accent: '#dc2626', bg: 'rgba(220,38,38,0.08)',  bar: 'linear-gradient(90deg, rgba(220,38,38,0.4), #dc2626)' },
};

function scoreColor(score: number) {
  if (score >= 80) return 'emerald';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'amber';
  return 'red';
}

function ScoreBar({ score, colorKey }: { score: number; colorKey: string }) {
  const c = COLOR_MAP[colorKey] || COLOR_MAP.slate;
  return (
    <div className="rounded-full overflow-hidden" style={{ height: 16, background: `${c.accent}12` }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(score, 2)}%`, background: c.bar }} />
    </div>
  );
}

// ─── 섹션 1: 요인별 현황 카드 ───────────────────────────────────────────────

function FactorCards({ data }: { data: ExposureAnalysisData }) {
  const factors = ['sales', 'review', 'ad', 'fulfillment', 'info'] as const;
  const fs = data.factorSummary;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {factors.map(key => {
        const f = fs[key];
        const meta = FACTOR_META[key];
        const Icon = meta.icon;
        const ck = scoreColor(f.score);
        const c = COLOR_MAP[ck];
        return (
          <div key={key} className="rounded-2xl px-4 py-3 flex flex-col gap-1"
            style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon size={14} style={{ color: c.accent }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c.accent }}>{meta.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular-nums" style={{ color: c.accent }}>{f.score}</span>
              <span className="text-sm font-semibold" style={{ color: c.accent, opacity: 0.5 }}>점</span>
            </div>
            <ScoreBar score={f.score} colorKey={ck} />
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {key === 'review' ? `미달 ${f.keyCount}개` : `${f.keyCount}개 달성`}
              {' · '}{f.subMetric}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 섹션 2: 개선 우선순위 ──────────────────────────────────────────────────

function ActionPriority({ actions }: { actions: ExposureUrgentAction[] }) {
  const urgent = actions.filter(a => a.urgency === 'urgent');
  const medium = actions.filter(a => a.urgency === 'medium');

  if (actions.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-8 text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>개선이 필요한 항목이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* 즉시 조치 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(220,38,38,0.04)' }}>
          <AlertTriangle size={14} style={{ color: '#dc2626' }} />
          <span className="text-xs font-bold" style={{ color: '#dc2626' }}>즉시 조치</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#dc2626' }}>{urgent.length}</span>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {urgent.length === 0
            ? <div className="py-6 text-center text-xs" style={{ color: 'var(--text-quaternary)' }}>없음</div>
            : urgent.map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
                  {FACTOR_META[a.factor]?.label ?? a.factorLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{a.action}</div>
                </div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: '#dc2626' }}>{a.score}점</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* 중점 개선 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(217,119,6,0.04)' }}>
          <TrendingUp size={14} style={{ color: '#d97706' }} />
          <span className="text-xs font-bold" style={{ color: '#d97706' }}>중점 개선</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#d97706' }}>{medium.length}</span>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {medium.length === 0
            ? <div className="py-6 text-center text-xs" style={{ color: 'var(--text-quaternary)' }}>없음</div>
            : medium.map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
                  {FACTOR_META[a.factor]?.label ?? a.factorLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{a.action}</div>
                </div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: '#d97706' }}>{a.score}점</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── 섹션 3: 상품별 진단 테이블 ─────────────────────────────────────────────

const SORT_KEYS = ['totalScore', 'sales', 'review', 'ad', 'fulfillment', 'info'] as const;
type SortKey = typeof SORT_KEYS[number];

const SORT_LABELS: Record<SortKey, string> = {
  totalScore: '종합',
  sales: '판매',
  review: '리뷰',
  ad: '광고',
  fulfillment: '가격·출고',
  info: '상품정보',
};

function ProductTable({ products }: { products: ExposureProductScore[] }) {
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('totalScore');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filtered = products
    .filter(p => gradeFilter === 'all' || p.grade === gradeFilter)
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    sortKey !== k ? null :
    sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>상품별 노출 진단</span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{filtered.length}개 상품</span>
        <div className="ml-auto flex gap-1">
          {(['all', 'A', 'B', 'C'] as const).map(g => (
            <button key={g} onClick={() => { setGradeFilter(g); setPage(1); }}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
              style={gradeFilter === g
                ? { background: 'var(--primary)', color: '#fff' }
                : { color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}>
              {g === 'all' ? '전체' : `${g}등급`}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table style={{ minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
              <th className="pl-4 w-8 text-left text-[11px]" style={{ color: 'var(--text-tertiary)' }}>#</th>
              <th className="w-8 text-left text-[11px]" style={{ color: 'var(--text-tertiary)' }}>등급</th>
              <th className="text-left text-[11px]" style={{ color: 'var(--text-tertiary)' }}>상품명</th>
              {SORT_KEYS.map(k => (
                <th key={k} className="text-right text-[11px] cursor-pointer select-none pr-2 whitespace-nowrap"
                  style={{ color: sortKey === k ? 'var(--primary)' : 'var(--text-tertiary)' }}
                  onClick={() => handleSort(k)}>
                  <span className="inline-flex items-center gap-0.5">
                    {SORT_LABELS[k]}<SortIcon k={k} />
                  </span>
                </th>
              ))}
              <th className="text-left text-[11px] pl-3 pr-4" style={{ color: 'var(--text-tertiary)' }}>개선과제</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              const totalC = scoreColor(p.totalScore);
              const tc = COLOR_MAP[totalC];
              return (
                <tr key={p.productId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="pl-4 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{rank}</td>
                  <td><span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${getGradeColor(p.grade || '')}`}>{p.grade || '?'}</span></td>
                  <td className="text-xs font-medium max-w-[200px] truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                  {/* 종합 점수 */}
                  <td className="text-right pr-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 hidden sm:block">
                        <ScoreBar score={p.totalScore} colorKey={totalC} />
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: tc.accent }}>{p.totalScore}</span>
                    </div>
                  </td>
                  {/* 요인별 미니바 */}
                  {(['sales', 'review', 'ad', 'fulfillment', 'info'] as const).map(fk => {
                    const sc = p[fk];
                    const fc = scoreColor(sc);
                    const fcc = COLOR_MAP[fc];
                    return (
                      <td key={fk} className="pr-2" style={{ minWidth: 60 }}>
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-10 hidden md:block">
                            <div className="rounded-full overflow-hidden" style={{ height: 10, background: `${fcc.accent}10` }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max(sc, 2)}%`, background: fcc.bar }} />
                            </div>
                          </div>
                          <span className="text-[11px] tabular-nums" style={{ color: fcc.accent }}>{sc}</span>
                        </div>
                      </td>
                    );
                  })}
                  {/* 개선과제 */}
                  <td className="pl-3 pr-4 max-w-[220px]">
                    <span className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{p.topIssue}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{(page - 1) * PAGE_SIZE + 1}~{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}개</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>◀</button>
            <span className="px-2.5 py-1 text-xs" style={{ color: 'var(--text-primary)' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>▶</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function ExposureAnalysis({ data }: { data: ExposureAnalysisData | null }) {
  if (!data) {
    return (
      <div className="py-16 text-center space-y-2">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>분석 중...</div>
      </div>
    );
  }

  const avgTotal = Math.round(
    Object.values(data.factorSummary).reduce((s, f) => s + f.score, 0) / 5
  );
  const avgColor = scoreColor(avgTotal);
  const avgC = COLOR_MAP[avgColor];

  return (
    <div className="space-y-4 animate-in">
      {/* 전체 요약 헤더 */}
      <div className="rounded-2xl px-5 py-3 flex items-center gap-4"
        style={{ background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>전체 노출 적합도</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: avgC.accent }}>{avgTotal}</span>
            <span className="text-lg font-semibold" style={{ color: avgC.accent, opacity: 0.5 }}>/ 100</span>
          </div>
        </div>
        <div className="flex-1 max-w-[240px]">
          <ScoreBar score={avgTotal} colorKey={avgColor} />
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>분석 상품</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{data.totalProducts}개</div>
        </div>
      </div>

      {/* 1. 요인별 현황 */}
      <FactorCards data={data} />

      {/* 2. 개선 우선순위 */}
      <div>
        <div className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>개선 우선순위</div>
        <ActionPriority actions={data.urgentActions} />
      </div>

      {/* 3. 상품별 진단 */}
      <ProductTable products={data.products} />
    </div>
  );
}
