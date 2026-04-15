import { cn, formatDateTime } from '@/lib/utils';
import type { AgentLog } from '@kiditem/shared';

interface AgentLogsSectionProps {
  logs: AgentLog[];
}

const LEVEL_CLS: Record<string, string> = {
  error: 'text-red-600',
  warn: 'text-amber-600',
  warning: 'text-amber-600',
  info: 'text-slate-700',
  debug: 'text-slate-400',
};

export function AgentLogsSection({ logs }: AgentLogsSectionProps) {
  if (!logs.length) return null;

  return (
    <section className="mt-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">로그 ({logs.length})</h2>
      <div className="rounded-lg border border-slate-200 bg-slate-50 max-h-80 overflow-y-auto">
        <ul className="divide-y divide-slate-200">
          {logs.map((log) => (
            <li key={log.id} className="px-3 py-1.5 text-xs font-mono">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 shrink-0">{formatDateTime(log.createdAt)}</span>
                <span className={cn('uppercase font-semibold shrink-0 w-12', LEVEL_CLS[log.level] ?? 'text-slate-600')}>
                  {log.level}
                </span>
                <span className="text-slate-800 break-all whitespace-pre-wrap">{log.message}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
