'use client';

import * as Popover from '@radix-ui/react-popover';
import { Bot, Ellipsis, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  agentConversationKeys,
  type AgentConversationKey,
  type ConversationSummary,
} from './conversation-api';

const destinations: Array<{ key: AgentConversationKey | null; label: string }> = [
  { key: null, label: 'General' },
  { key: 'sourcing', label: 'Sourcing' },
  { key: 'merchandising', label: 'Merchandising' },
  { key: 'supply', label: 'Supply' },
  { key: 'channel_operations', label: 'Channel Operations' },
  { key: 'advertising', label: 'Advertising' },
];

export function AgentConversationSidebar({
  conversations,
  selectedContext,
  activeConversationId,
  onSelectContext,
  onSelectConversation,
  onNewConversation,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  selectedContext: AgentConversationKey | null;
  activeConversationId: string | null;
  onSelectContext(context: AgentConversationKey | null): void;
  onSelectConversation(conversation: ConversationSummary): void;
  onNewConversation(): void;
  onRename(conversationId: string, title: string): void;
  onDelete(conversationId: string): void;
}) {
  const filtered = conversations
    .filter((conversation) => conversation.agentKey === selectedContext)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <nav aria-label="Agent conversations" className="flex min-h-0 w-72 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-3">
        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents</p>
        <div className="mt-2 grid gap-1">
          {destinations.map((destination) => {
            const active = destination.key === selectedContext;
            return (
              <button
                key={destination.key ?? 'general'}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectContext(destination.key)}
                className={`flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              >
                {destination.key === null ? <MessageSquare aria-hidden="true" size={16} /> : <Bot aria-hidden="true" size={16} />}
                {destination.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex items-center justify-between gap-2 px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent conversations</p>
          <button type="button" onClick={onNewConversation} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11">
            <Plus aria-hidden="true" size={16} /> New
          </button>
        </div>
        <ul className="mt-2 min-h-0 space-y-1 overflow-y-auto">
          {filtered.map((conversation) => (
            <li key={conversation.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
              <button
                type="button"
                onClick={() => onSelectConversation(conversation)}
                aria-current={conversation.id === activeConversationId ? 'page' : undefined}
                className={`min-h-10 min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 ${conversation.id === activeConversationId ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {conversation.title}
              </button>
              <ConversationActions conversation={conversation} onRename={onRename} onDelete={onDelete} />
            </li>
          ))}
          {!filtered.length ? <li className="px-2 py-4 text-sm text-muted-foreground">No conversations yet.</li> : null}
        </ul>
      </div>
    </nav>
  );
}

function ConversationActions({
  conversation,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  onRename(conversationId: string, title: string): void;
  onDelete(conversationId: string): void;
}) {
  const [title, setTitle] = useState(conversation.title);
  const [confirming, setConfirming] = useState(false);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Actions for ${conversation.title}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-lg:min-h-11 max-lg:min-w-11">
          <Ellipsis aria-hidden="true" size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" className="z-50 w-64 rounded-lg border bg-popover p-3 shadow-lg">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Rename conversation
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11" />
          </label>
          <button type="button" disabled={!title.trim() || title.trim() === conversation.title} onClick={() => onRename(conversation.id, title.trim())} className="mt-2 min-h-10 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">Save name</button>
          <div className="mt-3 border-t pt-3">
            {confirming ? (
              <button type="button" onClick={() => onDelete(conversation.id)} className="min-h-10 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">Confirm delete</button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"><Trash2 aria-hidden="true" size={16} /> Delete</button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { destinations as agentConversationDestinations, agentConversationKeys };
