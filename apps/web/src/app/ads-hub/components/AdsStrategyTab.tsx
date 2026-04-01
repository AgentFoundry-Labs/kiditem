'use client';

import { Megaphone, Check } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { getGradeColor } from '@/lib/utils';
import type { AdsListItem as AdProduct } from '@kiditem/shared';

interface ActionItem {
  productId: string;
  productName: string;
  grade: string;
  tier: string | null;
  currentRoas: number;
  currentAdRate: number;
  recommendedAction: string;
  actionPriority: 'urgent' | 'high' | 'medium' | 'low';
  reason: string;
  maxBidPrice: number;
  recommendedDailyBudget: number;
}

const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700', label: '긴급' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', label: '높음' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700', label: '보통' },
  low: { bg: 'bg-gray-100', text: 'text-gray-600', label: '낮음' },
};

export function buildActions(products: AdProduct[]): ActionItem[] {
  return products
    .map((p) => {
      let action = '유지';
      let priority: ActionItem['actionPriority'] = 'low';
      let reason = '정상 운영 중';

      if (p.adRevenue === 0 && p.spend > 0) {
        action = '광고 매출 0원 — 즉시 중단';
        priority = 'urgent';
        reason = `광고비 ₩${formatKRW(p.spend)} 지출, 매출 없음`;
      } else if (p.roas > 0 && p.roas < 200 && p.spend > 0) {
        action = `ROAS ${p.roas}% 위험 — 광고비 절감 또는 중단`;
        priority = 'urgent';
        reason = `ROAS ${p.roas}%로 손실 구간`;
      } else if (p.profitRate < 0 && p.spend > 0) {
        action = '적자 상품 — 광고 중단 권고';
        priority = 'urgent';
        reason = `이익률 ${p.profitRate}%, 광고비가 수익 초과`;
      } else if (p.adRate > 15) {
        action = '광고비율 과다 — 입찰가 조정';
        priority = 'high';
        reason = `광고비율 ${p.adRate}% (기준: 15% 이하)`;
      } else if (p.grade === 'C' && (p.adTier === '1차' || p.adTier === '2차')) {
        action = 'C등급 고티어 — 티어 하향 필요';
        priority = 'high';
        reason = `${p.grade}등급 상품에 ${p.adTier} 배정`;
      } else if (p.roas >= 200 && p.roas < 300) {
        action = 'ROAS 개선 필요 — 키워드 최적화';
        priority = 'medium';
        reason = `ROAS ${p.roas}% (목표: 300% 이상)`;
      } else if (p.roas >= 300) {
        action = '유지';
        priority = 'low';
        reason = `ROAS ${p.roas}%, 정상 운영`;
      }

      const avgSpend = p.spend > 0 ? p.spend / 30 : 0;
      const targetRoas = p.grade === 'A' ? 300 : p.grade === 'B' ? 400 : 500;
      const maxBid = avgSpend > 0 ? Math.round(avgSpend * (targetRoas / Math.max(p.roas, 1))) : 0;

      return {
        productId: p.id,
        productName: p.name,
        grade: p.grade,
        tier: p.adTier,
        currentRoas: p.roas,
        currentAdRate: p.adRate,
        recommendedAction: action,
        actionPriority: priority,
        reason,
        maxBidPrice: Math.min(maxBid, 5000),
        recommendedDailyBudget: Math.round(avgSpend * 0.8),
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.actionPriority] ?? 4) - (order[b.actionPriority] ?? 4);
    });
}

export function AdsStrategyTab({ actions }: { actions: ActionItem[] }) {
  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Megaphone size={14} className="text-orange-500" />
            <span className="text-sm font-medium">주간 액션 플랜</span>
            <span className="text-xs text-gray-400">{actions.length}건</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/50 text-gray-500">
                <th className="text-left px-4 py-2 font-medium">우선순위</th>
                <th className="text-left px-3 py-2 font-medium">등급</th>
                <th className="text-left px-3 py-2 font-medium">상품명</th>
                <th className="text-left px-3 py-2 font-medium">추천 액션</th>
                <th className="text-right px-3 py-2 font-medium">ROAS</th>
                <th className="text-right px-3 py-2 font-medium">광고비율</th>
                <th className="text-right px-3 py-2 font-medium">추천 입찰가</th>
                <th className="text-right px-3 py-2 font-medium">추천 일예산</th>
                <th className="text-left px-3 py-2 font-medium">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    전략 데이터가 없습니다
                  </td>
                </tr>
              ) : (
                actions.slice(0, 50).map((a, i) => {
                  const ps = PRIORITY_STYLE[a.actionPriority];
                  return (
                    <tr key={`${a.productId}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ps.bg} ${ps.text}`}>
                          {ps.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(a.grade)}`}>
                          {a.grade}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[150px] truncate font-medium">{a.productName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div
                          className={`max-w-[200px] truncate ${
                            a.actionPriority === 'urgent'
                              ? 'text-red-600'
                              : a.actionPriority === 'high'
                                ? 'text-orange-600'
                                : 'text-blue-600'
                          }`}
                        >
                          {a.recommendedAction}
                        </div>
                      </td>
                      <td
                        className={`text-right px-3 py-2.5 tabular-nums ${
                          a.currentRoas >= 300
                            ? 'text-green-600'
                            : a.currentRoas >= 200
                              ? 'text-orange-500'
                              : 'text-red-500'
                        }`}
                      >
                        {a.currentRoas}%
                      </td>
                      <td
                        className={`text-right px-3 py-2.5 tabular-nums ${
                          a.currentAdRate > 15 ? 'text-red-500' : 'text-gray-700'
                        }`}
                      >
                        {a.currentAdRate}%
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        ₩{formatKRW(a.maxBidPrice)}
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        ₩{formatKRW(a.recommendedDailyBudget)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[200px] truncate text-[10px] text-gray-500">{a.reason}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={14} className="text-green-500" />
          <span className="text-sm font-medium">등급별 광고 전략 가이드</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              grade: 'A',
              title: '핵심상품',
              color: 'border-green-200 bg-green-50/30',
              rules: [
                '예산의 80%를 집중 투입',
                'ROAS 300% 이상 유지',
                '광고비율 12% 이내',
                '1차 핵심 광고 운영',
                '키워드 확장으로 노출 극대화',
              ],
            },
            {
              grade: 'B',
              title: '성장상품',
              color: 'border-yellow-200 bg-yellow-50/30',
              rules: [
                '예산의 15% 배분',
                'ROAS 400% 이상 목표',
                '광고비율 8% 이내',
                '2차 성장 광고 운영',
                'A등급 승급 가능성 모니터링',
              ],
            },
            {
              grade: 'C',
              title: '정리대상',
              color: 'border-red-200 bg-red-50/30',
              rules: [
                '예산의 5% 이하로 제한',
                'ROAS 500% 미달 시 중단',
                '광고비율 5% 이내',
                '3차 테스트만 허용',
                '적자 상품 즉시 광고 중단',
              ],
            },
          ].map((item) => (
            <div key={item.grade} className={`rounded-lg border p-3 ${item.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(item.grade)}`}>
                  {item.grade}등급
                </span>
                <span className="text-xs font-medium">{item.title}</span>
              </div>
              <ul className="space-y-1">
                {item.rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                    <Check size={10} className="shrink-0 mt-0.5 text-gray-400" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
