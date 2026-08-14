'use client';

import type { AgentDelegationEvent } from '@kiditem/shared/agent-interaction';
import { parseAgentSessionTaskName, parseAgentVersionName } from '@kiditem/shared/identifiers';

const statusLabel: Record<AgentDelegationEvent['status'], string> = {
  created: '생성됨',
  running: '실행 중',
  completed: '완료됨',
  failed: '실패함',
  cancelled: '취소됨',
};

export function AgentDelegationCard({ event }: { event: AgentDelegationEvent }) {
  const childTask = parseAgentSessionTaskName(event.childTask, event.session);
  const from = parseAgentVersionName(event.fromAgentVersion);
  const to = parseAgentVersionName(event.toAgentVersion);

  return (
    <section
      data-testid={`agent-delegation-${childTask.task}`}
      aria-label="Agent 위임"
      className="space-y-1 rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      <p className="text-sm font-semibold">작업 위임 · {statusLabel[event.status]}</p>
      <p className="text-sm text-muted-foreground">
        {from.agentDefinitionKey} → {to.agentDefinitionKey}
      </p>
    </section>
  );
}
