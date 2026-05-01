import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp, closeApp, TEST_ORGANIZATION_ID } from './setup';

let api: ReturnType<Awaited<ReturnType<typeof createApp>>['request']>;
let prisma: Awaited<ReturnType<typeof createApp>>['prisma'];

const MARKETPLACE_AGENT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const MARKETPLACE_WF_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const INSTALLED_AGENT_ID = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80';

const sampleAgentCatalog = {
  id: MARKETPLACE_AGENT_ID,
  type: 'agent',
  name: '매니저 에이전트',
  description: '전사 데이터 분석',
  category: 'operations',
  role: 'manager',
  adapterType: 'claude_local',
  promptTemplate: 'agent-config/prompts/agents/manager.md',
  skills: ['db-query'],
  permissions: null,
  icon: null,
  module: null,
  nodesJson: null,
  edgesJson: null,
  configurableParams: [],
  version: 1,
  installCount: 3,
  isPublished: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleWorkflowCatalog = {
  ...sampleAgentCatalog,
  id: MARKETPLACE_WF_ID,
  type: 'workflow',
  name: '광고 성과 분석',
  description: '광고 전략 에이전트에게 분석 위임',
  category: 'analytics',
  module: 'analytics',
  role: null,
  adapterType: null,
  nodesJson: [
    { id: '1', type: 'trigger.schedule', config: { cron: '0 9 * * *' } },
    { id: '2', type: 'agent_task.create', config: { agent_type: 'ad_strategy' } },
    { id: '3', type: 'notification.alert', config: { title: '분석 완료' } },
  ],
  edgesJson: [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
  ],
};

// Catalog row that still references removed slim-core executors. Used to
// prove the marketplace hides + rejects them after the workflow surface
// shrank to the registered node types.
const legacyWorkflowCatalog = {
  ...sampleWorkflowCatalog,
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091',
  name: '레거시 DB 쿼리 워크플로우',
  nodesJson: [
    { id: '1', type: 'trigger.manual' },
    { id: '2', type: 'internal.db_query', config: { model: 'Product' } },
    { id: '3', type: 'data.filter' },
  ],
};

beforeAll(async () => {
  const { request, prisma: p } = await createApp();
  api = request;
  prisma = p;
});

afterAll(async () => {
  await closeApp();
});

describe('Marketplace Agent CRUD — /api/marketplace/agents', () => {
  describe('GET /api/marketplace/agents', () => {
    beforeEach(() => {
      (prisma.marketplace.findMany as any).mockResolvedValue([sampleAgentCatalog]);
      (prisma.agentDefinition.findMany as any).mockResolvedValue([]);
    });

    it('lists available agents with installed status', async () => {
      // organizationId 는 DevAuthMiddleware + @CurrentOrganization() 로 자동 주입 — 쿼리 불필요
      const res = await api().get('/api/marketplace/agents');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('매니저 에이전트');
      expect(res.body[0].installed).toBe(false);

      // installed 판정에 사용되는 agentDefinition 조회가 organizationId 로 스코프되는지 확인 (multitenancy)
      expect(prisma.agentDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: TEST_ORGANIZATION_ID }),
        }),
      );
    });

    it('marks agent as installed when definition exists', async () => {
      (prisma.agentDefinition.findMany as any).mockResolvedValue([
        { marketplaceId: MARKETPLACE_AGENT_ID },
      ]);

      const res = await api().get('/api/marketplace/agents');

      expect(res.body[0].installed).toBe(true);
    });
  });

  describe('POST /api/marketplace/agents/:id/install', () => {
    beforeEach(() => {
      (prisma.marketplace.findUnique as any).mockResolvedValue(sampleAgentCatalog);
      (prisma.agentDefinition.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: INSTALLED_AGENT_ID, ...data }),
      );
      (prisma.agentDefinition.findFirst as any).mockResolvedValue(null);
      (prisma.marketplace.update as any).mockResolvedValue({ ...sampleAgentCatalog, installCount: 4 });
    });

    it('installs agent and returns created definition', async () => {
      // body 는 비어 있어도 되고 — organizationId 는 auth context 에서 주입
      const res = await api()
        .post(`/api/marketplace/agents/${MARKETPLACE_AGENT_ID}/install`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prisma.agentDefinition.create).toHaveBeenCalled();
      expect(prisma.marketplace.update).toHaveBeenCalled();
    });

    it('returns 404 for non-existent catalog item', async () => {
      (prisma.marketplace.findUnique as any).mockResolvedValue(null);

      const res = await api()
        .post('/api/marketplace/agents/non-existent-id/install')
        .send({});

      expect(res.status).toBe(404);
    });
  });
});

