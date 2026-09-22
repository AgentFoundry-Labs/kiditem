import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { REGISTRATION_SOURCE_PORT, type RegistrationSourcePort } from '../../../../sourcing/application/port/in/registration-source.port';
import { readRegistrationExecutionFacts, registrationDraftState } from '../../../read/registration-execution.reader';
import {
  freezeProductRegistrationPayload,
  type RegistrationSubmissionJson,
} from '../../../domain/registration/registration-submission-payload';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../sourcing/application/port/in/registration-content-workspace.port';
import {
  assertRegistrationIdentity,
  requireCandidateSalesProduct,
  findCandidateAccountPreparation,
  lockPreparation,
  resolvedSelectionData,
  selectionResolutionInput,
} from './candidate-registration-rows';
import type {
  CloseRegistrationDraftInput,
  ClaimRegistrationDraftInput,
  ClaimedRegistrationDraft,
  FreezeRegistrationDraftInput,
  FrozenRegistrationDraft,
  RegistrationDraftPort,
} from '../../../application/port/out/persistence/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

const channelIntegrity = new ChannelIntegrityAdapter();

/**
 * Channels 소유 등록 설정을 실행 울타리의 같은 트랜잭션에서 처리한다(ADR-0020).
 * 후보 자격과 콘텐츠 provenance는 Sourcing의 공개 포트로 확인하며,
 * 등록 설정과 실행 상태의 변경 권한은 Channels에 둔다.
 */
@Injectable()
export class RegistrationDraftAdapter implements RegistrationDraftPort {
  constructor(
    @Inject(REGISTRATION_SOURCE_PORT) private readonly source: RegistrationSourcePort,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  async lockCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    await this.source.lock(tx, input.organizationId, input.sourceCandidateId);
  }

  async requireActiveCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    await this.source.requireActive(tx, input.organizationId, input.sourceCandidateId);
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
    const row = await client(tx).registrationTarget.findFirst({
      where: { id: input.preparationId, organizationId: input.organizationId },
    });
    return row ? toFrozenDraft(client(tx), row) : null;
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
    const rows = await client(tx).registrationTarget.findMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        ...(input.isDeleted === undefined ? {} : {
          archivedAt: input.isDeleted ? { not: null } : null,
        }),
        ...(input.fenceIdle === true
          ? {
            archivedAt: null,
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
    const row = await findCandidateAccountPreparation(client(tx), input.organizationId, input.sourceCandidateId, input.channelAccountId);
    if (!row) return null;
    const draft = await toFrozenDraft(client(tx), await this.ensureCandidateContext(tx, row));
    if (draft.reviewPayloadHash !== null && draft.status === 'draft') {
      throw new ConflictException('Approved preparation is missing its registration execution.');
    }
    return input.status && draft.status !== input.status ? null : draft;
  }

  async freezeForSubmission(
    handle: ChannelsRepositoryTransaction,
    input: FreezeRegistrationDraftInput,
  ): Promise<FrozenRegistrationDraft> {
    const tx = client(handle);
    const product = await requireCandidateSalesProduct(tx, input.organizationId, input.sourceCandidateId);
    const existing = await findCandidateAccountPreparation(tx, input.organizationId, input.sourceCandidateId, input.channelAccountId);
    const sourceContentWorkspaceId = existing?.sourceContentWorkspaceId
      ?? await this.contentWorkspaces.ensureCandidateWorkspace(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        displayName: input.displayName,
        createdByUserId: input.requestedByUserId,
      });
    const resolved = await this.contentWorkspaces.resolveSourceSelections(
      handle,
      selectionResolutionInput(input.organizationId, sourceContentWorkspaceId, {}),
    );
    const frozenColumns = {
      displayName: input.displayName,
      registrationInput: input.registrationInput as Prisma.InputJsonValue,
      ...resolvedSelectionData(resolved),
    };
    const row = existing
      ? await tx.registrationTarget.update({
        where: { id: existing.id, organizationId: input.organizationId },
        data: {
          registrationInput: input.registrationInput as Prisma.InputJsonValue,
          sourceContentWorkspaceId,
          ...(existing.displayName === null ? { displayName: input.displayName } : {}),
          ...resolvedSelectionData(resolved),
        },
      })
      : await tx.registrationTarget.create({
        data: {
          organizationId: input.organizationId,
          salesProductId: product.id,
          selectedOptions: { createMany: { data: product.options.map((option, sortOrder) => ({
            salesProductOptionId: option.id, sortOrder,
          })) } },
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.channelAccountId,
          sourceContentWorkspaceId,
          createdByUserId: input.requestedByUserId,
          ...frozenColumns,
        },
      });
    return toFrozenDraft(tx, row);
  }

