'use client';

import { AlertTriangle, Check, CircleDashed, Loader2, MinusCircle, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  collectManualSteps,
  summarizePublishRun,
  type PublishTask,
  type PublishTaskStatus,
} from '../lib/publish-plan';

const STATUS_META: Record<PublishTaskStatus, { label: string; tone: string; icon: typeof Check }> = {
  pending: { label: '대기', tone: 'text-slate-400', icon: CircleDashed },
  running: { label: '진행 중', tone: 'text-purple-600', icon: Loader2 },
  succeeded: { label: '전송 완료', tone: 'text-emerald-600', icon: Check },
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
 * 작업 하나가 한 줄이다. 상태는 `전송 완료` 까지만 말한다 — 그게 우리가 아는
 * 전부이기 때문이다. 몰이 실제로 등록했는지는 재조회로만 알 수 있고, 그 배선이
 * 붙기 전까지 이 화면은 등록됐다고 말하지 않는다.
 *
 * 사방넷 FAQ 원문: "실제 등록 성공 여부와 상관없이 '처리완료'로 변경됩니다."
 * 업계에서 가장 자주 나오는 사고가 그 표시를 성공으로 읽는 것이다.
 */
export function StepDispatch({ tasks, running }: StepDispatchProps) {
  const summary = summarizePublishRun(tasks);
  const manualSteps = collectManualSteps(tasks);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="작업" value={summary.total} />
        <StatCard label="전송 완료" value={summary.succeeded} tone="text-emerald-600" />
        <StatCard label="실패" value={summary.failed} tone="text-red-600" />
        <StatCard label="등록 확인됨" value={summary.confirmed} tone="text-slate-400" />
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
          <strong className="block">전송까지 끝났습니다. 아직 등록은 아닙니다.</strong>
          <p className="mt-1 text-xs leading-relaxed">
            우리가 확인한 것은 &lsquo;보냈다&rsquo; 까지입니다. 몰이 실제로 등록했는지는 몰 화면에서
            확인해야 합니다. 아래 남은 일을 마치면 등록이 완료됩니다.
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
