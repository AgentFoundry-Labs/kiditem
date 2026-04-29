'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { queryKeys } from '@/lib/query-keys';
import type { AgentEvent } from '@kiditem/shared/agent-trace';
import { fetchAgentTrace } from '../../../lib/agent-api';
import { isRunningStatus } from '../../lib/trace-utils';
import { TraceHeader } from './components/TraceHeader';
import { TraceTimeline } from './components/TraceTimeline';
import { TraceWarningBanner } from './components/TraceWarningBanner';
import { EventDetailModal } from './components/EventDetailModal';
import { AgentLogsSection } from './components/AgentLogsSection';

interface TraceViewProps {
  taskId: string;
}

/**
 * Trace 상세 뷰. `page.tsx` 가 `use(params)` 로 taskId 를 풀어서 주입.
 * 분리 이유: React 19 `use(Promise)` 는 Suspense 를 요구하여 유닛 테스트가 복잡해짐.
 * taskId string 을 받는 얇은 컴포넌트로 분리해 직접 테스트 가능.
 */
export function TraceView({ taskId }: TraceViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<AgentEvent | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.agents.trace(taskId),
    queryFn: () => fetchAgentTrace(taskId),
    refetchInterval: (query) =>
      isRunningStatus(query.state.data?.task.status) ? 15_000 : false,
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="table" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          트레이스를 불러오지 못했습니다.{error instanceof Error ? ` (${error.message})` : ''}
        </div>
        <Link
          href="/agents/tasks"
          className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-3 h-3" /> 태스크 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <Link
        href="/agents/tasks"
        className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> 태스크 목록으로
      </Link>

      <TraceHeader
        task={data.task}
        workflowRun={data.workflowRun}
        traceability={data.traceability}
      />

      {data.traceability.warning && <TraceWarningBanner message={data.traceability.warning} />}

      <TraceTimeline
        heartbeatRuns={data.heartbeatRuns}
        events={data.events}
        wakeupRequests={data.wakeupRequests}
        onEventClick={setSelectedEvent}
      />

      <AgentLogsSection logs={data.logs} />

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
