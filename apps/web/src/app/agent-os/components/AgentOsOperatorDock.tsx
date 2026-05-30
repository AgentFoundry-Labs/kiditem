'use client';

import type { AgentOsArtifact, AgentOsGraph, AgentOsMessage } from '../lib/agent-os-types';
import { OperatorChatPanel } from './OperatorChatPanel';
import { RunInspector } from './RunInspector';

export function AgentOsOperatorDock({
  conversationTitle,
  messages,
  artifacts,
  graph,
  selectedConversationId,
  sending,
  draftPending,
  onCreateDraft,
  onSend,
}: {
  conversationTitle: string | null;
  messages: AgentOsMessage[];
  artifacts: AgentOsArtifact[];
  graph: AgentOsGraph | null;
  selectedConversationId: string | null;
  sending: boolean;
  draftPending: boolean;
  onCreateDraft: (artifactId: string) => void;
  onSend: (content: string) => void;
}) {
  return (
    <section className="absolute bottom-4 right-4 top-4 z-20 grid w-[400px] grid-rows-[minmax(280px,1fr)_260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020]/95 shadow-xl shadow-black/40 backdrop-blur-xl">
      <div className="flex min-h-0 flex-col border-b border-white/10">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
              Conversation
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {conversationTitle ?? '새 Operator 세션'}
            </div>
          </div>
        </div>
        <OperatorChatPanel
          messages={messages}
          artifacts={artifacts}
          selectedConversationId={selectedConversationId}
          sending={sending}
          draftPending={draftPending}
          onCreateDraft={onCreateDraft}
          onSend={onSend}
        />
      </div>
      <div className="min-h-0">
        <RunInspector graph={graph} />
      </div>
    </section>
  );
}
