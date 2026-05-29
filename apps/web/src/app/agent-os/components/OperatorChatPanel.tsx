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
  sending = false,
  draftPending = false,
  onCreateDraft,
  onSend,
}: {
  messages: AgentOsMessage[];
  artifacts: AgentOsArtifact[];
  selectedConversationId: string | null;
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
    <main className="flex min-w-0 flex-1 flex-col bg-[#090d16]">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div>
          <h2 className="text-sm font-bold text-white">Operator Chat</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Sourcing · Listing · Supply
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.length === 0 && artifacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm leading-6 text-slate-300">
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
                    ? 'self-end bg-cyan-500 text-white'
                    : 'self-start border border-white/10 bg-[#101827] text-slate-100',
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
        className="border-t border-white/10 bg-[#0c1220] p-4"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-12 flex-1 resize-none rounded-lg border border-white/10 bg-[#090d16] px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
            placeholder="시장 기회나 카테고리를 요청하세요"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-cyan-300/50 text-cyan-100 hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="전송"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </main>
  );
}