describe('Marketplace Workflow CRUD — /api/marketplace/workflows', () => {
  describe('GET /api/marketplace/workflows', () => {
    beforeEach(() => {
      (prisma.marketplace.findMany as any).mockResolvedValue([sampleWorkflowCatalog]);
      (prisma.workflowTemplate.findMany as any).mockResolvedValue([]);
    });

    it('lists available workflows', async () => {
      const res = await api().get('/api/marketplace/workflows');

      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('광고 성과 분석');
      expect(res.body[0].installed).toBe(false);

      // installed 판정에 사용되는 workflowTemplate 조회가 organizationId 로 스코프되는지 확인 (multitenancy)
      expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: TEST_ORGANIZATION_ID }),
        }),
      );
    });

    it('hides catalog rows that reference removed slim-core executors', async () => {
      (prisma.marketplace.findMany as any).mockResolvedValue([
        sampleWorkflowCatalog,
        legacyWorkflowCatalog,
      ]);

      const res = await api().get('/api/marketplace/workflows');

      expect(res.status).toBe(200);
      // legacyWorkflowCatalog references internal.db_query and data.filter,
      // so it must not surface in the install list at all.
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(MARKETPLACE_WF_ID);
    });
  });

  describe('GET /api/marketplace/workflows/:id', () => {
    it('returns 404 for catalog rows that reference removed executors', async () => {
      (prisma.marketplace.findUnique as any).mockResolvedValue(legacyWorkflowCatalog);

      const res = await api().get(`/api/marketplace/workflows/${legacyWorkflowCatalog.id}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/workflows/:id/install', () => {
    beforeEach(() => {
      (prisma.marketplace.findUnique as any).mockResolvedValue(sampleWorkflowCatalog);
      (prisma.workflowTemplate.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'wf-installed-id', ...data }),
      );
      (prisma.marketplace.update as any).mockResolvedValue({ ...sampleWorkflowCatalog, installCount: 4 });
    });

    it('installs workflow and returns created template', async () => {
      const res = await api()
        .post(`/api/marketplace/workflows/${MARKETPLACE_WF_ID}/install`)
        .send({});

      expect(res.status).toBe(201);
      expect(prisma.workflowTemplate.create).toHaveBeenCalled();
    });

    it('rejects install for catalog rows that reference removed executors', async () => {
      (prisma.marketplace.findUnique as any).mockResolvedValue(legacyWorkflowCatalog);
      (prisma.workflowTemplate.create as any).mockClear();
      (prisma.marketplace.update as any).mockClear();

      const res = await api()
        .post(`/api/marketplace/workflows/${legacyWorkflowCatalog.id}/install`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unsupported node types/);
      expect(prisma.workflowTemplate.create).not.toHaveBeenCalled();
      expect(prisma.marketplace.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/marketplace/workflows/:id/uninstall', () => {
    beforeEach(() => {
      (prisma.workflowTemplate.findFirst as any).mockResolvedValue({ id: 'wf-installed-id', marketplaceId: MARKETPLACE_WF_ID });
      (prisma.workflowTemplate.delete as any).mockResolvedValue({ id: 'wf-installed-id' });
      (prisma.marketplace.findUnique as any).mockResolvedValue({ ...sampleWorkflowCatalog, installCount: 3 });
      (prisma.marketplace.update as any).mockResolvedValue({ ...sampleWorkflowCatalog, installCount: 2 });
    });

    it('uninstalls workflow and decrements install count', async () => {
      const res = await api()
        .post(`/api/marketplace/workflows/${MARKETPLACE_WF_ID}/uninstall`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(prisma.workflowTemplate.delete).toHaveBeenCalled();
    });

    it('returns 404 when not installed', async () => {
      (prisma.workflowTemplate.findFirst as any).mockResolvedValue(null);

      const res = await api()
        .post(`/api/marketplace/workflows/${MARKETPLACE_WF_ID}/uninstall`)
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
