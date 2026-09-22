import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailAnalysisRow,
  UpsertThumbnailAnalysisInput,
} from '../../../application/port/out/repository/thumbnail-analysis.repository.port';

/**
 * Tenant-scoped writer for `ThumbnailAnalysis`. The previous flat service
 * inlined this upsert in three places (single-product analyze, chunk-batch
 * persist, image-spec pre-inspect) with subtly different defaults. This
 * helper is the single source of truth: any caller fills in the partial
 * facets it actually computed (`qualityResult`, `complianceResult`,
 * `imageSpec`, `recompose`) and the helper composes the Prisma update +
 * create payloads identically.
 *
 * `organizationId` is bound on every write so cross-tenant masters can never
 * be touched. Missing facets leave their existing column untouched on update
 * and use the legacy placeholder defaults on create (`grade: 'F'`,
 * `overallScore: 0`, empty arrays).
 */

export async function upsertThumbnailAnalysis(
  prisma: PrismaService,
  input: UpsertThumbnailAnalysisInput,
): Promise<ThumbnailAnalysisRow> {
  const {
    contentWorkspaceId,
    organizationId,
    imageUrl,
    qualityResult,
    complianceResult,
    imageSpec,
    recompose,
  } = input;
  const now = new Date();

  const update: Prisma.ThumbnailAnalysisUpdateInput = { imageUrl };
  const create: Prisma.ThumbnailAnalysisCreateInput = {
    contentWorkspace: {
      connect: {
        id_organizationId: { id: contentWorkspaceId, organizationId },
      },
    },
    organization: { connect: { id: organizationId } },
    imageUrl,
    overallScore: 0,
    grade: 'F',
    issues: [] as Prisma.InputJsonValue,
    suggestions: [] as Prisma.InputJsonValue,
    method: 'ai',
  };

  if (qualityResult) {
    update.overallScore = qualityResult.overallScore;
    update.grade = qualityResult.grade;
    update.scores = (qualityResult.scores ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    update.issues = (qualityResult.issues as unknown as Prisma.InputJsonValue) ?? [];
    update.suggestions = qualityResult.suggestions as Prisma.InputJsonValue;
    update.method = qualityResult.method;
    update.qualityAnalyzedAt = now;
    create.overallScore = qualityResult.overallScore;
    create.grade = qualityResult.grade;
    create.scores = (qualityResult.scores ?? undefined) as Prisma.InputJsonValue;
    create.issues = qualityResult.issues as unknown as Prisma.InputJsonValue;
    create.suggestions = qualityResult.suggestions as Prisma.InputJsonValue;
    create.method = qualityResult.method;
    create.qualityAnalyzedAt = now;
  }

  if (complianceResult) {
    update.complianceGrade = complianceResult.complianceGrade;
    update.complianceScores = complianceResult.complianceScores as unknown as Prisma.InputJsonValue;
    update.complianceAnalyzedAt = now;
    create.complianceGrade = complianceResult.complianceGrade;
    create.complianceScores = complianceResult.complianceScores as unknown as Prisma.InputJsonValue;
    create.complianceAnalyzedAt = now;
  }

  if (imageSpec) {
    update.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
    create.imageSpec = imageSpec as unknown as Prisma.InputJsonValue;
  }

  if (recompose !== undefined) {
    update.recompose = recompose as unknown as Prisma.InputJsonValue;
    create.recompose = recompose as unknown as Prisma.InputJsonValue;
  }

  const upserted = await prisma.thumbnailAnalysis.upsert({
    where: { contentWorkspaceId },
    create,
    update,
  });

  return upserted as ThumbnailAnalysisRow;
}
