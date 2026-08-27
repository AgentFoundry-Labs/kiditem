'use client';

import { MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { conversationContextFor, conversationContexts } from './conversation-context.catalog';
import { bulkDeleteConversations, type ConversationBulkDeleteResult } from './conversation-bulk-delete';
import type { AgentConversationKey, ConversationSummary } from './conversation-api';

type FolderFilter = 'all' | 'general' | AgentConversationKey;
type DeleteFocusIntent = {
  conversationId: string;
  orderedConversationIds: string[];
};
type DeletePlan = {
  label: string;
  conversations: ConversationSummary[];
  restoreFocusConversationId?: string;
  focusIntent?: DeleteFocusIntent;
};

/** Client-side bounded history controls over the shared provider summary cache. */
export function ConversationHistorySettings({
  conversations,
  activeConversationId,
  isRunning,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isRunning: boolean;
  onRename(conversationId: string, title: string): Promise<ConversationSummary>;
  onDelete(conversationId: string): Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<FolderFilter>('all');
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [title, setTitle] = useState('');
  const [renameError, setRenameError] = useState(false);
  const [deletePlan, setDeletePlan] = useState<DeletePlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<ConversationBulkDeleteResult | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement | null>(null);
  const historyListRef = useRef<HTMLUListElement | null>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const sorted = useMemo(() => [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [conversations]);
  const filtered = sorted.filter((conversation) => (
    (folder === 'all' || (folder === 'general' ? conversation.agentKey === null : conversation.agentKey === folder))
    && (!normalizedSearch || conversation.title.toLocaleLowerCase().includes(normalizedSearch))
  ));
  const folderConversations = folder === 'all'
    ? []
    : sorted.filter((conversation) => folder === 'general' ? conversation.agentKey === null : conversation.agentKey === folder);
  const isLive = (conversation: ConversationSummary) => (
    conversation.id === activeConversationId && isRunning
  );
  const openRename = (conversation: ConversationSummary) => {
    setRenaming(conversation);
    setTitle(conversation.title);
    setRenameError(false);
  };
  const saveRename = async () => {
    if (!renaming || !title.trim() || title.trim() === renaming.title) return;
    try {
      await onRename(renaming.id, title.trim());
      setRenaming(null);
    } catch {
      setTitle(renaming.title);
      setRenameError(true);
      setRenaming(null);
    }
  };
  const prepareDelete = (
    label: string,
    targets: ConversationSummary[],
    restoreFocusConversationId?: string,
    focusIntent?: DeleteFocusIntent,
  ) => {
    const deletable = targets.filter((conversation) => !isLive(conversation));
    if (!deletable.length) return;
    setDeleteResult(null);
    setDeletePlan({ label, conversations: deletable, restoreFocusConversationId, focusIntent });
  };
  const restoreMenuTrigger = useCallback((conversationId: string | undefined) => {
    if (!conversationId) return;
    window.setTimeout(() => {
      Array.from(historyListRef.current?.querySelectorAll<HTMLButtonElement>('[data-conversation-history-menu-trigger]') ?? [])
        .find((trigger) => trigger.dataset.conversationHistoryMenuTrigger === conversationId)
        ?.focus();
    }, 0);
  }, []);
  const cancelDelete = () => {
    const restoreFocusConversationId = deletePlan?.restoreFocusConversationId;
    setDeletePlan(null);
    restoreMenuTrigger(restoreFocusConversationId);
  };
  const confirmDelete = async () => {
    if (!deletePlan) return;
    setDeleting(true);
    const result = await bulkDeleteConversations(deletePlan.conversations, onDelete);
    setDeleteResult(result);
    setDeletePlan(null);
    setDeleting(false);
    const focusIntent = deletePlan.focusIntent;
    if (focusIntent && !result.failed.some((failure) => failure.conversationId === focusIntent.conversationId)) {
      window.setTimeout(() => {
        const triggers = Array.from(historyListRef.current?.querySelectorAll<HTMLButtonElement>('[data-conversation-history-menu-trigger]') ?? []);
        const triggersByConversationId = new Map(
          triggers.map((trigger) => [trigger.dataset.conversationHistoryMenuTrigger, trigger]),
        );
        const deletedIndex = focusIntent.orderedConversationIds.indexOf(focusIntent.conversationId);
        const nearestConversationIds = deletedIndex === -1
          ? focusIntent.orderedConversationIds
          : Array.from({ length: focusIntent.orderedConversationIds.length - 1 }, (_, offset) => {
            const distance = offset + 1;
            return [
              focusIntent.orderedConversationIds[deletedIndex + distance],
              focusIntent.orderedConversationIds[deletedIndex - distance],
            ];
          }).flat().filter((conversationId): conversationId is string => Boolean(conversationId));
        const nearest = nearestConversationIds
          .map((conversationId) => triggersByConversationId.get(conversationId))
          .find((trigger) => trigger && !trigger.disabled);
        (nearest ?? historyListRef.current)?.focus();
      }, 0);
    } else if (result.failed.length) {
      restoreMenuTrigger(deletePlan.restoreFocusConversationId);
    }
  };

  useEffect(() => {
    if (deletePlan) confirmDeleteRef.current?.focus();
  }, [deletePlan]);

  return (
    <section aria-label="채팅 기록" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          대화 검색
          <input aria-label="대화 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          대화 폴더
          <select aria-label="대화 폴더" value={folder} onChange={(event) => setFolder(event.target.value as FolderFilter)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
            <option value="all">전체 대화</option>
            <option value="general">일반 AI 챗</option>
            {conversationContexts.filter((context) => context.key !== null).map((context) => <option key={context.key} value={context.key}>{context.label}</option>)}
          </select>
        </label>
      </div>
      {isRunning ? <p role="status" className="text-sm text-muted-foreground">진행 중인 대화는 종료된 뒤 삭제할 수 있습니다.</p> : null}
      {renameError ? <p role="alert" className="text-sm text-destructive">대화 이름을 변경할 수 없습니다.</p> : null}
      {deleteResult?.failed.length ? <p role="alert" className="text-sm text-destructive">{deleteResult.succeededIds.length}개 대화를 삭제했고 {deleteResult.failed.length}개는 삭제할 수 없습니다.</p> : null}
      {deleteResult && !deleteResult.failed.length ? <p role="status" className="text-sm text-muted-foreground">{deleteResult.succeededIds.length}개 대화를 삭제했습니다.</p> : null}
      <ul ref={historyListRef} aria-label="대화 기록 목록" tabIndex={-1} className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.map((conversation) => {
          const editing = renaming?.id === conversation.id;
          const live = isLive(conversation);
          return (
            <ConversationHistoryRow
              key={conversation.id}
              conversation={conversation}
              editing={editing}
              live={live}
              title={title}
              onTitleChange={setTitle}
              onSaveRename={() => void saveRename()}
              onCancelRename={() => setRenaming(null)}
              onOpenRename={() => openRename(conversation)}
              onDelete={() => prepareDelete(
                conversation.title,
                [conversation],
                conversation.id,
                { conversationId: conversation.id, orderedConversationIds: filtered.map((candidate) => candidate.id) },
              )}
            />
          );
        })}
        {!filtered.length ? <li className="py-6 text-center text-sm text-muted-foreground">표시할 대화가 없습니다.</li> : null}
      </ul>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {folder !== 'all' ? <button type="button" onClick={() => prepareDelete(`${folder === 'general' ? '일반 AI 챗' : conversationContextFor(folder).label} 폴더`, folderConversations)} disabled={!folderConversations.some((conversation) => !isLive(conversation))} className="min-h-10 rounded-md border px-3 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">선택 폴더 삭제</button> : null}
        <button type="button" onClick={() => prepareDelete('전체 대화', sorted)} disabled={!sorted.some((conversation) => !isLive(conversation))} className="min-h-10 rounded-md border px-3 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">전체 대화 삭제</button>
      </div>
      {deletePlan ? (
        <div role="alertdialog" aria-label="대화 삭제 확인" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">{deletePlan.label}의 대화 {deletePlan.conversations.length}개를 삭제할까요?</p>
          <p className="mt-1 text-sm text-muted-foreground">삭제한 대화는 되돌릴 수 없습니다.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={cancelDelete} disabled={deleting} className="min-h-10 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
            <button ref={confirmDeleteRef} type="button" onClick={() => void confirmDelete()} disabled={deleting} className="min-h-10 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">{deleting ? '삭제 중…' : '삭제 확인'}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConversationHistoryRow({
  conversation,
  editing,
  live,
  title,
  onTitleChange,
  onSaveRename,
  onCancelRename,
  onOpenRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  editing: boolean;
  live: boolean;
  title: string;
  onTitleChange(title: string): void;
  onSaveRename(): void;
  onCancelRename(): void;
  onOpenRename(): void;
  onDelete(): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const wasEditingRef = useRef(editing);
  const restoreMenuTrigger = useCallback(() => {
    window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
  }, []);
  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
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
    if (!editing && wasEditingRef.current) restoreMenuTrigger();
    wasEditingRef.current = editing;
  }, [editing, restoreMenuTrigger]);

  const closeOnEscape = (event: { key: string; preventDefault(): void; stopPropagation(): void }) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
  };

  return (
    <li className="rounded-md border p-3">
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <input ref={renameInputRef} aria-label={`${conversation.title} 이름`} value={title} onChange={(event) => onTitleChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11" />
          <button type="button" onClick={onSaveRename} disabled={!title.trim() || title.trim() === conversation.title} className="min-h-10 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">이름 저장</button>
          <button type="button" onClick={onCancelRename} className="min-h-10 rounded-md px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">취소</button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{conversation.title}</p>
            <p className="text-xs text-muted-foreground">{conversationContextFor(conversation.agentKey).label}</p>
          </div>
          <div className="relative shrink-0">
            <button
              ref={menuTriggerRef}
              type="button"
              data-conversation-history-menu-trigger={conversation.id}
              aria-label={`${conversation.title} 메뉴`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
              onKeyDown={closeOnEscape}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11"
            >
              <MoreHorizontal aria-hidden="true" size={18} />
            </button>
            {menuOpen ? (
              <div ref={menuRef} role="menu" aria-label={`${conversation.title} 메뉴`} onKeyDown={closeOnEscape} className="absolute right-0 z-20 mt-1 w-28 rounded-md border bg-popover p-1 shadow-lg">
                <button type="button" role="menuitem" onClick={() => { closeMenu(); onOpenRename(); }} className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  이름 변경
                </button>
                <button type="button" role="menuitem" disabled={live} onClick={() => { closeMenu(); onDelete(); }} className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                  삭제
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}
