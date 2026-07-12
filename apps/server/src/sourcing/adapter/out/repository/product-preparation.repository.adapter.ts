import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type ProductPreparation } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateOrGetActiveDraftInput,
  FrozenProductPreparationSubmission,
  ProductPreparationClaimResult,
  ProductPreparationDraftResult,
  ProductPreparationRepositoryPort,
  ReplaceDraftInputRequest,
} from '../../../application/port/out/repository/product-preparation.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import {
  freezeProductPreparationPayload,
  type ProductPreparationJson,
} from '../../../domain/product-preparation-payload';

const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

@Injectable()
export class ProductPreparationRepositoryAdapter
  implements ProductPreparationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
  ): Promise<ProductPreparationDraftResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [candidate, account] = await Promise.all([
          tx.sourcingCandidate.findFirst({
            where: {
              id: input.sourceCandidateId,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            select: { id: true, status: true },
          }),
          tx.channelAccount.findFirst({
            where: {
              id: input.input.channelAccountId,
              organizationId: input.organizationId,
              status: 'active',
            },
            select: { id: true },
          }),
        ]);
        if (!candidate) throw new NotFoundException('Sourcing candidate not found.');
        if (candidate.status !== 'sourced') {
          throw new UnprocessableEntityException(
            `Candidate cannot be prepared from status '${candidate.status}'.`,
          );
        }
        if (!account) throw new NotFoundException('Channel account not found.');

        const existing = await tx.productPreparation.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.input.channelAccountId,
            status: { in: [...ACTIVE_PREPARATION_STATUSES] },
            isDeleted: false,
          },
          select: { id: true, status: true, sourceContentWorkspaceId: true },
        });
        if (existing) {
          if (existing.status !== 'draft') {
            throw new ConflictException('An active submission already exists for this account.');
          }
          return {
            preparationId: existing.id,
            status: 'draft' as const,
            sourceContentWorkspaceId: existing.sourceContentWorkspaceId ?? undefined,
          };
        }

        const sourceContentWorkspaceId = await resolveSourceWorkspace(
          tx as unknown as SourcingRepositoryTransaction,
        );
        const legacyDraft = await tx.productPreparation.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: null,
            status: 'draft',
            isDeleted: false,
          },
          select: { id: true },
        });
        if (legacyDraft) {
          const adopted = await tx.productPreparation.updateMany({
            where: {
              id: legacyDraft.id,
              organizationId: input.organizationId,
              sourceCandidateId: input.sourceCandidateId,
              channelAccountId: null,
              status: 'draft',
              isDeleted: false,
            },
            data: {
              channelAccountId: input.input.channelAccountId,
              sourceContentWorkspaceId,
              contentWorkspaceId: sourceContentWorkspaceId,
              createdByUserId: input.createdByUserId,
              ...editableUpdate(input.input),
            },
          });
          if (adopted.count !== 1) {
            throw new ConflictException('Legacy preparation changed during account adoption.');
          }
          return {
            preparationId: legacyDraft.id,
            status: 'draft' as const,
            sourceContentWorkspaceId,
          };
        }
        const created = await tx.productPreparation.create({
          data: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.input.channelAccountId,
            sourceContentWorkspaceId,
            contentWorkspaceId: sourceContentWorkspaceId,
            displayName: input.input.displayName,
            status: 'draft',
            registrationInput: input.input.registrationInput as Prisma.InputJsonValue,
            selectedThumbnailUrl: input.input.selectedThumbnailUrl ?? null,
            selectedThumbnailGenerationId:
              input.input.selectedThumbnailGenerationId ?? null,
            selectedThumbnailGenerationCandidateId:
              input.input.selectedThumbnailGenerationCandidateId ?? null,
            selectedDetailPageArtifactId:
              input.input.selectedDetailPageArtifactId ?? null,
            selectedDetailPageRevisionId:
              input.input.selectedDetailPageRevisionId ?? null,
            selectedDetailPageGenerationId:
              input.input.selectedDetailPageGenerationId ?? null,
            createdByUserId: input.createdByUserId,
          },
          select: { id: true },
        });
        return {
          preparationId: created.id,
          status: 'draft' as const,
          sourceContentWorkspaceId,
        };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const winner = await this.prisma.productPreparation.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.input.channelAccountId,
          status: 'draft',
          isDeleted: false,
        },
        select: { id: true, sourceContentWorkspaceId: true },
      });
      if (winner) {
        return {
          preparationId: winner.id,
          status: 'draft',
          sourceContentWorkspaceId: winner.sourceContentWorkspaceId ?? undefined,
        };
      }

      const candidateWideConflict = await this.prisma.productPreparation.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          isDeleted: false,
        },
        select: { channelAccountId: true },
      });
      if (candidateWideConflict) {
        throw new ConflictException(
          'Candidate already has a preparation for another channel account during the 0.1.8 expand compatibility window.',
        );
      }
      throw new ConflictException('A concurrent preparation command won.');
    }
  }

  async replaceDraftInput(
    input: ReplaceDraftInputRequest,
  ): Promise<ProductPreparationDraftResult | { preparationId: string; status: 'cancelled' }> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');

      if (input.command.kind === 'cancel') {
        if (current.status !== 'draft' && current.status !== 'failed') {
          throw new ConflictException(`Preparation cannot be cancelled from '${current.status}'.`);
        }
        await tx.productPreparation.updateMany({
          where: { id: current.id, organizationId: input.organizationId, isDeleted: false },
          data: { status: 'cancelled', isDeleted: true, deletedAt: new Date() },
        });
        return { preparationId: current.id, status: 'cancelled' as const };
      }

      if (current.status === 'draft') {
        await tx.productPreparation.updateMany({
          where: {
            id: current.id,
            organizationId: input.organizationId,
            status: 'draft',
            isDeleted: false,
          },
          data: editableUpdate(input.command.input),
        });
        return { preparationId: current.id, status: 'draft' as const };
      }
      if (current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot be edited from '${current.status}'.`);
      }

      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: 'failed',
          isDeleted: false,
        },
        data: { status: 'cancelled', isDeleted: true, deletedAt: new Date() },
      });
      const created = await tx.productPreparation.create({
        data: replacementCreateData(
          current,
          input.organizationId,
          input.userId,
          input.command.input,
        ),
        select: { id: true },
      });
      return { preparationId: created.id, status: 'draft' as const };
    });
  }

  async claimForSubmission(
    organizationId: string,
    preparationId: string,
    _userId: string | null,
  ): Promise<ProductPreparationClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      if (current.status === 'registered') {
        if (!current.channelListingId) {
          throw new ConflictException('Registered preparation is missing its listing identity.');
        }
        return {
          preparationId: current.id,
          status: 'registered' as const,
          listingId: current.channelListingId,
        };
      }
      const activeCandidate = current.sourceCandidateId
        ? await tx.sourcingCandidate.findFirst({
            where: {
              id: current.sourceCandidateId,
              organizationId,
              status: 'sourced',
              isDeleted: false,
            },
            select: { id: true },
          })
        : null;
      if (!activeCandidate) {
        throw new ConflictException('Source candidate is not active for registration.');
      }
      if (current.status === 'submitting' && !current.registrationResult) {
        throw new ConflictException('Product registration submission is already in progress.');
      }
      if (!['draft', 'submitting', 'failed'].includes(current.status)) {
        throw new ConflictException(`Preparation cannot be submitted from '${current.status}'.`);
      }
      assertRegistrationIdentity(current);

      if (current.status === 'draft') {
        const frozen = freezeProductPreparationPayload(buildSubmissionPayload(current));
        const submissionKey = randomUUID();
        const updated = await tx.productPreparation.update({
          where: { id: current.id },
          data: {
            status: 'submitting',
            submissionKey,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            lastError: null,
          },
        });
        return toFrozenSubmission(updated);
      }

      if (!current.submissionKey || !current.submissionPayloadJson || !current.submissionPayloadHash) {
        throw new ConflictException('Retriable preparation is missing its frozen submission.');
      }
      const updated = current.status === 'failed'
        ? await tx.productPreparation.update({
            where: { id: current.id },
            data: { status: 'submitting' },
          })
        : current;
      return toFrozenSubmission(updated);
    });
  }

  async loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenProductPreparationSubmission> {
    const row = await this.prisma.productPreparation.findFirst({
      where: {
        id: preparationId,
        organizationId,
        status: { in: ['submitting', 'failed'] },
        isDeleted: false,
      },
    });
    if (!row) throw new NotFoundException('Frozen product preparation not found.');
    return toFrozenSubmission(row);
  }

  async recordProviderResult(
    organizationId: string,
    preparationId: string,
    result: {
      providerSubmissionId?: string | null;
      externalListingId: string;
      channel: string;
      rawResult: unknown;
    },
  ): Promise<FrozenProductPreparationSubmission> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          status: 'submitting',
          isDeleted: false,
        },
      });
      if (!current) throw new ConflictException('Preparation is not awaiting a provider result.');
      const registrationResult = freezeProductPreparationPayload({
        providerSubmissionId: result.providerSubmissionId ?? null,
        externalListingId: result.externalListingId,
        channel: result.channel,
        rawResult: result.rawResult,
      } as ProductPreparationJson).payload;
      const updated = await tx.productPreparation.update({
        where: { id: current.id },
        data: {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          registrationResult: registrationResult as Prisma.InputJsonValue,
          lastError: null,
        },
      });
      return toFrozenSubmission(updated);
    });
  }

  async markFailed(input: {
    organizationId: string;
    preparationId: string;
    error: string;
  }): Promise<{ preparationId: string; status: 'failed' }> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { id: true, status: true },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      if (current.status !== 'submitting' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot fail from '${current.status}'.`);
      }
      await tx.productPreparation.updateMany({
        where: { id: current.id, organizationId: input.organizationId, isDeleted: false },
        data: { status: 'failed', lastError: input.error },
      });
      return { preparationId: current.id, status: 'failed' as const };
    });
  }

  async finalizeRegistered(
    organizationId: string,
    preparationId: string,
    finalize: (
      tx: SourcingRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<{ preparationId: string; status: 'registered'; listingId: string }> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      if (current.status === 'registered' && current.channelListingId) {
        return {
          preparationId: current.id,
          status: 'registered' as const,
          listingId: current.channelListingId,
        };
      }
      if (current.status !== 'submitting') {
        throw new ConflictException('Preparation is not ready for finalization.');
      }
      assertRegistrationIdentity(current);
      if (!current.registrationResult) {
        throw new ConflictException('Provider success must be recorded before finalization.');
      }

      const result = await finalize(tx as unknown as SourcingRepositoryTransaction);
      const listing = await tx.channelListing.findFirst({
        where: {
          id: result.listingId,
          organizationId,
          channelAccountId: current.channelAccountId,
          sourceCandidateId: current.sourceCandidateId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!listing) {
        throw new ConflictException('Final listing is outside the preparation account or source.');
      }
      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId,
          status: 'submitting',
          isDeleted: false,
        },
        data: {
          status: 'registered',
          channelListingId: listing.id,
          lastError: null,
        },
      });
      return {
        preparationId: current.id,
        status: 'registered' as const,
        listingId: listing.id,
      };
    }, { timeout: 15_000 });
  }
}

