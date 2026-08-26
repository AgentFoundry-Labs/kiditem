'use client';

import { Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationCombinedSelector, isSupportedConversationPair } from './ConversationCombinedSelector';
import type { ConversationRuntime, GatewayReadiness } from './conversation-api';

type DraftPatch = {
  provider?: ConversationRuntime | null;
  model?: string | null;
  reasoningEffort?: string | null;
  message?: string;
};

export function AgentConversationComposer({
  conversationId,
  contextLabel,
  placeholder,
  runtime,
  readiness,
  initialMessage,
  initialModel,
  initialReasoningEffort,
  isDraft,
  activeTurnId,
  onStart,
  onInput,
  onInterrupt,
  onUpdateDraft,
  onRetry,
}: {
  conversationId: string;
  contextLabel: string;
  placeholder: string;
  runtime: ConversationRuntime | null;
  readiness: GatewayReadiness[] | null | undefined;
  initialMessage?: string;
  initialModel?: string | null;
  initialReasoningEffort?: string | null;
  isDraft: boolean;
  activeTurnId: string | null;
  onStart(input: { message: string; model: string; reasoningEffort: string }): Promise<void>;
  onInput(message: string): Promise<void>;
  onInterrupt(): Promise<void>;
  onUpdateDraft?(patch: DraftPatch): void;
  onRetry?(): void;
}) {
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const [message, setMessage] = useState(initialMessage ?? '');
  const [model, setModel] = useState<string | null>(initialModel ?? null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(initialReasoningEffort ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairSupported = useMemo(() => isSupportedConversationPair({
    runtime,
    model,
    reasoningEffort,
    readiness,
  }), [model, readiness, reasoningEffort, runtime]);
  const needsReview = Boolean((model || reasoningEffort) && !pairSupported);
  const canStart = Boolean(message.trim() && runtime && pairSupported && !submitting);
  const canInput = Boolean(message.trim() && activeTurnId && !submitting);

  useEffect(() => {
    setMessage(initialMessage ?? '');
    setModel(initialModel ?? null);
    setReasoningEffort(initialReasoningEffort ?? null);
    setError(null);
  }, [conversationId]); // A new selection is the only time local composer state is replaced.
  useEffect(() => {
    if (!isDraft) return;
    messageRef.current?.focus();
  }, [conversationId, isDraft]);
  useEffect(() => {
    const textarea = messageRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 80), 240)}px`;
  }, [message]);

  const updateMessage = (nextMessage: string) => {
    setMessage(nextMessage);
    if (isDraft) onUpdateDraft?.({ message: nextMessage });
  };
  const updateRuntime = (nextRuntime: ConversationRuntime | null) => {
    if (!isDraft) return;
    setModel(null);
    setReasoningEffort(null);
    onUpdateDraft?.({ provider: nextRuntime, model: null, reasoningEffort: null });
  };
  const updateModel = (nextModel: string | null) => {
    setModel(nextModel);
    if (isDraft) onUpdateDraft?.({ model: nextModel });
  };
  const updateReasoningEffort = (nextReasoningEffort: string | null) => {
    setReasoningEffort(nextReasoningEffort);
    if (isDraft) onUpdateDraft?.({ reasoningEffort: nextReasoningEffort });
  };
  const submit = async () => {
    if (!(activeTurnId ? canInput : canStart)) return;
    setSubmitting(true);
    setError(null);
    try {
      if (activeTurnId) await onInput(message.trim());
      else await onStart({
        message: message.trim(),
        model: model ?? '',
        reasoningEffort: reasoningEffort ?? '',
      });
      updateMessage('');
    } catch {
      setError(activeTurnId ? '메시지를 보낼 수 없습니다.' : '선택한 대화 엔진을 현재 사용할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };
  const interrupt = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onInterrupt();
    } catch {
      setError('대화를 중단할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-card p-3 shadow-sm">
        {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error}</p> : null}
        {needsReview ? <p role="alert" className="mb-2 text-sm text-amber-700">선택한 모델과 사고 수준을 다시 선택해 주세요.</p> : null}
        {runtime && readiness === null ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
            <span>선택한 대화 엔진을 현재 사용할 수 없습니다.</span>
            {onRetry ? <button type="button" onClick={onRetry} className="rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">다시 시도</button> : null}
          </div>
        ) : null}
        <label className="sr-only" htmlFor="agent-conversation-message">{contextLabel} 메시지</label>
        <textarea
          ref={messageRef}
          id="agent-conversation-message"
          maxLength={16_000}
          value={message}
          onChange={(event) => updateMessage(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || isComposing || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void submit();
          }}
          placeholder={placeholder}
          rows={2}
          className="min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch">
          <ConversationCombinedSelector
            runtime={runtime}
            readiness={readiness}
            model={model}
            reasoningEffort={reasoningEffort}
            providerEditable={isDraft}
            disabled={Boolean(activeTurnId)}
            needsReview={needsReview}
            onRuntimeChange={updateRuntime}
            onModelChange={updateModel}
            onReasoningEffortChange={updateReasoningEffort}
          />
          {activeTurnId ? (
            <button
              type="button"
              aria-label="대화 중단"
              onClick={() => void interrupt()}
              disabled={submitting}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 max-lg:min-w-11"
            >
              <Square aria-hidden="true" size={16} />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="보내기"
              disabled={!canStart}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 max-lg:min-w-11"
            >
              <Send aria-hidden="true" size={17} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
