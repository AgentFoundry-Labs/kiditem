'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Database, Loader2, Send, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourcingAssistantAnswer } from '../lib/entry-recommendation-api';

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: SourcingAssistantAnswer;
}

export interface SourcingAssistantPanelProps {
  turns: AssistantTurn[];
  isBusy: boolean;
  documentCount: number | null;
  onAsk: (question: string) => void;
}

const QUICK_QUESTIONS = [
  '지금 가장 진입하기 좋은 상품은?',
  '경쟁이 얕은 키워드 알려줘',
  '마진 40% 넘는 상품만 보여줘',
  '이번 주 새로 뜬 키워드는?',
];

/**
 * 자사 데이터 근거 어시스턴트.
 *
 * 답변 생성은 서버가 로컬 CLI 를 띄워서 한다(HTTP LLM API 아님). CLI 를 못 쓰면
 * 검색된 근거만 돌아오며, 그 사실을 배지로 분명히 드러낸다 — 근거만 나온 것을
 * 생성된 답으로 오해하면 판단이 틀어진다.
 */
export function SourcingAssistantPanel({
  turns,
  isBusy,
  documentCount,
  onAsk,
}: SourcingAssistantPanelProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns.length, isBusy]);

  const submit = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isBusy) return;
    onAsk(trimmed);
    setDraft('');
  };

  return (
    <section className="flex h-[560px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] xl:h-full xl:min-h-0">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Terminal size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-black text-[var(--text-primary)]">소싱 어시스턴트</h2>
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)]">자사 데이터 RAG · 로컬 CLI</p>
          </div>
        </div>
        {documentCount != null && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-1.5 py-1 text-[10px] font-black text-[var(--text-secondary)]">
            <Database size={10} aria-hidden="true" />
            {documentCount}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="어시스턴트 대화"
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-sunken)] p-3 [scrollbar-width:thin]"
      >
        <div className="flex min-h-full flex-col justify-end gap-3">
          {turns.length === 0 && (
            <p className="text-[11px] font-semibold leading-4 text-[var(--text-tertiary)]">
              추천 표를 근거로 답합니다. 아래 질문을 눌러보거나 직접 물어보세요.
            </p>
          )}
          {turns.map((turn) => (
            <Turn key={turn.id} turn={turn} />
          ))}
          {isBusy && (
            <p role="status" className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-tertiary)]">
              <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              내부 근거를 찾고 CLI 로 답을 만드는 중…
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={isBusy}
              onClick={() => submit(question)}
              className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>

        <form
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 focus-within:ring-2 focus-within:ring-[var(--primary)]"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isBusy}
            maxLength={500}
            placeholder="자사 소싱 데이터에 대해 물어보세요"
            aria-label="어시스턴트 질문"
            className="h-8 min-w-0 flex-1 bg-transparent px-2 text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isBusy || !draft.trim()}
            aria-label="질문 보내기"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-white transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={13} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}

function Turn({ turn }: { turn: AssistantTurn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[88%] rounded-lg bg-[var(--primary-soft)] px-2.5 py-1.5 text-[11px] font-black leading-4 text-[var(--text-primary)]">
          {turn.text}
        </p>
      </div>
    );
  }

  const answer = turn.answer;
  const degraded = answer?.mode === 'retrieval_only';

  return (
    <div className="min-w-0">
      {answer && (
        <span
          className={cn(
            'mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black ring-1 ring-inset',
            degraded
              ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
          )}
        >
          {degraded ? '근거만 (생성 안 됨)' : `CLI 생성 · ${answer.model ?? ''}`}
        </span>
      )}
      <p className="whitespace-pre-line text-[11px] font-semibold leading-4 text-[var(--text-primary)]">
        {turn.text}
      </p>

      {answer?.degradedReason && (
        <p className="mt-1.5 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-semibold leading-3.5 text-amber-800">
          <AlertCircle size={11} className="mt-px shrink-0" aria-hidden="true" />
          {answer.degradedReason}
        </p>
      )}

      {answer && answer.citations.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {answer.citations.map((citation) => (
            <li key={citation.index} className="truncate text-[10px] font-medium text-[var(--text-tertiary)]">
              [{citation.index}] {citation.title}
              {citation.sourceDate ? ` · ${citation.sourceDate}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
