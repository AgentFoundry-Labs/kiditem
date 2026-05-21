import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp, closeApp, TEST_ORGANIZATION_ID } from './setup';

let api: ReturnType<Awaited<ReturnType<typeof createApp>>['request']>;
let prisma: Awaited<ReturnType<typeof createApp>>['prisma'];

const MARKETPLACE_AGENT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const MARKETPLACE_WF_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

const sampleAgentCatalog = {
  id: MARKETPLACE_AGENT_ID,
  type: 'agent',
  name: '매니저 에이전트',
  description: '전사 데이터 분석',
  category: 'operations',
  role: 'manager',
  adapterType: 'claude_local',
  promptTemplate: 'agent-config/prompts/agents/manager.md',
  skills: [],
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
  name: '광고 성과 알림',
  description: '정해진 조건을 평가하고 알림을 남김',
  category: 'analytics',
  module: 'analytics',
  role: null,
  adapterType: null,
  nodesJson: [
    { id: '1', type: 'trigger.schedule', config: { cron: '0 9 * * *' } },
    { id: '2', type: 'condition.evaluate', config: { field: 'spend', operator: 'gte', value: 100000 } },
    { id: '3', type: 'notification.alert', config: { title: '분석 완료' } },
  ],
  edgesJson: [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
  ],
};

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

// Agent OS marketplace contract:
// - Shipped agent definitions are code-owned/global (no per-organization install/clone).
//   `GET /api/marketplace/agents` lists what's available; the per-tenant
//   "installed" flag is always false because cloning into a tenant is no
//   longer the install model.
// - Agent install/uninstall HTTP routes are stable surfaces but return 400 —
//   they are kept so callers fail loudly, not silently. Tenants pick
//   definitions up by creating an `AgentInstance` through Agent OS APIs.
// - Workflow install/uninstall remain organization-scoped CRUD on
//   `WorkflowTemplate`. The slim-core executor allowlist still rejects
//   catalog rows that reference removed node types.

describe('Marketplace — /api/marketplace/agents (Agent OS)', () => {
  describe('GET /api/marketplace/agents', () => {
    beforeEach(() => {
      (prisma.marketplace.findMany as any).mockResolvedValue([sampleAgentCatalog]);
    });

    it('lists agent catalog rows with installed=false (no per-tenant clone)', async () => {
      const res = await api().get('/api/marketplace/agents');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('매니저 에이전트');
      expect(res.body[0].installed).toBe(false);
    });
  });

  describe('POST /api/marketplace/agents/:id/install', () => {
    it('returns 400 — definitions are global; tenants create AgentInstance via Agent OS', async () => {
      const res = await api()
        .post(`/api/marketplace/agents/${MARKETPLACE_AGENT_ID}/install`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/marketplace/agents/:id/uninstall', () => {
    it('returns 400 — see install rationale', async () => {
      const res = await api()
        .post(`/api/marketplace/agents/${MARKETPLACE_AGENT_ID}/uninstall`)
        .send({});

      expect(res.status).toBe(400);
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
      expect(res.body[0].name).toBe('광고 성과 알림');
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
      (prisma.marketplace.findFirst as any).mockResolvedValue(legacyWorkflowCatalog);

      const res = await api().get(`/api/marketplace/workflows/${legacyWorkflowCatalog.id}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/workflows/:id/install', () => {
    beforeEach(() => {
      // The install adapter calls `prisma.marketplace.findFirst({ where: { id, type: 'workflow' } })`.
      (prisma.marketplace.findFirst as any).mockResolvedValue(sampleWorkflowCatalog);
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
      (prisma.marketplace.findFirst as any).mockResolvedValue(legacyWorkflowCatalog);
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
      // findInstalledWorkflow → workflowTemplate.findFirst({ marketplaceId, organizationId })
      (prisma.workflowTemplate.findFirst as any).mockResolvedValue({ id: 'wf-installed-id' });
      // deleteInstalledWorkflow → workflowTemplate.deleteMany({ id, organizationId })
      (prisma.workflowTemplate.deleteMany as any).mockResolvedValue({ count: 1 });
      // decrementInstallCountIfPositive → marketplace.updateMany({ id, installCount > 0 })
      (prisma.marketplace.updateMany as any).mockResolvedValue({ count: 1 });
    });

    it('uninstalls workflow and decrements install count', async () => {
      const res = await api()
        .post(`/api/marketplace/workflows/${MARKETPLACE_WF_ID}/uninstall`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(prisma.workflowTemplate.deleteMany).toHaveBeenCalled();
      expect(prisma.marketplace.updateMany).toHaveBeenCalled();
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