async function lockPreparation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM product_preparations
    WHERE id = ${preparationId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

function assertRegistrationIdentity(
  row: Pick<
    ProductPreparation,
    'sourceCandidateId' | 'channelAccountId' | 'sourceContentWorkspaceId'
  >,
): asserts row is typeof row & {
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
} {
  if (!row.sourceCandidateId || !row.channelAccountId || !row.sourceContentWorkspaceId) {
    throw new ConflictException('Preparation is missing account-scoped registration identity.');
  }
}

function buildSubmissionPayload(row: ProductPreparation): ProductPreparationJson {
  assertRegistrationIdentity(row);
  return {
    channelAccountId: row.channelAccountId,
    displayName: row.displayName,
    registrationInput: row.registrationInput as ProductPreparationJson,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}

function toFrozenSubmission(row: ProductPreparation): FrozenProductPreparationSubmission {
  assertRegistrationIdentity(row);
  if (!row.submissionKey || !row.submissionPayloadJson || !row.submissionPayloadHash) {
    throw new ConflictException('Preparation submission has not been frozen.');
  }
  const frozen = freezeProductPreparationPayload(
    row.submissionPayloadJson as ProductPreparationJson,
  );
  if (frozen.hash !== row.submissionPayloadHash) {
    throw new ConflictException('Frozen preparation payload hash does not match its JSON.');
  }
  const payload = frozen.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConflictException('Frozen preparation payload must be an object.');
  }
  const frozenChannelAccountId = frozenRequiredString(payload, 'channelAccountId');
  if (frozenChannelAccountId !== row.channelAccountId) {
    throw new ConflictException('Frozen preparation account does not match the row identity.');
  }
  return {
    preparationId: row.id,
    sourceCandidateId: row.sourceCandidateId,
    channelAccountId: frozenChannelAccountId,
    sourceContentWorkspaceId: row.sourceContentWorkspaceId,
    displayName: frozenRequiredString(payload, 'displayName'),
    status: row.status as FrozenProductPreparationSubmission['status'],
    submissionKey: row.submissionKey,
    submissionPayloadJson: frozen.payload,
    submissionPayloadHash: row.submissionPayloadHash,
    providerSubmissionId: row.providerSubmissionId,
    registrationResult: row.registrationResult as ProductPreparationJson | null,
    isRetry: row.lastError !== null,
    selectedThumbnailUrl: frozenNullableString(payload, 'selectedThumbnailUrl'),
    selectedThumbnailGenerationId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationId',
    ),
    selectedThumbnailGenerationCandidateId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationCandidateId',
    ),
    selectedDetailPageArtifactId: frozenNullableString(
      payload,
      'selectedDetailPageArtifactId',
    ),
    selectedDetailPageRevisionId: frozenNullableString(
      payload,
      'selectedDetailPageRevisionId',
    ),
    selectedDetailPageGenerationId: frozenNullableString(
      payload,
      'selectedDetailPageGenerationId',
    ),
  };
}

