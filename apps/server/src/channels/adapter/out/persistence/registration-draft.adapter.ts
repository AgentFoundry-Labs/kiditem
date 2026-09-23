import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { readRegistrationExecutionFacts } from '../repository/registration-execution.reader';
import { registrationDraftState } from '../../../domain/registration/registration-execution-state';
import { canStartRegistration } from '../../../domain/sales-product/sales-product-status';
import type { SalesProductStatus } from '@kiditem/shared/sales-product';
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
  findAccountPreparation,
  lockPreparation,
  lockSalesProduct,
  resolvedSelectionData,
  selectionResolutionInput,
} from './registration-state-rows';
import type {
  CloseRegistrationDraftInput,
  FreezeRegistrationDraftInput,
  FrozenRegistrationDraft,
  RegistrationDraftPort,
} from '../../../application/port/out/persistence/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

/**
 * Channels 소유 등록 설정을 실행 울타리의 같은 트랜잭션에서 처리한다(ADR-0020).
 * 콘텐츠 provenance 는 Content 의 공개 포트로 확인하며, 등록 설정과 실행 상태의 변경 권한은
 * Channels 에 둔다. 원본 기록은 불변 사실이라 등록이 그 자격을 묻지 않는다(KID-313).
 */
@Injectable()
export class RegistrationDraftAdapter implements RegistrationDraftPort {
  constructor(
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
    @Inject(SALES_PRODUCT_THUMBNAIL_SOURCE_PORT)
    private readonly thumbnailSources: SalesProductThumbnailSourcePort,
  ) {}

  async lockProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void> {
    await lockSalesProduct(client(tx), input.organizationId, input.salesProductId);
  }

  async requireActiveProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void> {
    const product = await client(tx).salesProduct.findFirst({
      where: { id: input.salesProductId, organizationId: input.organizationId },
      select: { name: true, status: true },
    });
    if (!product) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    // 몰에 보내는 것은 KID 를 받은 판매 상품(active)뿐이다(KID-313).
    if (!canStartRegistration(product.status as SalesProductStatus)) {
      throw new ConflictException(product.status === 'archived'
        ? `'${product.name}' 은(는) 보관한 판매상품이라 몰에 보내지 않습니다.`
        : `'${product.name}' 은(는) 아직 판매상품코드(KID)가 없는 초안입니다. 등록 설정을 만들어 KID 를 받은 뒤 다시 시도하세요.`);
    }
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
  ): Promise<{ sourceRecordId: string | null; sourceContentWorkspaceId: string | null; productName: string }> {
    const product = await client(tx).salesProduct.findFirst({
      where: { id: row.salesProductId, organizationId: row.organizationId },
      select: { name: true, sourceRecordId: true },
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
      sourceRecordId: product?.sourceRecordId ?? null,
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
    const row = await findAccountPreparation(client(tx), input.organizationId, input.salesProductId, input.channelAccountId);
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
    const existing = await findAccountPreparation(tx, input.organizationId, product.id, input.channelAccountId);
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
      sourceRecordId: product.sourceRecordId,
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

async function toFrozenDraft(
  tx: Prisma.TransactionClient,
  row: RegistrationTarget,
  context: { sourceRecordId: string | null; sourceContentWorkspaceId: string | null; productName: string },
): Promise<FrozenRegistrationDraft> {
  assertRegistrationIdentity(row);
  const [execution] = await readRegistrationExecutionFacts(tx, { organizationId: row.organizationId, registrationTargetIds: [row.id] });
  return {
    preparationId: row.id,
    organizationId: row.organizationId,
    salesProductId: row.salesProductId,
    sourceRecordId: context.sourceRecordId,
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
