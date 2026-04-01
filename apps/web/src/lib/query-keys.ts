export const queryKeys = {
  agents: {
    all: ['agents'] as const,
    list: () => [...queryKeys.agents.all, 'list'] as const,
    org: () => [...queryKeys.agents.all, 'org'] as const,
    detail: (id: string) => [...queryKeys.agents.all, 'detail', id] as const,
    runs: (id: string) => [...queryKeys.agents.all, 'runs', id] as const,
    runtimeState: (id: string) => [...queryKeys.agents.all, 'runtimeState', id] as const,
    costAnalytics: (params?: { from?: string; to?: string; agentId?: string }) =>
      [...queryKeys.agents.all, 'costAnalytics', params] as const,
  },
  workflows: {
    all: ['workflows'] as const,
    list: () => [...queryKeys.workflows.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.workflows.all, 'detail', id] as const,
    runs: (id: string) => [...queryKeys.workflows.all, 'runs', id] as const,
    runDetail: (runId: string) => [...queryKeys.workflows.all, 'runDetail', runId] as const,
  },
  marketplace: {
    all: ['marketplace'] as const,
    workflows: (query?: { module?: string; category?: string }) =>
      [...queryKeys.marketplace.all, 'workflows', query] as const,
    agents: (query?: { role?: string; category?: string }) =>
      [...queryKeys.marketplace.all, 'agents', query] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params: Record<string, string>) => [...queryKeys.products.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.products.all, 'detail', id] as const,
    pipelineStats: (status?: string) => [...queryKeys.products.all, 'pipelineStats', status] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    list: (params: Record<string, string>) => [...queryKeys.inventory.all, 'list', params] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    trend: (range: string) => [...queryKeys.dashboard.all, 'trend', range] as const,
    health: () => [...queryKeys.dashboard.all, 'health'] as const,
  },
  syncInfo: () => ['syncInfo'] as const,
} as const;
