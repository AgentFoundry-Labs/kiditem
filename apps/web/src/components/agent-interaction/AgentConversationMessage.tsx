import { ConversationContextMark } from './ConversationContextMark';
import { ConversationResponseBody } from './ConversationResponseBody';
import type { LiveMessage } from './ConversationRuntimeHost';

export function AgentConversationMessage({ message, contextLabel, live = false, showIdentity = true }: {
  message: Pick<LiveMessage, 'id' | 'role' | 'content'>;
  contextLabel: string;
  live?: boolean;
  showIdentity?: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <article className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-live-message={live || undefined}>
      <div className={`max-w-[min(85%,42rem)] px-4 py-3 text-[15px] leading-6 ${isUser ? 'rounded-[22px] bg-conversation-user text-conversation-user-foreground shadow-sm' : 'w-full bg-card text-foreground'}`}>
        {!isUser && showIdentity ? (
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ConversationContextMark
              contextLabel={contextLabel}
              testId="assistant-identity-marker"
              toneClassName="bg-primary text-primary-foreground"
            />
            {contextLabel}
          </p>
        ) : null}
        {isUser ? <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p> : <ConversationResponseBody content={message.content} />}
      </div>
    </article>
  );
}
