'use client';

import { useEffect, useRef } from 'react';
import { Ban, Database, Loader2, Play, ShieldCheck, TrendingUp, Waypoints } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { useDecisionKeywordSuggestions } from '../hooks/use-decision-keyword-suggestions';
import { DECISION_QUICK_ACTIONS, type DecisionChatTurn } from '../lib/decision-center-chat';

export interface DecisionCenterChatProps {
  turns: DecisionChatTurn[];
  keyword: string;
  isBusy: boolean;
  canManage: boolean;
  onKeywordChange: (value: string) => void;
  onRunKeyword: (keyword: string) => void;
  onCommand: (message: string) => void;
}

/**
 * 저장 증거 리플레이와 결정론적 바로가기만 제공한다. 자유 대화형 AI처럼 보이지 않도록
 * 새 분석 입력과 저장 결과 탐색 명령을 시각적으로 분리한다.
 */
export function DecisionCenterChat({
  turns,
  keyword,
  isBusy,
  canManage,
  onKeywordChange,
  onRunKeyword,
  onCommand,
}: DecisionCenterChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns.length, isBusy]);

  return (
    <section className="order-1 flex h-[660px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] xl:order-2 xl:h-full xl:min-h-0">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Waypoints size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-[var(--text-primary)]">저장 증거 결정 도우미</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-tertiary)]">명령형 · 실시간 자유 대화 아님</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <ShieldCheck size={11} aria-hidden="true" />
            구매 잠금
          </span>
        </div>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="의사결정 도우미 기록"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--surface-sunken)] p-4 [scrollbar-width:thin]"
      >
        {/*
          대화를 입력란 쪽에 붙여, 턴이 두어 개뿐일 때 위쪽이 통째로 비어 보이지 않게 한다.
          `justify-end` 는 스크롤 컨테이너가 아니라 안쪽 래퍼에 준다 — 스크롤 컨테이너에
          직접 주면 내용이 넘칠 때 위쪽이 잘려 스크롤로 닿을 수 없게 된다.
        */}
        <div className="flex min-h-full flex-col justify-end gap-5">
          {turns.map((turn) => <Turn key={turn.id} turn={turn} />)}
          {isBusy && (
            <div role="status" className="flex items-start gap-3">
              <AgentAvatar />
              <p className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-xs font-semibold text-[var(--text-tertiary)]">
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                최근 30일 저장 증거를 재생하고 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <div>
          <p className="text-[11px] font-black text-[var(--text-tertiary)]">저장 결과 바로가기</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DECISION_QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={isBusy}
                onClick={() => onCommand(action)}
                className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11px] font-bold leading-4 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        <form
          className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onRunKeyword(keyword);
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="decision-analysis-keyword" className="text-xs font-black text-[var(--text-primary)]">
              새 분석 키워드
            </label>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-tertiary)]">
              <Database size={11} aria-hidden="true" />
              저장 증거 30일
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 focus-within:ring-2 focus-within:ring-[var(--primary)]">
            <input
              id="decision-analysis-keyword"
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              disabled={isBusy || !canManage}
              maxLength={80}
              placeholder="예: 자석 블록, 말랑이 장난감"
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isBusy || !canManage || !keyword.trim()}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] px-3 text-xs font-black text-white transition-[transform,filter] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
            >
              <Play size={13} aria-hidden="true" />
              분석
            </button>
          </div>
          <KeywordSuggestions
            disabled={isBusy || !canManage}
            onPick={onKeywordChange}
          />
          <p className="mt-2 text-[11px] font-semibold leading-4 text-[var(--text-tertiary)]">
            새 수집 없이 저장된 증거만 다시 계산하며, 24시간 유효한 Shadow 배치를 만듭니다.
          </p>
        </form>

        {!canManage && (
          <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold leading-5 text-amber-800">
            <Ban size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            읽기 전용 계정입니다. 분석 실행과 검증 요청은 Owner/Admin만 가능합니다.
          </p>
        )}
      </div>
    </section>
  );
}

function Turn({ turn }: { turn: DecisionChatTurn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-xl bg-[var(--primary-soft)] px-3 py-2.5">
          <p className="text-xs font-black leading-5 text-[var(--text-primary)]">{turn.text}</p>
          {turn.chip && (
            <span className="mt-1.5 inline-block rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
              {turn.chip}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line text-xs font-semibold leading-5 text-[var(--text-primary)]">{turn.text}</p>
        {turn.followUp && <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">{turn.followUp}</p>}
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--primary)] ring-1 ring-inset ring-[var(--border)]">
      <Waypoints size={15} />
    </span>
  );
}

/**
 * 새 분석 키워드 입력 보조. 이 화면은 키워드를 발굴하지 않으므로, 키워드 분석·급상승
 * 탐지가 이미 만들어 둔 트렌드 키워드를 그대로 읽어 클릭 한 번으로 채우게만 한다.
 *
 * 추천이 없을 때는 아무것도 그리지 않는다 — 보조 기능이 본 입력을 밀어내면 안 된다.
 */
function KeywordSuggestions({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (keyword: string) => void;
}) {
  const { keywords, isLoading } = useDecisionKeywordSuggestions();
  if (isLoading || keywords.length === 0) return null;

  return (
    <div className="mt-2.5">
      <p className="flex items-center gap-1 text-[10px] font-black text-[var(--text-tertiary)]">
        <TrendingUp size={11} aria-hidden="true" />
        추천 키워드
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {keywords.map((item) => (
          <li key={`${item.kind}:${item.keyword}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(item.keyword)}
              title={
                item.monthlySearchVolume != null
                  ? `월 검색량 ${formatNumber(item.monthlySearchVolume)}`
                  : undefined
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                item.isNew
                  ? 'border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)]',
              )}
            >
              {item.keyword}
              {item.isNew && <span className="text-[9px] font-black">NEW</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
