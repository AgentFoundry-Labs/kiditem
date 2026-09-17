import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ProductPreparation } from '@prisma/client';
import {
  freezeProductRegistrationPayload,
  type RegistrationSubmissionJson,
} from '../../../../channels/domain/registration-submission-payload';
import type {
  ApplyRegistrationDraftStateInput,
  ClaimRegistrationDraftInput,
  ClaimedRegistrationDraft,
  FreezeRegistrationDraftInput,
  FrozenRegistrationDraft,
  RegistrationDraftPort,
} from '../../../../channels/application/port/out/cross-domain/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../../../../channels/application/port/out/transaction/repository-transaction';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../application/port/out/cross-domain/registration-content-workspace.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import { resolveProviderOutcome } from '../../../domain/product-preparation-state';
import {
  assertActiveCandidate,
  assertRegistrationIdentity,
  lockCandidate,
  lockPreparation,
  resolvedSelectionData,
  selectionResolutionInput,
} from '../repository/product-preparation-rows';

/**
 * Sourcing 이 등록 울타리에 내주는 초안 인터페이스.
 *
 * 울타리는 Channels 것이고 트랜잭션도 울타리가 연다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 초안 행을 실제로 쓰는 것은 여기뿐이라, "같은 초안을 한 계정에 두 번 보내지 않는다"는
 * 보장이 실행 행과 초안 전이를 한 커밋으로 묶으면서도 소유권은 갈라진다.
 *
 * 콘텐츠 작업공간과 선택값 해석은 울타리에 보이지 않는다 — Sourcing 안에서 끝낸다.
 */
@Injectable()
export class RegistrationDraftAdapter implements RegistrationDraftPort {
  constructor(
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  async lockCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    await lockCandidate(client(tx), input.organizationId, input.sourceCandidateId);
  }

  async requireActiveCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    await assertActiveCandidate(client(tx), input.organizationId, input.sourceCandidateId);
  }

  async lockDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<void> {
    await lockPreparation(client(tx), input.organizationId, input.preparationId);
  }

  async loadDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<FrozenRegistrationDraft | null> {
    const row = await client(tx).productPreparation.findFirst({
      where: { id: input.preparationId, organizationId: input.organizationId },
    });
    return row ? toFrozenDraft(row) : null;
  }

  async findDraftIds(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      isDeleted?: boolean;
      fenceIdle?: boolean;
    },
  ): Promise<string[]> {
    const rows = await client(tx).productPreparation.findMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        ...(input.isDeleted === undefined ? {} : { isDeleted: input.isDeleted }),
        ...(input.fenceIdle === true
          ? {
            status: 'submitting',
            providerOutcome: 'not_attempted',
            providerSubmissionId: null,
            registrationResult: { equals: Prisma.DbNull },
            submissionLeaseToken: null,
            submissionLeaseClaimedAt: null,
          }
          : {}),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findAccountDraft(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      status?: string;
    },
  ): Promise<FrozenRegistrationDraft | null> {
    const row = await client(tx).productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        channelAccountId: input.channelAccountId,
        isDeleted: false,
        ...(input.status ? { status: input.status } : {}),
      },
    });
    return row ? toFrozenDraft(row) : null;
  }

  async freezeForSubmission(
    handle: ChannelsRepositoryTransaction,
    input: FreezeRegistrationDraftInput,
  ): Promise<FrozenRegistrationDraft> {
    const tx = client(handle);
    const sourcingTx = handle as unknown as SourcingRepositoryTransaction;
    const existing = await tx.productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        channelAccountId: input.channelAccountId,
        isDeleted: false,
        status: 'draft',
      },
    });
    const sourceContentWorkspaceId = existing?.sourceContentWorkspaceId
      ?? await this.contentWorkspaces.ensureCandidateWorkspace(sourcingTx, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        displayName: input.displayName,
        createdByUserId: input.requestedByUserId,
      });
    const resolved = await this.contentWorkspaces.resolveSourceSelections(
      sourcingTx,
      selectionResolutionInput(input.organizationId, sourceContentWorkspaceId, {}),
    );
    const frozenColumns = {
      displayName: input.displayName,
      registrationInput: input.registrationInput as Prisma.InputJsonValue,
      status: 'submitting',
      submissionKey: input.submissionKey,
      submissionPayloadJson: input.frozenPayload as Prisma.InputJsonValue,
      submissionPayloadHash: input.frozenHash,
      reviewPayloadHash: input.frozenHash,
      approvedAt: new Date(),
      approvedByUserId: input.requestedByUserId,
      providerOutcome: 'not_attempted',
      ...resolvedSelectionData(resolved),
    };
    const row = existing
      ? await tx.productPreparation.update({
        where: { id: existing.id },
        data: frozenColumns,
      })
      : await tx.productPreparation.create({
        data: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.channelAccountId,
          sourceContentWorkspaceId,
          createdByUserId: input.requestedByUserId,
          ...frozenColumns,
        },
      });
    return toFrozenDraft(row);
  }

  async applyExecutionState(
    tx: ChannelsRepositoryTransaction,
    input: ApplyRegistrationDraftStateInput,
  ): Promise<number> {
    const expect = input.expect ?? {};
    const updated = await client(tx).productPreparation.updateMany({
      where: {
        id: input.preparationId,
        organizationId: input.organizationId,
        isDeleted: false,
        ...(input.sourceCandidateId ? { sourceCandidateId: input.sourceCandidateId } : {}),
        ...(expect.status === undefined ? {} : { status: expect.status }),
        ...(expect.providerOutcome === undefined
          ? {}
          : { providerOutcome: expect.providerOutcome }),
        ...(expect.submissionLeaseToken === undefined
          ? {}
          : { submissionLeaseToken: expect.submissionLeaseToken }),
        ...(expect.submissionLeaseClaimedAt === undefined
          ? {}
          : { submissionLeaseClaimedAt: expect.submissionLeaseClaimedAt }),
        ...(expect.noProviderIdentity === true
          ? {
            providerSubmissionId: null,
            registrationResult: { equals: Prisma.DbNull },
          }
          : {}),
      },
      data: executionStateData(input.set),
    });
    return updated.count;
  }

  async claimForSubmission(
    handle: ChannelsRepositoryTransaction,
    input: ClaimRegistrationDraftInput,
  ): Promise<ClaimedRegistrationDraft> {
    const tx = client(handle);
    const sourcingTx = handle as unknown as SourcingRepositoryTransaction;
    const current = await tx.productPreparation.findFirst({
      where: { id: input.preparationId, organizationId: input.organizationId, isDeleted: false },
    });
    if (!current) throw new NotFoundException('Product preparation not found.');

    if (input.reuseFrozenSubmission) {
      const updated = await updatePreparationAndLoad(tx, input.organizationId, current.id, {
        status: 'submitting',
        providerOutcome: input.providerOutcome ?? current.providerOutcome,
        submissionLeaseToken: input.submissionLeaseToken,
        submissionLeaseClaimedAt: input.now,
      });
      return { draft: toFrozenDraft(updated), frozen: null };
    }

    const resolvedSelections = await this.contentWorkspaces.resolveSourceSelections(
      sourcingTx,
      selectionResolutionInput(
        input.organizationId,
        current.sourceContentWorkspaceId,
        current,
      ),
    );
    const resolvedCurrent = {
      ...current,
      ...resolvedSelectionData(resolvedSelections),
    } as ProductPreparation;
    const frozen = freezeProductRegistrationPayload(buildSubmissionPayload(resolvedCurrent));
    const submissionKey = current.submissionKey || randomUUID();
    const updated = await updatePreparationAndLoad(tx, input.organizationId, current.id, {
      status: 'submitting',
      submissionKey,
      submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      providerOutcome: 'not_attempted',
      submissionLeaseToken: input.submissionLeaseToken,
      submissionLeaseClaimedAt: input.now,
      lastError: null,
      reviewPayloadHash: frozen.hash,
      approvedAt: input.now,
      approvedByUserId: input.userId,
      ...resolvedSelectionData(resolvedSelections),
    });
    return {
      draft: toFrozenDraft(updated),
      frozen: { payload: frozen.payload, hash: frozen.hash, submissionKey },
    };
  }

  branchContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      listingId: string;
      displayName: string;
      createdByUserId: string | null;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      selectedDetailPageArtifactId: string | null;
      selectedDetailPageRevisionId: string | null;
      selectedDetailPageGenerationId: string | null;
    },
  ): Promise<{ workspaceId: string }> {
    return this.contentWorkspaces.branchToListing(
      tx as unknown as SourcingRepositoryTransaction,
      input,
    );
  }

}

