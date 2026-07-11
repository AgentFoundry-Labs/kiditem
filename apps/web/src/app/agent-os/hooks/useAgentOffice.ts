'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { agentOsApi } from '../lib/agent-os-api';
import {
  buildAgentOfficeModel,
  type AgentOfficeViewModel,
} from '../lib/agent-office-model';
import {
  buildOperatorCommand,
  commandTargetFromNode,
} from '../lib/agent-command-presets';

const EMPTY_MODEL: AgentOfficeViewModel = {
  nodes: [],
  capabilities: [],
  activities: [],
  totals: {
    agents: 0,
    employees: 0,
    capabilities: 0,
    working: 0,
    waiting: 0,
    blocked: 0,
    pendingApprovals: 0,
    runningRuns: 0,
    totalCostMicros: '0',
  },
};

function conversationTime(value: {
  lastMessageAt: string | null;
  updatedAt: string;
  createdAt: string;
}): number {
  return Date.parse(value.lastMessageAt ?? value.updatedAt ?? value.createdAt);
}

function preferredConversationId(
  conversations: Array<{
    id: string;
    status: string;
    lastMessageAt: string | null;
    updatedAt: string;
    createdAt: string;
  }>,
): string | null {
  if (conversations.length === 0) return null;

  const active = conversations
    .filter((conversation) => conversation.status === 'active')
    .sort((a, b) => conversationTime(b) - conversationTime(a));

  if (active[0]) return active[0].id;

  return (
    [...conversations].sort(
      (a, b) => conversationTime(b) - conversationTime(a),
    )[0]?.id ?? null
  );
}

function shouldPoll(statuses: string[]): boolean {
  return statuses.some((status) =>
    ['running', 'pending', 'claimed', 'requires_approval'].includes(status),
  );
}

export function useAgentOffice() {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [command, setCommand] = useState('');

  const rosterQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'roster'],
    queryFn: () => agentOsApi.listRoster(),
    staleTime: 60_000,
  });

  const runsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'runs'],
    queryFn: () =>
      agentOsApi.listRuns({
        status: ['running', 'succeeded', 'failed', 'cancelled'],
        limit: 100,
      }),
    refetchInterval: (query) =>
      shouldPoll((query.state.data?.items ?? []).map((item) => item.status))
        ? 10_000
        : 45_000,
  });

  const requestsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'requests'],
    queryFn: () =>
      agentOsApi.listRequests({
        status: [
          'pending',
          'claimed',
          'requires_approval',
          'succeeded',
          'failed',
        ],
        limit: 100,
      }),
    refetchInterval: (query) =>
      shouldPoll((query.state.data?.items ?? []).map((item) => item.status))
        ? 10_000
        : 45_000,
  });

  const approvalsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'approvals'],
    queryFn: () =>
      agentOsApi.listApprovals({ status: ['pending'], limit: 100 }),
    refetchInterval: 45_000,
  });

  const conversationsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'conversations'],
    queryFn: () => agentOsApi.listConversations(),
    refetchInterval: 45_000,
  });

  const costQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'cost'],
    queryFn: () => agentOsApi.listCostEvents({ limit: 50 }),
    refetchInterval: 60_000,
  });

  const authorizationQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'authorization'],
    queryFn: () => agentOsApi.listAuthorizationEvents({ limit: 50 }),
    refetchInterval: 60_000,
  });

  const createConversation = useMutation({
    mutationFn: (content: string) => agentOsApi.createConversation({ content }),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setCommand('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (input: { conversationId: string; content: string }) =>
      agentOsApi.sendMessage(input.conversationId, { content: input.content }),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setCommand('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    },
  });

  const resolvedConversationId = useMemo(
    () =>
      conversationId ??
      preferredConversationId(conversationsQuery.data?.items ?? []),
    [conversationId, conversationsQuery.data],
  );

  const model = useMemo(() => {
    if (!rosterQuery.data) return EMPTY_MODEL;

    return buildAgentOfficeModel({
      roster: rosterQuery.data.items,
      runs: runsQuery.data?.items ?? [],
      requests: requestsQuery.data?.items ?? [],
      approvals: approvalsQuery.data?.items ?? [],
      conversations: conversationsQuery.data?.items ?? [],
      costEvents: costQuery.data?.items ?? [],
      authorizationEvents: authorizationQuery.data?.items ?? [],
      totalCostMicros: costQuery.data?.totalCostMicros ?? '0',
    });
  }, [
    approvalsQuery.data,
    authorizationQuery.data,
    conversationsQuery.data,
    costQuery.data,
    rosterQuery.data,
    requestsQuery.data,
    runsQuery.data,
  ]);

  const selectedNode = useMemo(
    () =>
      selectedNodeId === null
        ? null
        : (model.nodes.find((node) => node.id === selectedNodeId) ?? null),
    [model.nodes, selectedNodeId],
  );

  useEffect(() => {
    const firstNodeId = model.nodes[0]?.id ?? null;

    if (selectedNodeId === null) {
      if (firstNodeId !== null) {
        setSelectedNodeId(firstNodeId);
      }
      return;
    }

    const selectedNodeStillExists = model.nodes.some(
      (node) => node.id === selectedNodeId,
    );

    if (!selectedNodeStillExists) {
      setSelectedNodeId(firstNodeId);
    }
  }, [model.nodes, selectedNodeId]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
  };

  const submitCommand = () => {
    const content = buildOperatorCommand({
      content: command,
      target: commandTargetFromNode(selectedNode),
    });
    if (!content) return;

    if (selectedNodeId !== null && selectedNode === null) {
      toast.error('선택한 직원을 다시 선택해 주세요.');
      return;
    }

    const operator =
      model.nodes.find((node) => node.agentType === 'manager') ?? null;

    if (!operator || operator.configurationStatus !== 'ready') {
      toast.error('운영 총괄의 실행 설정이 필요합니다.');
      return;
    }

    if (selectedNode && selectedNode.configurationStatus !== 'ready') {
      toast.error(`${selectedNode.displayName}의 실행 설정이 필요합니다.`);
      return;
    }

    if (resolvedConversationId) {
      sendMessage.mutate({ conversationId: resolvedConversationId, content });
      return;
    }

    createConversation.mutate(content);
  };

  const initialQueries = [
    rosterQuery,
    runsQuery,
    requestsQuery,
    approvalsQuery,
    conversationsQuery,
    costQuery,
    authorizationQuery,
  ];

  const isInitialLoadPending = initialQueries.some(
    (query) =>
      query.isPending && query.data === undefined && query.error == null,
  );

  return {
    model,
    selectedNodeId,
    setSelectedNodeId,
    command,
    setCommand,
    submitCommand,
    commandPending: createConversation.isPending || sendMessage.isPending,
    isPending: isInitialLoadPending,
    isFetching:
      rosterQuery.isFetching ||
      runsQuery.isFetching ||
      requestsQuery.isFetching ||
      approvalsQuery.isFetching ||
      conversationsQuery.isFetching ||
      costQuery.isFetching ||
      authorizationQuery.isFetching,
    error:
      rosterQuery.error ??
      runsQuery.error ??
      requestsQuery.error ??
      approvalsQuery.error ??
      conversationsQuery.error ??
      costQuery.error ??
      authorizationQuery.error ??
      createConversation.error ??
      sendMessage.error,
    refresh,
  };
}
