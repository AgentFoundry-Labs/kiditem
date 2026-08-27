'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { ConversationCombinedSelector } from './ConversationCombinedSelector';
import { isSupportedConversationPair } from './conversation-preference-selection';
import type { ConversationRuntime, GatewayReadiness } from './conversation-api';

type DraftPatch = {
  provider?: ConversationRuntime | null;
  model?: string | null;
  reasoningEffort?: string | null;
  message?: string;
};

type PendingAction = 'launch' | 'interrupt' | null;

export function AgentConversationComposer({
  conversationId,
  contextLabel,
  placeholder,
  runtime,
  readiness,
  initialMessage,
  initialModel,
  initialReasoningEffort,
  needsReview = false,
  isDraft,
  isRunning,
  onStart,
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
  needsReview?: boolean;
  isDraft: boolean;
  isRunning: boolean;
  onStart(input: { message: string; model: string; reasoningEffort: string }): Promise<void>;
  onInterrupt(): Promise<void>;
  onUpdateDraft?(patch: DraftPatch): void;
  onRetry?(): void;
}) {
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const [message, setMessage] = useState(initialMessage ?? '');
  const [model, setModel] = useState<string | null>(initialModel ?? null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(initialReasoningEffort ?? null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedMessageIdentity = useRef<string | null>(null);
  const lastInitialMessageRef = useRef<string | undefined>(initialMessage);
  const locallyDispatchedMessageRef = useRef<string | undefined>(undefined);
  const messageIdentity = `${conversationId}:${isDraft ? 'draft' : 'conversation'}`;
  const launchPending = pendingAction === 'launch' && !isRunning;
  const interruptPending = pendingAction === 'interrupt';
  const selectorDisabled = isRunning || pendingAction !== null;
  const messageDisabled = launchPending || interruptPending;
  const pairSupported = useMemo(() => isSupportedConversationPair({
    runtime,
    model,
    reasoningEffort,
    readiness,
  }), [model, readiness, reasoningEffort, runtime]);
  const selectionNeedsReview = Boolean(
    needsReview && model && reasoningEffort && !pairSupported,
  );
  const canStart = Boolean(message.trim() && runtime && pairSupported && !isRunning && !pendingAction);

  useEffect(() => {
    if (initializedMessageIdentity.current === messageIdentity) {
      if (
        isDraft
        && pendingAction === null
        && initialMessage !== lastInitialMessageRef.current
      ) {
        const isLocalDraftEcho = initialMessage === locallyDispatchedMessageRef.current;
        lastInitialMessageRef.current = initialMessage;
        locallyDispatchedMessageRef.current = undefined;
        if (!isLocalDraftEcho) setMessage(initialMessage ?? '');
      }
      return;
    }
    const wasPromoted = initializedMessageIdentity.current === `${conversationId}:draft` && !isDraft;
    initializedMessageIdentity.current = messageIdentity;
    if (wasPromoted) return;
    lastInitialMessageRef.current = initialMessage;
    locallyDispatchedMessageRef.current = undefined;
    setMessage(initialMessage ?? '');
    setError(null);
  }, [conversationId, initialMessage, isDraft, messageIdentity, pendingAction]);
  useEffect(() => {
    setModel(initialModel ?? null);
    setReasoningEffort(initialReasoningEffort ?? null);
  }, [conversationId, initialModel, initialReasoningEffort]);
  useEffect(() => {
    if (!isDraft) return;
    messageRef.current?.focus();
  }, [conversationId, isDraft]);
  useEffect(() => {
    const textarea = messageRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 240)}px`;
  }, [message]);

  const updateMessage = (nextMessage: string) => {
    if (isDraft) locallyDispatchedMessageRef.current = nextMessage;
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
    if (!canStart) return;
    const action = 'launch';
    const submittedMessage = message.trim();
    setPendingAction(action);
    setError(null);
    setMessage('');
    try {
      await onStart({
        message: submittedMessage,
        model: model ?? '',
        reasoningEffort: reasoningEffort ?? '',
      });
    } catch {
      if (!messageRef.current?.value) updateMessage(submittedMessage);
      setError('선택한 대화 엔진을 현재 사용할 수 없습니다.');
    } finally {
      setPendingAction((current) => current === action ? null : current);
    }
  };
  const interrupt = async () => {
    if (!isRunning || interruptPending) return;
    setPendingAction('interrupt');
    setError(null);
    try {
      await onInterrupt();
    } catch {
      setError('대화를 중단할 수 없습니다.');
    } finally {
      setPendingAction((current) => current === 'interrupt' ? null : current);
    }
  };

  return (
    <form
      className="sticky bottom-0 bg-card px-4 py-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="conversation-composer-surface mx-auto w-full max-w-3xl rounded-[28px] border border-input bg-card p-2 shadow-sm">
        {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error}</p> : null}
        {selectionNeedsReview ? <p role="alert" className="mb-2 text-sm text-amber-700">선택한 모델과 추론 수준을 다시 선택해 주세요.</p> : null}
        {runtime && readiness === null ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
            <span>선택한 대화 엔진을 현재 사용할 수 없습니다.</span>
            {onRetry ? <button type="button" onClick={onRetry} className="rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">다시 시도</button> : null}
          </div>
        ) : null}
        <div className="conversation-composer-layout flex items-end gap-2">
          <label className="sr-only" htmlFor="agent-conversation-message">{contextLabel} 메시지</label>
          <textarea
            ref={messageRef}
            id="agent-conversation-message"
            maxLength={16_000}
            value={message}
            onChange={(event) => updateMessage(event.target.value)}
            disabled={messageDisabled}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || isComposing || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void submit();
            }}
            placeholder={placeholder}
            rows={1}
            className="conversation-composer-input min-h-[52px] min-w-0 flex-1 resize-none bg-card px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
          <div className="conversation-composer-actions flex min-w-0 flex-1 items-center gap-1">
            <ConversationCombinedSelector
              runtime={runtime}
              readiness={readiness}
              model={model}
              reasoningEffort={reasoningEffort}
              providerEditable={isDraft}
              disabled={selectorDisabled}
              needsReview={selectionNeedsReview}
              onRuntimeChange={updateRuntime}
              onModelChange={updateModel}
              onReasoningEffortChange={updateReasoningEffort}
            />
            {isRunning ? (
              <button
                type="button"
                aria-label="대화 중단"
                onClick={() => void interrupt()}
                disabled={interruptPending}
                className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-input bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 max-lg:min-w-11"
              >
                <Square aria-hidden="true" size={16} />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="보내기"
                disabled={!canStart}
                className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 max-lg:min-w-11"
              >
                <Send aria-hidden="true" size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
