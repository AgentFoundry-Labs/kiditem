import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const operatorAgent = {
  agentDefinitionKey: 'operator',
  agentVersion: 'agentDefinitions/operator/versions/v1',
  displayName: '운영 에이전트',
  description: '운영 질문을 처리합니다.',
  isDefault: true,
} as const;

export const analystAgent = {
  agentDefinitionKey: 'analyst',
  agentVersion: 'agentDefinitions/analyst/versions/v1',
  displayName: '분석 에이전트',
  description: '분석 질문을 처리합니다.',
  isDefault: false,
} as const;

export const existingSession = {
  name: 'organizations/org-1/agentSessions/session-1',
  copilotThreadId: '22222222-2222-4222-8222-222222222222',
  primaryAgentDefinitionKey: 'operator',
  primaryAgentVersion: 'agentDefinitions/operator/versions/v1',
  lifecycle: 'active',
  updatedAt: '2026-08-13T00:00:00.000Z',
} as const;

export const bootstrap = {
  defaultAgentDefinitionKey: 'operator',
  agents: [operatorAgent, analystAgent],
  sessions: [existingSession],
} as const;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function queryWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}
