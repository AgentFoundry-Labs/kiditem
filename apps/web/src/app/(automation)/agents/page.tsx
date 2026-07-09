'use client';

import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { AgentOfficeShell } from './components/AgentOfficeShell';
import { useAgentOffice } from './hooks/useAgentOffice';

export default function AgentOsOpsPage() {
  const office = useAgentOffice();

  if (office.isPending) return <PageSkeleton variant="dashboard" />;

  if (office.error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Agent OS HQ를 불러오지 못했습니다.{' '}
          {isApiError(office.error)
            ? office.error.detail
            : office.error instanceof Error
              ? office.error.message
              : ''}
        </div>
      </div>
    );
  }

  return (
    <AgentOfficeShell
      model={office.model}
      selectedNodeId={office.selectedNodeId}
      command={office.command}
      commandPending={office.commandPending}
      refreshing={office.isFetching}
      onSelectNode={office.setSelectedNodeId}
      onCommandChange={office.setCommand}
      onSubmitCommand={office.submitCommand}
      onRefresh={office.refresh}
    />
  );
}
