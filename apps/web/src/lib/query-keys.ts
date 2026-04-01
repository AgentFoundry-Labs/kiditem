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
  ads: {
    all: ['ads'] as const,
    list: () => [...queryKeys.ads.all, 'list'] as const,
    hub: () => [...queryKeys.ads.all, 'hub'] as const,
  },
  orders: {
    all: ['orders'] as const,
    pipeline: () => [...queryKeys.orders.all, 'pipeline'] as const,
  },
  coupangDashboard: {
    all: ['coupangDashboard'] as const,
    kpis: () => [...queryKeys.coupangDashboard.all, 'kpis'] as const,
    trend: (params: Record<string, string>) => [...queryKeys.coupangDashboard.all, 'trend', params] as const,
    ranking: (params: Record<string, string>) => [...queryKeys.coupangDashboard.all, 'ranking', params] as const,
    returnSummary: (params: Record<string, string>) => [...queryKeys.coupangDashboard.all, 'returnSummary', params] as const,
    returnReasons: (params: Record<string, string>) => [...queryKeys.coupangDashboard.all, 'returnReasons', params] as const,
    returnFaultSplit: (params: Record<string, string>) => [...queryKeys.coupangDashboard.all, 'returnFaultSplit', params] as const,
  },
  cs: {
    all: ['cs'] as const,
    list: (params?: Record<string, string>) => [...queryKeys.cs.all, 'list', params] as const,
  },
  logs: {
    all: ['logs'] as const,
    list: () => [...queryKeys.logs.all, 'list'] as const,
  },
  ontology: {
    all: ['ontology'] as const,
    products: () => [...queryKeys.ontology.all, 'products'] as const,
  },
  profitLoss: {
    all: ['profitLoss'] as const,
    list: (period: string) => [...queryKeys.profitLoss.all, 'list', period] as const,
  },
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    list: (params: Record<string, string>) => [...queryKeys.purchaseOrders.all, 'list', params] as const,
  },
  returns: {
    all: ['returns'] as const,
    list: () => [...queryKeys.returns.all, 'list'] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: (params: Record<string, string>) => [...queryKeys.reviews.all, 'list', params] as const,
  },
  salesAnalysis: {
    all: ['salesAnalysis'] as const,
    data: (period: string) => [...queryKeys.salesAnalysis.all, 'data', period] as const,
  },
  thumbnails: {
    all: ['thumbnails'] as const,
    list: (params: Record<string, string>) => [...queryKeys.thumbnails.all, 'list', params] as const,
  },
  stockMovement: {
    all: ['stockMovement'] as const,
    data: (params: Record<string, string>) => [...queryKeys.stockMovement.all, 'data', params] as const,
  },
  unshipped: {
    all: ['unshipped'] as const,
    list: (params?: Record<string, string>) => [...queryKeys.unshipped.all, 'list', params] as const,
  },
  sourcing: {
    all: ['sourcing'] as const,
    list: (params: Record<string, string>) => [...queryKeys.sourcing.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.sourcing.all, 'detail', id] as const,
    preview: (id: string) => [...queryKeys.sourcing.all, 'preview', id] as const,
  },
  companies: {
    all: ['companies'] as const,
    list: () => [...queryKeys.companies.all, 'list'] as const,
  },
  syncInfo: () => ['syncInfo'] as const,
} as const;
