'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import {
  admitQueuedInteractionPrompt,
  clearInteractionSession,
  isInteractionAgentDefinitionKey,
  markInteractionPromptReconciliationFailed,
  markInteractionPromptSubmitting,
  pinDurableInteractionAgent,
  recordInteractionSuccessorAdmission,
  resolvedInteractionAgent,
  restoreUnadmittedInteractionPrompt,
  setInteractionDraft,
  startInteraction,
  useInteractionSessionCoordinate,
  useInteractionSurfaceState,
  type InteractionAgentDefinitionKey,
  type QueuedInteractionPrompt,
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

/** Exact durable admission evidence emitted by the CopilotKit incoming adapter. */
export interface DurableWorkAdmission {
  kind: 'live_input' | 'root' | 'successor';
  sessionId: string;
  taskId: string;
  attemptId: string;
}

const DURABLE_ADMISSION_RETRY_MESSAGE =
  'Unable to confirm durable work. Retry the durable admission check before sending another prompt.';

/**
 * The interaction UI Module's controller. It keeps the durable projection,
 * selected Agent, session URL coordinate, and Agent Work API Adapter together
 * so the Surface remains a renderer.
 */
export function useAgentInteraction() {
  const [projection, setProjection] = useState<AgentWorkProjection | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const selectedAgentDefinitionKey = useInteractionSurfaceState(
    (state) => state.selectedAgentDefinitionKey,
  );
  const draft = useInteractionSurfaceState((state) => state.draft);
  const queuedPrompt = useInteractionSurfaceState((state) => state.queuedPrompt);
  const submissionStatus = useInteractionSurfaceState((state) => state.submissionStatus);
  const submissionError = useInteractionSurfaceState((state) => state.submissionError);
  const sessionId = useInteractionSurfaceState((state) => state.sessionId);
  const observedSessionId = useRef<string | null>(null);

  useInteractionSessionCoordinate();

  const loadProjection = useCallback(async (id: string) => {
    const nextProjection = await apiClient.get<AgentWorkProjection>(`/api/agent-work/sessions/${id}`);
    const durableAgentDefinitionKey = rootAgentDefinitionKey(nextProjection);
    if (durableAgentDefinitionKey) pinDurableInteractionAgent(durableAgentDefinitionKey);
    setProjection(nextProjection);
    setProjectionError(null);
    return nextProjection;
  }, []);
  const refresh = useCallback(async (id = sessionId) => {
    if (!id) return;
    try {
      await loadProjection(id);
    } catch {
      setProjectionError('Unable to load durable work. Refresh durable work to retry.');
    }
  }, [loadProjection, sessionId]);

  useEffect(() => {
    if (sessionId === observedSessionId.current) return;
    observedSessionId.current = sessionId;
    setProjection(null);
    if (!sessionId || queuedPrompt) return;
    void refresh(sessionId);
  }, [queuedPrompt, refresh, sessionId]);

  const rootTask = rootAgentTask(projection);
  const durableAgentDefinitionKey = rootTask?.agentDefinitionKey
    && isInteractionAgentDefinitionKey(rootTask.agentDefinitionKey)
    ? rootTask.agentDefinitionKey
    : null;
  const localAgentDefinitionKey = queuedPrompt?.agentDefinitionKey
    ?? resolvedInteractionAgent(selectedAgentDefinitionKey);
  const hasUnconfirmedSubmission = Boolean(sessionId && queuedPrompt);
  const agentDefinitionKey = durableAgentDefinitionKey
    ?? (hasUnconfirmedSubmission || !sessionId ? localAgentDefinitionKey : null);

  const begin = useCallback(() => {
    if (!agentDefinitionKey) return;
    startInteraction(
      agentDefinitionKey,
      sessionId && rootTask
        ? {
            taskId: rootTask.id,
            latestAttempt: rootTask.latestAttempt && {
              id: rootTask.latestAttempt.id,
              ordinal: rootTask.latestAttempt.ordinal,
            },
          }
        : null,
    );
  }, [agentDefinitionKey, rootTask, sessionId]);
  const newTask = useCallback(() => {
    if (useInteractionSurfaceState.getState().queuedPrompt) return;
    setProjection(null);
    setProjectionError(null);
    clearInteractionSession();
  }, []);
  const action = useCallback(async (path: string, body?: unknown) => {
    await apiClient.post(path, body);
    await refresh();
  }, [refresh]);
  const deleteSession = useCallback(async () => {
    if (!sessionId || useInteractionSurfaceState.getState().queuedPrompt) return;
    await apiClient.post(`/api/agent-work/sessions/${sessionId}/delete`);
    setProjection(null);
    setProjectionError(null);
    clearInteractionSession();
  }, [sessionId]);
  const reconcileDurableAdmission = useCallback(async (reconciliation: {
    sessionId: string;
    promptId: string;
    expectedSuccessorAttemptId?: string;
  }) => {
    const queued = useInteractionSurfaceState.getState().queuedPrompt;
    if (queued?.id !== reconciliation.promptId) return;
    const expectedSuccessorAttemptId = reconciliation.expectedSuccessorAttemptId
      ?? queued.expectedSuccessorAttemptId;
    markInteractionPromptSubmitting(reconciliation);
    try {
      const nextProjection = await loadProjection(reconciliation.sessionId);
      if (!provesDurableAdmission(
        nextProjection,
        queued,
        expectedSuccessorAttemptId ?? undefined,
      )) {
        restoreUnadmittedInteractionPrompt({
          ...reconciliation,
          error: 'Durable admission was not confirmed. Retry will reuse the exact command.',
        });
        return;
      }
      admitQueuedInteractionPrompt(reconciliation);
    } catch (error) {
      if (isApiError(error) && error.status === 404) {
        restoreUnadmittedInteractionPrompt(reconciliation);
        return;
      }
      markInteractionPromptReconciliationFailed({
        ...reconciliation,
        error: DURABLE_ADMISSION_RETRY_MESSAGE,
      });
    }
  }, [loadProjection]);
  const onLiveRunFinished = useCallback((finishedSessionId: string, promptId: string) => {
    void reconcileDurableAdmission({ sessionId: finishedSessionId, promptId });
  }, [reconcileDurableAdmission]);
  const onLiveAdmission = useCallback((input: {
    sessionId: string;
    promptId: string;
    admission: DurableWorkAdmission;
  }) => {
    const queued = useInteractionSurfaceState.getState().queuedPrompt;
    if (
      queued?.id !== input.promptId
      || input.admission.sessionId !== input.sessionId
    ) return;
    if (matchesRootAdmission(queued, input.sessionId, input.admission)) {
      admitQueuedInteractionPrompt(input);
      void refresh(input.sessionId);
      return;
    }
    if (matchesLiveInputAdmission(queued, input.sessionId, input.admission)) {
      admitQueuedInteractionPrompt(input);
      void refresh(input.sessionId);
      return;
    }
    if (matchesSuccessorAdmission(queued, input.sessionId, input.admission)) {
      recordInteractionSuccessorAdmission({
        sessionId: input.sessionId,
        promptId: input.promptId,
        attemptId: input.admission.attemptId,
      });
      void reconcileDurableAdmission({
        sessionId: input.sessionId,
        promptId: input.promptId,
        expectedSuccessorAttemptId: input.admission.attemptId,
      });
    }
  }, [reconcileDurableAdmission, refresh]);
  const retryDurableAdmission = useCallback(() => {
    if (!sessionId || !queuedPrompt || submissionStatus !== 'reconciliation_failed') return;
    void reconcileDurableAdmission({ sessionId, promptId: queuedPrompt.id });
  }, [queuedPrompt, reconcileDurableAdmission, sessionId, submissionStatus]);
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
      !queuedPrompt
      && projection?.tasks.length
      && projection.tasks.every((task) => task.status !== 'open'),
    ),
    canStart: Boolean(
      agentDefinitionKey
      && draft.trim()
      && ['idle', 'retry_ready'].includes(submissionStatus),
    ),
    continueTask,
    cancelTask,
    decideApproval,
    deleteSession,
    draft,
    interruptTask,
    isSubmissionRecoveryPending: ['submitting', 'reconciliation_failed'].includes(submissionStatus),
    markPromptSubmitting: markInteractionPromptSubmitting,
    newTask,
    onLiveAdmission,
    onLiveRunFinished,
    projection,
    projectionError,
    queuedPrompt,
    refresh,
    reopenTask,
    retryDurableAdmission,
    sessionId,
    setDraft: setInteractionDraft,
    start: begin,
    submissionError,
    submissionStatus,
  };
}

