'use client';

import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationContexts } from './conversation-context.catalog';
import { ConversationContextMark } from './ConversationContextMark';
import type { AgentConversationKey, ConversationSummary } from './conversation-api';

type ConversationContextKey = AgentConversationKey | null;

type DeleteFocusIntent = {
  conversationId: string;
  context: ConversationContextKey;
  orderedConversationIds: string[];
};

export function ConversationFolderTree({
  conversations,
  selectedContext,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  isRunning = false,
  onRenameConversation,
  onDeleteConversation,
  collapsed = false,
}: {
  conversations: ConversationSummary[];
  selectedContext: ConversationContextKey;
  activeConversationId: string | null;
  onSelectConversation(conversation: ConversationSummary): void;
  onNewConversation(context: ConversationContextKey): void;
  onOpenSettings(trigger: HTMLElement): void;
  isRunning?: boolean;
  onRenameConversation?(conversationId: string, title: string): Promise<ConversationSummary>;
  onDeleteConversation?(conversationId: string): Promise<void>;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<AgentConversationKey>>(
    () => new Set(selectedContext === null ? [] : [selectedContext]),
  );
  const expand = useCallback((context: ConversationContextKey) => {
    if (context === null) return;
    setExpanded((current) => current.has(context) ? current : new Set([...current, context]));
  }, []);

  useEffect(() => {
    expand(selectedContext);
  }, [expand, selectedContext]);
  useEffect(() => {
    const selected = conversations.find((conversation) => conversation.id === activeConversationId);
    if (selected) expand(selected.agentKey);
  }, [activeConversationId, conversations, expand]);

  const toggleFolder = (context: AgentConversationKey) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(context)) next.delete(context);
      else next.add(context);
      return next;
    });
  };
  const generalConversations = conversations
    .filter((conversation) => conversation.agentKey === null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const agentContexts = conversationContexts.filter(
    (context): context is (typeof conversationContexts)[number] & { key: AgentConversationKey } => context.key !== null,
  );
  const deleteFocusIntentRef = useRef<DeleteFocusIntent | null>(null);
  const [deleteFocusVersion, setDeleteFocusVersion] = useState(0);
  const requestDeleteFocus = useCallback((conversation: ConversationSummary) => {
    deleteFocusIntentRef.current = {
      conversationId: conversation.id,
      context: conversation.agentKey,
      orderedConversationIds: [
        ...agentContexts.flatMap((context) => conversations
          .filter((candidate) => candidate.agentKey === context.key)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((candidate) => candidate.id)),
        ...generalConversations.map((candidate) => candidate.id),
      ],
    };
    setDeleteFocusVersion((current) => current + 1);
  }, [agentContexts, conversations, generalConversations]);

  useEffect(() => {
    const intent = deleteFocusIntentRef.current;
    if (!intent) return;
    const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-conversation-row-control]'));
    const controlsByConversationId = new Map(
      controls.map((control) => [control.dataset.conversationRowControl, control]),
    );
    const deletedIndex = intent.orderedConversationIds.indexOf(intent.conversationId);
    const nearestIds = deletedIndex === -1
      ? intent.orderedConversationIds
      : Array.from({ length: intent.orderedConversationIds.length - 1 }, (_, offset) => {
        const distance = offset + 1;
        return [
          intent.orderedConversationIds[deletedIndex + distance],
          intent.orderedConversationIds[deletedIndex - distance],
        ];
      }).flat().filter((conversationId): conversationId is string => Boolean(conversationId));
    const nearest = nearestIds
      .map((conversationId) => controlsByConversationId.get(conversationId))
      .find((control) => control && !control.disabled);
    if (nearest) {
      nearest.focus();
    } else if (intent.context) {
      document.querySelector<HTMLButtonElement>(`[data-conversation-folder-toggle="${intent.context}"]`)?.focus();
    } else {
      document.querySelector<HTMLElement>('[data-conversation-general-section]')?.focus();
    }
    deleteFocusIntentRef.current = null;
  }, [conversations, deleteFocusVersion]);

  if (collapsed) {
    return (
      <nav aria-label="대화 목록" className="flex min-h-0 w-full flex-1 flex-col items-center bg-card p-2">
        <button
          type="button"
          aria-label="새 AI 대화"
          onClick={() => onNewConversation(null)}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Plus aria-hidden="true" size={18} />
        </button>
        <div className="mt-2 flex flex-col gap-1">
          {agentContexts.map((context) => (
            <button
              key={context.key}
              type="button"
              aria-label={`${context.label} 새 AI 대화`}
              onClick={() => onNewConversation(context.key)}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <ConversationContextMark contextLabel={context.label} />
            </button>
          ))}
        </div>
        <div className="mt-auto pt-2">
          <button
            type="button"
            aria-label="대화 설정"
            onClick={(event) => onOpenSettings(event.currentTarget)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Settings2 aria-hidden="true" size={16} />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="대화 목록" className="flex min-h-0 w-full flex-1 flex-col bg-card">
      <div className="shrink-0 border-b p-2">
        <button
          type="button"
          aria-label="새 AI 대화"
          onClick={() => onNewConversation(null)}
          className="inline-flex min-h-10 w-full items-center justify-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11"
        >
          <Plus aria-hidden="true" size={16} /> 새 AI 대화
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <section aria-label="에이전트" className="mb-4">
          <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">에이전트</p>
          {agentContexts.map((context) => {
            const isExpanded = expanded.has(context.key);
            const folderConversations = conversations
              .filter((conversation) => conversation.agentKey === context.key)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
            const isContextSelected = selectedContext === context.key;
            return (
              <section key={context.key} className="mb-0.5" aria-label={context.label}>
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    data-conversation-folder-toggle={context.key}
                    aria-expanded={isExpanded}
                    onClick={() => toggleFolder(context.key)}
                    className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${isContextSelected ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-muted'}`}
                  >
                    {isExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
                    <ConversationContextMark contextLabel={context.label} />
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
                        live={conversation.id === activeConversationId && isRunning}
                        onSelect={() => onSelectConversation(conversation)}
                        onRename={onRenameConversation}
                        onDelete={onDeleteConversation}
                        onDeleteSuccess={() => requestDeleteFocus(conversation)}
                      />
                    ))}
                    {!folderConversations.length ? <p className="px-2 py-2 text-xs text-muted-foreground">대화가 없습니다.</p> : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </section>
        <section aria-label="채팅" data-conversation-general-section tabIndex={-1}>
          <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">채팅</p>
          <div role="group" aria-label="채팅 대화" className="space-y-0.5">
            {generalConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                live={conversation.id === activeConversationId && isRunning}
                onSelect={() => onSelectConversation(conversation)}
                onRename={onRenameConversation}
                onDelete={onDeleteConversation}
                onDeleteSuccess={() => requestDeleteFocus(conversation)}
              />
            ))}
            {!generalConversations.length ? <p className="px-2 py-2 text-xs text-muted-foreground">대화가 없습니다.</p> : null}
          </div>
        </section>
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
  onDeleteSuccess,
}: {
  conversation: ConversationSummary;
  active: boolean;
  live: boolean;
  onSelect(): void;
  onRename?: (conversationId: string, title: string) => Promise<ConversationSummary>;
  onDelete?: (conversationId: string) => Promise<void>;
  onDeleteSuccess?(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<'rename' | 'delete' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement | null>(null);
  const restoreMenuTrigger = useCallback(() => {
    window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
  }, []);
  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
  }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) return;
      closeMenu(true);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [closeMenu, menuOpen]);
  useEffect(() => {
    if (editing) renameInputRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (confirmingDelete) confirmDeleteRef.current?.focus();
  }, [confirmingDelete]);
  const saveRename = async () => {
    if (!onRename || !title.trim() || title.trim() === conversation.title) return;
    setError(null);
    try {
      await onRename(conversation.id, title.trim());
      setEditing(false);
      restoreMenuTrigger();
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
      onDeleteSuccess?.();
    } catch {
      setError('delete');
    }
  };

  return (
    <div className="mt-1 rounded-md">
      {editing ? (
        <div className="flex flex-wrap gap-1 p-1">
          <input ref={renameInputRef} aria-label={`${conversation.title} 이름`} value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11" />
          <button type="button" onClick={() => void saveRename()} disabled={!title.trim() || title.trim() === conversation.title} className="min-h-10 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">이름 저장</button>
          <button type="button" onClick={() => { setEditing(false); restoreMenuTrigger(); }} className="min-h-10 rounded-md px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" data-conversation-row-control={conversation.id} aria-current={active ? 'page' : undefined} onClick={onSelect} className={`min-h-10 min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${active ? 'bg-primary-soft font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{conversation.title}</button>
          {onRename || onDelete ? (
            <div className="relative shrink-0">
              <button
                ref={menuTriggerRef}
                type="button"
                aria-label={`${conversation.title} 메뉴`}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 max-lg:min-w-11"
              >
                <MoreHorizontal aria-hidden="true" size={16} />
              </button>
              {menuOpen ? (
                <div ref={menuRef} role="menu" aria-label={`${conversation.title} 메뉴`} className="absolute right-0 z-20 mt-1 w-28 rounded-md border bg-popover p-1 shadow-lg">
                  {onRename ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        setTitle(conversation.title);
                        setError(null);
                        setEditing(true);
                      }}
                      className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      이름 변경
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={live}
                      onClick={() => {
                        closeMenu();
                        setError(null);
                        setConfirmingDelete(true);
                      }}
                      className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm text-destructive hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {confirmingDelete ? (
        <div role="alertdialog" aria-label="대화 삭제 확인" className="mt-1 rounded-md border border-red-200 bg-red-50 p-2 text-xs">
          <p>{conversation.title} 대화를 삭제할까요?</p>
          <div className="mt-2 flex justify-end gap-1">
            <button type="button" onClick={() => { setConfirmingDelete(false); restoreMenuTrigger(); }} className="min-h-10 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
            <button ref={confirmDeleteRef} type="button" onClick={() => void confirmDelete()} className="min-h-10 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">삭제 확인</button>
          </div>
        </div>
      ) : null}
      {error === 'rename' ? <p role="alert" className="px-2 py-1 text-xs text-destructive">대화 이름을 변경할 수 없습니다.</p> : null}
      {error === 'delete' ? <p role="alert" className="px-2 py-1 text-xs text-destructive">대화를 삭제할 수 없습니다.</p> : null}
    </div>
  );
}
