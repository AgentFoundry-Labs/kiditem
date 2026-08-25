'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  clearInteractionSession,
  consumeQueuedInteractionPrompt,
  isInteractionAgentDefinitionKey,
  pinDurableInteractionAgent,
  resolvedInteractionAgent,
  setInteractionDraft,
  startInteraction,
  useInteractionSessionCoordinate,
  useInteractionSurfaceState,
  type InteractionAgentDefinitionKey,
} from './interaction-surface-state';

export interface AgentWorkTask {
  id: string;
  parentTaskId: string | null;
  agentDefinitionKey: string;
  objective: string;
  status: string;
  presentation: string;
  summary?: string | null;
  error?: { code?: string; message?: string } | null;
  resourceRefs?: Array<{ kind: string; id: string }>;
  operationRefs?: Array<{ kind: string; id: string; status?: string }>;
  latestAttempt: { id: string; ordinal: number; status: string } | null;
  approval?: { id: string; invocationId: string; inputHash: string; expiresAt?: string } | null;
}

export interface AgentWorkProjection {
  session: { id: string };
  tasks: AgentWorkTask[];
}

/**
 * The interaction UI Module's controller. It keeps the durable projection,
 * selected Agent, session URL coordinate, and Agent Work API Adapter together
 * so the Surface remains a renderer.
 */
export function useAgentInteraction() {
  const [projection, setProjection] = useState<AgentWorkProjection | null>(null);
  const selectedAgentDefinitionKey = useInteractionSurfaceState(
    (state) => state.selectedAgentDefinitionKey,
  );
  const draft = useInteractionSurfaceState((state) => state.draft);
  const queuedPrompt = useInteractionSurfaceState((state) => state.queuedPrompt);
  const sessionId = useInteractionSurfaceState((state) => state.sessionId);
  const observedSessionId = useRef<string | null>(null);
  const locallyStartedSessions = useRef(new Set<string>());

  useInteractionSessionCoordinate();

  const loadProjection = useCallback(async (id: string) => {
    const nextProjection = await apiClient.get<AgentWorkProjection>(`/api/agent-work/sessions/${id}`);
    const durableAgentDefinitionKey = rootAgentDefinitionKey(nextProjection);
    if (durableAgentDefinitionKey) pinDurableInteractionAgent(durableAgentDefinitionKey);
    setProjection(nextProjection);
  }, []);
  const refresh = useCallback(async (id = sessionId) => {
    if (id) await loadProjection(id);
  }, [loadProjection, sessionId]);

  useEffect(() => {
    if (sessionId === observedSessionId.current) return;
    observedSessionId.current = sessionId;
    setProjection(null);
    if (!sessionId || locallyStartedSessions.current.has(sessionId)) return;
    void loadProjection(sessionId);
  }, [loadProjection, sessionId]);

  const durableAgentDefinitionKey = rootAgentDefinitionKey(projection);
  const localAgentDefinitionKey = queuedPrompt?.agentDefinitionKey
    ?? resolvedInteractionAgent(selectedAgentDefinitionKey);
  const hasLocalSession = Boolean(sessionId && locallyStartedSessions.current.has(sessionId));
  const agentDefinitionKey = durableAgentDefinitionKey
    ?? (hasLocalSession || !sessionId ? localAgentDefinitionKey : null);

  const begin = useCallback(() => {
    if (!agentDefinitionKey) return;
    const started = startInteraction(agentDefinitionKey);
    if (started?.createdSession) locallyStartedSessions.current.add(started.sessionId);
  }, [agentDefinitionKey]);
  const newTask = useCallback(() => {
    setProjection(null);
    clearInteractionSession();
  }, []);
  const action = useCallback(async (path: string, body?: unknown) => {
    await apiClient.post(path, body);
    await refresh();
  }, [refresh]);
  const deleteSession = useCallback(async () => {
    if (!sessionId) return;
    await apiClient.post(`/api/agent-work/sessions/${sessionId}/delete`);
    setProjection(null);
    clearInteractionSession();
  }, [sessionId]);
  const onLiveRunFinished = useCallback((finishedSessionId: string) => {
    locallyStartedSessions.current.delete(finishedSessionId);
    void loadProjection(finishedSessionId);
  }, [loadProjection]);
  const continueTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId || !task.latestAttempt) return;
    void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, {
      predecessorAttemptId: task.latestAttempt.id,
      prompt: draft.trim() || 'Continue the durable work with the current state.',
    });
  }, [action, draft, sessionId]);
  const reopenTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId || !task.latestAttempt) return;
    void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, {
      predecessorAttemptId: task.latestAttempt.id,
      prompt: draft.trim() || 'Reopen this durable work and continue from its current state.',
      reopen: true,
    });
  }, [action, draft, sessionId]);
  const interruptTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId || !task.latestAttempt) return;
    void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/attempts/${task.latestAttempt.id}/interrupt`);
  }, [action, sessionId]);
  const cancelTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId) return;
    void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/cancel`);
  }, [action, sessionId]);
  const decideApproval = useCallback((task: AgentWorkTask, decision: 'approved' | 'rejected') => {
    if (!sessionId || !task.approval) return;
    void action(`/api/agent-work/sessions/${sessionId}/approvals/${task.approval.id}`, {
      invocationId: task.approval.invocationId,
      inputHash: task.approval.inputHash,
      decision,
    });
  }, [action, sessionId]);

  return {
    agentDefinitionKey,
    agentLabel: displayAgentName(agentDefinitionKey ?? localAgentDefinitionKey),
    canDeleteSession: Boolean(
      projection?.tasks.length && projection.tasks.every((task) => task.status !== 'open'),
    ),
    canStart: Boolean(agentDefinitionKey && draft.trim()),
    consumeQueuedPrompt: consumeQueuedInteractionPrompt,
    continueTask,
    cancelTask,
    decideApproval,
    deleteSession,
    draft,
    interruptTask,
    newTask,
    onLiveRunFinished,
    projection,
    queuedPrompt,
    refresh,
    reopenTask,
    sessionId,
    setDraft: setInteractionDraft,
    start: begin,
  };
}

function rootAgentDefinitionKey(
  projection: AgentWorkProjection | null,
): InteractionAgentDefinitionKey | null {
  const rootTask = projection?.tasks.find((task) => task.parentTaskId === null);
  return isInteractionAgentDefinitionKey(rootTask?.agentDefinitionKey)
    ? rootTask.agentDefinitionKey
    : null;
}

function displayAgentName(agentDefinitionKey: InteractionAgentDefinitionKey): string {
  return agentDefinitionKey
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
