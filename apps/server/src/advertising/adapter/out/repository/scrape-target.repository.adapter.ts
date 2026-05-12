// Tenant-scoped ScrapeTarget CRUD. Mutations use `updateMany` with
// `(id, organizationId)` predicate followed by a tenant-scoped read so a
// cross-tenant id never leaks into the response.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateScrapeTargetInput,
  ScrapeTargetRepositoryPort,
  ScrapeTargetRow,
} from '../../../application/port/out/scrape-target.repository.port';

@Injectable()
export class ScrapeTargetRepositoryAdapter
  implements ScrapeTargetRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  listActive(organizationId: string): Promise<ScrapeTargetRow[]> {
    return this.prisma.scrapeTarget.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    input: CreateScrapeTargetInput,
    organizationId: string,
  ): Promise<ScrapeTargetRow> {
    return this.prisma.scrapeTarget.create({
      data: {
        organizationId,
        url: input.url,
        label: input.label || input.url,
        category: input.category || 'advertising',
      },
    });
  }

  async markScraped(
    id: string,
    organizationId: string,
  ): Promise<ScrapeTargetRow> {
    const lastScrapedAt = new Date();
    const updated = await this.prisma.scrapeTarget.updateMany({
      where: { id, organizationId },
      data: { lastScrapedAt },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Scrape target not found');
    }
    return this.getOrThrow(id, organizationId);
  }

  async softDelete(
    id: string,
    organizationId: string,
  ): Promise<ScrapeTargetRow> {
    const updated = await this.prisma.scrapeTarget.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Scrape target not found');
    }
    return this.getOrThrow(id, organizationId);
  }

  private async getOrThrow(
    id: string,
    organizationId: string,
  ): Promise<ScrapeTargetRow> {
    const target = await this.prisma.scrapeTarget.findFirst({
      where: { id, organizationId },
    });
    if (!target) throw new NotFoundException('Scrape target not found');
    return target;
  }
}
