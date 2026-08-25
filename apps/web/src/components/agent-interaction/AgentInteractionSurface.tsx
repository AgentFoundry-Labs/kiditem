'use client';

import { useEffect, useRef, type ComponentProps } from 'react';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { AgentInteractionTaskList } from './AgentInteractionTaskList';
import { useAgentInteraction } from './useAgentInteraction';
import type {
  InteractionAgentDefinitionKey,
  QueuedInteractionPrompt,
} from './interaction-surface-state';
import type { DurableWorkAdmission } from './useAgentInteraction';

/**
 * Durable Work renderer. The interaction UI Module owns context, session
 * coordination, projection, and Agent Work actions; CopilotKit stays a local
 * Adapter for future-only in-memory messages.
 */
export function AgentInteractionSurface({
  surface = 'global_panel',
  ...props
}: ComponentProps<'section'> & { surface?: 'global_panel' | 'workspace' }) {
  const interaction = useAgentInteraction();
  const liveAgentDefinitionKey = interaction.queuedPrompt?.agentDefinitionKey
    ?? interaction.agentDefinitionKey;

  return (
    <section
      {...props}
      data-interaction-agent={interaction.agentDefinitionKey ?? 'resolving'}
      data-interaction-surface={surface}
      className={`flex min-h-0 flex-1 flex-col gap-3 ${props.className ?? ''}`}
    >
      <h1 className="text-lg font-semibold">{interaction.agentLabel} work</h1>
      <p className="text-sm text-muted-foreground">
        Refresh loads durable tasks and attempts; past chat is never replayed.
      </p>
      <div className="flex gap-2">
        <input
          value={interaction.draft}
          onChange={(event) => interaction.setDraft(event.target.value)}
          placeholder={`Ask ${interaction.agentLabel} to begin work`}
          disabled={interaction.isSubmissionRecoveryPending}
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="button"
          onClick={interaction.start}
          disabled={!interaction.canStart}
          className="rounded bg-primary px-3 py-2 text-primary-foreground"
        >
          {interaction.sessionId ? 'Send follow-up' : 'Start'}
        </button>
        {interaction.sessionId ? (
          <button
            type="button"
            onClick={interaction.newTask}
            disabled={Boolean(interaction.queuedPrompt)}
            className="rounded border px-3 py-2"
          >
            New task
          </button>
        ) : null}
      </div>
      {interaction.sessionId ? (
        <>
          {liveAgentDefinitionKey ? (
            <LiveFutureAgent
              key={`${interaction.sessionId}:${liveAgentDefinitionKey}`}
              threadId={interaction.sessionId}
            agentDefinitionKey={liveAgentDefinitionKey}
            queuedPrompt={interaction.queuedPrompt}
            submissionStatus={interaction.submissionStatus}
            onSubmitting={(promptId) => interaction.markPromptSubmitting({
              sessionId: interaction.sessionId!,
              promptId,
            })}
            onAdmission={(promptId, admission) => interaction.onLiveAdmission({
              sessionId: interaction.sessionId!,
              promptId,
              admission,
            })}
            onFinished={(promptId) => interaction.onLiveRunFinished(interaction.sessionId!, promptId)}
          />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Loading durable agent identity…
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void interaction.refresh()}
              className="rounded border px-3 py-1"
            >
              Refresh durable work
            </button>
            {interaction.canDeleteSession ? (
              <button
                type="button"
                onClick={() => void interaction.deleteSession()}
                className="rounded border px-3 py-1"
              >
                Delete terminal session
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {interaction.submissionError ? (
        <div role="alert" className="rounded border border-destructive/40 p-2 text-sm text-destructive">
          <p>{interaction.submissionError}</p>
          {interaction.submissionStatus === 'reconciliation_failed' ? (
            <button
              type="button"
              onClick={() => interaction.retryDurableAdmission()}
              className="mt-2 rounded border px-3 py-1"
            >
              Retry durable admission check
            </button>
          ) : null}
        </div>
      ) : null}
      {interaction.projectionError ? (
        <div role="alert" className="rounded border border-destructive/40 p-2 text-sm text-destructive">
          {interaction.projectionError}
        </div>
      ) : null}
      <AgentInteractionTaskList
        tasks={interaction.projection?.tasks ?? []}
        onContinue={interaction.continueTask}
        onReopen={interaction.reopenTask}
        onInterrupt={interaction.interruptTask}
        onCancel={interaction.cancelTask}
        onApproval={interaction.decideApproval}
      />
    </section>
  );
}

function LiveFutureAgent({
  threadId,
  agentDefinitionKey,
  queuedPrompt,
  submissionStatus,
  onSubmitting,
  onAdmission,
  onFinished,
}: {
  threadId: string;
  agentDefinitionKey: InteractionAgentDefinitionKey;
  queuedPrompt: QueuedInteractionPrompt | null;
  submissionStatus: 'idle' | 'queued' | 'submitting' | 'reconciliation_failed' | 'retry_ready';
  onSubmitting(promptId: string): void;
  onAdmission(promptId: string, admission: DurableWorkAdmission): void;
  onFinished(promptId: string): void;
}) {
  const { agent, isReady } = useAgent({
    agentId: agentDefinitionKey,
    runtimeAgentId: agentDefinitionKey,
    threadId,
  });
  const { copilotkit } = useCopilotKit();
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    if (
      !queuedPrompt
      || submissionStatus !== 'queued'
      || !isReady
      || submitted.current === queuedPrompt.id
    ) return;
    submitted.current = queuedPrompt.id;
    onSubmitting(queuedPrompt.id);
    const subscription = agent.subscribe({
      onCustomEvent: ({ event }) => {
        const admission = durableWorkAdmission(event);
        if (admission) onAdmission(queuedPrompt.id, admission);
      },
    });
    installQueuedUserMessage(agent, queuedPrompt);
    void copilotkit.runAgent({ agent }).then(
      () => onFinished(queuedPrompt.id),
      () => onFinished(queuedPrompt.id),
    ).finally(() => subscription.unsubscribe()).catch(() => undefined);
  }, [agent, copilotkit, isReady, onAdmission, onFinished, onSubmitting, queuedPrompt, submissionStatus]);

  return (
    <ul aria-label={`Live ${displayAgentName(agentDefinitionKey)} output`} className="space-y-1">
      {agent.messages.map((message) => (
        <li key={message.id} data-live-message-role={message.role} className="text-sm">
          {typeof message.content === 'string' ? message.content : ''}
        </li>
      ))}
    </ul>
  );
}

function installQueuedUserMessage(
  agent: ReturnType<typeof useAgent>['agent'],
  queuedPrompt: QueuedInteractionPrompt,
): void {
  const message = {
    id: queuedPrompt.messageCommandKey,
    role: 'user' as const,
    content: queuedPrompt.text,
  };
  const existing = agent.messages.find((candidate) => candidate.id === message.id);
  if (!existing) {
    agent.addMessage(message);
    return;
  }
  const finalMessage = agent.messages.at(-1);
  if (
    finalMessage?.id === message.id
    && finalMessage.role === message.role
    && finalMessage.content === message.content
  ) return;
  agent.setMessages([
    ...agent.messages.filter((candidate) => candidate.id !== message.id),
    message,
  ]);
}

function displayAgentName(agentDefinitionKey: InteractionAgentDefinitionKey): string {
  return agentDefinitionKey
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function durableWorkAdmission(event: unknown): DurableWorkAdmission | null {
  if (!isRecord(event) || event.type !== 'CUSTOM' || event.name !== 'kiditem.agent_work_admission') {
    return null;
  }
  const value = event.value;
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (
    (kind !== 'live_input' && kind !== 'root' && kind !== 'successor')
    || typeof value.sessionId !== 'string'
    || typeof value.taskId !== 'string'
    || typeof value.attemptId !== 'string'
  ) return null;
  return {
    kind,
    sessionId: value.sessionId,
    taskId: value.taskId,
    attemptId: value.attemptId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
