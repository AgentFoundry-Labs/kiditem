import { Prisma } from '@prisma/client';
import { sourcingCandidateIdentityLockKey } from '../../../domain/sourcing-candidate-identity';
import type { UpsertCandidateInput } from '../../../application/port/out/repository/sourcing-candidate.repository.port';

/** One retained candidate policy shared by direct candidate writes and source publication. */
export async function upsertSourcedCandidateIn(tx: Prisma.TransactionClient, input: UpsertCandidateInput) {
  const key = sourcingCandidateIdentityLockKey(input);
  await tx.$queryRaw(
    // queryraw-tenancy-exempt: exact source identity key contains organization scope.
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"`,
  );
  const existing = await tx.sourcingCandidate.findFirst({
    where: { organizationId: input.organizationId,
      ...(input.sourceIdentityHash ? { sourcePlatform: input.sourcePlatform, sourceIdentityHash: input.sourceIdentityHash }
        : { sourceUrl: input.sourceUrl }), isDeleted: false, status: 'sourced' },
    select: { id: true, rawData: true },
  });
  const prior = existing?.rawData && typeof existing.rawData === 'object' && !Array.isArray(existing.rawData) ? existing.rawData : {};
  const data = {
    sourcePlatform: input.sourcePlatform, externalOfferId: input.externalOfferId ?? null,
    variantKeyNormalized: input.variantKeyNormalized ?? '', sourceIdentityHash: input.sourceIdentityHash ?? null,
    rawData: { ...prior, ...input.rawData } as Prisma.InputJsonValue,
    name: input.name, description: input.description, category: input.category, tags: input.tags,
    thumbnailUrl: input.thumbnailUrl, imageUrl: input.imageUrl, costCny: input.costCny ?? undefined,
  };
  const candidate = existing
    ? await tx.sourcingCandidate.update({ where: { id: existing.id }, data })
    : await tx.sourcingCandidate.create({ data: { organizationId: input.organizationId, sourceUrl: input.sourceUrl,
      triggeredByUserId: input.triggeredByUserId, status: 'sourced', ...data } });
  await ensureSourcedCandidateImages(tx, candidate.id, input.organizationId, input.images);
  return candidate;
}

export async function ensureSourcedCandidateImages(tx: Prisma.TransactionClient, candidateId: string,
  organizationId: string, images: UpsertCandidateInput['images']) {
  if (images.length === 0) return;
  const existing = await tx.candidateImage.count({ where: { candidateId, organizationId, isDeleted: false } });
  if (existing > 0) return;
  await tx.candidateImage.createMany({ data: images.map((image) => ({ organizationId, candidateId,
    url: image.url, role: image.role, label: image.label, sortOrder: image.sortOrder, source: image.source, isPrimary: image.isPrimary })) });
}
