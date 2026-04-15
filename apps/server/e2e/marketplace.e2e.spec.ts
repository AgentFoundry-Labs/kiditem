import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp, closeApp } from './setup';

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
  name: '주문 자동 처리',
  description: '신규 주문 수집 → 확인',
  category: 'automation',
  module: 'order',
  role: null,
  adapterType: null,
  nodesJson: [{ id: '1', type: 'trigger.manual' }],
  edgesJson: [],
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
      // companyId 는 DevAuthMiddleware + @CurrentCompany() 로 자동 주입 — 쿼리 불필요
      const res = await api().get('/api/marketplace/agents');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('매니저 에이전트');
      expect(res.body[0].installed).toBe(false);
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
      // body 는 비어 있어도 되고 — companyId 는 auth context 에서 주입
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
      expect(res.body[0].name).toBe('주문 자동 처리');
      expect(res.body[0].installed).toBe(false);
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
