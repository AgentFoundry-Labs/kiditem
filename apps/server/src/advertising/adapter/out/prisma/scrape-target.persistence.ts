// Tenant-scoped scrape-target CRUD. Extracted from AdSyncService so the
// service stays a dispatcher only. Mutating writes use `updateMany` with
// `(id, organizationId)` predicate followed by a tenant-scoped read so a
// cross-tenant id never leaks into the response.

import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';

export async function listScrapeTargets(
  prisma: PrismaService,
  organizationId: string,
) {
  return prisma.scrapeTarget.findMany({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createScrapeTarget(
  prisma: PrismaService,
  url: string,
  label: string | undefined,
  category: string | undefined,
  organizationId: string,
) {
  return prisma.scrapeTarget.create({
    data: {
      organizationId,
      url,
      label: label || url,
      category: category || 'advertising',
    },
  });
}

export async function markScrapeTargetScraped(
  prisma: PrismaService,
  id: string,
  organizationId: string,
) {
  const lastScrapedAt = new Date();
  const updated = await prisma.scrapeTarget.updateMany({
    where: { id, organizationId },
    data: { lastScrapedAt },
  });
  if (updated.count !== 1) {
    throw new NotFoundException('Scrape target not found');
  }
  return getScrapeTargetOrThrow(prisma, id, organizationId);
}

export async function deleteScrapeTarget(
  prisma: PrismaService,
  id: string,
  organizationId: string,
) {
  const updated = await prisma.scrapeTarget.updateMany({
    where: { id, organizationId },
    data: { isActive: false },
  });
  if (updated.count !== 1) {
    throw new NotFoundException('Scrape target not found');
  }
  return getScrapeTargetOrThrow(prisma, id, organizationId);
}

async function getScrapeTargetOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
) {
  const target = await prisma.scrapeTarget.findFirst({
    where: { id, organizationId },
  });
  if (!target) throw new NotFoundException('Scrape target not found');
  return target;
}