  private async ensureCandidateContext(handle: ChannelsRepositoryTransaction, row: RegistrationTarget): Promise<RegistrationTarget> {
    if (row.sourceContentWorkspaceId && row.displayName) return row;
    if (!row.sourceCandidateId) throw new ConflictException('Candidate identity is missing.');
    const product = await requireCandidateSalesProduct(client(handle), row.organizationId, row.sourceCandidateId);
    const workspaceId = row.sourceContentWorkspaceId ?? await this.contentWorkspaces.ensureCandidateWorkspace(
      handle,
      { organizationId: row.organizationId, sourceCandidateId: row.sourceCandidateId,
        displayName: row.displayName ?? product.name, createdByUserId: row.createdByUserId },
    );
    return client(handle).registrationTarget.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: { sourceContentWorkspaceId: workspaceId, displayName: row.displayName ?? product.name },
    });
  }

  async closeDraft(tx: ChannelsRepositoryTransaction, input: CloseRegistrationDraftInput): Promise<number> {
    if (!input.archive) return 0;
    const updated = await client(tx).registrationTarget.updateMany({
      where: { id: input.preparationId, organizationId: input.organizationId,
        archivedAt: null,
        ...(input.sourceCandidateId ? { sourceCandidateId: input.sourceCandidateId } : {}) },
      data: { archivedAt: input.closedAt },
    });
    return updated.count;
  }

  async claimForSubmission(
    handle: ChannelsRepositoryTransaction,
    input: ClaimRegistrationDraftInput,
  ): Promise<ClaimedRegistrationDraft> {
    const tx = client(handle);
    const current = await tx.registrationTarget.findFirst({
      where: { id: input.preparationId, organizationId: input.organizationId, archivedAt: null },
    });
    if (!current) throw new NotFoundException('Product preparation not found.');

    if (input.reuseFrozenSubmission) {
      return { draft: await toFrozenDraft(tx, current), frozen: null };
    }

    assertRegistrationIdentity(current);
    const resolvedSelections = await this.contentWorkspaces.resolveSourceSelections(
      handle,
      selectionResolutionInput(
        input.organizationId,
        current.sourceContentWorkspaceId,
        current,
      ),
    );
    const resolvedCurrent = {
      ...current,
      ...resolvedSelectionData(resolvedSelections),
    } as RegistrationTarget;
    const frozen = freezeProductRegistrationPayload(buildSubmissionPayload(resolvedCurrent), channelIntegrity.sha256);
    const updated = await updatePreparationAndLoad(tx, input.organizationId, current.id, {
      ...resolvedSelectionData(resolvedSelections),
    });
    return {
      draft: await toFrozenDraft(tx, updated),
      frozen: { payload: frozen.payload, hash: frozen.hash },
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
      tx,
      input,
    );
  }

}

function client(tx: ChannelsRepositoryTransaction): Prisma.TransactionClient {
  return ownerTransactionClient(tx);
}

async function updatePreparationAndLoad(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
  data: Prisma.RegistrationTargetUncheckedUpdateManyInput,
): Promise<RegistrationTarget> {
    const updated = await tx.registrationTarget.updateMany({
    where: { id: preparationId, organizationId, archivedAt: null },
    data,
  });
  if (updated.count !== 1) {
    throw new ConflictException('Product preparation changed during its locked update.');
  }
  const row = await tx.registrationTarget.findFirst({
    where: { id: preparationId, organizationId, archivedAt: null },
  });
  if (!row) throw new NotFoundException('Product preparation not found.');
  return row;
}

function buildSubmissionPayload(row: RegistrationTarget): RegistrationSubmissionJson {
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

async function toFrozenDraft(tx: Prisma.TransactionClient, row: RegistrationTarget): Promise<FrozenRegistrationDraft> {
  assertRegistrationIdentity(row);
  const [execution] = await readRegistrationExecutionFacts(tx, { organizationId: row.organizationId, registrationTargetIds: [row.id] });
  return {
    preparationId: row.id,
    organizationId: row.organizationId,
    sourceCandidateId: row.sourceCandidateId,
    channelAccountId: row.channelAccountId,
    sourceContentWorkspaceId: row.sourceContentWorkspaceId,
    displayName: row.displayName,
    status: registrationDraftState(row.archivedAt, execution),
    closedAt: row.archivedAt,
    isDeleted: row.archivedAt !== null,
    channelListingId: execution?.channelListingId ?? null,
    approvedByUserId: execution?.approvedByUserId ?? null,
    reviewPayloadHash: execution?.reviewPayloadHash ?? null,
    updatedAt: row.updatedAt,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}
