import type { RocketOrderActivityEvent } from '@/lib/rocket-order-activity';

const STATUS_LABEL = {
  started: '진행',
  succeeded: '완료',
  failed: '실패',
} as const;

const STATUS_CLASS = {
  started: 'bg-blue-50 text-blue-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
} as const;

export function RocketOrderActivityPanel({ events }: {
  events: RocketOrderActivityEvent[];
}) {
  return (
    <aside className="h-full rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-extrabold text-slate-900">작업 알림</h2>
      <div role="log" aria-live="polite" className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-xs leading-5 text-slate-400">수집·미리보기·확정 작업이 여기에 표시됩니다.</p>
        ) : events.map((event) => (
          <div key={event.id} className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[event.status]}`}>
                {STATUS_LABEL[event.status]}
              </span>
              <time className="text-[10px] tabular-nums text-slate-400" dateTime={event.occurredAt}>
                {new Date(event.occurredAt).toLocaleTimeString('ko-KR', { hour12: false })}
              </time>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">{event.message}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