function frozenRequiredString(
  payload: ProductPreparationJson,
  key: string,
): string {
  const value = (payload as Record<string, ProductPreparationJson>)[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConflictException(`Frozen preparation payload is missing '${key}'.`);
  }
  return value;
}

function frozenNullableString(
  payload: ProductPreparationJson,
  key: string,
): string | null {
  const value = (payload as Record<string, ProductPreparationJson>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ConflictException(`Frozen preparation payload field '${key}' is invalid.`);
  }
  return value;
}

function editableUpdate(
  input: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Prisma.ProductPreparationUncheckedUpdateInput;
function editableUpdate(
  input: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Prisma.ProductPreparationUncheckedUpdateInput {
  return {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.registrationInput !== undefined
      ? { registrationInput: input.registrationInput as Prisma.InputJsonValue }
      : {}),
    ...(input.selectedThumbnailUrl !== undefined
      ? { selectedThumbnailUrl: input.selectedThumbnailUrl }
      : {}),
    ...(input.selectedThumbnailGenerationId !== undefined
      ? { selectedThumbnailGenerationId: input.selectedThumbnailGenerationId }
      : {}),
    ...(input.selectedThumbnailGenerationCandidateId !== undefined
      ? {
          selectedThumbnailGenerationCandidateId:
            input.selectedThumbnailGenerationCandidateId,
        }
      : {}),
    ...(input.selectedDetailPageArtifactId !== undefined
      ? { selectedDetailPageArtifactId: input.selectedDetailPageArtifactId }
      : {}),
    ...(input.selectedDetailPageRevisionId !== undefined
      ? { selectedDetailPageRevisionId: input.selectedDetailPageRevisionId }
      : {}),
    ...(input.selectedDetailPageGenerationId !== undefined
      ? { selectedDetailPageGenerationId: input.selectedDetailPageGenerationId }
      : {}),
  };
}

function replacementCreateData(
  current: ProductPreparation,
  organizationId: string,
  userId: string | null,
  update: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Prisma.ProductPreparationUncheckedCreateInput {
  return {
    organizationId,
    sourceCandidateId: current.sourceCandidateId,
    channelAccountId: current.channelAccountId,
    sourceContentWorkspaceId: current.sourceContentWorkspaceId,
    contentWorkspaceId: current.contentWorkspaceId,
    displayName: update.displayName ?? current.displayName,
    status: 'draft',
    registrationInput: (update.registrationInput ?? current.registrationInput) as Prisma.InputJsonValue,
    selectedThumbnailUrl: valueOrCurrent(update, 'selectedThumbnailUrl', current),
    selectedThumbnailGenerationId: valueOrCurrent(update, 'selectedThumbnailGenerationId', current),
    selectedThumbnailGenerationCandidateId: valueOrCurrent(
      update,
      'selectedThumbnailGenerationCandidateId',
      current,
    ),
    selectedDetailPageArtifactId: valueOrCurrent(update, 'selectedDetailPageArtifactId', current),
    selectedDetailPageRevisionId: valueOrCurrent(update, 'selectedDetailPageRevisionId', current),
    selectedDetailPageGenerationId: valueOrCurrent(update, 'selectedDetailPageGenerationId', current),
    createdByUserId: userId,
  };
}

type OptionalSelectionKey =
  | 'selectedThumbnailUrl'
  | 'selectedThumbnailGenerationId'
  | 'selectedThumbnailGenerationCandidateId'
  | 'selectedDetailPageArtifactId'
  | 'selectedDetailPageRevisionId'
  | 'selectedDetailPageGenerationId';

function valueOrCurrent(
  input: Partial<Record<OptionalSelectionKey, string | null>>,
  key: OptionalSelectionKey,
  current: ProductPreparation,
): string | null {
  return input[key] !== undefined ? input[key] ?? null : current[key];
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}
