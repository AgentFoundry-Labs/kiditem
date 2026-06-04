'use client';

import { FormEvent, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOsArtifact, AgentOsMessage } from '../lib/agent-os-types';
import { AgentResultCard } from './AgentResultCard';

function roleLabel(role: AgentOsMessage['role']): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Operator';
  if (role === 'tool') return 'Tool';
  return 'System';
}

export function OperatorChatPanel({
  messages,
  artifacts,
  selectedConversationId,
  className,
  sending = false,
  draftPending = false,
  onCreateDraft,
  onSend,
}: {
  messages: AgentOsMessage[];
  artifacts: AgentOsArtifact[];
  selectedConversationId: string | null;
  className?: string;
  sending?: boolean;
  draftPending?: boolean;
  onCreateDraft: (artifactId: string) => void;
  onSend: (content: string) => void;
}) {
  const [content, setContent] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setContent('');
  }

  return (
    <main
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-white', className)}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
        <div>
          <h2 className="text-sm font-bold text-slate-950">Operator Chat</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sourcing · Listing · Supply
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          {messages.length === 0 && artifacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
              새 Operator 세션
            </div>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={cn(
                  'max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6',
                  isUser
                    ? 'self-end bg-sky-500 text-white'
                    : 'self-start border border-slate-200 bg-white text-slate-700 shadow-sm',
                )}
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {roleLabel(message.role)}
                </div>
                {message.content}
              </div>
            );
          })}

          {artifacts.map((artifact) => (
            <AgentResultCard
              key={artifact.id}
              artifact={artifact}
              draftPending={draftPending}
              onCreateDraft={onCreateDraft}
            />
          ))}
        </div>
      </div>

      <form
        onSubmit={submit}
        className="shrink-0 border-t border-slate-200 bg-white px-4 py-3"
      >
        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-11 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-400"
            placeholder="시장 기회나 카테고리를 요청하세요"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sky-200 text-sky-600 hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="전송"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </main>
  );
}
