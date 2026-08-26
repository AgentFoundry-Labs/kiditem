'use client';

import { Bot, ChevronDown, ChevronRight, MessageSquare, Plus, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { conversationContexts } from './conversation-context.catalog';
import type { AgentConversationKey, ConversationSummary } from './conversation-api';

type ConversationContextKey = AgentConversationKey | null;

export function ConversationFolderTree({
  conversations,
  selectedContext,
  activeConversationId,
  onSelectContext,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  activeTurnId = null,
  onRenameConversation,
  onDeleteConversation,
}: {
  conversations: ConversationSummary[];
  selectedContext: ConversationContextKey;
  activeConversationId: string | null;
  onSelectContext(context: ConversationContextKey): void;
  onSelectConversation(conversation: ConversationSummary): void;
  onNewConversation(context: ConversationContextKey): void;
  onOpenSettings(trigger: HTMLElement): void;
  activeTurnId?: string | null;
  onRenameConversation?(conversationId: string, title: string): Promise<ConversationSummary>;
  onDeleteConversation?(conversationId: string): Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Set<ConversationContextKey>>(
    () => new Set([selectedContext]),
  );
  const expand = useCallback((context: ConversationContextKey) => {
    setExpanded((current) => current.has(context) ? current : new Set([...current, context]));
  }, []);

  useEffect(() => {
    expand(selectedContext);
  }, [expand, selectedContext]);
  useEffect(() => {
    const selected = conversations.find((conversation) => conversation.id === activeConversationId);
    if (selected) expand(selected.agentKey);
  }, [activeConversationId, conversations, expand]);

  const toggleFolder = (context: ConversationContextKey) => {
    onSelectContext(context);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(context)) next.delete(context);
      else next.add(context);
      return next;
    });
  };

  return (
    <nav aria-label="대화 목록" className="flex min-h-0 w-72 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-3">
        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI 챗</p>
        <button
          type="button"
          onClick={() => onNewConversation(null)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
        >
          <Plus aria-hidden="true" size={16} /> 새 AI 대화
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversationContexts.map((context) => {
          const isExpanded = expanded.has(context.key);
          const folderConversations = conversations
            .filter((conversation) => conversation.agentKey === context.key)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
          const isContextSelected = selectedContext === context.key;
          return (
            <section key={context.key ?? 'general'} className="mb-1" aria-label={context.label}>
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleFolder(context.key)}
                  className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${isContextSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                >
                  {isExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
                  {context.key === null ? <MessageSquare aria-hidden="true" size={16} /> : <Bot aria-hidden="true" size={16} />}
                  <span className="truncate">{context.label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${context.label} 새 AI 대화`}
                  onClick={() => onNewConversation(context.key)}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 max-lg:min-w-11"
                >
                  <Plus aria-hidden="true" size={16} />
                </button>
              </div>
              {isExpanded ? (
                <div role="group" aria-label={`${context.label} 대화`} className="ml-4 border-l pl-2">
                  {folderConversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeConversationId}
                      live={conversation.id === activeConversationId && Boolean(activeTurnId)}
                      onSelect={() => onSelectConversation(conversation)}
                      onRename={onRenameConversation}
                      onDelete={onDeleteConversation}
                    />
                  ))}
                  {!folderConversations.length ? <p className="px-2 py-2 text-xs text-muted-foreground">대화가 없습니다.</p> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="border-t p-2">
        <button
          type="button"
          aria-label="대화 설정"
          onClick={(event) => onOpenSettings(event.currentTarget)}
          className="inline-flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11"
        >
          <Settings2 aria-hidden="true" size={16} /> 대화 설정
        </button>
      </div>
    </nav>
  );
}

function ConversationRow({
  conversation,
  active,
  live,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  live: boolean;
  onSelect(): void;
  onRename?: (conversationId: string, title: string) => Promise<ConversationSummary>;
  onDelete?: (conversationId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<'rename' | 'delete' | null>(null);
  const saveRename = async () => {
    if (!onRename || !title.trim() || title.trim() === conversation.title) return;
    setError(null);
    try {
      await onRename(conversation.id, title.trim());
      setEditing(false);
    } catch {
      setTitle(conversation.title);
      setError('rename');
    }
  };
  const confirmDelete = async () => {
    if (!onDelete) return;
    setError(null);
    try {
      await onDelete(conversation.id);
      setConfirmingDelete(false);
    } catch {
      setError('delete');
    }
  };

  return (
    <div className="mt-1 rounded-md">
      {editing ? (
        <div className="flex flex-wrap gap-1 p-1">
          <input aria-label={`${conversation.title} 이름`} value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11" />
          <button type="button" onClick={() => void saveRename()} disabled={!title.trim() || title.trim() === conversation.title} className="min-h-10 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">이름 저장</button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-md px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-current={active ? 'page' : undefined} onClick={onSelect} className={`min-h-10 min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${active ? 'bg-primary/10 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{conversation.title}</button>
          {onRename ? <button type="button" aria-label={`${conversation.title} 이름 변경`} onClick={() => { setTitle(conversation.title); setError(null); setEditing(true); }} className="inline-flex min-h-10 shrink-0 rounded-md px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11">이름</button> : null}
          {onDelete ? <button type="button" aria-label={`${conversation.title} 삭제`} disabled={live} onClick={() => { setError(null); setConfirmingDelete(true); }} className="inline-flex min-h-10 shrink-0 rounded-md px-2 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11">삭제</button> : null}
        </div>
      )}
      {confirmingDelete ? (
        <div role="alertdialog" aria-label="대화 삭제 확인" className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
          <p>{conversation.title} 대화를 삭제할까요?</p>
          <div className="mt-2 flex justify-end gap-1">
            <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-10 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
            <button type="button" onClick={() => void confirmDelete()} className="min-h-10 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">삭제 확인</button>
          </div>
        </div>
      ) : null}
      {error === 'rename' ? <p role="alert" className="px-2 py-1 text-xs text-destructive">대화 이름을 변경할 수 없습니다.</p> : null}
      {error === 'delete' ? <p role="alert" className="px-2 py-1 text-xs text-destructive">대화를 삭제할 수 없습니다.</p> : null}
    </div>
  );
}
