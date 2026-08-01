'use client';

import { CircleAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { UpsertOperationScheduleRequest } from '@kiditem/shared/operations';
import { friendlyError } from '@/lib/api-error';
import { AgentOsOperationCard } from './AgentOsOperationCard';
import { useAgentOsOperations } from '../../hooks/use-agent-os-operations';

export function AgentOsOperationsPanel() {
  const operations = useAgentOsOperations();

  const start = (operationKey: string) => {
    operations.startOperation.mutate(
      { operationKey, input: { sourceSurface: 'dashboard', input: {} } },
      {
        onSuccess: () => toast.success('작업을 시작했습니다. 진행 상태는 이 패널에서 갱신됩니다.'),
        onError: (error) => toast.error(friendlyError(error) ?? '작업을 시작하지 못했습니다.'),
      },
    );
  };

  const cancel = (runId: string) => {
    operations.cancelOperation.mutate(runId, {
      onError: (error) => toast.error(friendlyError(error) ?? '작업 취소에 실패했습니다.'),
    });
  };

  const retryBrowserRun = (runId: string) => {
    operations.retryBrowserOperation.mutate(runId, {
      onSuccess: () => toast.success('브라우저 작업을 다시 대기열에 넣었습니다.'),
      onError: (error) => toast.error(friendlyError(error) ?? '브라우저 작업 재시도에 실패했습니다.'),
    });
  };

  const saveSchedule = (operationKey: string, request: UpsertOperationScheduleRequest) => {
    operations.saveSchedule.mutate({ operationKey, request }, {
      onSuccess: () => toast.success(request.enabled ? '예약을 저장하고 활성화했습니다.' : '예약을 저장하고 비활성화했습니다.'),
      onError: (error) => toast.error(friendlyError(error) ?? '예약 저장에 실패했습니다.'),
    });
  };

  if (operations.isLoading) {
    return <div className="flex min-h-24 items-center justify-center text-sm text-violet-600"><Loader2 size={16} className="mr-2 animate-spin" /> 작업 목록을 불러오는 중</div>;
  }

  if (operations.error) {
    return <p className="flex items-center gap-1 rounded-lg bg-red-50 p-3 text-xs text-red-700"><CircleAlert size={14} /> 작업 상태를 불러오지 못했습니다.</p>;
  }

  if (operations.definitions.length === 0) {
    return <p className="rounded-lg bg-white/70 p-3 text-xs text-slate-500">등록된 운영 작업이 없습니다.</p>;
  }

  return (
    <section className="mt-3 border-t border-violet-100 pt-3" aria-label="Agent OS 작업 실행 및 예약">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-violet-900">OPERATIONS</h3>
        <p className="text-[11px] text-violet-600">실행 상태는 2초마다 갱신됩니다</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {operations.definitions.map((definition) => (
          <AgentOsOperationCard
            key={definition.key}
            definition={definition}
            latestRun={operations.latestRuns.get(definition.key)}
            schedule={operations.schedules.get(definition.key)}
            pendingStart={operations.startOperation.isPending}
            pendingCancel={operations.cancelOperation.isPending}
            pendingRetry={operations.retryBrowserOperation.isPending}
            pendingSchedule={operations.saveSchedule.isPending}
            onStart={start}
            onCancel={cancel}
            onRetry={retryBrowserRun}
            onSaveSchedule={saveSchedule}
          />
        ))}
      </div>
    </section>
  );
}
