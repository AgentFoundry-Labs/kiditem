// Persistence adapter for the marketplace catalog read model. Returns
// published workflow / agent rows plus per-organization install state for
// the catalog tile. The slim-core allowlist filter and "agent install not
// wired" projection live in the application service (pure logic).

import { Injectable } from '@nestjs/common';
import type { Marketplace } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AgentCatalogQuery,
  MarketplaceCatalogQuery,
  MarketplaceCatalogRepositoryPort,
  WorkflowCatalogReadout,
} from '../../../application/port/out/repository/marketplace-catalog.repository.port';

@Injectable()
export class MarketplaceCatalogRepositoryAdapter
  implements MarketplaceCatalogRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async fetchWorkflowCatalog(
    organizationId: string,
    query: MarketplaceCatalogQuery,
  ): Promise<WorkflowCatalogReadout> {
    const [rows, installed] = await Promise.all([
      this.prisma.marketplace.findMany({
        where: {
          type: 'workflow',
          isPublished: true,
          ...(query.module && { module: query.module }),
          ...(query.category && { category: query.category }),
        },
        orderBy: { installCount: 'desc' },
      }),
      this.prisma.workflowTemplate.findMany({
        where: { organizationId, marketplaceId: { not: null } },
        select: { marketplaceId: true },
      }),
    ]);
    const installedIds = new Set(
      installed
        .map((i) => i.marketplaceId)
        .filter((id): id is string => id !== null),
    );
    return { rows, installedIds };
  }

  findWorkflowById(id: string): Promise<Marketplace | null> {
    return this.prisma.marketplace.findFirst({
      where: { id, type: 'workflow' },
    });
  }

  fetchAgentCatalog(query: AgentCatalogQuery): Promise<Marketplace[]> {
    return this.prisma.marketplace.findMany({
      where: {
        type: 'agent',
        isPublished: true,
        ...(query.role && { role: query.role }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });
  }

  findAgentById(id: string): Promise<Marketplace | null> {
    return this.prisma.marketplace.findFirst({
      where: { id, type: 'agent' },
    });
  }
}
