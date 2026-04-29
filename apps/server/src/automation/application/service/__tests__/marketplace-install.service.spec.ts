import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketplaceInstallService } from '../marketplace-install.service';

function makePrisma() {
  return {
    marketplace: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
    workflowTemplate: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    agentDefinition: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeService() {
  const prisma = makePrisma();
  const service = new MarketplaceInstallService(prisma as never);
  return { service, prisma };
}

const SLIM_CORE_NODES = [
  { id: 'n1', type: 'trigger.manual', config: {} },
  { id: 'n2', type: 'agent_task.create', config: { agent_type: 'rules_evaluation' } },
];

describe('MarketplaceInstallService', () => {
  describe('installWorkflow', () => {
    it('throws NotFoundException when catalog row does not exist', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue(null);

      await expect(
        service.installWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when catalog row is not a workflow', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        nodesJson: SLIM_CORE_NODES,
      });

      await expect(
        service.installWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when nodesJson contains an unsupported node type (defense-in-depth)', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        name: 'legacy',
        nodesJson: [{ id: 'n1', type: 'internal.db_query', config: {} }],
        edgesJson: [],
        configurableParams: [],
      });

      await expect(
        service.installWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.workflowTemplate.create).not.toHaveBeenCalled();
      expect(prisma.marketplace.update).not.toHaveBeenCalled();
    });

    it('clones the catalog into WorkflowTemplate, increments installCount, and sets manual triggerType by default', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        name: 'rules sweep',
        description: 'desc',
        module: 'analytics',
        nodesJson: SLIM_CORE_NODES,
        edgesJson: [{ source: 'n1', target: 'n2' }],
        configurableParams: [],
      });
      prisma.workflowTemplate.create.mockResolvedValue({ id: 'tpl-1' });

      const result = await service.installWorkflow('m-1', 'company-1');

      expect(prisma.workflowTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'company-1',
          name: 'rules sweep',
          module: 'analytics',
          triggerType: 'manual',
          schedule: null,
          marketplaceId: 'm-1',
          nodesJson: SLIM_CORE_NODES,
        }),
      });
      expect(prisma.marketplace.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { installCount: { increment: 1 } },
      });
      expect(result).toEqual({ id: 'tpl-1' });
    });

    it('falls back to module="order" when the catalog has no module', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        name: 'rules sweep',
        nodesJson: SLIM_CORE_NODES,
        edgesJson: [],
        configurableParams: [],
        module: null,
      });
      prisma.workflowTemplate.create.mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1');

      expect(prisma.workflowTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ module: 'order' }),
      });
    });

    it('promotes triggerType to "scheduled" and stores the cron when params.schedule is provided', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        name: 'rules sweep',
        nodesJson: SLIM_CORE_NODES,
        edgesJson: [],
        configurableParams: [],
      });
      prisma.workflowTemplate.create.mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1', { schedule: '0 9 * * *' });

      expect(prisma.workflowTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggerType: 'scheduled',
          schedule: '0 9 * * *',
        }),
      });
    });

    it('applies configurableParams to the matching node config and ignores keys with no nodeId mapping', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        name: 'rules sweep',
        nodesJson: [
          { id: 'n1', type: 'trigger.manual', config: {} },
          { id: 'n2', type: 'agent_task.create', config: { agent_type: 'rules_evaluation' } },
        ],
        edgesJson: [],
        configurableParams: [
          { key: 'agent_type', nodeId: 'n2' },
          { key: 'orphan_param' /* no nodeId — ignored */ },
        ],
      });
      prisma.workflowTemplate.create.mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'company-1', {
        agent_type: 'custom_agent',
        orphan_param: 'x',
      });

      const createArgs = prisma.workflowTemplate.create.mock.calls[0][0];
      expect(createArgs.data.nodesJson[1]).toMatchObject({
        id: 'n2',
        config: { agent_type: 'custom_agent' },
      });
      expect(createArgs.data.nodesJson[0]).toMatchObject({ id: 'n1', config: {} });
    });
  });

  describe('installAgent', () => {
    it('throws NotFoundException when catalog row is not an agent', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'workflow',
        nodesJson: SLIM_CORE_NODES,
      });

      await expect(
        service.installAgent('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('clones the catalog into AgentDefinition, increments installCount, and auto-wires reportsTo for specialists', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        description: 'evaluates rules',
        adapterType: 'claude_local',
        role: 'specialist',
        skills: ['db'],
        permissions: { agentType: {} },
        promptTemplate: 'agent-config/prompts/rules.md',
        icon: '🧠',
      });
      prisma.agentDefinition.create.mockResolvedValue({
        id: 'agent-1',
        role: 'specialist',
      });
      prisma.agentDefinition.findFirst.mockResolvedValue({ id: 'manager-1' });

      await service.installAgent('m-1', 'company-1');

      expect(prisma.agentDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'company-1',
          name: 'Rules Bot',
          marketplaceId: 'm-1',
          role: 'specialist',
        }),
      });
      expect(prisma.agentDefinition.findFirst).toHaveBeenCalledWith({
        where: { companyId: 'company-1', role: 'manager' },
      });
      expect(prisma.agentDefinition.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: { reportsTo: 'manager-1' },
      });
      expect(prisma.marketplace.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { installCount: { increment: 1 } },
      });
    });

    it('skips reportsTo wiring when no manager exists in the tenant', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        role: 'specialist',
      });
      prisma.agentDefinition.create.mockResolvedValue({
        id: 'agent-1',
        role: 'specialist',
      });
      prisma.agentDefinition.findFirst.mockResolvedValue(null);

      await service.installAgent('m-1', 'company-1');

      expect(prisma.agentDefinition.update).not.toHaveBeenCalled();
    });

    it('does not auto-wire reportsTo for non-specialist roles', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Boss Bot',
        role: 'manager',
      });
      prisma.agentDefinition.create.mockResolvedValue({
        id: 'agent-2',
        role: 'manager',
      });

      await service.installAgent('m-1', 'company-1');

      expect(prisma.agentDefinition.findFirst).not.toHaveBeenCalled();
      expect(prisma.agentDefinition.update).not.toHaveBeenCalled();
    });

    it('applies whitelisted params (schedule / monthlyTokenBudget / requiresApproval / timeoutSeconds) when provided', async () => {
      const { service, prisma } = makeService();
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        type: 'agent',
        name: 'Rules Bot',
        role: 'manager',
      });
      prisma.agentDefinition.create.mockResolvedValue({
        id: 'agent-1',
        role: 'manager',
      });

      await service.installAgent('m-1', 'company-1', {
        schedule: '0 9 * * *',
        monthlyTokenBudget: 100000,
        requiresApproval: true,
        timeoutSeconds: 600,
      });

      expect(prisma.agentDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          schedule: '0 9 * * *',
          monthlyTokenBudget: 100000,
          requiresApproval: true,
          timeoutSeconds: 600,
        }),
      });
    });
  });

  describe('uninstallWorkflow', () => {
    it('throws NotFoundException when no installed template exists for the tenant (cross-tenant id rejection)', async () => {
      const { service, prisma } = makeService();
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.uninstallWorkflow('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.workflowTemplate.delete).not.toHaveBeenCalled();
      expect(prisma.marketplace.update).not.toHaveBeenCalled();
    });

    it('removes the tenant-scoped template and decrements installCount', async () => {
      const { service, prisma } = makeService();
      prisma.workflowTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        installCount: 5,
      });

      await expect(
        service.uninstallWorkflow('m-1', 'company-1'),
      ).resolves.toEqual({ ok: true });

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith({
        where: { marketplaceId: 'm-1', companyId: 'company-1' },
      });
      expect(prisma.workflowTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
      });
      expect(prisma.marketplace.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { installCount: { decrement: 1 } },
      });
    });

    it('does not decrement installCount below zero', async () => {
      const { service, prisma } = makeService();
      prisma.workflowTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        installCount: 0,
      });

      await service.uninstallWorkflow('m-1', 'company-1');

      expect(prisma.marketplace.update).not.toHaveBeenCalled();
    });
  });

  describe('uninstallAgent', () => {
    it('throws NotFoundException when no installed agent exists for the tenant', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.uninstallAgent('m-1', 'company-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.agentDefinition.delete).not.toHaveBeenCalled();
    });

    it('removes the tenant-scoped agent and decrements installCount', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue({ id: 'agent-1' });
      prisma.marketplace.findFirst.mockResolvedValue({
        id: 'm-1',
        installCount: 3,
      });

      await expect(
        service.uninstallAgent('m-1', 'company-1'),
      ).resolves.toEqual({ ok: true });

      expect(prisma.agentDefinition.findFirst).toHaveBeenCalledWith({
        where: { marketplaceId: 'm-1', companyId: 'company-1' },
      });
      expect(prisma.agentDefinition.delete).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
      });
      expect(prisma.marketplace.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { installCount: { decrement: 1 } },
      });
    });
  });
});
