import { Prisma } from '@prisma/client';

/**
 * Prisma include preset for `MasterProduct.images` used by thumbnail-AI flows.
 *
 * Tenant scope: callers pass `organizationId` so the to-many relation include is
 * tenant-filtered, not just the parent master row. Pure URL/precedence rules
 * over the resulting row shape live in `domain/thumbnail-master-image.ts`.
 */
export const THUMBNAIL_MASTER_IMAGE_SELECT: Prisma.MasterProduct$imagesArgs = {
  where: { isDeleted: false },
  select: { url: true, role: true, sortOrder: true, isPrimary: true },
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
};

export function thumbnailMasterImageSelect(organizationId: string): Prisma.MasterProduct$imagesArgs {
  return {
    ...THUMBNAIL_MASTER_IMAGE_SELECT,
    where: { organizationId, isDeleted: false },
  };
}
