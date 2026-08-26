'use client';

import { useState } from 'react';
import { AgentConversationComposer } from './AgentConversationComposer';
import { AgentConversationMessage } from './AgentConversationMessage';
import { useConversationRuntime, type ToolProjection } from './ConversationRuntimeHost';

/** Shared message lane and composer presentation over the route-stable runtime. */
export function ConversationFlow() {
  const runtime = useConversationRuntime();
  const [initialDraft] = useState(() => runtime.isDraft ? runtime.draft?.message ?? '' : '');
  const label = runtime.activeConversation?.title
    ?? draftLabel(runtime.draft?.message)
    ?? 'New conversation';

  if (!runtime.conversationId) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="Conversation messages" className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {runtime.historyLoading ? <p role="status" className="text-sm text-muted-foreground">Loading provider history…</p> : null}
        {runtime.historyError ? <p role="alert" className="text-sm text-destructive">Provider history could not be loaded.</p> : null}
        {runtime.historyMessages.map((message) => <AgentConversationMessage key={message.id} message={message} />)}
        {runtime.liveMessages.map((message) => <AgentConversationMessage key={`live-${message.id}`} message={message} live />)}
        <ToolStatusCards projections={runtime.toolProjections} />
        {runtime.turnEnded ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{runtime.turnEnded}</p> : null}
      </section>
      {runtime.runtime ? (
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <AgentConversationComposer
            label={label}
            runtime={runtime.runtime}
            readiness={runtime.readiness}
            initialDraft={initialDraft}
            activeTurnId={runtime.activeTurnId}
            onStart={runtime.start}
            onInput={runtime.sendInput}
            onInterrupt={runtime.interrupt}
          />
        </div>
      ) : (
        <p role="status" className="mx-auto w-full max-w-3xl border-t px-4 py-4 text-sm text-muted-foreground sm:px-6">
          Choose a provider runtime before sending the first message.
        </p>
      )}
    </div>
  );
}

function ToolStatusCards({ projections }: { projections: ToolProjection[] }) {
  if (!projections.length) return null;
  return (
    <section aria-label="Live provider tool details" className="space-y-2">
      {projections.map((projection) => (
        <article key={projection.id} className="rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">{projection.title}</p>
          {projection.detail ? <p className="mt-1 text-muted-foreground">{projection.detail}</p> : null}
        </article>
      ))}
    </section>
  );
}

function draftLabel(message: string | undefined): string | null {
  const normalized = message?.trim();
  return normalized || null;
}
