'use client';

import { AlertTriangle, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type {
  EntryRecommendation,
  EntryRecommendationComponents,
  EntrySourceKey,
} from '../lib/entry-recommendation-api';

export interface EntryRecommendationDetailProps {
  item: EntryRecommendation;
  /** 어시스턴트가 응답 중인지. 중복 제출로 CLI 프로세스가 겹치지 않게 버튼을 잠근다. */
  isAsking: boolean;
  onClose: () => void;
  onAsk: (question: string) => void;
}

const COMPONENT_LABELS: Record<keyof EntryRecommendationComponents, string> = {
  margin: '마진',
  demand: '수요',
  competition: '경쟁 여유',
  momentum: '상승세',
  supplier: '공급 안정',
};

const SOURCE_LABELS: Record<EntrySourceKey, string> = {
  supply_1688_new: '1688 신상품',
  keyword_trend: '키워드 트렌드',
  coupang_competitor: '쿠팡 경쟁상품',
  coupang_rising: '쿠팡 급상승',
};

/** 표에서 행을 클릭하면 펼쳐지는 상세. 왜 추천됐는지를 근거 단위로 보여준다. */
export function EntryRecommendationDetail({
  item,
  isAsking,
  onClose,
  onAsk,
}: EntryRecommendationDetailProps) {
  return (
    <section className="rounded-xl border border-[var(--primary)]/30 bg-[var(--surface)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-black text-white">
              {item.rank}위 · {item.grade}
            </span>
            <span className="text-xs font-black text-[var(--text-primary)]">종합 {item.score}점</span>
          </div>
          <h3 className="mt-1.5 text-sm font-black leading-5 text-[var(--text-primary)]">{item.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="shrink-0 rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {(Object.keys(COMPONENT_LABELS) as (keyof EntryRecommendationComponents)[]).map((key) => (
          <div key={key}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-black text-[var(--text-tertiary)]">
                {COMPONENT_LABELS[key]}
              </span>
              <span className="text-[11px] font-black tabular-nums text-[var(--text-primary)]">
                {item.components[key]}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  'h-full rounded-full',
                  item.components[key] >= 60 ? 'bg-[var(--primary)]' : 'bg-[var(--text-quaternary)]',
                )}
                style={{ width: `${item.components[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Fact label="최소주문" value={item.minOrderQuantity != null ? `${item.minOrderQuantity}개` : null} />
        <Fact
          label="예상 이익"
          value={item.estimatedProfitKrw != null ? `${formatNumber(item.estimatedProfitKrw)}원` : null}
        />
        <Fact
          label="경쟁 리뷰"
          value={item.coupang?.reviews != null ? `${formatNumber(item.coupang.reviews)}개` : null}
        />
        <Fact label="공급사" value={item.supplierName} />
      </dl>

      {item.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {item.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {item.risks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.risks.map((risk) => (
            <li key={risk} className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              {risk}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <span className="text-[10px] font-black text-[var(--text-tertiary)]">근거 소스</span>
        {item.contributingSources.map((source) => (
          <span
            key={source}
            className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]"
          >
            {SOURCE_LABELS[source]}
          </span>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={isAsking}
            onClick={() => onAsk(`${item.keyword ?? item.title} 지금 진입해도 될까? 근거로 설명해줘.`)}
            className="rounded-md bg-[var(--primary)] px-2.5 py-1.5 text-[11px] font-black text-white transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAsking ? '답변 생성 중…' : '어시스턴트에게 묻기'}
          </button>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              1688 열기
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </div>
      </footer>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-black text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[11px] font-bold text-[var(--text-primary)]">
        {value ?? <span className="text-[var(--text-quaternary)]">-</span>}
      </dd>
    </div>
  );
}
