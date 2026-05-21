import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  MarketplaceInstallStorePort,
  WorkflowCatalogInstallSource,
} from '../../port/out/repository/marketplace-install-store.port';
import { MarketplaceInstallService } from '../marketplace-install.service';

function makeStore(): MarketplaceInstallStorePort {
  return {
    findWorkflowCatalog: vi.fn(),
    createWorkflowInstallation: vi.fn(),
    findInstalledWorkflow: vi.fn(),
    deleteInstalledWorkflow: vi.fn(),
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
  { id: 'n2', type: 'notification.alert', config: { title: 'done' } },
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
        service.installWorkflow('m-1', 'organization-1'),
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
        service.installWorkflow('m-1', 'organization-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(store.createWorkflowInstallation).not.toHaveBeenCalled();
    });

    it('creates a tenant workflow installation with manual triggerType by default', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(workflowCatalog());
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      const result = await service.installWorkflow('m-1', 'organization-1');

      expect(store.createWorkflowInstallation).toHaveBeenCalledWith({
        organizationId: 'organization-1',
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

      await service.installWorkflow('m-1', 'organization-1');

      expect(store.createWorkflowInstallation).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'order' }),
      );
    });

    it('promotes triggerType to "scheduled" and stores cron when params.schedule is a string', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findWorkflowCatalog).mockResolvedValue(workflowCatalog());
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'organization-1', {
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
              type: 'notification.alert',
              config: { title: 'done' },
            },
          ],
          configurableParams: [
            { key: 'title', nodeId: 'n2' },
            { key: 'orphan_param' },
          ],
        }),
      );
      vi.mocked(store.createWorkflowInstallation).mockResolvedValue({ id: 'tpl-1' });

      await service.installWorkflow('m-1', 'organization-1', {
        title: 'custom title',
        orphan_param: 'x',
      });

      const createArgs = vi.mocked(store.createWorkflowInstallation).mock.calls[0][0];
      expect(createArgs.nodesJson).toEqual([
        { id: 'n1', type: 'trigger.manual', config: {} },
        {
          id: 'n2',
          type: 'notification.alert',
          config: { title: 'custom title' },
        },
      ]);
    });
  });

  describe('uninstallWorkflow', () => {
    it('throws NotFoundException when no installed template exists for the tenant', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledWorkflow).mockResolvedValue(null);

      await expect(
        service.uninstallWorkflow('m-1', 'organization-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(store.deleteInstalledWorkflow).not.toHaveBeenCalled();
      expect(store.decrementInstallCountIfPositive).not.toHaveBeenCalled();
    });

    it('removes the tenant-scoped template and decrements installCount', async () => {
      const { service, store } = makeService();
      vi.mocked(store.findInstalledWorkflow).mockResolvedValue({ id: 'tpl-1' });
      vi.mocked(store.deleteInstalledWorkflow).mockResolvedValue(true);

      await expect(
        service.uninstallWorkflow('m-1', 'organization-1'),
      ).resolves.toEqual({ ok: true });

      expect(store.findInstalledWorkflow).toHaveBeenCalledWith('m-1', 'organization-1');
      expect(store.deleteInstalledWorkflow).toHaveBeenCalledWith(
        'tpl-1',
        'organization-1',
      );
      expect(store.decrementInstallCountIfPositive).toHaveBeenCalledWith('m-1');
    });
  });
});
