// apps/server/src/products/read-models/bundle-component-read-model.ts
import { BadRequestException } from '@nestjs/common';
import { BundleComponent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListBundleComponentsQuery } from '../dto/list-bundle-components.query';

/**
 * Read model for forward (by bundle) and reverse (by component) listing.
 * At least one filter is required so the result set stays bounded — this
 * preserves the public 400 contract from the previous service-side check.
 */
export async function listBundleComponentsForTenant(
  prisma: PrismaService,
  companyId: string,
  q: ListBundleComponentsQuery,
): Promise<BundleComponent[]> {
  if (!q.bundleOptionId && !q.componentOptionId) {
    throw new BadRequestException(
      'bundleOptionId or componentOptionId is required',
    );
  }
  return prisma.bundleComponent.findMany({
    where: {
      companyId,
      ...(q.bundleOptionId ? { bundleOptionId: q.bundleOptionId } : {}),
      ...(q.componentOptionId ? { componentOptionId: q.componentOptionId } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}
