'use client';

import { useState } from 'react';
import {
  ChevronDown, AlertTriangle, Wallet, Download, FileSpreadsheet,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import type { AdRulesData, AdWeeklyPlan, AdStrategyAction } from '@kiditem/shared';

interface Props {
  rules: AdRulesData['recommendations'];
  strategy: AdWeeklyPlan | undefined;
}

const GRADE_CONFIGS = [
  { grade: 'A', title: '핵심 상품 캠페인', subtitle: '공격적 확장 — 매출 상위 70%', budgetPct: 65, color: '#059669', headerGrad: 'from-emerald-600 to-green-600', border: 'border-emerald-300', ring: 'ring-emerald-400', campaignType: '매출최적화 + 수동 병행', targetRoasLabel: '300~500%', bidGuide: { main: '800~1,000', sub: '500~700', longtail: '200~400' } },
  { grade: 'B', title: '성장 후보 캠페인', subtitle: '최적화 집중 — 매출 70~90%', budgetPct: 25, color: '#f59e0b', headerGrad: 'from-amber-500 to-yellow-500', border: 'border-amber-300', ring: 'ring-amber-400', campaignType: '수동 성과형 위주', targetRoasLabel: '300~480%', bidGuide: { main: '500~700', sub: '300~500', longtail: '100~300' } },
  { grade: 'C', title: '정리/테스트 캠페인', subtitle: '손절 · 재구성 — 나머지', budgetPct: 10, color: '#ef4444', headerGrad: 'from-red-500 to-pink-500', border: 'border-red-300', ring: 'ring-red-400', campaignType: '최소 테스트 or OFF', targetRoasLabel: '500%+', bidGuide: { main: 'OFF', sub: '200~300', longtail: '100~200' } },
] as const;

function exportCampaignXlsx(grade: string, actions: AdStrategyAction[], budget: number) {
  import('xlsx').then((XLSX) => {
    const gradeMap: Record<string, { campaignType: string; targetRoas: string; bidMain: string; bidSub: string; bidLongtail: string }> = {
      A: { campaignType: '매출최적화 + 수동 병행', targetRoas: '300~500%', bidMain: '800~1,000', bidSub: '500~700', bidLongtail: '200~400' },
      B: { campaignType: '수동 성과형', targetRoas: '300~480%', bidMain: '500~700', bidSub: '300~500', bidLongtail: '100~300' },
      C: { campaignType: '최소 테스트 or OFF', targetRoas: '500%+', bidMain: 'OFF', bidSub: '200~300', bidLongtail: '100~200' },
    };

    const grades = grade === 'all' ? ['A', 'B', 'C'] : [grade];
    const wb = XLSX.utils.book_new();

    for (const g of grades) {
      const cfg = gradeMap[g] || gradeMap.A;
      const gradeActions = grade === 'all' ? actions.filter(a => a.grade === g) : actions;
      const gradeBudget = grade === 'all' ? Math.round(budget * (g === 'A' ? 0.65 : g === 'B' ? 0.25 : 0.1)) : budget;

      const rows = gradeActions.map((a, i) => {
        const productBudget = gradeActions.length > 0 ? Math.round(gradeBudget / gradeActions.length) : 0;
        return {
          'No': i + 1,
          '캠페인명': `${g}등급_캠페인`,
          '상품명': a.name,
          '상품ID': a.productId,
          '등급': g,
          '현재 ROAS(%)': a.currentRoas || 0,
          '추천 일예산(원)': productBudget,
          '목표 ROAS(%)': a.targetRoas || cfg.targetRoas,
          '최대 입찰가(원)': a.maxBidPrice || 0,
          '캠페인 유형': cfg.campaignType,
          '메인 키워드 입찰가': cfg.bidMain + '원',
          '서브 키워드 입찰가': cfg.bidSub + '원',
          '롱테일 키워드 입찰가': cfg.bidLongtail + '원',
          '현재 CTR(%)': a.currentCtr || 0,
          '현재 CVR(%)': a.currentCvr || 0,
          '현재 ACoS(%)': a.currentAcos || 0,
          '키워드': (a.keywords || []).join(', '),
          '추천 액션': a.recommendedAction,
          '우선순위': a.actionPriority === 'urgent' ? '긴급' : a.actionPriority === 'high' ? '높음' : a.actionPriority === 'medium' ? '보통' : '낮음',
          '사유': a.reason || '',
        };
      });

      if (rows.length === 0) {
        rows.push({
          'No': 1, '캠페인명': `${g}등급_캠페인`, '상품명': '(해당 상품 없음)', '상품ID': '',
          '등급': g, '현재 ROAS(%)': 0, '추천 일예산(원)': 0, '목표 ROAS(%)': cfg.targetRoas,
          '최대 입찰가(원)': 0, '캠페인 유형': cfg.campaignType,
          '메인 키워드 입찰가': cfg.bidMain + '원', '서브 키워드 입찰가': cfg.bidSub + '원',
          '롱테일 키워드 입찰가': cfg.bidLongtail + '원',
          '현재 CTR(%)': 0, '현재 CVR(%)': 0, '현재 ACoS(%)': 0,
          '키워드': '', '추천 액션': '', '우선순위': '', '사유': '',
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 4 }, { wch: 16 }, { wch: 35 }, { wch: 12 }, { wch: 5 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 18 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, `${g}등급 캠페인`);
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = grade === 'all' ? `광고캠페인_ABC_${dateStr}.xlsx` : `광고캠페인_${grade}등급_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  });
}

export function StrategyTab({ rules, strategy }: Props) {
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [totalBudget, setTotalBudget] = useState(300000);
  const [budgetInput, setBudgetInput] = useState('300,000');

  const stratActions = strategy?.actions || [];

  return (
    <div className="space-y-5">
      {/* 1. Budget input */}
      <div className="rounded-2xl overflow-hidden bg-white shadow-md border border-slate-100">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-r from-violet-600 to-blue-600">
              <Wallet size={17} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">일일 광고 총 예산</h2>
              <p className="text-[11px] text-slate-400">총 예산 기준 A·B·C 캠페인별 자동 배분</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text" value={budgetInput}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = Math.max(0, parseInt(raw) || 0);
                  setBudgetInput(formatNumber(num));
                  setTotalBudget(num);
                }}
                className="w-48 text-right pr-12 pl-3 py-2.5 rounded-xl text-xl font-black tabular-nums bg-slate-50 border-2 border-violet-600 text-slate-900"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none text-slate-400">원</span>
            </div>
            <button
              onClick={() => exportCampaignXlsx('all', stratActions, totalBudget)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white hover:shadow-lg transition-shadow bg-gradient-to-r from-violet-600 to-blue-600"
            >
              <Download size={14} /> 전체 XLSX
            </button>
          </div>
        </div>
        {/* Distribution bar */}
        <div className="px-5 pb-4 flex items-center gap-4">
          <div className="flex-1 flex h-4 rounded-full overflow-hidden">
            <div style={{ width: '65%', background: 'linear-gradient(90deg, #059669, #10b981)' }} />
            <div style={{ width: '25%', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
            <div style={{ width: '10%', background: 'linear-gradient(90deg, #ef4444, #f87171)' }} />
          </div>
          <div className="flex gap-3 text-[11px] font-semibold shrink-0 text-slate-600">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />A {formatKRW(Math.round(totalBudget * 0.65))}원</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />B {formatKRW(Math.round(totalBudget * 0.25))}원</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />C {formatKRW(Math.round(totalBudget * 0.1))}원</span>
          </div>
        </div>
      </div>

      {/* 2. ABC Campaign Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {GRADE_CONFIGS.map(cfg => {
          const isSelected = selectedGrade === cfg.grade;
          const gradeActions = stratActions.filter(a => a.grade === cfg.grade);
          const gradeBudget = Math.round(totalBudget * cfg.budgetPct / 100);
          const urgentCount = gradeActions.filter(a => a.actionPriority === 'urgent').length;

          return (
            <div key={cfg.grade} className={cn('rounded-2xl overflow-hidden border-2 transition-all', cfg.border, isSelected ? `ring-2 ${cfg.ring} shadow-xl` : 'hover:shadow-lg')}>
              {/* Header */}
              <button onClick={() => setSelectedGrade(isSelected ? null : cfg.grade)} className={cn('w-full text-left bg-gradient-to-r px-5 py-4', cfg.headerGrad)}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-2xl font-black text-white">{cfg.grade}</span>
                    <div>
                      <div className="text-base font-bold text-white leading-tight">{cfg.title}</div>
                      <div className="text-[12px] text-white/70">{cfg.subtitle}</div>
                    </div>
                  </div>
                  <ChevronDown size={18} className={cn('text-white/70 transition-transform', isSelected ? 'rotate-180' : '')} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-black text-white tabular-nums">{formatKRW(gradeBudget)}<span className="text-sm font-semibold text-white/60 ml-1">원/일</span></div>
                  <div className="flex items-center gap-2">
                    {urgentCount > 0 && <span className="px-2 py-1 bg-red-500/80 rounded-lg text-[11px] font-bold text-white">긴급 {urgentCount}</span>}
                    <span className="px-2 py-1 bg-white/20 rounded-lg text-[12px] font-bold text-white">{gradeActions.length}개 상품</span>
                  </div>
                </div>
              </button>

              {/* Campaign settings */}
              <div className="px-5 py-4 space-y-3 bg-white" style={{ borderBottom: isSelected ? '1px solid #e2e8f0' : 'none' }}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">캠페인 유형</div>
                  <div className="text-[15px] font-bold mt-0.5 text-slate-900">{cfg.campaignType}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">목표 ROAS</div>
                  <div className="text-xl font-black mt-0.5" style={{ color: cfg.color }}>{cfg.targetRoasLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-slate-400">키워드 입찰가</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-3 py-1.5 rounded-lg" style={{ background: `${cfg.color}10` }}>
                      <span className="text-[12px] font-bold" style={{ color: cfg.color }}>메인</span>
                      <span className="text-[14px] font-black tabular-nums" style={{ color: cfg.color }}>{cfg.bidGuide.main}원</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-1.5 rounded-lg bg-slate-50">
                      <span className="text-[12px] font-bold text-slate-600">서브</span>
                      <span className="text-[14px] font-black tabular-nums text-slate-900">{cfg.bidGuide.sub}원</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-1.5 rounded-lg bg-slate-50">
                      <span className="text-[12px] font-bold text-slate-400">롱테일</span>
                      <span className="text-[14px] font-black tabular-nums text-slate-900">{cfg.bidGuide.longtail}원</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); exportCampaignXlsx(cfg.grade, gradeActions, gradeBudget); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:shadow-md"
                  style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}
                >
                  <FileSpreadsheet size={15} /> XLSX 내보내기
                </button>
              </div>

              {/* Product list (expanded) */}
              {isSelected && (
                <div className="max-h-[400px] overflow-y-auto bg-white">
                  {gradeActions.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-slate-400">해당 상품 없음</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {gradeActions.map((a, i) => {
                        const productBudget = gradeActions.length > 0 ? Math.round(gradeBudget / gradeActions.length) : 0;
                        return (
                          <div key={i} className="px-5 py-3 hover:bg-slate-50/50">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[13px] font-bold truncate flex-1 text-slate-900">{a.name}</span>
                              <span className={cn('text-[15px] font-black tabular-nums shrink-0', a.currentRoas >= 300 ? 'text-emerald-600' : a.currentRoas >= 100 ? 'text-amber-600' : a.currentRoas > 0 ? 'text-red-500' : 'text-slate-300')}>
                                {a.currentRoas > 0 ? `${a.currentRoas}%` : '-'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] tabular-nums text-slate-600">
                              <span>일예산 <b className="text-slate-900">{formatKRW(productBudget)}원</b></span>
                              <span>·</span>
                              <span>입찰 <b className="text-slate-900">{a.maxBidPrice > 0 ? `${formatKRW(a.maxBidPrice)}원` : '-'}</b></span>
                              <span>·</span>
                              <span className={cn('font-bold', a.actionPriority === 'urgent' ? 'text-red-600' : a.actionPriority === 'high' ? 'text-orange-600' : '')}>
                                {a.actionPriority === 'urgent' ? '긴급' : a.actionPriority === 'high' ? '높음' : a.actionPriority === 'medium' ? '보통' : '낮음'}
                              </span>
                            </div>
                            {a.keywords && a.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {a.keywords.slice(0, 8).map((kw, ki) => (
                                  <span key={ki} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${cfg.color}08`, color: cfg.color, border: `1px solid ${cfg.color}20` }}>{kw}</span>
                                ))}
                                {a.keywords.length > 8 && <span className="text-[10px] self-center text-slate-300">+{a.keywords.length - 8}</span>}
                              </div>
                            )}
                            <div className="text-[11px] mt-1 truncate text-slate-400">{a.recommendedAction}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Urgent action items */}
      {(rules.some(r => r.priority === 'urgent') || strategy?.adIssues?.zeroConversion || strategy?.adIssues?.cGradeHighTier || strategy?.adIssues?.aGradeNoAd) && (
        <div className="rounded-2xl p-5 bg-white shadow-md border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="text-sm font-bold text-slate-900">쿠팡 광고센터에서 직접 처리</span>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {rules.filter(r => r.priority === 'urgent').slice(0, 10).map((r, i) => (
              <div key={`r${i}`} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{r.name}</div>
                  <div className="text-xs mt-0.5 text-slate-400">{r.action}</div>
                </div>
                <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold hover:shadow-md text-white" style={{ background: '#dc2626' }}>광고센터 →</a>
              </div>
            ))}
            {rules.filter(r => r.priority === 'urgent').length > 10 && (
              <div className="text-center text-xs py-2 text-slate-400">외 {rules.filter(r => r.priority === 'urgent').length - 10}건</div>
            )}
            {strategy?.adIssues?.zeroConversion ? (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                <div className="flex-1"><div className="text-sm font-semibold text-slate-900">전환 0 상품 {strategy.adIssues.zeroConversion}개</div><div className="text-xs mt-0.5 text-slate-400">키워드 OFF 처리</div></div>
                <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold hover:shadow-md text-white" style={{ background: '#dc2626' }}>광고센터 →</a>
              </div>
            ) : null}
            {strategy?.adIssues?.cGradeHighTier ? (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#f59e0b' }} />
                <div className="flex-1"><div className="text-sm font-semibold text-slate-900">C등급 고광고 {strategy.adIssues.cGradeHighTier}개</div><div className="text-xs mt-0.5 text-slate-400">예산 축소 또는 캠페인 OFF</div></div>
                <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold hover:shadow-md text-white" style={{ background: '#f59e0b' }}>광고센터 →</a>
              </div>
            ) : null}
            {strategy?.adIssues?.aGradeNoAd ? (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(45,157,90,0.04)', border: '1px solid rgba(45,157,90,0.15)' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#059669' }} />
                <div className="flex-1"><div className="text-sm font-semibold text-slate-900">A등급 미광고 {strategy.adIssues.aGradeNoAd}개</div><div className="text-xs mt-0.5 text-slate-400">매출최적화 캠페인 생성</div></div>
                <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold hover:shadow-md text-white" style={{ background: '#059669' }}>광고센터 →</a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
