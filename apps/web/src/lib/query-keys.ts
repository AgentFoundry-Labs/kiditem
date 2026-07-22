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
    trace: (taskId: string) => [...queryKeys.agents.all, 'trace', taskId] as const,
    tasksList: (params: Record<string, string | number | undefined>) =>
      [...queryKeys.agents.all, 'tasksList', params] as const,
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
    operations: {
      all: ['products', 'operations'] as const,
      lists: () => [...queryKeys.products.operations.all, 'list'] as const,
      list: (params: Record<string, string>) =>
        [...queryKeys.products.operations.lists(), params] as const,
      detail: (id: string) =>
        [...queryKeys.products.operations.all, 'detail', id] as const,
      mutations: () =>
        [...queryKeys.products.operations.all, 'mutation'] as const,
      recipeCandidates: (params: Record<string, string>) =>
        [
          ...queryKeys.products.operations.all,
          'recipe-component-candidates',
          params,
        ] as const,
    },
    images: (masterId: string) => [...queryKeys.products.all, 'images', masterId] as const,
    pipelineStats: (status?: string, period?: number) =>
      [...queryKeys.products.all, 'pipelineStats', status, period] as const,
    inspection: (id: string) => [...queryKeys.products.all, 'inspection', id] as const,
    catalog: {
      all: ['products', 'catalog'] as const,
      list: (params: Record<string, string>) =>
        [...queryKeys.products.catalog.all, 'list', params] as const,
      detail: (id: string) =>
        [...queryKeys.products.catalog.all, 'detail', id] as const,
      counts: (status?: string) =>
        [...queryKeys.products.catalog.all, 'counts', status] as const,
    },
  },
  inventory: {
    all: ['inventory'] as const,
    snapshots: () => [...queryKeys.inventory.all, 'sellpia-skus'] as const,
    snapshot: (params: Record<string, string>) =>
      [...queryKeys.inventory.snapshots(), params] as const,
    assets: () => [...queryKeys.inventory.all, 'sellpia-assets'] as const,
    assetList: (params: Record<string, string>) =>
      [...queryKeys.inventory.assets(), params] as const,
    importRuns: () => [...queryKeys.inventory.all, 'sellpia-import-runs'] as const,
    importRunList: (params: Record<string, string>) =>
      [...queryKeys.inventory.importRuns(), params] as const,
    freshness: () => [...queryKeys.inventory.all, 'sellpia-freshness'] as const,
    currentBasis: () => [...queryKeys.inventory.all, 'sellpia-current-basis'] as const,
    history: () => [...queryKeys.inventory.all, 'sellpia-history'] as const,
    historyList: (params: Record<string, string>) =>
      [...queryKeys.inventory.history(), params] as const,
    receiptBatches: () => [...queryKeys.inventory.all, 'sellpia-receipt-batches'] as const,
    // Sellpia 상품별 소진(재고 분석)
    productSalesAll: () => [...queryKeys.inventory.all, 'sellpia-product-sales'] as const,
    productSales: (months?: number) =>
      [...queryKeys.inventory.all, 'sellpia-product-sales', months ?? 0] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    // Sales
    salesBaseline: () =>
      [...queryKeys.dashboard.all, 'sales', 'baseline'] as const,
    salesRange: (range: string, from?: string, to?: string) =>
      [...queryKeys.dashboard.all, 'sales', 'range', range, from ?? '', to ?? ''] as const,
    // Ad
    adBaseline: () =>
      [...queryKeys.dashboard.all, 'ad', 'baseline'] as const,
    adRange: (range: string, from?: string, to?: string) =>
      [...queryKeys.dashboard.all, 'ad', 'range', range, from ?? '', to ?? ''] as const,
    // Inventory (range-agnostic)
    inventory: () =>
      [...queryKeys.dashboard.all, 'inventory'] as const,
    // Trend (unchanged contract)
    trend: (range: string) =>
      [...queryKeys.dashboard.all, 'trend', range] as const,
    // Health (unchanged)
    health: () =>
      [...queryKeys.dashboard.all, 'health'] as const,
    // Sellpia 판매현황(몰별 매출)
    sellpiaSalesAll: () => [...queryKeys.dashboard.all, 'sellpia-sales'] as const,
    sellpiaSales: (from?: string, to?: string) =>
      [...queryKeys.dashboard.all, 'sellpia-sales', from ?? '', to ?? ''] as const,
  },
  ads: {
    all: ['ads'] as const,
    list: () => [...queryKeys.ads.all, 'list'] as const,
    products: (period?: string) => [...queryKeys.ads.all, 'products', period] as const,
    campaigns: (period?: string) => [...queryKeys.ads.all, 'campaigns', period] as const,
    campaignProducts: (channelAccountId: string, campaignIdentity: string, period?: string) =>
      [...queryKeys.ads.all, 'campaigns', channelAccountId, campaignIdentity, period] as const,
    trends: (period?: string | number) => [...queryKeys.ads.all, 'trends', period] as const,
    rules: (period?: string | number) => [...queryKeys.ads.all, 'rules', period] as const,
    plan: (period?: string | number) => [...queryKeys.ads.all, 'plan', period] as const,
    recommend: (period?: string | number) => [...queryKeys.ads.all, 'recommend', period] as const,
    benchmark: (period?: string | number) => [...queryKeys.ads.all, 'benchmark', period] as const,
    collectStatus: () => [...queryKeys.ads.all, 'collect', 'status'] as const,
    scrapeTargets: () => [...queryKeys.ads.all, 'scrapeTargets'] as const,
    keywordRank: () => [...queryKeys.ads.all, 'keywordRank'] as const,
    keywordRankTrackers: () => [...queryKeys.ads.keywordRank(), 'trackers'] as const,
    keywordRankHistory: (keyword: string, days: number) =>
      [...queryKeys.ads.keywordRank(), 'history', keyword, days] as const,
    keywordRankProducts: (days: number) =>
      [...queryKeys.ads.keywordRank(), 'products', days] as const,
    keywordRankSerp: (keyword: string) =>
      [...queryKeys.ads.keywordRank(), 'serp', keyword] as const,
    config: () => [...queryKeys.ads.all, 'config'] as const,
    extensionStatus: () => [...queryKeys.ads.all, 'extension', 'status'] as const,
  },
  orders: {
    all: ['orders'] as const,
    pipeline: (params?: Record<string, string>) => [...queryKeys.orders.all, 'pipeline', params] as const,
    scheduledSync: (dateHour: string) => [...queryKeys.orders.all, 'scheduledSync', dateHour] as const,
    action: (action: string) => [...queryKeys.orders.all, 'action', action] as const,
    rocketSavedPoList: (params: {
      channelAccountId: string;
      from: string;
      to: string;
      status: string;
    }) => [...queryKeys.orders.all, 'rocket-saved-po-list', params] as const,
    collectionMalls: () => [...queryKeys.orders.all, 'collection', 'malls'] as const,
    collectionMallAction: (action: string) =>
      [...queryKeys.orders.collectionMalls(), action] as const,
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
  logs: {
    all: ['logs'] as const,
    list: () => [...queryKeys.logs.all, 'list'] as const,
  },
  profitLoss: {
    all: ['profitLoss'] as const,
    list: (period: string) => [...queryKeys.profitLoss.all, 'list', period] as const,
  },
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    list: (params: Record<string, string>) => [...queryKeys.purchaseOrders.all, 'list', params] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: (params: Record<string, string>) => [...queryKeys.reviews.all, 'list', params] as const,
  },
  salesAnalysis: {
    all: ['salesAnalysis'] as const,
    data: (period: string) => [...queryKeys.salesAnalysis.all, 'data', period] as const,
    statistics: (tab: string, period: string) =>
      [...queryKeys.salesAnalysis.all, 'statistics', tab, period] as const,
    dataSources: () => [...queryKeys.salesAnalysis.all, 'dataSources'] as const,
  },
  thumbnails: {
    all: ['thumbnails'] as const,
    list: (params: Record<string, string>) => [...queryKeys.thumbnails.all, 'list', params] as const,
  },
  thumbnailAnalysis: {
    all: ['thumbnailAnalysis'] as const,
    list: (params: Record<string, string>) => [...queryKeys.thumbnailAnalysis.all, 'list', params] as const,
    summary: () => [...queryKeys.thumbnailAnalysis.all, 'summary'] as const,
    generations: (params?: Record<string, string>) => [...queryKeys.thumbnailAnalysis.all, 'generations', params] as const,
    tracking: () => [...queryKeys.thumbnailAnalysis.all, 'tracking'] as const,
  },
  channelAccounts: {
    all: ['channelAccounts'] as const,
    active: () => [...queryKeys.channelAccounts.all, 'active'] as const,
  },
  channelSkuMappings: {
    all: ['channelSkuMappings'] as const,
    lists: () => [...queryKeys.channelSkuMappings.all, 'list'] as const,
    list: (params: Record<string, string>) =>
      [...queryKeys.channelSkuMappings.lists(), params] as const,
    candidates: (channelSkuId: string, params: Record<string, string>) =>
      [
        ...queryKeys.channelSkuMappings.all,
        'candidates',
        channelSkuId,
        params,
      ] as const,
  },
  channelProductMappings: {
    all: ['channelProductMappings'] as const,
    list: (params: Record<string, string>) =>
      [...queryKeys.channelProductMappings.all, 'list', params] as const,
    productCandidates: (channelListingId: string, params: Record<string, string>) =>
      [...queryKeys.channelProductMappings.all, 'product-candidates', channelListingId, params] as const,
    variantCandidates: (channelListingOptionId: string, params: Record<string, string>) =>
      [...queryKeys.channelProductMappings.all, 'variant-candidates', channelListingOptionId, params] as const,
    recipeSuggestion: (channelListingOptionId: string) =>
      [...queryKeys.channelProductMappings.all, 'recipe-suggestion', channelListingOptionId] as const,
    recipeAutomationPreview: (channelAccountId: string) =>
      [...queryKeys.channelProductMappings.all, 'recipe-automation-preview', channelAccountId] as const,
  },
  channelSkuAvailability: {
    all: ['channelSkuAvailability'] as const,
    lists: () => [...queryKeys.channelSkuAvailability.all, 'list'] as const,
    list: (params: Record<string, string>) =>
      [...queryKeys.channelSkuAvailability.lists(), params] as const,
  },
  coupangAccount: {
    all: ['coupangAccount'] as const,
    settings: () => [...queryKeys.coupangAccount.all, 'settings'] as const,
  },
  stockMovement: {
    all: ['stockMovement'] as const,
    data: (params: Record<string, string>) => [...queryKeys.stockMovement.all, 'data', params] as const,
    summary: (params: Record<string, string>) => [...queryKeys.stockMovement.all, 'summary', params] as const,
  },
  sourcing: {
    all: ['sourcing'] as const,
    list: (params: Record<string, string>) => [...queryKeys.sourcing.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.sourcing.all, 'detail', id] as const,
    preview: (id: string) => [...queryKeys.sourcing.all, 'preview', id] as const,
    scrapeUrlStatus: (url: string) => [...queryKeys.sourcing.all, 'scrape-url-status', url] as const,
    liveNaverMarket: () => [...queryKeys.sourcing.all, 'market', 'naver-live'] as const,
    trend: () => [...queryKeys.sourcing.all, 'trend'] as const,
    trendSeeds: () => [...queryKeys.sourcing.all, 'trend', 'seeds'] as const,
    trendNaverKeywords: (days: number) => [...queryKeys.sourcing.all, 'trend', 'naver-keywords', days] as const,
    trendPopularKeywords: (days: number) => [...queryKeys.sourcing.all, 'trend', 'popular-keywords', days] as const,
    trend1688Hot: (days: number) => [...queryKeys.sourcing.all, 'trend', '1688-hot', days] as const,
    trendShorts: (days: number) => [...queryKeys.sourcing.all, 'trend', 'shorts', days] as const,
    liveCommerceStatus: () => [...queryKeys.sourcing.all, 'live-commerce', 'status'] as const,
    liveCommerceExtensionStatus: () => [...queryKeys.sourcing.all, 'live-commerce', 'extension-status'] as const,
    liveCommerceSnapshots: (days: number) => [...queryKeys.sourcing.all, 'live-commerce', 'snapshots', days] as const,
    competitors: (days: number) => [...queryKeys.sourcing.all, 'competitors', days] as const,
    competitorCollectionStatus: (runId: string | null) =>
      [...queryKeys.sourcing.all, 'competitors', 'collection-status', runId] as const,
  },
  productContent: {
    all: ['content-archive'] as const,
    cards: (params: Record<string, string>) =>
      [...queryKeys.productContent.all, 'cards', params] as const,
    workspaces: (params: Record<string, string>) =>
      [...queryKeys.productContent.all, 'workspaces', params] as const,
    productWorkspace: (id: string, params?: Record<string, string>) =>
      [...queryKeys.productContent.all, 'product-workspace', id, params] as const,
    groupWorkspace: (id: string, params?: Record<string, string>) =>
      [...queryKeys.productContent.all, 'group-workspace', id, params] as const,
    sourcingLinks: (id: string, params?: Record<string, string>) =>
      [...queryKeys.productContent.all, 'sourcing-links', id, params] as const,
    detail: (id: string) => [...queryKeys.productContent.all, 'detail', id] as const,
    preview: (id: string) => [...queryKeys.productContent.all, 'preview', id] as const,
    editedHtml: (id: string) => [...queryKeys.productContent.all, 'edited-html', id] as const,
    generationEditedHtml: (id: string) =>
      [...queryKeys.productContent.all, 'generation-edited-html', id] as const,
    detailGenerationsAll: (templateId: 'kids-playful' | 'bold-vertical') =>
      [templateId === 'bold-vertical' ? 'bold-generations' : 'kp-generations'] as const,
    detailGenerations: (
      templateId: 'kids-playful' | 'bold-vertical',
      scope?: {
        productId?: string | null;
        sourceCandidateId?: string | null;
        contentWorkspaceId?: string | null;
      },
    ) => {
      const root = templateId === 'bold-vertical' ? 'bold-generations' : 'kp-generations';
      if (scope?.contentWorkspaceId) {
        return [root, { contentWorkspaceId: scope.contentWorkspaceId }] as const;
      }
      if (scope?.sourceCandidateId) {
        return [root, { sourceCandidateId: scope.sourceCandidateId }] as const;
      }
      if (templateId === 'kids-playful' && scope?.productId) {
        return [root, { productId: scope.productId }] as const;
      }
      if (templateId === 'bold-vertical') {
        return [root, { productId: scope?.productId ?? null }] as const;
      }
      return [root] as const;
    },
    detailGeneration: (id: string) => ['kp-generations', 'one', id] as const,
    detailGenerationNoop: () => ['kp-generations', 'one', 'noop'] as const,
  },
  contentWorkspaces: {
    all: ['content-workspaces'] as const,
    list: (params: Record<string, string>) =>
      [...queryKeys.contentWorkspaces.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.contentWorkspaces.all, 'detail', id] as const,
    duplicate: (title: string) =>
      [...queryKeys.contentWorkspaces.all, 'duplicate', title] as const,
  },
  deletionPassword: {
    all: ['deletion-password'] as const,
    status: () => [...queryKeys.deletionPassword.all, 'status'] as const,
  },
  channelListings: {
    all: ['channel-listings'] as const,
    list: (params: Record<string, string>) =>
      [...queryKeys.channelListings.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.channelListings.all, 'detail', id] as const,
  },
  coupangCatalogImports: {
    all: ['coupangCatalogImports'] as const,
    run: (channelAccountId: string, runId: string) =>
      [...queryKeys.coupangCatalogImports.all, channelAccountId, runId] as const,
    extension: (runId: string) =>
      [...queryKeys.coupangCatalogImports.all, 'extension', runId] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    list: () => [...queryKeys.organizations.all, 'list'] as const,
  },
  stockTransfers: {
    all: ['stockTransfers'] as const,
    list: (params?: Record<string, string>) => [...queryKeys.stockTransfers.all, 'list', params] as const,
  },
  warehouses: {
    all: ['warehouses'] as const,
  },
  returnTransfers: {
    all: ['returnTransfers'] as const,
    list: (params?: Record<string, string>) => [...queryKeys.returnTransfers.all, 'list', params] as const,
  },
  actionTasks: {
    all: ['actionTasks'] as const,
    list: (scope?: string) => [...queryKeys.actionTasks.all, 'list', scope ?? 'all'] as const,
  },
  syncInfo: () => ['syncInfo'] as const,
  salesPlans: {
    all: ['sales-plans'] as const,
  },
  categories: {
    all: ['categories'] as const,
  },
  bundleProducts: {
    all: ['bundle-products'] as const,
  },
  alerts: {
    all: ['alerts'] as const,
  },
  browserCollection: {
    all: ['browser-collection'] as const,
    session: (runId: string) =>
      [...queryKeys.browserCollection.all, 'session', runId] as const,
  },
  settlements: {
    all: ['settlements'] as const,
    list: (period?: string) => [...queryKeys.settlements.all, 'list', period || 'all'] as const,
  },
} as const;
