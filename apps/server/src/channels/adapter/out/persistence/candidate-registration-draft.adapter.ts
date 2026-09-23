import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { REGISTRATION_SOURCE_PORT, type RegistrationSourcePort } from '../../../../sourcing/application/port/in/registration-source.port';
import { readRegistrationExecutionFacts } from '../repository/registration-execution.reader';
import { registrationDraftState } from '../../../domain/registration/registration-execution-state';
import {
  freezeProductRegistrationPayload,
  type RegistrationSubmissionJson,
} from '../../../domain/registration/registration-submission-payload';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../content/application/port/in/workspace/registration-content-workspace.port';
import {
  SALES_PRODUCT_THUMBNAIL_SOURCE_PORT,
  type SalesProductThumbnailSourcePort,
} from '../../../application/port/out/ai/sales-product-thumbnail-source.port';
import {
  assertRegistrationIdentity,
  assertThumbnailBelongsToProduct,
  requireConfirmedSalesProduct,
  findCandidateAccountPreparation,
  lockPreparation,
  lockSalesProduct,
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
    @Inject(SALES_PRODUCT_THUMBNAIL_SOURCE_PORT)
    private readonly thumbnailSources: SalesProductThumbnailSourcePort,
  ) {}

  async lockProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void> {
    const sourceCandidateId = await this.sourceOf(tx, input);
    // 후보 거절도 후보 행을 먼저 잠근다. 두 경로가 같은 순서로 잠가야 서로를 기다리지 않는다.
    if (sourceCandidateId) await this.source.lock(tx, input.organizationId, sourceCandidateId);
    await lockSalesProduct(client(tx), input.organizationId, input.salesProductId);
  }

  async requireActiveProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void> {
    const product = await client(tx).salesProduct.findFirst({
      where: { id: input.salesProductId, organizationId: input.organizationId },
      select: { name: true, status: true, sourceCandidateId: true },
    });
    if (!product) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    if (product.status === 'archived' || product.status === 'unused') {
      throw new ConflictException(
        `'${product.name}' 은(는) 보관한 판매상품입니다. 다시 쓰려면 판매상품에서 상태를 되돌리세요.`,
      );
    }
    // 원천에서 온 상품은 그 후보가 살아 있어야 한다. 직접 작성한 상품에는 볼 후보가 없다.
    if (product.sourceCandidateId) {
      await this.source.requireActive(tx, input.organizationId, product.sourceCandidateId);
    }
  }

  async findSalesProductIdForSource(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<string | null> {
    const product = await client(tx).salesProduct.findFirst({
      where: { organizationId: input.organizationId, sourceCandidateId: input.sourceCandidateId },
      select: { id: true },
    });
    return product?.id ?? null;
  }

  private async sourceOf(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<string | null> {
    const product = await client(tx).salesProduct.findFirst({
      where: { id: input.salesProductId, organizationId: input.organizationId },
      select: { sourceCandidateId: true },
    });
    return product?.sourceCandidateId ?? null;
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
    return row ? toFrozenDraft(client(tx), row, await this.readSourceContext(tx, row)) : null;
  }

  /**
   * 초안의 원천 기록과 콘텐츠 작업공간. 둘 다 등록 설정 줄에 저장하지 않는다 — 원천은 판매상품이
   * 가리키고, 작업공간은 AI 소유라 필요할 때 그 계약에 묻는다.
   */
  private async readSourceContext(
    tx: ChannelsRepositoryTransaction,
    row: Pick<RegistrationTarget, 'organizationId' | 'salesProductId' | 'displayName'>,
    options: { ensure?: boolean } = {},
  ): Promise<{ sourceCandidateId: string | null; sourceContentWorkspaceId: string | null; productName: string }> {
    const product = await client(tx).salesProduct.findFirst({
      where: { id: row.salesProductId, organizationId: row.organizationId },
      select: { name: true, sourceCandidateId: true },
    });
    const workspaceId = options.ensure
      ? (await this.contentWorkspaces.ensureSalesProductWorkspace(tx, {
        organizationId: row.organizationId,
        salesProductId: row.salesProductId,
        displayName: row.displayName ?? product?.name ?? '',
        createdByUserId: null,
      })).workspaceId
      : await this.contentWorkspaces.findSalesProductWorkspaceId({
        organizationId: row.organizationId,
        salesProductId: row.salesProductId,
      });
    return {
      sourceCandidateId: product?.sourceCandidateId ?? null,
      sourceContentWorkspaceId: workspaceId,
      productName: product?.name ?? '',
    };
  }

  async findDraftIds(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      isDeleted?: boolean;
      fenceIdle?: boolean;
    },
  ): Promise<string[]> {
    const rows = await client(tx).registrationTarget.findMany({
      where: {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
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
      salesProductId: string;
      channelAccountId: string;
      status?: string;
    },
  ): Promise<FrozenRegistrationDraft | null> {
    const row = await findCandidateAccountPreparation(client(tx), input.organizationId, input.salesProductId, input.channelAccountId);
    if (!row) return null;
    const named = await this.ensureDisplayName(tx, row);
    const draft = await toFrozenDraft(client(tx), named, await this.readSourceContext(tx, named));
    if (draft.reviewPayloadHash !== null && draft.status === 'draft') {
      throw new ConflictException('Approved preparation is missing its registration execution.');
    }
    return input.status && draft.status !== input.status ? null : draft;
  }

  /**
   * 제출 payload 를 그 상품 × 몰 계정의 **기존** 등록 설정에 얼린다.
   *
   * 없는 설정을 여기서 만들지 않는다(KID-310). 설정을 만드는 순간이 곧 판매 결정이라 그 자리에서
   * KID 를 발급하는데(`channels/registration-targets` resolve), 동결이 설정을 대신 만들면 그
   * 발급을 건너뛰어 코드 없는 상품이 몰로 나간다. 발급 지점은 셋뿐이다: 첫 등록 설정 · 몰 엑셀
   * 파일 · 직접 작성(ADR-0022).
   */
  async freezeForSubmission(
    handle: ChannelsRepositoryTransaction,
    input: FreezeRegistrationDraftInput,
  ): Promise<FrozenRegistrationDraft> {
    const tx = client(handle);
    const product = await requireConfirmedSalesProduct(tx, input.organizationId, input.salesProductId);
    const existing = await findCandidateAccountPreparation(tx, input.organizationId, product.id, input.channelAccountId);
    if (!existing) {
      throw new ConflictException(
        `'${product.name}' 에는 이 몰 계정의 등록 설정이 없습니다. 등록 설정을 먼저 만든 뒤 다시 시도하세요.`,
      );
    }
    const { workspaceId: sourceContentWorkspaceId } = await this.contentWorkspaces.ensureSalesProductWorkspace(handle, {
      organizationId: input.organizationId,
      salesProductId: product.id,
      displayName: input.displayName,
      createdByUserId: input.requestedByUserId,
    });
    const resolved = await this.contentWorkspaces.resolveSourceSelections(
      handle,
      selectionResolutionInput(input.organizationId, sourceContentWorkspaceId, {}),
    );
    await assertThumbnailBelongsToProduct(
      tx, this.thumbnailSources, input.organizationId, product.id, resolved.selectedThumbnailUrl,
    );
    const row = await tx.registrationTarget.update({
      where: { id: existing.id, organizationId: input.organizationId },
      data: {
        registrationInput: input.registrationInput as Prisma.InputJsonValue,
        ...(existing.displayName === null ? { displayName: input.displayName } : {}),
        ...resolvedSelectionData(resolved),
      },
    });
    return toFrozenDraft(tx, row, {
      sourceCandidateId: product.sourceCandidateId,
      sourceContentWorkspaceId,
      productName: product.name,
    });
  }

  /**
   * 이름 없는 옛 설정에 판매상품 이름을 채운다. 가격 게이트는 이름이 이미 있어도 본다 —
   * 이름이 있다고 초안이 아닌 것은 아니다.
   */
  private async ensureDisplayName(handle: ChannelsRepositoryTransaction, row: RegistrationTarget): Promise<RegistrationTarget> {
    const product = await requireConfirmedSalesProduct(client(handle), row.organizationId, row.salesProductId);
    if (row.displayName) return row;
    return client(handle).registrationTarget.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: { displayName: product.name },
    });
  }

  async closeDraft(tx: ChannelsRepositoryTransaction, input: CloseRegistrationDraftInput): Promise<number> {
    if (!input.archive) return 0;
    const updated = await client(tx).registrationTarget.updateMany({
      where: { id: input.preparationId, organizationId: input.organizationId,
        archivedAt: null,
        ...(input.salesProductId ? { salesProductId: input.salesProductId } : {}) },
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
      return { draft: await toFrozenDraft(tx, current, await this.readSourceContext(handle, current)), frozen: null };
    }

    assertRegistrationIdentity(current);
    const context = await this.readSourceContext(handle, current, { ensure: true });
    if (!context.sourceContentWorkspaceId) {
      throw new ConflictException('이 판매상품에는 콘텐츠 작업공간이 없습니다.');
    }
    const resolvedSelections = await this.contentWorkspaces.resolveSourceSelections(
      handle,
      selectionResolutionInput(
        input.organizationId,
        context.sourceContentWorkspaceId,
        current,
      ),
    );
    await assertThumbnailBelongsToProduct(
      tx,
      this.thumbnailSources,
      input.organizationId,
      current.salesProductId,
      resolvedSelections.selectedThumbnailUrl,
    );
    const resolvedCurrent = {
      ...current,
      ...resolvedSelectionData(resolvedSelections),
    } as RegistrationTarget;
    const frozen = freezeProductRegistrationPayload(
      buildSubmissionPayload(resolvedCurrent, context.productName), channelIntegrity.sha256,
    );
    const updated = await updatePreparationAndLoad(tx, input.organizationId, current.id, {
      ...resolvedSelectionData(resolvedSelections),
    });
    return {
      draft: await toFrozenDraft(tx, updated, context),
      frozen: { payload: frozen.payload, hash: frozen.hash },
    };
  }

  branchContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
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
    return this.contentWorkspaces.attachToListing(tx, {
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      listingId: input.listingId,
    });
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

function buildSubmissionPayload(row: RegistrationTarget, productName: string): RegistrationSubmissionJson {
  assertRegistrationIdentity(row);
  return {
    channelAccountId: row.channelAccountId,
    displayName: row.displayName ?? productName,
    registrationInput: row.registrationInput as RegistrationSubmissionJson,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}

async function toFrozenDraft(
  tx: Prisma.TransactionClient,
  row: RegistrationTarget,
  context: { sourceCandidateId: string | null; sourceContentWorkspaceId: string | null; productName: string },
): Promise<FrozenRegistrationDraft> {
  assertRegistrationIdentity(row);
  const [execution] = await readRegistrationExecutionFacts(tx, { organizationId: row.organizationId, registrationTargetIds: [row.id] });
  return {
    preparationId: row.id,
    organizationId: row.organizationId,
    salesProductId: row.salesProductId,
    sourceCandidateId: context.sourceCandidateId,
    channelAccountId: row.channelAccountId,
    sourceContentWorkspaceId: context.sourceContentWorkspaceId,
    // 표시명은 설정이 덮어쓴 값이고, 없으면 판매상품 이름이다.
    displayName: row.displayName ?? context.productName,
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
