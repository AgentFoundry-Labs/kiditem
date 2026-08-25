'use client';

import { useEffect, useRef, type ComponentProps } from 'react';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { AgentInteractionTaskList } from './AgentInteractionTaskList';
import { useAgentInteraction } from './useAgentInteraction';
import type {
  InteractionAgentDefinitionKey,
  QueuedInteractionPrompt,
} from './interaction-surface-state';

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
          <button type="button" onClick={interaction.newTask} className="rounded border px-3 py-2">
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
              onConsumed={interaction.consumeQueuedPrompt}
              onFinished={() => interaction.onLiveRunFinished(interaction.sessionId!)}
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
  onConsumed,
  onFinished,
}: {
  threadId: string;
  agentDefinitionKey: InteractionAgentDefinitionKey;
  queuedPrompt: QueuedInteractionPrompt | null;
  onConsumed(promptId: string): void;
  onFinished(): void;
}) {
  const { agent, isReady } = useAgent({
    agentId: agentDefinitionKey,
    runtimeAgentId: agentDefinitionKey,
    threadId,
  });
  const { copilotkit } = useCopilotKit();
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    if (!queuedPrompt || !isReady || submitted.current === queuedPrompt.id) return;
    submitted.current = queuedPrompt.id;
    onConsumed(queuedPrompt.id);
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: queuedPrompt.text });
    void copilotkit.runAgent({ agent }).finally(onFinished);
  }, [agent, copilotkit, isReady, onConsumed, onFinished, queuedPrompt]);

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

function displayAgentName(agentDefinitionKey: InteractionAgentDefinitionKey): string {
  return agentDefinitionKey
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
