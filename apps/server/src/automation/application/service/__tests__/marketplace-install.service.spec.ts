import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  MarketplaceInstallStorePort,
  WorkflowCatalogInstallSource,
} from '../../port/out/marketplace-install-store.port';
import { MarketplaceInstallService } from '../marketplace-install.service';

function makeStore(): MarketplaceInstallStorePort {
  return {
    findWorkflowCatalog: vi.fn(),
    findAgentCatalog: vi.fn(),
    createWorkflowInstallation: vi.fn(),
    createAgentInstallation: vi.fn(),
    findTenantManager: vi.fn(),
    assignAgentReportsTo: vi.fn(),
    findInstalledWorkflow: vi.fn(),
    deleteInstalledWorkflow: vi.fn(),
    findInstalledAgent: vi.fn(),
    deleteInstalledAgent: vi.fn(),
    decrementInstallCountIfPositive: vi.fn(),
  };
}

function makeService() {
  const store = makeStore();
  const service = new MarketplaceInstallService(store);
  return { service, store };
}

const SLIM_CORE_NODES = [
  { id: 'n1', type: 'trigger.manual', config: {} },
  { id: 'n2', type: 'agent_task.create', config: { agent_type: 'rules_evaluation' } },
];

function workflowCatalog(
  overrides: Partial<WorkflowCatalogInstallSource> = {},
): WorkflowCatalogInstallSource {
  return {
    id: 'm-1',
    type: 'workflow',
    name: 'rules sweep',
    description: 'desc',
    module: 'analytics',
    nodesJson: SLIM_CORE_NODES,
    edgesJson: [{ source: 'n1', target: 'n2' }],
    configurableParams: [],
    ...overrides,
  };
}

