// Tenant-scoped scrape-target CRUD. Extracted from AdSyncService so the
// service stays a dispatcher only. Mutating writes use `updateMany` with
// `(id, companyId)` predicate followed by a tenant-scoped read so a
// cross-tenant id never leaks into the response.

import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';

export async function listScrapeTargets(
  prisma: PrismaService,
  companyId: string,
) {
  return prisma.scrapeTarget.findMany({
    where: { companyId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createScrapeTarget(
  prisma: PrismaService,
  url: string,
  label: string | undefined,
  category: string | undefined,
  companyId: string,
) {
  return prisma.scrapeTarget.create({
    data: {
      companyId,
      url,
      label: label || url,
      category: category || 'advertising',
    },
  });
}

export async function markScrapeTargetScraped(
  prisma: PrismaService,
  id: string,
  companyId: string,
) {
  const lastScrapedAt = new Date();
  const updated = await prisma.scrapeTarget.updateMany({
    where: { id, companyId },
    data: { lastScrapedAt },
  });
  if (updated.count !== 1) {
    throw new NotFoundException('Scrape target not found');
  }
  return getScrapeTargetOrThrow(prisma, id, companyId);
}

export async function deleteScrapeTarget(
  prisma: PrismaService,
  id: string,
  companyId: string,
) {
  const updated = await prisma.scrapeTarget.updateMany({
    where: { id, companyId },
    data: { isActive: false },
  });
  if (updated.count !== 1) {
    throw new NotFoundException('Scrape target not found');
  }
  return getScrapeTargetOrThrow(prisma, id, companyId);
}

async function getScrapeTargetOrThrow(
  prisma: PrismaService,
  id: string,
  companyId: string,
) {
  const target = await prisma.scrapeTarget.findFirst({
    where: { id, companyId },
  });
  if (!target) throw new NotFoundException('Scrape target not found');
  return target;
}
