'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ComponentProps,
} from 'react';
import {
  CopilotChat,
  UseAgentUpdate,
  useAgent,
  type CopilotChatViewProps,
} from '@copilotkit/react-core/v2';
import { InteractionHeader } from './InteractionHeader';
import { useInteractionBootstrap } from './useInteractionBootstrap';
import { useInteractionStore } from './interaction-store';
import { useKidItemConversation } from './useKidItemConversation';

const SubmissionContext = createContext<(() => void) | null>(null);

const ManagedChatView = Object.assign(function ManagedChatView(props: CopilotChatViewProps) {
  const markSubmitted = useContext(SubmissionContext);
  const draft = useInteractionStore((state) => state.draft);
  const setDraft = useInteractionStore((state) => state.setDraft);
  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    markSubmitted?.();
    setDraft('');
    props.onSubmitMessage?.(value);
  }, [markSubmitted, props.onSubmitMessage, setDraft]);

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

export function AgentInteractionSurface(props: ComponentProps<'section'>) {
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
  ...props
}: Omit<ComponentProps<'section'>, 'onError'> & {
  bootstrap: NonNullable<ReturnType<typeof useInteractionBootstrap>['data']>;
  errorMessage: string | null;
  onError: (message: string) => void;
}) {
  const conversation = useKidItemConversation(bootstrap);
  const { agent, isReady } = useAgent({
    agentId: conversation.agentId,
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const connectionLabel = errorMessage
    ? '연결 오류'
    : agent.isRunning
      ? '실행 중'
      : isReady
        ? '연결됨'
        : '연결 중';

  return (
    <section {...props} className={`flex min-h-0 flex-1 flex-col ${props.className ?? ''}`}>
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
      <SubmissionContext.Provider value={conversation.markSubmitted}>
        <CopilotChat
          agentId={conversation.agentId}
          threadId={conversation.threadId}
          chatView={ManagedChatView}
          onError={(event) => {
            if ('error' in event) onError(event.error.message);
          }}
          className="min-h-0 flex-1"
        />
      </SubmissionContext.Provider>
    </section>
  );
}
