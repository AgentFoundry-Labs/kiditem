'use client';

import { Fragment, useMemo, useState } from 'react';
import { Bot, ChevronDown, ChevronRight, KeyRound, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AdKeywordSnapshot } from '@kiditem/shared/advertising';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { cardRaised } from '../lib/card-styles';
import {
  PAUSE_PROPOSAL_REVIEW_COMMANDS,
  pauseProposalReviewMessage,
  pauseProposalState,
  pendingProposalIds,
  type PauseProposalReview,
} from '../lib/keyword-pause-proposal';
import { useAdKeywords, useReviewKeywordProposals, useRunKeywordAgent } from '../hooks/useAdOpsData';

type KeywordFilter = 'all' | 'serving' | 'idle' | 'irrelevant';

interface Props {
  period: string;
}

const FILTERS: { key: KeywordFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'serving', label: '노출 중' },
  { key: 'idle', label: '노출 0' },
  { key: 'irrelevant', label: '연관 없음' },
];

export default function AdKeywordsContent({ period }: Props) {
  const {
    products,
    keywords,
    collectedAt,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useAdKeywords(period, true);

  const runAgent = useRunKeywordAgent(period);
  const [judgingProduct, setJudgingProduct] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reviewProposals = useReviewKeywordProposals();
  const reviewKeywordProposals = (review: PauseProposalReview, ids: string[]) => {
    if (ids.length === 0) return;
    reviewProposals.mutate(
      { ...PAUSE_PROPOSAL_REVIEW_COMMANDS[review], ids },
      {
        onSuccess: ({ updated }) => {
          if (updated === 0) {
            toast.warning('반영된 제안이 없습니다. 목록을 새로 고친 뒤 다시 확인해 주세요.');
            return;
          }
          toast.success(pauseProposalReviewMessage(review, updated));
        },
        onError: (mutationError) => {
          toast.error(
            isApiError(mutationError) ? mutationError.detail : '제안을 처리하지 못했습니다.',
          );
        },
      },
    );
  };

  const judgeKeywords = (externalOptionId?: string) => {
    setJudgingProduct(externalOptionId ?? null);
    runAgent.mutate(
      externalOptionId ? { externalOptionId } : undefined,
      {
        onSuccess: (result) => {
          // The server always explains what it judged, skipped, and filed.
          toast[result.ok ? 'success' : 'warning'](result.reason);
        },
        onError: (mutationError) => {
          toast.error(
            isApiError(mutationError)
              ? mutationError.detail
              : '키워드 판정에 실패했습니다.',
          );
        },
        onSettled: () => setJudgingProduct(null),
      },
    );
  };
  const [filter, setFilter] = useState<KeywordFilter>('all');
  const [search, setSearch] = useState('');

  const keywordsByOption = useMemo(() => {
    const map = new Map<string, AdKeywordSnapshot[]>();
    for (const keyword of keywords) {
      if (!keyword.externalOptionId) continue;
      const bucket = map.get(keyword.externalOptionId);
      if (bucket) bucket.push(keyword);
      else map.set(keyword.externalOptionId, [keyword]);
    }
    return map;
  }, [keywords]);

  // Keywords served across several advertised options lose their option link
  // during ingest, so they belong to no product row. Surfacing the count keeps
  // the per-product totals honest instead of silently dropping them.
  const sharedKeywordCount = useMemo(
    () => keywords.filter((keyword) => !keyword.externalOptionId).length,
    [keywords],
  );

  const totals = useMemo(
    () =>
      products.reduce(
        (acc, product) => ({
          keywordCount: acc.keywordCount + product.keywordCount,
          smartTargetingCount: acc.smartTargetingCount + product.smartTargetingCount,
          servingCount: acc.servingCount + product.servingCount,
          irrelevantCount: acc.irrelevantCount + product.irrelevantCount,
        }),
        { keywordCount: 0, smartTargetingCount: 0, servingCount: 0, irrelevantCount: 0 },
      ),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const hay = `${product.productName ?? ''} ${product.campaignName ?? ''} ${product.externalOptionId}`;
      if (hay.toLowerCase().includes(q)) return true;
      return (keywordsByOption.get(product.externalOptionId) ?? []).some((keyword) =>
        keyword.keyword.toLowerCase().includes(q),
      );
    });
  }, [products, search, keywordsByOption]);

  if (isLoading) {
    return (
      <div className={cn(cardRaised, 'p-10 text-center text-sm')} style={{ color: 'var(--text-tertiary)' }}>
        키워드 불러오는 중…
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn(cardRaised, 'p-10 text-center')}>
        <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
          키워드를 불러오지 못했습니다
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {isApiError(error) ? error.detail : '잠시 후 다시 시도해 주세요.'}
        </p>
        <button
          onClick={() => void refetch()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: 'var(--primary)', color: '#ffffff' }}
        >
          <RefreshCw size={13} /> 다시 시도
        </button>
      </div>
    );
  }

  if (products.length === 0 && keywords.length === 0) {
    return (
      <div className={cn(cardRaised, 'p-10 text-center')}>
        <KeyRound size={28} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          아직 수집된 광고 키워드가 없습니다
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          대시보드 데이터 수집 모달에서 <b>광고 동기화</b>를 실행하면
          <br />
          캠페인 순회가 끝난 뒤 상품별 키워드가 함께 수집됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="광고 상품" value={`${formatNumber(products.length)}개`} hint={`키워드 ${formatNumber(totals.keywordCount)}개`} />
        <SummaryCard
          label="스마트 타겟팅"
          value={`${formatNumber(totals.smartTargetingCount)}개`}
          hint="쿠팡이 자동 매칭한 키워드"
        />
        <SummaryCard
          label="노출 중"
          value={`${formatNumber(totals.servingCount)}개`}
          hint={`노출 0 ${formatNumber(Math.max(0, totals.keywordCount - totals.servingCount))}개`}
        />
        <SummaryCard
          label="연관 없음"
          value={`${formatNumber(totals.irrelevantCount)}개`}
          hint={totals.irrelevantCount > 0 ? 'AI 판정 결과' : '아직 판정 전'}
          tone={totals.irrelevantCount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className={cn(cardRaised, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <KeyRound size={15} style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              상품별 광고 키워드
            </h3>
          </div>
          {collectedAt && (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              최근 수집 {new Date(collectedAt).toLocaleString('ko-KR')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상품명·키워드 검색"
              className="w-52 rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => judgeKeywords()}
              disabled={runAgent.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60"
              style={{ background: 'var(--primary)', color: '#ffffff' }}
              title="상품과 연관 없는 키워드를 AI가 판정해 승인 대기로 올립니다"
            >
              {runAgent.isPending && judgingProduct === null ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> 판정 중…
                </>
              ) : (
                <>
                  <Bot size={13} /> AI 연관성 판정
                </>
              )}
            </button>
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-lg p-2 transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-tertiary)' }}
              title="새로고침"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                <th className="px-4 py-2.5 text-left font-semibold">상품</th>
                <th className="px-3 py-2.5 text-left font-semibold">캠페인</th>
                <th className="px-3 py-2.5 text-right font-semibold">키워드</th>
                <th className="px-3 py-2.5 text-right font-semibold">노출 중</th>
                <th className="px-3 py-2.5 text-right font-semibold">연관 없음</th>
                <th className="px-3 py-2.5 text-right font-semibold">광고비</th>
                <th className="px-3 py-2.5 text-right font-semibold">노출수</th>
                <th className="px-3 py-2.5 text-right font-semibold">클릭</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const isOpen = expanded === product.externalOptionId;
                const rows = keywordsByOption.get(product.externalOptionId) ?? [];
                return (
                  <Fragment key={product.externalOptionId}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : product.externalOptionId)}
                      className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-sunken)]"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {isOpen ? (
                            <ChevronDown size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                          ) : (
                            <ChevronRight size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                              {product.productName ?? '(이름 없음)'}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              ID {product.externalOptionId}
                              {product.listing ? ` · ${product.listing.masterProduct.code}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {product.campaignName ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatNumber(product.keywordCount)}
                        {product.registeredCount > 0 && (
                          <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                            (등록 {product.registeredCount})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {formatNumber(product.servingCount)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold" style={{ color: product.irrelevantCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {product.irrelevantCount > 0 ? formatNumber(product.irrelevantCount) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {formatKRW(product.metrics.spend)}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {formatNumber(product.metrics.impressions)}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {formatNumber(product.metrics.clicks)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3" style={{ background: 'var(--surface-sunken)' }}>
                          <KeywordList
                            keywords={rows}
                            filter={filter}
                            onFilterChange={setFilter}
                            search={search}
                            judging={
                              runAgent.isPending &&
                              judgingProduct === product.externalOptionId
                            }
                            judgeDisabled={runAgent.isPending}
                            onJudge={() => judgeKeywords(product.externalOptionId)}
                            reviewing={reviewProposals.isPending}
                            onReview={reviewKeywordProposals}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {sharedKeywordCount > 0 && (
          <p className="border-t px-4 py-2.5 text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
            여러 상품에 동시에 노출된 키워드 {formatNumber(sharedKeywordCount)}개는 특정 상품에 귀속되지 않아 위 집계에서 제외됩니다.
          </p>
        )}
      </div>
    </div>
  );
}

function KeywordList({
  keywords,
  filter,
  onFilterChange,
  search,
  judging,
  judgeDisabled,
  onJudge,
  reviewing,
  onReview,
}: {
  keywords: AdKeywordSnapshot[];
  filter: KeywordFilter;
  onFilterChange: (next: KeywordFilter) => void;
  search: string;
  judging: boolean;
  judgeDisabled: boolean;
  onJudge: () => void;
  reviewing: boolean;
  onReview: (review: PauseProposalReview, ids: string[]) => void;
}) {
  const q = search.trim().toLowerCase();
  const visible = keywords
    .filter((keyword) => {
      if (filter === 'serving' && keyword.metrics.impressions === 0) return false;
      if (filter === 'idle' && keyword.metrics.impressions > 0) return false;
      if (filter === 'irrelevant' && keyword.relevance !== 'irrelevant') return false;
      if (q && !keyword.keyword.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.metrics.impressions - a.metrics.impressions || a.keyword.localeCompare(b.keyword));
  // A product-wide request covers every proposal of the product awaiting
  // review, not only the chips the filter shows.
  const pendingIds = pendingProposalIds(keywords);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => onFilterChange(entry.key)}
            className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={
              filter === entry.key
                ? { background: 'var(--primary)', color: '#ffffff' }
                : { background: 'var(--surface)', color: 'var(--text-tertiary)' }
            }
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-auto text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {formatNumber(visible.length)} / {formatNumber(keywords.length)}개
        </span>
        <button
          onClick={onJudge}
          disabled={judgeDisabled}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          title="이 상품의 키워드만 AI가 판정합니다"
        >
          {judging ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 판정 중…
            </>
          ) : (
            <>
              <Bot size={11} /> 이 상품만 판정
            </>
          )}
        </button>
        {pendingIds.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => onReview('approve', pendingIds)}
              disabled={reviewing}
              className="btn-primary btn-sm disabled:opacity-50"
              title="필터나 검색과 관계없이 이 상품에서 승인 대기 중인 제안을 모두 승인합니다"
            >
              이 상품 제안 {formatNumber(pendingIds.length)}개 모두 승인
            </button>
            <button
              type="button"
              onClick={() => onReview('reject', pendingIds)}
              disabled={reviewing}
              className="btn-secondary btn-sm disabled:opacity-50"
              title="필터나 검색과 관계없이 이 상품에서 승인 대기 중인 제안을 모두 거절합니다"
            >
              이 상품 제안 {formatNumber(pendingIds.length)}개 모두 거절
            </button>
          </>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          조건에 맞는 키워드가 없습니다.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((keyword) => (
            <KeywordChip
              key={`${keyword.adGroup ?? ''}:${keyword.keyword}`}
              keyword={keyword}
              reviewing={reviewing}
              onReview={onReview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KeywordChip({
  keyword,
  reviewing,
  onReview,
}: {
  keyword: AdKeywordSnapshot;
  reviewing: boolean;
  onReview: (review: PauseProposalReview, ids: string[]) => void;
}) {
  const isIrrelevant = keyword.relevance === 'irrelevant';
  const isLoose = keyword.relevance === 'loose';
  const proposal = keyword.pauseProposal;
  const proposalState = proposal ? pauseProposalState(proposal) : null;
  const summary =
    keyword.relevanceReason ??
    `${keyword.origin === 'registered' ? '직접 등록' : '스마트 타겟팅'} · 노출 ${formatNumber(keyword.metrics.impressions)} · 클릭 ${formatNumber(keyword.metrics.clicks)}`;
  return (
    <span
      role="group"
      aria-label={keyword.keyword}
      // The reason the latest attempt recorded, such as why it did not run, is on hover.
      title={proposal?.errorMessage ? `${summary}\n${proposal.errorMessage}` : summary}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
      style={{
        borderColor: isIrrelevant ? 'var(--danger)' : isLoose ? 'var(--warning)' : 'var(--border-subtle)',
        background: isIrrelevant ? 'var(--danger-subtle)' : 'var(--surface)',
        color: isIrrelevant ? 'var(--danger)' : 'var(--text-secondary)',
      }}
    >
      {keyword.origin === 'registered' && <Sparkles size={10} style={{ color: 'var(--primary)' }} />}
      <span className="font-medium">{keyword.keyword}</span>
      <span style={{ color: 'var(--text-muted)' }}>
        {formatNumber(keyword.metrics.impressions)}
        {keyword.metrics.clicks > 0 ? ` · 클릭 ${formatNumber(keyword.metrics.clicks)}` : ''}
      </span>
      {proposal && proposalState && (
        <>
          <span className="font-semibold">{proposalState.label}</span>
          {proposalState.note && (
            <span style={{ color: 'var(--text-secondary)' }}>{proposalState.note}</span>
          )}
          {proposalState.actions.map(({ review, label }) => (
            <button
              key={review}
              type="button"
              onClick={() => onReview(review, [proposal.actionId])}
              disabled={reviewing}
              // An inline small neutral button: the keyword grid holds many chips.
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </>
      )}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className={cn(cardRaised, 'px-4 py-3.5')}>
      <p className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <p
        className="mt-1 text-xl font-extrabold"
        style={{ color: tone === 'danger' ? 'var(--danger)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </p>
    </div>
  );
}
