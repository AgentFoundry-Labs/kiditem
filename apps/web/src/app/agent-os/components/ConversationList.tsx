'use client';

import { MessageSquarePlus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOsConversation } from '../lib/agent-os-types';

function statusLabel(status: string): string {
  if (status === 'active') return '진행 중';
  if (status === 'archived') return '보관됨';
  return status;
}

export function ConversationList({
  conversations,
  selectedId,
  className,
  headerClassName,
  loading = false,
  onNew,
  onRefresh,
  onSelect,
}: {
  conversations: AgentOsConversation[];
  selectedId: string | null;
  className?: string;
  headerClassName?: string;
  loading?: boolean;
  onNew: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col border-r border-white/10 bg-[#0c1220]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center justify-between border-b border-white/10 px-4',
          headerClassName,
        )}
      >
        <div>
          <h1 className="text-sm font-bold text-white">Agent OS</h1>
          <p className="mt-0.5 text-xs text-slate-400">Operator conversations</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
            aria-label="대화 새로고침"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={onNew}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/40 text-cyan-200 hover:border-cyan-200"
            aria-label="새 대화"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">
            아직 대화가 없습니다.
          </div>
        ) : (
          conversations.map((conversation) => {
            const selected = conversation.id === selectedId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  'mb-1 block w-full rounded-lg border p-3 text-left transition-colors',
                  selected
                    ? 'border-cyan-300/60 bg-cyan-300/10'
                    : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]',
                )}
              >
                <span className="block truncate text-sm font-semibold text-white">
                  {conversation.title}
                </span>
                <span className="mt-2 inline-flex rounded-md bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                  {statusLabel(conversation.status)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
