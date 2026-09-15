'use client';

import { useMemo, useState } from 'react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import {
  useSourcingRecommendations,
  useSourcingValidation,
} from '../hooks/use-sourcing-workspace';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';
import { normalizeWingOperationKeywords } from '../lib/wing-operation-input';
import { SourcingReadState } from './SourcingReadState';
import { WingCatalogCalculationActions } from './WingCatalogCalculationActions';
import { WingCatalogSourceStatus } from './WingCatalogSourceStatus';

const STATUS_LABELS = {
  pending: '검증 대기',
  observing: '관측 중',
  ready_for_review: '검토 가능',
  blocked: '근거 부족',
  failed: '검증 실패',
} as const;

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600',
  observing: 'bg-blue-50 text-blue-700',
  ready_for_review: 'bg-emerald-50 text-emerald-700',
  blocked: 'bg-amber-50 text-amber-800',
  failed: 'bg-rose-50 text-rose-700',
} as const;

export function SellochValidationPage() {
  const validationQuery = useSourcingValidation();
  const recommendationsQuery = useSourcingRecommendations('today');
  const [inputError, setInputError] = useState<string | null>(null);
  const items = validationQuery.data?.data?.items ?? [];
  const keywords = useMemo(() => normalizeWingOperationKeywords(
    (recommendationsQuery.data?.data?.items ?? []).flatMap((item) => [
      item.keyword,
      ...item.sourceKeywords,
    ]),
    12,
  ), [recommendationsQuery.data]);
  const operationInput = useMemo(() => ({
    keywords,
    maxPages: 1,
    purpose: 'recommendation_validation' as const,
  }), [keywords]);
  const wingSource = useWingCatalogSource({ input: operationInput });

  const collectValidationKeywords = () => {
    if (keywords.length === 0) {
      setInputError('검증할 추천 키워드가 없습니다. 오늘의 추천을 먼저 새로고침하세요.');
      return;
    }
    setInputError(null);
    void wingSource.start();
  };

  return (
    <main className="min-h-full bg-transparent text-[#171923]">
      <div className="flex w-full flex-col gap-4 px-0 py-0">
        <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            <h1 className="text-3xl font-black tracking-normal text-[#111827]">상품 검증</h1>
            <p className="mt-2 text-sm font-bold text-[#667085]">
              서버가 보유한 근거만 표시합니다. 추정할 수 없는 값은 자료 없음으로 남깁니다.
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <CollectionStartControl
              control={wingSource.control}
              startLabel="Wing 검증 수집"
              startTitle="추천 키워드를 Wing 카탈로그로 수집합니다. 추천과 검증은 따로 갱신합니다."
              onStart={collectValidationKeywords}
              onStop={wingSource.control.stop}
            />
            <WingCatalogCalculationActions attempt={wingSource.attempt} validation />
          </div>
        </header>

        {inputError ? <p className="text-sm font-bold text-rose-700">{inputError}</p> : null}
        <WingCatalogSourceStatus source={wingSource} />

        <section className="overflow-hidden rounded-[18px] border border-[#eef1f5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <h2 className="text-base font-black text-[#111827]">상품 검증 큐</h2>
            <span className="text-xs font-black text-[#6d5dfc]">마진 · 인증 · 옵션</span>
          </div>
          <div className="overflow-x-auto px-6 pb-6">
            <SourcingReadState
              envelope={validationQuery.data}
              isLoading={validationQuery.isLoading}
              error={validationQuery.error}
              emptyLabel="검증할 추천 run이 아직 없습니다. 수집 후 다시 확인해주세요."
            >
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#cfd9e8] bg-[#f8fafc] px-5 py-10 text-center text-sm font-bold text-[#667085]">
                  현재 추천 run에는 검증할 후보가 없습니다.
                </p>
              ) : (
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#f6f7f9] text-xs font-black text-[#4b5563]">
                      {['상품 후보', '검증 상태', '점수', '예상 마진', '리스크', '다음 작업'].map((header) => (
                        <th key={header} className="whitespace-nowrap px-4 py-4">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.episodeId} className="border-b border-[#eef1f5] bg-white text-sm font-bold text-[#374151] last:border-b-0">
                        <td className="max-w-[300px] px-4 py-4 font-black text-[#111827]">{item.displayName}</td>
                        <td className="px-4 py-4">
                          <span className={cn('rounded-full px-2.5 py-1 text-xs font-black', STATUS_STYLES[item.status])}>
                            {STATUS_LABELS[item.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-[#6d5dfc]">{scoreLabel(item.score)}</td>
                        <td className="px-4 py-4">{marginLabel(item.expectedMarginBps)}</td>
                        <td className="max-w-[260px] px-4 py-4 text-[#667085]">{riskLabel(item.checks)}</td>
                        <td className="px-4 py-4">{nextActionLabel(item.status, item.checks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SourcingReadState>
          </div>
        </section>
      </div>
    </main>
  );
}



function scoreLabel(value: number | null): string {
  return value == null ? '자료 없음' : `${formatNumber(value)}점`;
}

function marginLabel(value: number | null): string {
  if (value == null) return '자료 없음';
  return formatPercent(value / 100);
}

function riskLabel(checks: Array<{ checkKey: string; status: string }>): string {
  const risks = checks
    .filter((check) => check.status === 'missing' || check.status === 'fail')
    .map((check) => checkLabel(check.checkKey, check.status));
  return risks.length > 0 ? risks.slice(0, 2).join(', ') : '확인된 리스크 없음';
}

function nextActionLabel(
  status: keyof typeof STATUS_LABELS,
  checks: Array<{ status: string }>,
): string {
  if (checks.some((check) => check.status === 'missing')) return '근거 수집 후 재검토';
  if (status === 'ready_for_review') return '검토 배치에서 선택';
  if (status === 'failed') return '실패 근거 확인';
  return '관측 결과 대기';
}

function checkLabel(key: string, status: string): string {
  if (key === 'supplier_evidence' && status === 'missing') return '공급 근거 없음';
  if (key === 'margin' && status === 'missing') return '마진 자료 없음';
  if (key === 'compliance' && status === 'missing') return '인증 자료 없음';
  return status === 'fail' ? `${key} 실패` : `${key} 자료 없음`;
}
