'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConversationList } from './components/ConversationList';
import { OperatorChatPanel } from './components/OperatorChatPanel';
import { RunInspector } from './components/RunInspector';
import {
  agentOsChatKeys,
  createAgentConversation,
  createOrderDraftFromRecommendation,
  getAgentConversationGraph,
  listAgentConversations,
  listAgentMessages,
} from './lib/agent-os-chat-api';

export default function AgentOsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );

  const conversations = useQuery({
    queryKey: agentOsChatKeys.conversations,
    queryFn: listAgentConversations,
    refetchInterval: 10_000,
  });

  const selectedConversationId =
    selectedId === undefined
      ? conversations.data?.items[0]?.id ?? null
      : selectedId;

  const messages = useQuery({
    queryKey: selectedConversationId
      ? agentOsChatKeys.messages(selectedConversationId)
      : ['agent-os', 'conversations', 'new', 'messages'],
    queryFn: () => listAgentMessages(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 3_000,
  });

  const graph = useQuery({
    queryKey: selectedConversationId
      ? agentOsChatKeys.graph(selectedConversationId)
      : ['agent-os', 'conversations', 'new', 'graph'],
    queryFn: () => getAgentConversationGraph(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 3_000,
  });

  const createConversation = useMutation({
    mutationFn: createAgentConversation,
    onSuccess: async (result) => {
      setSelectedId(result.conversation.id);
      await queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.conversations,
      });
      await queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.messages(result.conversation.id),
      });
      await queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.graph(result.conversation.id),
      });
    },
  });

  const createDraft = useMutation({
    mutationFn: (artifactId: string) => {
      if (!selectedConversationId) {
        throw new Error('conversation_required');
      }
      return createOrderDraftFromRecommendation(
        selectedConversationId,
        artifactId,
      );
    },
    onSuccess: async () => {
      if (!selectedConversationId) return;
      await queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.messages(selectedConversationId),
      });
      await queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.graph(selectedConversationId),
      });
    },
  });

  const artifacts = useMemo(
    () => graph.data?.artifacts ?? [],
    [graph.data?.artifacts],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#090d16] text-white">
      <ConversationList
        conversations={conversations.data?.items ?? []}
        selectedId={selectedConversationId}
        loading={conversations.isFetching}
        onNew={() => setSelectedId(null)}
        onRefresh={() =>
          queryClient.invalidateQueries({
            queryKey: agentOsChatKeys.conversations,
          })
        }
        onSelect={(id) => setSelectedId(id)}
      />
      <OperatorChatPanel
        messages={messages.data?.items ?? []}
        artifacts={artifacts}
        selectedConversationId={selectedConversationId}
        sending={createConversation.isPending}
        draftPending={createDraft.isPending}
        onSend={(content) => createConversation.mutate(content)}
        onCreateDraft={(artifactId) => createDraft.mutate(artifactId)}
      />
      <RunInspector graph={graph.data ?? null} />
    </div>
  );
}
