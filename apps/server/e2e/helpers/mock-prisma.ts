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
  'user',
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

/**
 * e2e 테스트용 고정 UUID. DevAuthMiddleware 가 이 값으로
 * `user.findUnique` 를 호출하며, setup.ts 에서 default mock 이 아래 user 를 반환한다.
 */
export const TEST_USER_ID = 'f1234567-89ab-4cde-8f01-23456789abcd';
export const TEST_COMPANY_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const TEST_DEFAULT_USER = {
  id: TEST_USER_ID,
  companyId: TEST_COMPANY_ID,
  email: 'e2e@test.local',
  name: 'E2E Tester',
  role: 'owner',
  type: 'human',
  team: null,
  avatarUrl: null,
  agentDefinitionId: null,
  isActive: true,
  lastLoginAt: null,
  password: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

  // DevAuthMiddleware 가 `user.findUnique({ where: { id } })` 를 호출하므로
  // 요청된 TEST_USER_ID 면 default 를 반환, 아니면 null.
  (mock.user as { findUnique: { mockImplementation: (fn: unknown) => void } }).findUnique.mockImplementation(
    async ({ where }: { where: { id?: string } }) =>
      where?.id === TEST_USER_ID ? TEST_DEFAULT_USER : null,
  );

  return mock;
}
