import type { ConversationMessage } from './conversation-api';

export function AgentConversationMessage({ message, live = false }: {
  message: Pick<ConversationMessage, 'id' | 'role' | 'content'>;
  live?: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <article className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-live-message={live || undefined}>
      <div className={`max-w-[85%] px-3 py-2 text-sm leading-6 ${isUser ? 'rounded-xl bg-primary/10 text-foreground' : 'text-foreground'}`}>
        {message.role === 'tool' || message.role === 'status' ? <p className="mb-1 text-xs font-medium opacity-70">{message.role}</p> : null}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </article>
  );
}
