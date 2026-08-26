'use client';

import { AgentConversationComposer } from './AgentConversationComposer';
import { AgentConversationMessage } from './AgentConversationMessage';
import { conversationContextFor } from './conversation-context.catalog';
import { useConversationRuntime, type ToolProjection } from './ConversationRuntimeHost';

/** Shared message lane, live projections, cards, and compact composer. */
export function ConversationFlow() {
  const runtime = useConversationRuntime();
  const context = conversationContextFor(
    runtime.activeConversation?.agentKey ?? runtime.draft?.agentKey ?? null,
  );

  if (!runtime.conversationId) return null;
  const draftHasExplicitPair = Boolean(runtime.draft?.model || runtime.draft?.reasoningEffort);
  const initialModel = draftHasExplicitPair
    ? runtime.draft?.model ?? null
    : runtime.turnPreference.model;
  const initialReasoningEffort = draftHasExplicitPair
    ? runtime.draft?.reasoningEffort ?? null
    : runtime.turnPreference.reasoningEffort;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="대화 메시지" className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {runtime.historyLoading ? <p role="status" className="text-sm text-muted-foreground">대화 기록을 불러오는 중입니다.</p> : null}
        {runtime.historyError ? <p role="alert" className="text-sm text-destructive">대화 기록을 불러올 수 없습니다.</p> : null}
        {runtime.historyMessages.map((message) => <AgentConversationMessage key={message.id} message={message} />)}
        {runtime.liveMessages.map((message) => <AgentConversationMessage key={`live-${message.id}`} message={message} live />)}
        <ToolStatusCards projections={runtime.toolProjections} />
        {runtime.turnEnded ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{runtime.turnEnded}</p> : null}
      </section>
      <AgentConversationComposer
        conversationId={runtime.conversationId}
        contextLabel={context.label}
        placeholder={context.placeholder}
        runtime={runtime.runtime}
        readiness={runtime.readiness}
        initialMessage={runtime.isDraft ? runtime.draft?.message : undefined}
        initialModel={initialModel}
        initialReasoningEffort={initialReasoningEffort}
        needsReview={runtime.turnPreference.needsReview}
        isDraft={runtime.isDraft}
        activeTurnId={runtime.activeTurnId}
        onStart={runtime.start}
        onInput={runtime.sendInput}
        onInterrupt={runtime.interrupt}
        onUpdateDraft={runtime.isDraft ? runtime.updateDraft : undefined}
        onRetry={runtime.retryReadiness}
      />
    </div>
  );
}

function ToolStatusCards({ projections }: { projections: ToolProjection[] }) {
  if (!projections.length) return null;
  return (
    <section aria-label="실시간 도구 정보" className="space-y-2">
      {projections.map((projection) => (
        <article key={projection.id} className="rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">{projection.title}</p>
          {projection.detail ? <p className="mt-1 text-muted-foreground">{projection.detail}</p> : null}
        </article>
      ))}
    </section>
  );
}
