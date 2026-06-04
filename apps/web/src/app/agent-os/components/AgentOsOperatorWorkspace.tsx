'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  agentOsChatKeys,
  createAgentConversation,
  createOrderDraftFromRecommendation,
  getAgentConversationGraph,
  listAgentConversations,
  listAgentMessages,
  resolveAgentApproval,
  sendAgentMessage,
} from '../lib/agent-os-chat-api';
import {
  getExecutionCanvasNode,
  projectAgentRunGraph,
  type ExecutionCanvasGraph,
  type ExecutionCanvasLane,
  type ExecutionCanvasNode,
} from '../lib/execution-canvas-graph';
import { ConversationList } from './ConversationList';
import { ExecutionCanvas } from './ExecutionCanvas';
import { ExecutionNodeDetail } from './ExecutionNodeDetail';
import { OperatorChatPanel } from './OperatorChatPanel';

export function AgentOsOperatorWorkspace({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: agentOsChatKeys.conversations,
    queryFn: listAgentConversations,
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data],
  );

  useEffect(() => {
    if (!open || selectedConversationId || conversations.length === 0) return;
    setSelectedConversationId(conversations[0]?.id ?? null);
  }, [conversations, open, selectedConversationId]);

  const messagesQuery = useQuery({
    queryKey: selectedConversationId
      ? agentOsChatKeys.messages(selectedConversationId)
      : ['agent-os', 'conversations', 'empty', 'messages'],
    queryFn: () => listAgentMessages(selectedConversationId ?? ''),
    enabled: open && Boolean(selectedConversationId),
    refetchInterval: open && selectedConversationId ? 10_000 : false,
  });

  const graphQuery = useQuery({
    queryKey: selectedConversationId
      ? agentOsChatKeys.graph(selectedConversationId)
      : ['agent-os', 'conversations', 'empty', 'graph'],
    queryFn: () => getAgentConversationGraph(selectedConversationId ?? ''),
    enabled: open && Boolean(selectedConversationId),
    refetchInterval: open && selectedConversationId ? 10_000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const result = selectedConversationId
        ? await sendAgentMessage(selectedConversationId, content)
        : await createAgentConversation(content);
      return result;
    },
    onSuccess: (result) => {
      setSelectedConversationId(result.conversation.id);
      queryClient.invalidateQueries({ queryKey: agentOsChatKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.messages(result.conversation.id),
      });
      queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.graph(result.conversation.id),
      });
      queryClient.invalidateQueries({ queryKey: ['agent-os', 'runs'] });
      toast.success('Operator에게 전달했습니다');
    },
    onError: () => toast.error('Operator 대화 전송 실패'),
  });

  const orderDraftMutation = useMutation({
    mutationFn: (input: { conversationId: string; artifactId: string }) => {
      return createOrderDraftFromRecommendation(
        input.conversationId,
        input.artifactId,
      );
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.graph(variables.conversationId),
      });
      queryClient.invalidateQueries({ queryKey: ['agent-os', 'runs'] });
      toast.success('발주 초안 요청을 보냈습니다');
    },
    onError: () => toast.error('발주 초안 요청 실패'),
  });

  const approvalMutation = useMutation({
    mutationFn: (input: {
      conversationId: string | null;
      approvalRequestId: string;
      status: 'approved' | 'rejected';
    }) => resolveAgentApproval(input.approvalRequestId, input.status),
    onSuccess: (_, variables) => {
      if (variables.conversationId) {
        queryClient.invalidateQueries({
          queryKey: agentOsChatKeys.graph(variables.conversationId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: agentOsChatKeys.conversations,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['agent-os', 'runs'] });
      toast.success(
        variables.status === 'approved' ? '승인했습니다' : '거절했습니다',
      );
    },
    onError: () => toast.error('승인 처리 실패'),
  });

  const graph = graphQuery.data ?? null;
  const canvasGraph = useMemo(
    () => normalizeWorkspaceCanvasLabels(projectAgentRunGraph(graph)),
    [graph],
  );
  const selectedNode = useMemo(
    () => getExecutionCanvasNode(canvasGraph, selectedNodeId),
    [canvasGraph, selectedNodeId],
  );
  const pendingApprovalRequestId = approvalMutation.isPending
    ? (approvalMutation.variables?.approvalRequestId ?? null)
    : null;

  useEffect(() => {
    setSelectedNodeId(null);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!open) {
      setSelectedNodeId(null);
      return;
    }

    setSelectedNodeId((current) => {
      if (current && canvasGraph.nodes.some((node) => node.id === current)) {
        return current;
      }

      const priorityNode =
        canvasGraph.nodes.find((node) => node.status === 'waiting_approval') ??
        canvasGraph.nodes.find((node) => node.status === 'running') ??
        canvasGraph.nodes[0] ??
        null;

      return priorityNode?.id ?? null;
    });
  }, [canvasGraph, open]);

  if (!open) return null;

  return (
    <section
      aria-label="Operator workspace"
      className="absolute bottom-4 left-4 right-4 top-[88px] z-40 flex min-h-0 overflow-hidden rounded-xl border border-cyan-300/20 bg-[#080d17]/95 shadow-2xl shadow-black/50 backdrop-blur md:left-auto md:w-[min(1120px,calc(100vw-2rem))]"
    >
      <ConversationList
        conversations={conversations}
        selectedId={selectedConversationId}
        loading={conversationsQuery.isFetching}
        onNew={() => setSelectedConversationId(null)}
        onRefresh={() =>
          queryClient.invalidateQueries({
            queryKey: agentOsChatKeys.conversations,
          })
        }
        onSelect={setSelectedConversationId}
      />
      <main className="min-w-0 flex-1 bg-slate-100 p-3 pr-0">
        <ExecutionCanvas
          graph={canvasGraph}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      </main>
      <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-white/10 bg-white text-slate-950">
        <header className="shrink-0 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-950">Node Detail</h2>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {selectedNode?.kind === 'approval'
              ? 'User approval required'
              : selectedNode?.label ?? 'Select a canvas node'}
          </p>
        </header>
        <div className="min-h-0 h-[44%] shrink-0 [&>aside]:w-full">
          <ExecutionNodeDetail
            node={selectedNode}
            approvalPendingId={pendingApprovalRequestId}
            onResolveApproval={(approvalRequestId, status) =>
              approvalMutation.mutate({
                conversationId: selectedConversationId,
                approvalRequestId,
                status,
              })
            }
          />
        </div>
        <OperatorChatPanel
          messages={messagesQuery.data?.items ?? []}
          artifacts={graph?.artifacts ?? []}
          selectedConversationId={selectedConversationId}
          className="min-h-0 flex-1"
          sending={sendMutation.isPending}
          draftPending={orderDraftMutation.isPending}
          onCreateDraft={(artifactId) => {
            if (!selectedConversationId) return;
            orderDraftMutation.mutate({
              conversationId: selectedConversationId,
              artifactId,
            });
          }}
          onSend={(content) => sendMutation.mutate(content)}
        />
      </aside>
      <button
        type="button"
        onClick={onClose}
        aria-label="Operator workspace 닫기"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#101827] text-slate-300 hover:border-cyan-300 hover:text-cyan-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}

function normalizeWorkspaceCanvasLabels(
  graph: ExecutionCanvasGraph,
): ExecutionCanvasGraph {
  const laneById = new Map(graph.lanes.map((lane) => [lane.id, lane]));
  const nodeById = new Map<string, ExecutionCanvasNode>();

  const normalizeNode = (node: ExecutionCanvasNode) => {
    const lane = laneById.get(node.laneId) ?? null;
    const label = workspaceNodeLabel(node, lane);
    const normalizedNode = label === node.label ? node : { ...node, label };
    nodeById.set(node.id, normalizedNode);
    return normalizedNode;
  };

  const nodes = graph.nodes.map(normalizeNode);
  const lanes = graph.lanes.map((lane) => ({
    ...lane,
    nodes: lane.nodes.map(
      (node) => nodeById.get(node.id) ?? normalizeNode(node),
    ),
  }));

  return {
    ...graph,
    lanes,
    nodes,
  };
}

function workspaceNodeLabel(
  node: ExecutionCanvasNode,
  lane: ExecutionCanvasLane | null,
): string {
  if (node.kind === 'approval' && node.status === 'waiting_approval') {
    return 'User approval required';
  }

  if (node.kind !== 'tool') {
    return node.label;
  }

  const capabilityKey = node.metadata.capabilityKey;
  if (!capabilityKey) {
    return node.label;
  }

  const segments = capabilityKey
    .trim()
    .toLowerCase()
    .split(/[._-]+/)
    .filter(Boolean);
  const laneAliases = new Set([lane?.id, lane?.agentType].filter(Boolean));
  const visibleSegments = laneAliases.has(segments[0])
    ? segments.slice(1)
    : segments;

  if (visibleSegments.length === 0) {
    return node.label;
  }

  return visibleSegments
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}