function rootAgentTask(
  projection: AgentWorkProjection | null,
): AgentWorkTask | null {
  return projection?.tasks.find((task) => task.parentTaskId === null) ?? null;
}

function rootAgentDefinitionKey(
  projection: AgentWorkProjection | null,
): InteractionAgentDefinitionKey | null {
  const agentDefinitionKey = rootAgentTask(projection)?.agentDefinitionKey;
  return isInteractionAgentDefinitionKey(agentDefinitionKey) ? agentDefinitionKey : null;
}

function provesDurableAdmission(
  projection: AgentWorkProjection,
  prompt: QueuedInteractionPrompt,
  expectedSuccessorAttemptId?: string,
): boolean {
  if (prompt.createdSession) return true;
  if (!prompt.baseline) return false;
  const rootTask = projection.tasks.find((task) => (
    task.id === prompt.baseline!.taskId && task.parentTaskId === null
  ));
  const successor = rootTask?.latestAttempt;
  if (!successor) return false;
  const predecessor = prompt.baseline.latestAttempt;
  const isSuccessor = predecessor === null
    || (successor.id !== predecessor.id && successor.ordinal > predecessor.ordinal);
  return isSuccessor
    && (expectedSuccessorAttemptId === undefined || successor.id === expectedSuccessorAttemptId);
}

function matchesLiveInputAdmission(
  prompt: QueuedInteractionPrompt,
  sessionId: string,
  admission: DurableWorkAdmission,
): boolean {
  const predecessor = prompt.baseline?.latestAttempt;
  return admission.kind === 'live_input'
    && !prompt.createdSession
    && admission.sessionId === sessionId
    && admission.taskId === prompt.baseline?.taskId
    && admission.attemptId === predecessor?.id;
}

function matchesRootAdmission(
  prompt: QueuedInteractionPrompt,
  sessionId: string,
  admission: DurableWorkAdmission,
): boolean {
  return admission.kind === 'root'
    && prompt.createdSession
    && admission.sessionId === sessionId;
}

function matchesSuccessorAdmission(
  prompt: QueuedInteractionPrompt,
  sessionId: string,
  admission: DurableWorkAdmission,
): boolean {
  const predecessor = prompt.baseline?.latestAttempt;
  return admission.kind === 'successor'
    && !prompt.createdSession
    && admission.sessionId === sessionId
    && admission.taskId === prompt.baseline?.taskId
    && (!predecessor || admission.attemptId !== predecessor.id);
}

function displayAgentName(agentDefinitionKey: InteractionAgentDefinitionKey): string {
  return agentDefinitionKey
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
