import { vi } from 'vitest';

function createModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'test-id', ...data })),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'test-id', ...data })),
    upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'test-id', ...create })),
    delete: vi.fn().mockResolvedValue({ id: 'test-id' }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({}),
  };
}

const models = [
  'product', 'order', 'coupangOrderItem', 'inventory', 'review',
  'company', 'supplier', 'warehouse', 'ad', 'profitLoss',
  'workflowTemplate', 'workflowRun', 'activityEvent', 'alert',
  'agentDefinition', 'agentTask', 'agentLog', 'agentEvent',
  'marketplace', 'businessRule', 'featureGate', 'thumbnailAnalysis',
  'thumbnailGeneration', 'thumbnail', 'category', 'optionMaster',
  'purchaseOrder', 'purchaseOrderItem', 'stockTransfer', 'stockTransaction',
  'stockAudit', 'shipment', 'coupangReturn', 'unshippedItem',
  'pickingList', 'pickingItem', 'returnTransfer', 'bundleProduct',
  'productMemo', 'processingCost', 'settlement', 'manualLedger',
  'supplierProduct', 'supplierPayment', 'salesPlan', 'trafficStats',
  'gradeHistory', 'actionTask', 'systemSetting', 'csRecord',
  'adSnapshot', 'adCampaignSnapshot', 'scrapeTarget', 'contentGeneration',
  'itemWinner', 'agentWakeupRequest', 'agentDenialRecord',
] as const;

export function createMockPrisma() {
  const mock: Record<string, unknown> = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn().mockImplementation((fn) =>
      typeof fn === 'function' ? fn(mock) : Promise.all(fn),
    ),
  };

  for (const model of models) {
    mock[model] = createModelMock();
  }

  return mock;
}
