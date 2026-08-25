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
  agentDefinitionKey: string | null;
  objective: string;
  completionCriteria?: string;
  status: string;
  latestAttempt: AgentWorkAttempt | null;
  result?: AgentWorkResult | null;
  approval?: AgentWorkApproval | null;
  approvals?: AgentWorkApproval[];
  invocations?: AgentWorkInvocation[];
  childTasks?: AgentWorkChildTask[];
  resourceRefs?: AgentWorkReference[];
  operationRefs?: AgentWorkReference[];
}

export interface AgentWorkReference {
  kind?: string;
  id?: string;
  status?: string;
}

export interface AgentWorkError {
  code?: string | null;
  message?: string | null;
}

export interface AgentWorkResult {
  outcome?: string | null;
  summary?: string | null;
  resourceRefs?: AgentWorkReference[];
  operationRefs?: AgentWorkReference[];
  needsInput?: unknown;
  error?: AgentWorkError | null;
}

export interface AgentWorkAttempt {
  id: string;
  ordinal: number;
  status: string;
  result?: AgentWorkResult | null;
  error?: AgentWorkError | null;
}

export interface AgentWorkApproval {
  id: string;
  invocationId: string;
  inputHash: string;
  status?: string | null;
  expiresAt?: string | null;
}

export interface AgentWorkInvocation {
  id: string;
  capabilityKey: string;
  status: string;
  result?: AgentWorkResult | null;
  error?: AgentWorkError | null;
  approval?: AgentWorkApproval | null;
}

export interface AgentWorkChildTask {
  id: string;
  parentTaskId: string | null;
  objective: string;
  completionCriteria?: string;
  status: string;
  latestAttempt: AgentWorkAttempt | null;
}

export interface AgentWorkView {
  session: { id: string };
  tasks: AgentWorkTask[];
}

/** Exact durable admission evidence emitted by the CopilotKit incoming adapter. */
export interface DurableWorkAdmission {
  kind: 'live_input' | 'root';
  sessionId: string;
  taskId: string;
  attemptId: string;
}

const DURABLE_ADMISSION_RETRY_MESSAGE =
  'Unable to confirm durable work. Retry the durable admission check before sending another prompt.';

/**
 * The interaction UI Module's controller. It keeps the durable work view,
 * selected Agent, session URL coordinate, and Agent Work API Adapter together
 * so the Surface remains a renderer.
 */
export function useAgentInteraction() {
  const [workView, setWorkView] = useState<AgentWorkView | null>(null);
  const [workViewError, setWorkViewError] = useState<string | null>(null);
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

  const loadWorkView = useCallback(async (id: string) => {
    const nextWorkView = await apiClient.get<AgentWorkView>(`/api/agent-work/sessions/${id}`);
    const durableAgentDefinitionKey = rootAgentDefinitionKey(nextWorkView);
    if (durableAgentDefinitionKey) pinDurableInteractionAgent(durableAgentDefinitionKey);
    setWorkView(nextWorkView);
    setWorkViewError(null);
    return nextWorkView;
  }, []);
  const refresh = useCallback(async (id = sessionId) => {
    if (!id) return;
    try {
      await loadWorkView(id);
    } catch {
      setWorkViewError('Unable to load durable work. Refresh durable work to retry.');
    }
  }, [loadWorkView, sessionId]);

  useEffect(() => {
    if (sessionId === observedSessionId.current) return;
    observedSessionId.current = sessionId;
    setWorkView(null);
    if (!sessionId || queuedPrompt) return;
    void refresh(sessionId);
  }, [queuedPrompt, refresh, sessionId]);

  const rootTask = rootAgentTask(workView);
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
    setWorkView(null);
    setWorkViewError(null);
    clearInteractionSession();
  }, []);
  const action = useCallback(async (path: string, body?: unknown) => {
    await apiClient.post(path, body);
    await refresh();
  }, [refresh]);
  const deleteSession = useCallback(async () => {
    if (!sessionId || useInteractionSurfaceState.getState().queuedPrompt) return;
    await apiClient.post(`/api/agent-work/sessions/${sessionId}/delete`);
    setWorkView(null);
    setWorkViewError(null);
    clearInteractionSession();
  }, [sessionId]);
  const reconcileDurableAdmission = useCallback(async (reconciliation: {
    sessionId: string;
    promptId: string;
  }) => {
    const queued = useInteractionSurfaceState.getState().queuedPrompt;
    if (queued?.id !== reconciliation.promptId) return;
    markInteractionPromptSubmitting(reconciliation);
    try {
      const nextWorkView = await loadWorkView(reconciliation.sessionId);
      if (!provesDurableAdmission(nextWorkView, queued)) {
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
  }, [loadWorkView]);
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
  }, [refresh]);
  const retryDurableAdmission = useCallback(() => {
    if (!sessionId || !queuedPrompt || submissionStatus !== 'reconciliation_failed') return;
    void reconcileDurableAdmission({ sessionId, promptId: queuedPrompt.id });
  }, [queuedPrompt, reconcileDurableAdmission, sessionId, submissionStatus]);
  const continueTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId || !task.latestAttempt || !canContinueAgentWorkTask(task)) return;
    void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, {
      predecessorAttemptId: task.latestAttempt.id,
      prompt: draft.trim() || 'Continue the durable work with the current state.',
    });
  }, [action, draft, sessionId]);
  const reopenTask = useCallback((task: AgentWorkTask) => {
    if (!sessionId || !task.latestAttempt || !canReopenAgentWorkTask(task)) return;
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
    if (!sessionId || !task.approval || task.approval.status !== 'pending') return;
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
      && workView?.tasks.length
      && workView.tasks.every((task) => task.status !== 'open'),
    ),
    canStart: Boolean(
      agentDefinitionKey
      && draft.trim()
      && ['idle', 'retry_ready'].includes(submissionStatus)
      && (!sessionId || isLiveAgentWorkAttempt(rootTask?.latestAttempt ?? null)),
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
    workView,
    workViewError,
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
  workView: AgentWorkView | null,
): AgentWorkTask | null {
  return workView?.tasks.find((task) => task.parentTaskId === null) ?? null;
}

function rootAgentDefinitionKey(
  workView: AgentWorkView | null,
): InteractionAgentDefinitionKey | null {
  const agentDefinitionKey = rootAgentTask(workView)?.agentDefinitionKey;
  return isInteractionAgentDefinitionKey(agentDefinitionKey) ? agentDefinitionKey : null;
}

function provesDurableAdmission(
  workView: AgentWorkView,
  prompt: QueuedInteractionPrompt,
): boolean {
  return prompt.createdSession && Boolean(workView.session.id);
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

export function isLiveAgentWorkAttempt(attempt: AgentWorkAttempt | null): boolean {
  return Boolean(attempt && ['starting', 'running'].includes(attempt.status));
}

export function canContinueAgentWorkTask(task: AgentWorkTask): boolean {
  return task.status !== 'cancelled' && Boolean(task.latestAttempt) && !isLiveAgentWorkAttempt(task.latestAttempt);
}

export function canReopenAgentWorkTask(task: AgentWorkTask): boolean {
  return task.status === 'cancelled' && Boolean(task.latestAttempt) && !isLiveAgentWorkAttempt(task.latestAttempt);
}

function displayAgentName(agentDefinitionKey: InteractionAgentDefinitionKey): string {
  return agentDefinitionKey
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