/** 울타리가 준 전이 값을 Prisma 갱신 데이터로 옮긴다. JSON 널만 따로 다룬다. */
function executionStateData(
  set: ApplyRegistrationDraftStateInput['set'],
): Prisma.ProductPreparationUncheckedUpdateManyInput {
  const { registrationResult, ...rest } = set;
  return {
    ...rest,
    ...(registrationResult === undefined
      ? {}
      : {
        registrationResult: registrationResult === null
          ? Prisma.JsonNull
          : registrationResult as Prisma.InputJsonValue,
      }),
  };
}

function client(tx: ChannelsRepositoryTransaction): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

async function updatePreparationAndLoad(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
  data: Prisma.ProductPreparationUncheckedUpdateManyInput,
): Promise<ProductPreparation> {
  const updated = await tx.productPreparation.updateMany({
    where: { id: preparationId, organizationId, isDeleted: false },
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

function buildSubmissionPayload(row: ProductPreparation): RegistrationSubmissionJson {
  assertRegistrationIdentity(row);
  return {
    channelAccountId: row.channelAccountId,
    displayName: row.displayName,
    registrationInput: row.registrationInput as RegistrationSubmissionJson,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}

function toFrozenDraft(row: ProductPreparation): FrozenRegistrationDraft {
  return {
    preparationId: row.id,
    organizationId: row.organizationId,
    sourceCandidateId: row.sourceCandidateId,
    channelAccountId: row.channelAccountId,
    sourceContentWorkspaceId: row.sourceContentWorkspaceId,
    displayName: row.displayName,
    status: row.status,
    isDeleted: row.isDeleted,
    submissionKey: row.submissionKey,
    submissionPayloadHash: row.submissionPayloadHash,
    hasSubmissionPayload: row.submissionPayloadJson !== null,
    providerOutcome: row.providerOutcome,
    providerSubmissionId: row.providerSubmissionId,
    hasRegistrationResult: row.registrationResult !== null,
    channelListingId: row.channelListingId,
    submissionLeaseToken: row.submissionLeaseToken,
    submissionLeaseClaimedAt: row.submissionLeaseClaimedAt,
    approvedByUserId: row.approvedByUserId,
    resolvedProviderOutcome: resolveProviderOutcome(row),
    submissionPayloadJson: row.submissionPayloadJson,
    registrationResult: row.registrationResult,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}