describe('MarketplaceInstallService', () => {
  describe('installWorkflow', () => {
    it('throws NotFoundException when catalog row does not exist', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(null);

      await expect(
        service.installWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when nodesJson contains an unsupported node type', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(
        workflowCatalog({
          name: 'legacy',
          nodesJson: [{ id: 'n1', type: 'internal.db_query', config: {} }],
        }),
      );

      await expect(
        service.installWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(store.createWorkflowInstallation).not.toHaveBeenCalled();
    });

    it('creates a tenant workflow installation with manual triggerType by default', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(workflowCatalog());
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      const result = await service.installWorkflow('m-1', 'company-1');

      expect(store.createWorkflowInstallation).toHaveBeenCalledWith({
        companyId: 'company-1',
        name: 'rules sweep',
        description: 'desc',
        module: 'analytics',
        isActive: true,
        triggerType: 'manual',
        schedule: null,
        nodesJson: SLIM_CORE_NODES,
        edgesJson: [{ source: 'n1', target: 'n2' }],
        marketplaceId: 'm-1',
      });
      expect(result).toEqual({ id: 'tpl-1' });
    });

    it('falls back to module="order" when the catalog has no module', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(
        workflowCatalog({ module: null }),
      );
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1');

      expect(store.createWorkflowInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'order' }),
      );
    });

    it('promotes triggerType to "scheduled" and stores cron when params.schedule is a string', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(workflowCatalog());
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1', {
        schedule: '0 9 * * *',
      });

      expect(store.createWorkflowInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'scheduled',
          schedule: '0 9 * * *',
        }),
      );
    });

    it('applies configurableParams to matching node config and ignores unmapped keys', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(
        workflowCatalog({
          nodesJson: [
            { id: 'n1', type: 'trigger.manual', config: {} },
            {
              id: 'n2',
              type: 'agent_task.create',
              config: { agent_type: 'rules_evaluation' },
            },
          ],
          configurableParams: [
            { key: 'agent_type', nodeId: 'n2' },
            { key: 'orphan_param' },
          ],
        }),
      );
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1', {
        agent_type: 'custom_agent',
        orphan_param: 'x',
      });

      const createArgs = vi.mocked(store.createWorkflowInstallation).mock.calls[0][0];
      expect(createArgs.nodesJson).toEqual([
        { id: 'n1', type: 'trigger.manual', config: {} },
        {
          id: 'n2',
          type: 'agent_task.create',
          config: { agent_type: 'custom_agent' },
        },
      ]);
    });
  });

  describe('installAgent', () => {
    it('throws NotFoundException when catalog row does not exist', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findAgentCatalog).mockResolvedValue(null);

      await expect(service.installAgent('m-1', 'company-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('creates a tenant agent installation and auto-wires specialists to the tenant manager', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findAgentCatalog).mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        description: 'evaluates rules',
        adapterType: 'claude_local',
        role: 'specialist',
        skills: ['db'],
        permissions: { agentType: {} },
        promptTemplate: 'agent-config/prompts/rules.md',
        icon: 'brain',
      });
      vi.mocked(store.createAgentInstallation).mockResolvedValue({
        id: 'agent-1',
        role: 'specialist',
      });
      vi.mocked(store.findTenantManager).mockResolvedValue({ id: 'manager-1' });

      await service.installAgent('m-1', 'company-1');

      expect(store.createAgentInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          name: 'Rules Bot',
          marketplaceId: 'm-1',
          role: 'specialist',
        }),
      );
      expect(store.findTenantManager).toHaveBeenCalledWith('company-1');
      expect(store.assignAgentReportsTo).toHaveBeenCalledWith(
        'agent-1',
        'company-1',
        'manager-1',
      );
    });

    it('skips reportsTo wiring when no manager exists in the tenant', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findAgentCatalog).mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        description: null,
        adapterType: null,
        role: 'specialist',
        skills: [],
        permissions: null,
        promptTemplate: null,
        icon: null,
      });
      vi.mocked(store.createAgentInstallation).mockResolvedValue({
        id: 'agent-1',
        role: 'specialist',
      });
      vi.mocked(store.findTenantManager).mockResolvedValue(null);

      await service.installAgent('m-1', 'company-1');

      expect(store.assignAgentReportsTo).not.toHaveBeenCalled();
    });

    it('does not auto-wire reportsTo for non-specialist roles', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findAgentCatalog).mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Boss Bot',
        description: null,
        adapterType: null,
        role: 'manager',
        skills: [],
        permissions: null,
        promptTemplate: null,
        icon: null,
      });
      vi.mocked(store.createAgentInstallation).mockResolvedValue({
        id: 'agent-2',
        role: 'manager',
      });

      await service.installAgent('m-1', 'company-1');

      expect(store.findTenantManager).not.toHaveBeenCalled();
      expect(store.assignAgentReportsTo).not.toHaveBeenCalled();
    });

    it('applies typed params and ignores wrongly typed values', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findAgentCatalog).mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        description: null,
        adapterType: null,
        role: 'manager',
        skills: [],
        permissions: null,
        promptTemplate: null,
        icon: null,
      });
      vi.mocked(store.createAgentInstallation).mockResolvedValue({
        id: 'agent-1',
        role: 'manager',
      });

      await service.installAgent('m-1', 'company-1', {
        schedule: '0 9 * * *',
        monthlyTokenBudget: 100000,
        requiresApproval: true,
        timeoutSeconds: 'not-a-number',
      });

      expect(store.createAgentInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: '0 9 * * *',
          monthlyTokenBudget: 100000,
          requiresApproval: true,
        }),
      );
      expect(store.createAgentInstallation).toHaveBeenCalledWith(
        expect.not.objectContaining({ timeoutSeconds: expect.anything() }),
      );
    });
  });

  describe('uninstallWorkflow', () => {
    it('throws NotFoundException when no installed template exists for the tenant', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledWorkflow).mockResolvedValue(null);

      await expect(
        service.uninstallWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(store.deleteInstalledWorkflow).not.toHaveBeenCalled();
      expect(store.decrementInstallCountIfPositive).not.toHaveBeenCalled();
    });

    it('removes the tenant-scoped template and decrements installCount', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledWorkflow).mockResolvedValue({ id: 'tpl-1' });
      vi.mocked(store.deleteInstalledWorkflow).mockResolvedValue(true);

      await expect(
        service.uninstallWorkflow('m-1', 'company-1'),
      ).resolves.toEqual({ ok: true });

      expect(store.findInstalledWorkflow).toHaveBeenCalledWith('m-1', 'company-1');
      expect(store.deleteInstalledWorkflow).toHaveBeenCalledWith(
        'tpl-1',
        'company-1',
      );
      expect(store.decrementInstallCountIfPositive).toHaveBeenCalledWith('m-1');
    });
  });

  describe('uninstallAgent', () => {
    it('throws NotFoundException when no installed agent exists for the tenant', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledAgent).mockResolvedValue(null);

      await expect(service.uninstallAgent('m-1', 'company-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(store.deleteInstalledAgent).not.toHaveBeenCalled();
      expect(store.decrementInstallCountIfPositive).not.toHaveBeenCalled();
    });

    it('removes the tenant-scoped agent and decrements installCount', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledAgent).mockResolvedValue({
        id: 'agent-1',
        role: 'specialist',
      });
      vi.mocked(store.deleteInstalledAgent).mockResolvedValue(true);

      await expect(service.uninstallAgent('m-1', 'company-1')).resolves.toEqual({
        ok: true,
      });

      expect(store.findInstalledAgent).toHaveBeenCalledWith('m-1', 'company-1');
      expect(store.deleteInstalledAgent).toHaveBeenCalledWith(
        'agent-1',
        'company-1',
      );
      expect(store.decrementInstallCountIfPositive).toHaveBeenCalledWith('m-1');
    });
  });
});
