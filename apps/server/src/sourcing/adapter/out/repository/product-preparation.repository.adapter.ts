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
  ResolveProductPreparationSelections,
  ReplaceDraftInputRequest,
} from '../../../application/port/out/repository/product-preparation.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import {
  freezeProductPreparationPayload,
  type ProductPreparationJson,
} from '../../../domain/product-preparation-payload';
import {
  blocksCandidateTerminalTransition,
  canDiscardProviderIdentity,
  canStartProviderCreate,
  hasLiveSubmissionLease,
  resolveProviderOutcome,
} from '../../../domain/product-preparation-state';

const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

@Injectable()
export class ProductPreparationRepositoryAdapter
  implements ProductPreparationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertCandidateTerminalTransitionAllowed(
    transaction: SourcingRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    const tx = transaction as Prisma.TransactionClient;
    const preparations = await tx.productPreparation.findMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        status: { in: [...ACTIVE_PREPARATION_STATUSES] },
        isDeleted: false,
      },
      select: {
        status: true,
        providerOutcome: true,
        submissionKey: true,
        providerSubmissionId: true,
        registrationResult: true,
      },
    });
    if (preparations.some((row) => blocksCandidateTerminalTransition({
      status: row.status,
      outcome: resolveProviderOutcome(row),
      submissionKey: row.submissionKey,
      providerSubmissionId: row.providerSubmissionId,
      registrationResult: row.registrationResult,
    }))) {
      throw new ConflictException(
        'Candidate has an active product preparation or retained provider identity.',
      );
    }
  }

  async createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockCandidate(tx, input.organizationId, input.sourceCandidateId);
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
        const resolvedSelections = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(
            input.organizationId,
            sourceContentWorkspaceId,
            input.input,
          ),
        );
        const legacyDraft = await tx.productPreparation.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: null,
            status: 'draft',
            isDeleted: false,
          },
        });
        if (legacyDraft) {
          if (!canDiscardProviderIdentity({
            outcome: resolveProviderOutcome(legacyDraft),
            providerSubmissionId: legacyDraft.providerSubmissionId,
            registrationResult: legacyDraft.registrationResult,
          })) {
            throw new ConflictException(
              'Legacy preparation provider identity cannot be adopted or discarded.',
            );
          }
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
              ...resolvedSelectionData(resolvedSelections),
              providerOutcome: 'not_attempted',
              submissionLeaseToken: null,
              submissionLeaseClaimedAt: null,
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
            ...resolvedSelectionData(resolvedSelections),
            providerOutcome: 'not_attempted',
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
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | { preparationId: string; status: 'cancelled' }> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, input.organizationId, identity.sourceCandidateId);
      }
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');

      const providerOutcome = resolveProviderOutcome(current);
      const providerIdentityCanBeDiscarded = canDiscardProviderIdentity({
        outcome: providerOutcome,
        providerSubmissionId: current.providerSubmissionId,
        registrationResult: current.registrationResult,
      });

      if (input.command.kind === 'cancel') {
        if (current.status !== 'draft' && current.status !== 'failed') {
          throw new ConflictException(`Preparation cannot be cancelled from '${current.status}'.`);
        }
        if (!providerIdentityCanBeDiscarded) {
          throw new ConflictException(
            'Preparation provider identity cannot be discarded by cancellation.',
          );
        }
        await tx.productPreparation.updateMany({
          where: { id: current.id, organizationId: input.organizationId, isDeleted: false },
          data: {
            status: 'cancelled',
            isDeleted: true,
            deletedAt: new Date(),
            submissionLeaseToken: null,
            submissionLeaseClaimedAt: null,
          },
        });
        return { preparationId: current.id, status: 'cancelled' as const };
      }

      if (current.status !== 'draft' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot be edited from '${current.status}'.`);
      }

      if (!providerIdentityCanBeDiscarded) {
        throw new ConflictException(
          'Preparation provider identity cannot be discarded or edited.',
        );
      }
      assertRegistrationIdentity(current);
      await assertActiveCandidate(tx, input.organizationId, current.sourceCandidateId);
      const resolvedSelections = await resolveSelections(
        tx as unknown as SourcingRepositoryTransaction,
        selectionResolutionInput(
          input.organizationId,
          current.sourceContentWorkspaceId,
          mergedSelectionValues(current, input.command.input),
        ),
      );

      if (current.status === 'draft') {
        await tx.productPreparation.updateMany({
          where: {
            id: current.id,
            organizationId: input.organizationId,
            status: 'draft',
            isDeleted: false,
          },
          data: {
            ...editableUpdate(input.command.input),
            ...resolvedSelectionData(resolvedSelections),
          },
        });
        return { preparationId: current.id, status: 'draft' as const };
      }
      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: 'failed',
          isDeleted: false,
        },
        data: {
          status: 'cancelled',
          isDeleted: true,
          deletedAt: new Date(),
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      const created = await tx.productPreparation.create({
        data: replacementCreateData(
          current,
          input.organizationId,
          input.userId,
          input.command.input,
          resolvedSelections,
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
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, organizationId, identity.sourceCandidateId);
      }
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
      assertRegistrationIdentity(current);
      await assertActiveCandidate(tx, organizationId, current.sourceCandidateId);
      const now = new Date();
      if (current.status === 'submitting' && hasLiveSubmissionLease({
        token: current.submissionLeaseToken,
        claimedAt: current.submissionLeaseClaimedAt,
        now,
      })) {
        throw new ConflictException('Product registration submission is already in progress.');
      }
      if (!['draft', 'submitting', 'failed'].includes(current.status)) {
        throw new ConflictException(`Preparation cannot be submitted from '${current.status}'.`);
      }
      const submissionLeaseToken = randomUUID();

      if (current.status === 'draft') {
        const resolvedSelections = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(
            organizationId,
            current.sourceContentWorkspaceId,
            current,
          ),
        );
        const resolvedCurrent = {
          ...current,
          ...resolvedSelectionData(resolvedSelections),
        } as ProductPreparation;
        const frozen = freezeProductPreparationPayload(
          buildSubmissionPayload(resolvedCurrent),
        );
        const submissionKey = randomUUID();
        const updated = await updatePreparationAndLoad(
          tx,
          organizationId,
          current.id,
          {
            status: 'submitting',
            submissionKey,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            providerOutcome: 'not_attempted',
            submissionLeaseToken,
            submissionLeaseClaimedAt: now,
            lastError: null,
            ...resolvedSelectionData(resolvedSelections),
          },
        );
        return toFrozenSubmission(updated);
      }

      if (!current.submissionKey || !current.submissionPayloadJson || !current.submissionPayloadHash) {
        throw new ConflictException('Retriable preparation is missing its frozen submission.');
      }
      const providerOutcome = resolveProviderOutcome(current);
      const updated = await updatePreparationAndLoad(
        tx,
        organizationId,
        current.id,
        {
          status: 'submitting',
          providerOutcome,
          submissionLeaseToken,
          submissionLeaseClaimedAt: now,
        },
      );
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

  async markProviderAttemptStarted(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          status: 'submitting',
          isDeleted: false,
        },
      });
      if (!current || current.submissionLeaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (!canStartProviderCreate(resolveProviderOutcome(current))) {
        throw new ConflictException(
          'Provider create is not allowed while the prior outcome is uncertain or succeeded.',
        );
      }
      const updated = await tx.productPreparation.updateMany({
        where: {
          id: preparationId,
          organizationId,
          status: 'submitting',
          submissionLeaseToken,
          isDeleted: false,
        },
        data: { providerOutcome: 'uncertain', lastError: null },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
    });
  }

  async recordProviderResult(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
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
      if (!current || current.submissionLeaseToken !== submissionLeaseToken) {
        throw new ConflictException('Preparation is not awaiting this provider result.');
      }
      const registrationResult = freezeProductPreparationPayload({
        providerSubmissionId: result.providerSubmissionId ?? null,
        externalListingId: result.externalListingId,
        channel: result.channel,
        rawResult: result.rawResult,
      } as ProductPreparationJson).payload;
      const updated = await updatePreparationAndLoad(
        tx,
        organizationId,
        current.id,
        {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          registrationResult: registrationResult as Prisma.InputJsonValue,
          providerOutcome: 'succeeded',
          lastError: null,
        },
      );
      return toFrozenSubmission(updated);
    });
  }

  async markFailed(input: {
    organizationId: string;
    preparationId: string;
    submissionLeaseToken: string;
    error: string;
    providerOutcome?: 'definitive_failure';
  }): Promise<{ preparationId: string; status: 'failed' }> {
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
      if (current.status !== 'submitting' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot fail from '${current.status}'.`);
      }
      if (
        current.status === 'submitting'
        && current.submissionLeaseToken !== input.submissionLeaseToken
      ) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (current.status === 'failed' && current.submissionLeaseToken === null) {
        return { preparationId: current.id, status: 'failed' as const };
      }
      const currentOutcome = resolveProviderOutcome(current);
      if (
        input.providerOutcome === 'definitive_failure'
        && (currentOutcome === 'succeeded'
          || current.providerSubmissionId !== null
          || current.registrationResult !== null)
      ) {
        throw new ConflictException('Recorded provider success cannot become a definitive failure.');
      }
      const providerOutcome = input.providerOutcome ?? currentOutcome;
      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          submissionLeaseToken: input.submissionLeaseToken,
          isDeleted: false,
        },
        data: {
          status: 'failed',
          lastError: input.error,
          providerOutcome,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      return { preparationId: current.id, status: 'failed' as const };
    });
  }

  async finalizeRegistered(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    finalize: (
      tx: SourcingRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<{ preparationId: string; status: 'registered'; listingId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, organizationId, identity.sourceCandidateId);
      }
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
      await assertActiveCandidate(tx, organizationId, current.sourceCandidateId);
      if (current.submissionLeaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (!current.registrationResult || resolveProviderOutcome(current) !== 'succeeded') {
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
      const updated = await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId,
          status: 'submitting',
          submissionLeaseToken,
          isDeleted: false,
        },
        data: {
          status: 'registered',
          channelListingId: listing.id,
          lastError: null,
          providerOutcome: 'succeeded',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Product registration finalization lease was lost.');
      }
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

async function lockCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM sourcing_candidates
    WHERE id = ${sourceCandidateId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

async function assertActiveCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  const candidate = await tx.sourcingCandidate.findFirst({
    where: {
      id: sourceCandidateId,
      organizationId,
      status: 'sourced',
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!candidate) {
    throw new ConflictException('Source candidate is not active for registration.');
  }
}

async function updatePreparationAndLoad(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
  data: Prisma.ProductPreparationUncheckedUpdateManyInput,
): Promise<ProductPreparation> {
  const updated = await tx.productPreparation.updateMany({
    where: {
      id: preparationId,
      organizationId,
      isDeleted: false,
    },
    data,
  });
  if (updated.count !== 1) {
    throw new ConflictException('Product preparation changed during its locked update.');
  }
  const row = await tx.productPreparation.findFirst({
    where: { id: preparationId, organizationId, isDeleted: false },
  });
  if (!row) throw new NotFoundException('Product preparation not found.');
  return row;
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
  const providerOutcome = resolveProviderOutcome(row);
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
    providerOutcome,
    submissionLeaseToken: row.submissionLeaseToken,
    isRetry: row.lastError !== null || providerOutcome !== 'not_attempted',
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
  resolvedSelections: ResolvedSelections,
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
    ...resolvedSelectionData(resolvedSelections),
    providerOutcome: 'not_attempted',
    submissionLeaseToken: null,
    submissionLeaseClaimedAt: null,
    createdByUserId: userId,
  };
}

type ResolvedSelections = Awaited<ReturnType<ResolveProductPreparationSelections>>;

function selectionResolutionInput(
  organizationId: string,
  sourceWorkspaceId: string,
  selections: Partial<Record<OptionalSelectionKey, string | null | undefined>>,
) {
  return {
    organizationId,
    sourceWorkspaceId,
    selectedThumbnailUrl: selections.selectedThumbnailUrl ?? null,
    selectedThumbnailGenerationId: selections.selectedThumbnailGenerationId ?? null,
    selectedThumbnailGenerationCandidateId:
      selections.selectedThumbnailGenerationCandidateId ?? null,
    selectedDetailPageArtifactId: selections.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId: selections.selectedDetailPageRevisionId ?? null,
    selectedDetailPageGenerationId: selections.selectedDetailPageGenerationId ?? null,
  };
}

function mergedSelectionValues(
  current: ProductPreparation,
  update: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Record<OptionalSelectionKey, string | null> {
  return {
    selectedThumbnailUrl: valueOrCurrent(update, 'selectedThumbnailUrl', current),
    selectedThumbnailGenerationId:
      valueOrCurrent(update, 'selectedThumbnailGenerationId', current),
    selectedThumbnailGenerationCandidateId:
      valueOrCurrent(update, 'selectedThumbnailGenerationCandidateId', current),
    selectedDetailPageArtifactId:
      valueOrCurrent(update, 'selectedDetailPageArtifactId', current),
    selectedDetailPageRevisionId:
      valueOrCurrent(update, 'selectedDetailPageRevisionId', current),
    selectedDetailPageGenerationId:
      valueOrCurrent(update, 'selectedDetailPageGenerationId', current),
  };
}

function resolvedSelectionData(
  resolved: ResolvedSelections,
): Record<OptionalSelectionKey, string | null> {
  return {
    selectedThumbnailUrl: resolved.selectedThumbnailUrl,
    selectedThumbnailGenerationId: resolved.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId:
      resolved.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: resolved.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: resolved.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: resolved.selectedDetailPageGenerationId,
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
