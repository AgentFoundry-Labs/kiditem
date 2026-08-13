'use client';

import Link from 'next/link';
import type {
  AllowedAgent,
  AgentSessionSummary,
} from '@kiditem/shared/agent-interaction';

interface InteractionHeaderProps {
  agents: AllowedAgent[];
  agentId: string;
  agentLocked: boolean;
  sessions: AgentSessionSummary[];
  selectedSession: AgentSessionSummary | null;
  connectionLabel: string;
  onAgentChange: (agentId: string) => void;
  onNewConversation: () => void;
  onSessionSelect: (sessionId: string) => void;
}

export function InteractionHeader({
  agents,
  agentId,
  agentLocked,
  sessions,
  selectedSession,
  connectionLabel,
  onAgentChange,
  onNewConversation,
  onSessionSelect,
}: InteractionHeaderProps) {
  return (
    <header className="border-b border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-foreground">
          <span className="sr-only">에이전트</span>
          <select
            aria-label="에이전트"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            disabled={agentLocked}
            value={agentId}
            onChange={(event) => onAgentChange(event.target.value)}
          >
            {agents.map((agent) => (
              <option key={`${agent.agentDefinitionKey}:${agent.agentVersionId}`} value={agent.agentDefinitionKey}>
                {agent.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border border-input px-2 py-1 text-sm"
          onClick={onNewConversation}
        >
          새 대화
        </button>
        <span className="text-xs text-muted-foreground">{connectionLabel}</span>
        {selectedSession ? (
          <Link className="ml-auto text-sm text-primary underline" href="/agent-os">
            AgentOS 워크스페이스
          </Link>
        ) : null}
      </div>
      <div aria-label="대화 기록" className="mt-2 flex gap-2 overflow-x-auto">
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            type="button"
            aria-label={`세션 ${session.sessionId} 열기`}
            className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
            onClick={() => onSessionSelect(session.sessionId)}
          >
            {session.sessionId}
          </button>
        ))}
      </div>
    </header>
  );
}
