'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  UseAgentUpdate,
  useAgent,
  type CopilotChatViewProps,
} from '@copilotkit/react-core/v2';
import { InteractionHeader } from './InteractionHeader';
import { useInteractionBootstrap } from './useInteractionBootstrap';
import { useInteractionStore } from './interaction-store';
import { useKidItemConversation } from './useKidItemConversation';
import { InteractionRegistration } from './interaction-registration';
import { findLatestEligibleSuggestion } from './suggestion-eligibility';
import { OfficialInteractionInterrupts } from './OfficialInteractionRenderers';

type InteractionSurface = 'global_panel' | 'agentos_workspace';

const SubmissionContext = createContext<{
  markSubmitted: () => void;
  registerSend: (send: ((content: string) => void) | null) => void;
  threadId: string;
} | null>(null);

const ManagedChatView = Object.assign(function ManagedChatView(props: CopilotChatViewProps) {
  const markSubmitted = useContext(SubmissionContext);
  const draft = useInteractionStore((state) => state.draft);
  const setDraft = useInteractionStore((state) => state.setDraft);
  const consumeLatestSuggestions = useInteractionStore((state) => state.consumeLatestSuggestions);
  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    if (markSubmitted) consumeLatestSuggestions(markSubmitted.threadId);
    markSubmitted?.markSubmitted();
    setDraft('');
    props.onSubmitMessage?.(value);
  }, [consumeLatestSuggestions, markSubmitted, props.onSubmitMessage, setDraft]);
  useEffect(() => {
    markSubmitted?.registerSend(handleSubmit);
    return () => markSubmitted?.registerSend(null);
  }, [handleSubmit, markSubmitted]);

  return (
    <CopilotChat.View
      {...props}
      inputValue={draft}
      onInputChange={setDraft}
      onSubmitMessage={handleSubmit}
    />
  );
}, {
  ScrollView: CopilotChat.View.ScrollView,
  ScrollToBottomButton: CopilotChat.View.ScrollToBottomButton,
  Feather: CopilotChat.View.Feather,
  WelcomeMessage: CopilotChat.View.WelcomeMessage,
  WelcomeScreen: CopilotChat.View.WelcomeScreen,
});

export function AgentInteractionSurface({
  surface = 'global_panel',
  ...props
}: ComponentProps<'section'> & { surface?: InteractionSurface }) {
  const bootstrapQuery = useInteractionBootstrap();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (bootstrapQuery.isLoading) {
    return <section {...props} aria-busy="true">대화를 준비하고 있습니다.</section>;
  }
  if (bootstrapQuery.isError || !bootstrapQuery.data) {
    return <section {...props} role="alert">대화를 불러오지 못했습니다.</section>;
  }

  return (
    <ReadyInteractionSurface
      {...props}
      surface={surface}
      bootstrap={bootstrapQuery.data}
      errorMessage={errorMessage}
      onError={setErrorMessage}
    />
  );
}

function ReadyInteractionSurface({
  bootstrap,
  errorMessage,
  onError,
  surface,
  ...props
}: Omit<ComponentProps<'section'>, 'onError'> & {
  bootstrap: NonNullable<ReturnType<typeof useInteractionBootstrap>['data']>;
  errorMessage: string | null;
  onError: (message: string) => void;
  surface: InteractionSurface;
}) {
  const conversation = useKidItemConversation(bootstrap);

  return (
    <CopilotChatConfigurationProvider
      agentId={conversation.agentId}
      threadId={conversation.threadId}
      hasExplicitThreadId
    >
      <ThreadBoundInteractionSurface
        {...props}
        surface={surface}
        bootstrap={bootstrap}
        conversation={conversation}
        errorMessage={errorMessage}
        onError={onError}
      />
    </CopilotChatConfigurationProvider>
  );
}

function ThreadBoundInteractionSurface({
  bootstrap,
  conversation,
  errorMessage,
  onError,
  surface,
  ...props
}: Omit<ComponentProps<'section'>, 'onError'> & {
  bootstrap: NonNullable<ReturnType<typeof useInteractionBootstrap>['data']>;
  conversation: ReturnType<typeof useKidItemConversation>;
  errorMessage: string | null;
  onError: (message: string) => void;
  surface: InteractionSurface;
}) {
  const sendSuggestedReplyRef = useRef<((content: string) => void) | null>(null);
  const registerSend = useCallback((send: ((content: string) => void) | null) => {
    sendSuggestedReplyRef.current = send;
  }, []);
  const sendSuggestedReply = useCallback((content: string) => {
    sendSuggestedReplyRef.current?.(content);
  }, []);
  const submissionContext = useMemo(() => ({
    markSubmitted: conversation.markSubmitted,
    registerSend,
    threadId: conversation.threadId,
  }), [conversation.markSubmitted, conversation.threadId, registerSend]);
  const { agent, isReady } = useAgent({
    agentId: conversation.agentId,
    updates: [UseAgentUpdate.OnRunStatusChanged, UseAgentUpdate.OnMessagesChanged],
  });
  const toolResultMessages = (agent.messages ?? []).filter((message) => (
    message.role === 'tool' && typeof message.content === 'string'
  ));
  const toolMessageIdByCall = Object.fromEntries(toolResultMessages.flatMap((message) => (
    'toolCallId' in message && typeof message.toolCallId === 'string'
      ? [[message.toolCallId, message.id]]
      : []
  )));
  const latestSuggestionMessageId = findLatestEligibleSuggestion(
    (agent.messages ?? []) as Array<{ id: string; role: string; content?: unknown; toolCallId?: string }>,
  )?.toolMessageId ?? null;
  const connectionLabel = errorMessage
    ? '연결 오류'
    : agent.isRunning
      ? '실행 중'
      : isReady
        ? '연결됨'
        : '연결 중';

  return (
    <section
      {...props}
      data-interaction-surface={surface}
      data-thread-id={conversation.threadId}
      data-session={conversation.session?.name ?? ''}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${props.className ?? ''}`}
    >
      <output aria-label="선택된 대화 식별자" className="sr-only">
        {conversation.session ? `${conversation.session.name}:${conversation.threadId}` : conversation.threadId}
      </output>
      <InteractionHeader
        agents={bootstrap.agents}
        agentId={conversation.agentId}
        agentLocked={conversation.agentLocked}
        sessions={bootstrap.sessions}
        selectedSession={conversation.session}
        connectionLabel={connectionLabel}
        onAgentChange={conversation.selectAgent}
        onNewConversation={conversation.startNewConversation}
        onSessionSelect={conversation.selectSession}
      />
      {errorMessage ? (
        <p role="alert" className="bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <SubmissionContext.Provider value={submissionContext}>
        <OfficialInteractionInterrupts agentId={conversation.agentId} />
        <InteractionRegistration
          onSend={sendSuggestedReply}
          latestSuggestionMessageId={latestSuggestionMessageId}
          toolMessageIdByCall={toolMessageIdByCall}
          threadId={conversation.threadId}
        />
        <CopilotChat
          key={`${conversation.agentId}:${conversation.threadId}`}
          agentId={conversation.agentId}
          threadId={conversation.threadId}
          chatView={ManagedChatView}
          onError={(event) => {
            if ('error' in event) onError(event.error.message);
          }}
          className="h-full min-h-0 flex-1 overflow-hidden"
        />
      </SubmissionContext.Provider>
    </section>
  );
}
