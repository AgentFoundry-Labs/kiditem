'use client';

import { useCallback, useState } from 'react';
import type {
  AgentSessionSummary,
  InteractionBootstrap,
} from '@kiditem/shared/agent-interaction';
import { useInteractionStore } from './interaction-store';

export function useKidItemConversation(bootstrap: InteractionBootstrap) {
  const selectedAgentDefinitionKey = useInteractionStore(
    (state) => state.selectedAgentDefinitionKey,
  );
  const selectedSessionId = useInteractionStore((state) => state.selectedSessionId);
  const selectedThreadId = useInteractionStore((state) => state.selectedThreadId);
  const selectAgentInStore = useInteractionStore((state) => state.selectAgent);
  const selectSessionInStore = useInteractionStore((state) => state.selectSession);
  const [newThreadId, setNewThreadId] = useState(() => crypto.randomUUID());
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const session = bootstrap.sessions.find(
    (candidate) => candidate.sessionId === selectedSessionId,
  ) ?? null;
  const defaultAgent = bootstrap.agents.find((candidate) => candidate.isDefault);
  const agentId = session?.primaryAgentDefinitionKey
    ?? selectedAgentDefinitionKey
    ?? defaultAgent?.agentDefinitionKey
    ?? bootstrap.defaultAgentDefinitionKey;
  const agentLocked = session !== null || hasSubmitted;
  const threadId = selectedThreadId ?? newThreadId;

  const selectAgent = useCallback((nextAgentId: string) => {
    if (agentLocked) return;
    if (!bootstrap.agents.some((candidate) => candidate.agentDefinitionKey === nextAgentId)) {
      return;
    }
    selectAgentInStore(nextAgentId);
  }, [agentLocked, bootstrap.agents, selectAgentInStore]);

  const selectSession = useCallback((sessionId: string) => {
    const nextSession: AgentSessionSummary | undefined = bootstrap.sessions.find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (!nextSession) return;
    selectAgentInStore(nextSession.primaryAgentDefinitionKey);
    selectSessionInStore(nextSession.sessionId, nextSession.copilotThreadId);
    setHasSubmitted(false);
  }, [bootstrap.sessions, selectAgentInStore, selectSessionInStore]);

  const startNewConversation = useCallback(() => {
    setNewThreadId(crypto.randomUUID());
    selectSessionInStore(null, null);
    setHasSubmitted(false);
  }, [selectSessionInStore]);

  const markSubmitted = useCallback(() => setHasSubmitted(true), []);

  return {
    agentId,
    agentLocked,
    session,
    threadId,
    markSubmitted,
    selectAgent,
    selectSession,
    startNewConversation,
  };
}
