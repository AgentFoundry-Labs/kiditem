import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  MAX_SELLPIA_MANUAL_MATCH_TARGETS,
  SellpiaManualMatchSnapshotSchema,
  SellpiaManualMatchTargetsResponseSchema,
  type SellpiaManualMatchAttempt,
  type SellpiaManualMatchSourceStatus,
} from '@kiditem/shared/sellpia-manual-match';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import {
  SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
  type SellpiaManualMatchRepositoryPort,
} from '../port/out/repository/sellpia-manual-match.repository.port';

@Injectable()
export class SellpiaManualMatchService {
  constructor(
    @Inject(SELLPIA_RECIPE_EVIDENCE_PORT)
    private readonly inventory: SellpiaRecipeEvidencePort,
    @Inject(SELLPIA_MANUAL_MATCH_REPOSITORY_PORT)
    private readonly repository: SellpiaManualMatchRepositoryPort,
  ) {}

  async targets(organizationId: string) {
    const [activeSkus, currentSnapshot] = await Promise.all([
      this.inventory.listActiveForMatching(organizationId),
      this.repository.getCurrentStatus(organizationId),
    ]);
    const targetCodes = targetCodesOf(activeSkus.map((sku) => sku.code));
    return SellpiaManualMatchTargetsResponseSchema.parse({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: targetCodes.length,
      targetCodes,
      currentSnapshot,
    });
  }

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<SellpiaManualMatchAttempt> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_IDEMPOTENCY_KEY');
    }
    return this.repository.beginAttempt({
      organizationId: input.organizationId,
      idempotencyKey,
    });
  }

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchAttempt> {
    return this.repository.readAttempt(input);
  }

  readCurrent(organizationId: string): Promise<SellpiaManualMatchSourceStatus> {
    return this.repository.readCurrent({ organizationId });
  }

  async completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    snapshot: unknown;
  }): Promise<SellpiaManualMatchAttempt> {
    const parsed = SellpiaManualMatchSnapshotSchema.safeParse(input.snapshot);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'sellpia_manual_match_invalid_snapshot',
        message: 'Sellpia manual-match snapshot is invalid',
        issues: parsed.error.issues.slice(0, 20),
      });
    }
    return this.repository.completeAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      snapshot: parsed.data,
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaManualMatchAttempt> {
    const errorCode = input.errorCode.trim();
    const errorMessage = input.errorMessage.trim();
    if (!errorCode || errorCode.length > 100 || !errorMessage || errorMessage.length > 300) {
      throw new BadRequestException('INVALID_SELLPIA_MANUAL_MATCH_FAILURE');
    }
    return this.repository.failAttempt({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      attemptToken: input.attemptToken,
      errorCode,
      errorMessage,
    });
  }

  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchAttempt> {
    return this.repository.cancelAttempt(input);
  }

  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ) {
    return this.repository.findByNormalizedAliases(organizationId, normalizedAliases);
  }
}

function targetCodesOf(codes: readonly string[]): string[] {
  const targetCodes = [...new Set(codes)].sort();
  if (targetCodes.length > MAX_SELLPIA_MANUAL_MATCH_TARGETS) {
    throw new ConflictException(
      `Sellpia manual-match collection supports at most ${MAX_SELLPIA_MANUAL_MATCH_TARGETS} active SKUs`,
    );
  }
  return targetCodes;
}
