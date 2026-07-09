'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { agentOsApi } from '../lib/agent-os-api';
import {
  buildAgentOfficeModel,
  type AgentOfficeViewModel,
} from '../lib/agent-office-model';

const EMPTY_MODEL: AgentOfficeViewModel = {
  nodes: [],
  activities: [],
  totals: {
    agents: 0,
    working: 0,
    waiting: 0,
    blocked: 0,
    pendingApprovals: 0,
    runningRuns: 0,
    totalCostMicros: '0',
  },
};

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

  const instancesQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => agentOsApi.listInstances(),
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
        status: ['pending', 'claimed', 'requires_approval', 'succeeded', 'failed'],
        limit: 100,
      }),
    refetchInterval: (query) =>
      shouldPoll((query.state.data?.items ?? []).map((item) => item.status))
        ? 10_000
        : 45_000,
  });

  const approvalsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'approvals'],
    queryFn: () => agentOsApi.listApprovals({ status: ['pending'], limit: 100 }),
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

  const model = useMemo(() => {
    if (!instancesQuery.data) return EMPTY_MODEL;

    return buildAgentOfficeModel({
      instances: instancesQuery.data,
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
    instancesQuery.data,
    requestsQuery.data,
    runsQuery.data,
  ]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents.list() });
  };

  const submitCommand = () => {
    const content = command.trim();
    if (!content) return;

    if (conversationId) {
      sendMessage.mutate({ conversationId, content });
      return;
    }

    createConversation.mutate(content);
  };

  return {
    model,
    selectedNodeId,
    setSelectedNodeId,
    command,
    setCommand,
    submitCommand,
    commandPending: createConversation.isPending || sendMessage.isPending,
    isPending: instancesQuery.isPending,
    isFetching:
      instancesQuery.isFetching ||
      runsQuery.isFetching ||
      requestsQuery.isFetching ||
      approvalsQuery.isFetching ||
      conversationsQuery.isFetching ||
      costQuery.isFetching ||
      authorizationQuery.isFetching,
    error:
      instancesQuery.error ??
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
