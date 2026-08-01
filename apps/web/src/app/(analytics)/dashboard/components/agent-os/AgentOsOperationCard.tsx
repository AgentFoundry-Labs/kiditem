'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CircleAlert, CircleCheck, Loader2, Play, RotateCcw, Square } from 'lucide-react';
import type {
  OperationDefinition,
  OperationRun,
  OperationSchedule,
  UpsertOperationScheduleRequest,
} from '@kiditem/shared/operations';
import { formatDateTime } from '@/lib/utils';

const DEFAULT_CRON = '0 2 * * *';
const DEFAULT_TIME_ZONE = 'Asia/Seoul';

const STATUS_LABEL: Record<OperationRun['status'], string> = {
  queued: '대기열',
  waiting_runtime: '브라우저 대기',
  running: '실행 중',
  attention_required: '확인 필요',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소됨',
  skipped: '건너뜀',
};

const STATUS_CLASS: Record<OperationRun['status'], string> = {
  queued: 'bg-slate-100 text-slate-700',
  waiting_runtime: 'bg-amber-100 text-amber-800',
  running: 'bg-blue-100 text-blue-800',
  attention_required: 'bg-orange-100 text-orange-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-600',
  skipped: 'bg-slate-100 text-slate-600',
};

function isActive(run: OperationRun | undefined): boolean {
  return run !== undefined && ['queued', 'waiting_runtime', 'running', 'attention_required'].includes(run.status);
}

type Props = {
  definition: OperationDefinition;
  latestRun?: OperationRun;
  schedule?: OperationSchedule;
  pendingStart: boolean;
  pendingCancel: boolean;
  pendingRetry: boolean;
  pendingSchedule: boolean;
  onStart: (operationKey: string) => void;
  onCancel: (runId: string) => void;
  onRetry: (runId: string) => void;
  onSaveSchedule: (operationKey: string, request: UpsertOperationScheduleRequest) => void;
};

export function AgentOsOperationCard({
  definition,
  latestRun,
  schedule,
  pendingStart,
  pendingCancel,
  pendingRetry,
  pendingSchedule,
  onStart,
  onCancel,
  onRetry,
  onSaveSchedule,
}: Props) {
  const [cronExpression, setCronExpression] = useState(schedule?.cronExpression ?? DEFAULT_CRON);
  const [timeZone, setTimeZone] = useState(schedule?.timeZone ?? DEFAULT_TIME_ZONE);

  useEffect(() => {
    setCronExpression(schedule?.cronExpression ?? DEFAULT_CRON);
    setTimeZone(schedule?.timeZone ?? DEFAULT_TIME_ZONE);
  }, [schedule?.cronExpression, schedule?.timeZone]);

  const active = isActive(latestRun);
  const status = latestRun?.status;
  const scheduleRequest = (enabled: boolean): UpsertOperationScheduleRequest => ({
    cronExpression,
    timeZone,
    misfirePolicy: schedule?.misfirePolicy ?? 'catch_up_once',
    enabled,
    input: schedule?.input ?? {},
  });

  return (
    <article className="rounded-xl border border-violet-100 bg-white/90 p-3 shadow-sm" data-operation-key={definition.key}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{definition.title}</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">{definition.ownerDomain} · {definition.engineType}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status ? STATUS_CLASS[status] : 'bg-slate-100 text-slate-600'}`}>
          {status ? STATUS_LABEL[status] : '대기'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="block text-slate-400">마지막 실행</span>
          <span>{latestRun ? formatDateTime(latestRun.createdAt) : '기록 없음'}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="block text-slate-400">다음 예약</span>
          <span>{schedule?.enabled ? formatDateTime(schedule.nextRunAt) : '비활성'}</span>
        </div>
      </div>

      {status === 'attention_required' && (
        <p className="mt-2 flex items-center gap-1 text-xs text-orange-700">
          <CircleAlert size={13} /> {latestRun?.error?.message ?? '운영자 확인이 필요합니다.'}
        </p>
      )}
      {status === 'succeeded' && latestRun?.result && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <CircleCheck size={13} /> 최근 실행이 완료되었습니다.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onStart(definition.key)}
          disabled={pendingStart || active}
          className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md bg-violet-600 px-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingStart ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {active ? '실행 중' : '실행'}
        </button>
        {active && latestRun ? (
          <button
            type="button"
            onClick={() => onCancel(latestRun.id)}
            disabled={pendingCancel}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {pendingCancel ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />}
            취소
          </button>
        ) : null}
        {status === 'attention_required' && latestRun?.engineType === 'browser' ? (
          <button
            type="button"
            onClick={() => onRetry(latestRun.id)}
            disabled={pendingRetry}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-orange-200 px-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-60"
          >
            {pendingRetry ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            재시도
          </button>
        ) : null}
      </div>

      {definition.scheduleSupported && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700"><CalendarClock size={13} /> 예약 실행</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={schedule?.enabled ?? false}
                disabled={pendingSchedule}
                onChange={(event) => onSaveSchedule(definition.key, scheduleRequest(event.target.checked))}
              />
              {schedule?.enabled ? '활성' : '비활성'}
            </label>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              aria-label={`${definition.title} cron`}
              value={cronExpression}
              onChange={(event) => setCronExpression(event.target.value)}
              className="min-w-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
            />
            <input
              aria-label={`${definition.title} timezone`}
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              className="rounded-md border border-slate-200 px-1 py-1 text-xs text-slate-700"
            />
          </div>
          <button
            type="button"
            onClick={() => onSaveSchedule(definition.key, scheduleRequest(schedule?.enabled ?? false))}
            disabled={pendingSchedule}
            className="mt-2 text-xs font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-60"
          >
            cron/timezone 저장
          </button>
        </div>
      )}
    </article>
  );
}
