'use client';

import { AlertTriangle, Check, CircleDashed, Loader2, MinusCircle, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { collectManualSteps, summarizePublishRun } from '../lib/publish-plan';
import type { PublishTask, PublishTaskStatus } from '../../_shared/use-mall-publish-run';

const STATUS_META: Record<PublishTaskStatus, { label: string; tone: string; icon: typeof Check }> = {
  pending: { label: '대기', tone: 'text-slate-400', icon: CircleDashed },
  running: { label: '진행 중', tone: 'text-purple-600', icon: Loader2 },
  reconciling: { label: '결과 확인 필요', tone: 'text-amber-700', icon: AlertTriangle },
  succeeded: { label: '끝남', tone: 'text-emerald-600', icon: Check },
  failed: { label: '실패', tone: 'text-red-600', icon: X },
  cancelled: { label: '중단', tone: 'text-slate-400', icon: MinusCircle },
};

interface StepDispatchProps {
  tasks: PublishTask[];
  running: boolean;
}

/**
 * 4단계 — 송신.
 *
 * 작업 하나가 한 줄이다. 확장이 [등록]을 누른 몰(ADR-0015)은 "몰이 받음 · 상품번호"까지, 누르지 않은 몰은 "폼 채움 —
 * 사람이 등록"까지 말한다. 몰이 실제로 올렸는지는 재조회로만 알 수 있어, 그 전에는 등록됐다고 말하지 않는다.
 *
 * 사방넷 FAQ 원문: "실제 등록 성공 여부와 상관없이 '처리완료'로 변경됩니다."
 * 업계에서 가장 자주 나오는 사고가 그 표시를 성공으로 읽는 것이다.
 */
export function StepDispatch({ tasks, running }: StepDispatchProps) {
  const summary = summarizePublishRun(tasks);
  const manualSteps = collectManualSteps(tasks);
  const accepted = tasks.filter((task) => task.outcome?.submitted && task.outcome.accepted === true).length;
  const leftToPerson = tasks.filter((task) => task.status === 'succeeded' && !task.outcome?.submitted).length;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="작업" value={summary.total} />
        <StatCard label="몰이 받음" value={accepted} tone="text-emerald-600" />
        <StatCard label="사람이 등록할 것" value={leftToPerson} tone="text-amber-600" />
        <StatCard label="실패" value={summary.failed} tone="text-red-600" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const meta = STATUS_META[task.status];
            const StatusIcon = meta.icon;
            return (
              <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                <StatusIcon
                  size={15}
                  className={cn('mt-0.5 flex-none', meta.tone, task.status === 'running' && 'animate-spin')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900">{task.mallName}</span>
                    <span className="text-xs text-slate-400">
                      {task.items.length === 1
                        ? task.items[0]?.name
                        : `${formatNumber(task.items.length)}건`}
                    </span>
                  </div>
                  {task.error ? (
                    <p className="mt-1 text-xs leading-relaxed text-red-600">{task.error}</p>
                  ) : null}
                  {task.status === 'succeeded' ? (
                    <p className="mt-1 text-xs text-slate-500">{submitLine(task)}</p>
                  ) : null}
                  {task.status === 'reconciling' ? (task.outcome?.manualSteps ?? []).map((step) => (
                    <p key={step} className="mt-1 text-xs text-amber-700">{step}</p>
                  )) : null}
                  {(task.outcome?.warnings ?? []).map((warning) => (
                    <p key={warning} className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                      <AlertTriangle size={11} className="mt-0.5 flex-none" />
                      {warning}
                    </p>
                  ))}
                </div>
                <span className={cn('flex-none text-xs font-medium', meta.tone)}>{meta.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {summary.done && summary.succeeded > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="block">끝났습니다. 몰에 올라간 것은 몰 상품을 다시 가져와 확인합니다.</strong>
          <p className="mt-1 text-xs leading-relaxed">
            몰이 받았다고 답한 것도 몰이 실제로 올렸는지는 몰 상품 목록을 다시 가져와야 압니다. 승인이 붙는 몰은 승인
            뒤에 올라갑니다. 확장이 [등록]을 누르지 않은 몰은 아래 남은 일을 마쳐야 등록됩니다.
          </p>
          {manualSteps.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {manualSteps.map((entry) => (
                <li key={`${entry.mallName}-${entry.step}`} className="flex gap-2 text-xs">
                  <span className="flex-none rounded bg-white px-1.5 py-0.5 font-medium text-amber-800">
                    {entry.mallName}
                  </span>
                  <span className="leading-relaxed">{entry.step}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {running ? (
        <p className="text-xs text-slate-400">
          한 번에 하나씩 처리합니다. 열리는 탭을 닫지 마세요.
        </p>
      ) : null}
    </section>
  );
}

function StatCard({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold', tone)}>{formatNumber(value)}</div>
    </div>
  );
}

/** 끝난 작업 한 줄 — 확장이 [등록]을 눌렀는지, 몰이 뭐라고 했는지. */
function submitLine(task: PublishTask): string {
  const outcome = task.outcome;
  if (!outcome?.submitted) return '폼 채움 — [등록]은 사람이 누릅니다.';
  if (outcome.accepted === true) {
    return outcome.productNo ? `몰이 받음 · 상품번호 ${outcome.productNo}` : '몰이 받음';
  }
  return '[등록]을 눌렀지만 몰의 답을 읽지 못했습니다 — 열린 화면에서 확인하세요.';
}
