'use client';

import Link from 'next/link';
import type {
  AllowedAgent,
  AgentSessionSummary,
} from '@kiditem/shared/agent-interaction';
import { parseAgentSessionName } from '@kiditem/shared/identifiers';

interface InteractionHeaderProps {
  agents: AllowedAgent[];
  agentId: string;
  agentLocked: boolean;
  sessions: AgentSessionSummary[];
  selectedSession: AgentSessionSummary | null;
  connectionLabel: string;
  onAgentChange: (agentId: string) => void;
  onNewConversation: () => void;
  onSessionSelect: (sessionName: string) => void;
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
              <option key={`${agent.agentDefinitionKey}:${agent.agentVersion}`} value={agent.agentDefinitionKey}>
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
            key={session.name}
            type="button"
            aria-label={`세션 ${sessionLabel(session)} 열기`}
            className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
            onClick={() => onSessionSelect(session.name)}
          >
            {sessionLabel(session)}
          </button>
        ))}
      </div>
    </header>
  );
}

function sessionLabel(session: AgentSessionSummary): string {
  return parseAgentSessionName(session.name).session;
}
