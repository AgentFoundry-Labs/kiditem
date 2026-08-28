'use client';

import type { ReactNode } from 'react';
import { AgentConversationComposer } from './AgentConversationComposer';
import { AgentConversationMessage } from './AgentConversationMessage';
import { ConversationEvidenceRail } from './ConversationEvidenceRail';
import { conversationContextFor } from './conversation-context.catalog';
import { useConversationRuntime } from './ConversationRuntimeHost';

/** Shared message lane, idle guidance, cards, and compact composer. */
export function ConversationFlow({
  supplementalContent,
  emptyState,
}: {
  supplementalContent?: ReactNode;
  emptyState?: ReactNode;
}) {
  const runtime = useConversationRuntime();
  const context = conversationContextFor(
    runtime.activeConversation?.agentKey ?? runtime.draft?.agentKey ?? null,
  );
  const idleContent = runtime.messages.length === 0 ? emptyState : null;

  if (!runtime.conversationId) {
    return idleContent || supplementalContent ? (
      <section aria-label="대화 메시지" className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
        {idleContent}
        {supplementalContent ? <ConversationEvidenceRail>{supplementalContent}</ConversationEvidenceRail> : null}
      </section>
    ) : null;
  }
  const draftHasExplicitPair = Boolean(runtime.draft?.model || runtime.draft?.reasoningEffort);
  const initialModel = draftHasExplicitPair
    ? runtime.draft?.model ?? null
    : runtime.turnPreference.model;
  const initialReasoningEffort = draftHasExplicitPair
    ? runtime.draft?.reasoningEffort ?? null
    : runtime.turnPreference.reasoningEffort;
  const evidenceContent = supplementalContent
    ? <ConversationEvidenceRail>{supplementalContent}</ConversationEvidenceRail>
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="대화 메시지" className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {idleContent}
        {runtime.messages.map((message, index) => (
          <AgentConversationMessage
            key={message.id}
            message={message}
            contextLabel={context.label}
            showIdentity={message.role === 'assistant' && runtime.messages[index - 1]?.role !== 'assistant'}
          />
        ))}
        {evidenceContent}
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
        isRunning={runtime.isRunning}
        onStart={runtime.start}
        onInterrupt={runtime.interrupt}
        onUpdateDraft={runtime.isDraft ? runtime.updateDraft : undefined}
      />
    </div>
  );
}
