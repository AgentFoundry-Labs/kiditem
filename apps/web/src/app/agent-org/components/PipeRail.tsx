'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import type { PipeFeedEntry, PipeInboxItem } from '../lib/pipe-model';
import { PIPE_STAGE_BY_ID } from '../lib/pipe-stages';
import type { PipeState } from '../lib/pipe-states';
import { PipeStateChip } from './PipeStateChip';

const INBOX_LIMIT = 6;
const FEED_LIMIT = 14;

/**
 * 확인 필요 — 원인별로 묶은 사람의 할 일. 실시간 활동 패널의 윗칸.
 *
 * 증상이 아니라 원인으로 묶는다. GS샵 로그인 만료 하나는 수집 알림 · 관찰 기록 · 자동 멈춤에
 * 흩어져 있어도 한 장이다. 재시도 중인 것은 올리지 않는다 — 다음 바퀴가 스스로 다시 묻는다.
 */
export function AttentionInbox({ items, now }: { items: PipeInboxItem[]; now: number }) {
  const shown = items.slice(0, INBOX_LIMIT);
  return (
    <section className="px-3 pb-2 pt-3" aria-labelledby="pipe-inbox-title">
      <header className="mb-1.5 flex items-center gap-1.5 px-1">
        <h2 id="pipe-inbox-title" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          확인 필요
        </h2>
        <span className="rounded bg-white/[0.06] px-1.5 font-mono text-[10px] tabular-nums text-slate-300">
          {formatNumber(items.length)}
        </span>
        <span className="ml-auto text-[10px] text-slate-600">원인별 · 급한 순</span>
      </header>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-slate-600">지금 사람이 봐야 할 일이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 transition-colors hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <span className="flex items-center gap-1.5">
                  <PipeStateChip state={item.state} />
                  <span className="ml-auto text-[9.5px] text-slate-600">{timeAgo(new Date(item.lastAt), new Date(now))}</span>
                </span>
                <span className="text-[11.5px] font-semibold leading-snug text-slate-100">{item.title}</span>
                {item.detail ? (
                  <span className="line-clamp-2 text-[10.5px] leading-snug text-slate-400">{item.detail}</span>
                ) : null}
                <span className="flex flex-wrap gap-x-2 text-[10px] text-slate-600">
                  <span>{item.stageIds.map((id) => PIPE_STAGE_BY_ID.get(id)?.title ?? id).join(' · ')}</span>
                  {item.count > 1 ? <span>기록 {formatNumber(item.count)}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > INBOX_LIMIT ? (
        <p className="mt-1.5 text-center text-[10px] text-slate-600">외 {formatNumber(items.length - INBOX_LIMIT)}건</p>
      ) : null}
    </section>
  );
}

const EXCEPTION_STATES = new Set<PipeState>(['failed', 'blocked_external', 'waiting_human', 'stale', 'retrying', 'unknown']);
const GOOD_STATES = new Set<PipeState>(['done', 'partial']);
const BAD_STATES = new Set<PipeState>(['failed', 'blocked_external']);

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 실시간 기록 — 세로 타임라인. 멈춰 두고 읽을 수 있고, 예외만 골라 볼 수 있다. */
export function PipeFeed({ entries }: { entries: PipeFeedEntry[] }) {
  const [frozen, setFrozen] = useState<PipeFeedEntry[] | null>(null);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const source = frozen ?? entries;
  const shown = (exceptionsOnly
    ? source.filter((entry) => (entry.state !== null && EXCEPTION_STATES.has(entry.state)) || entry.state === null)
    : source
  ).slice(0, FEED_LIMIT);

  return (
    <section className="px-3 pb-3 pt-3" aria-labelledby="pipe-feed-title">
      <header className="mb-1.5 flex items-center gap-1 px-1">
        <h2 id="pipe-feed-title" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          실시간 기록
        </h2>
        <button
          type="button"
          onClick={() => setExceptionsOnly((value) => !value)}
          aria-pressed={exceptionsOnly}
          className={cn(
            'ml-auto rounded-md border px-1.5 py-0.5 text-[10px] transition-colors',
            exceptionsOnly ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-slate-500 hover:text-slate-200',
          )}
        >
          예외만
        </button>
        <button
          type="button"
          onClick={() => setFrozen((value) => (value ? null : entries))}
          aria-pressed={frozen !== null}
          className={cn(
            'rounded-md border px-1.5 py-0.5 text-[10px] transition-colors',
            frozen ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-slate-500 hover:text-slate-200',
          )}
        >
          {frozen ? '다시 흐르기' : '멈춤'}
        </button>
      </header>
      {shown.length === 0 ? (
        <p className="py-5 text-center text-[11px] text-slate-600">
          {exceptionsOnly ? '최근 예외 기록이 없습니다.' : '최근 기록이 없습니다.'}
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((entry) => (
            <li key={entry.id} className="relative ml-1 border-l border-white/[0.06] py-1.5 pl-4">
              <span
                className={cn(
                  'absolute -left-[4px] top-2.5 h-[7px] w-[7px] rounded-full border-2 border-[#0f1628]',
                  entry.state && GOOD_STATES.has(entry.state)
                    ? 'bg-emerald-400'
                    : entry.state && BAD_STATES.has(entry.state)
                      ? 'bg-red-400'
                      : entry.state === 'running'
                        ? 'bg-blue-400'
                        : 'bg-slate-500',
                )}
                aria-hidden
              />
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[11px] font-medium text-slate-200">{entry.title}</span>
                <time className="ml-auto shrink-0 font-mono text-[9.5px] text-slate-600" dateTime={new Date(entry.at).toISOString()}>
                  {clock(entry.at)}
                </time>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                {entry.state ? (
                  <PipeStateChip state={entry.state} />
                ) : (
                  <span className="text-[10px] text-slate-500">{entry.laneLabel ?? '기록'}</span>
                )}
                <span className="truncate text-[10px] text-slate-600">{PIPE_STAGE_BY_ID.get(entry.stageId)?.title}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
