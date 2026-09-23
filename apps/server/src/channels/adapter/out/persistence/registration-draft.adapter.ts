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
  assertRegistrationIdentity,
  requireConfirmedSalesProduct,
  findAccountPreparation,
  lockPreparation,
  lockSalesProduct,
} from './registration-state-rows';
import { normalizeRegistrationMallInput, withAdapterValues } from '../../../domain/registration/registration-mall-input';
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
    row: Pick<RegistrationTarget, 'organizationId' | 'salesProductId'>,
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
        displayName: product?.name ?? '',
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
    // 판매가 게이트는 등록 설정이 있어도 본다 — 초안이면 제출하지 않는다.
    await requireConfirmedSalesProduct(client(tx), row.organizationId, row.salesProductId);
    const draft = await toFrozenDraft(client(tx), row, await this.readSourceContext(tx, row));
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
    // 고른 콘텐츠가 이 상품 작업공간의 것인지 보고, 비어 있으면 지금 현재 값으로 채운다. 대상에는 다시 쓰지 않는다.
    const resolved = await this.contentWorkspaces.resolveSourceSelections(handle, {
      organizationId: input.organizationId,
      sourceWorkspaceId: sourceContentWorkspaceId,
      selectedThumbnailAssetId: existing.selectedThumbnailAssetId,
      selectedDetailPageRevisionId: existing.selectedDetailPageRevisionId,
    });
    // 설정에는 쿠팡 어댑터 값만 남긴다(KID-321 이 몰 중립으로 옮길 때까지). 실행 시점 사실은 실행 payload 에만 있다.
    const row = await tx.registrationTarget.update({
      where: { id: existing.id, organizationId: input.organizationId },
      data: {
        registrationInput: withAdapterValues(
          normalizeRegistrationMallInput(existing.registrationInput),
          'coupang',
          coupangAdapterValues(input.registrationInput),
        ) as Prisma.InputJsonValue,
      },
    });
    return {
      ...await toFrozenDraft(tx, row, {
        sourceRecordId: product.sourceRecordId,
        sourceContentWorkspaceId,
        productName: product.name,
      }),
      selectedThumbnailAssetId: resolved.selectedThumbnailAssetId,
      selectedDetailPageRevisionId: resolved.selectedDetailPageRevisionId,
    };
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

  async attachContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string; listingId: string },
  ): Promise<{ workspaceId: string } | null> {
    // 작업공간이 없는 판매 상품(옛 행)은 붙일 것이 없다 — 몰에 올라간 등록 확인을 막지 않는다.
    const workspaceId = await this.contentWorkspaces.findSalesProductWorkspaceId(input);
    if (!workspaceId) return null;
    return this.contentWorkspaces.attachToListing(tx, input);
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
    // 등록 설정은 이름을 갖지 않는다 — 판매상품 이름이다(KID-313 W2).
    displayName: context.productName,
    status: registrationDraftState(row.archivedAt, execution),
    closedAt: row.archivedAt,
    isDeleted: row.archivedAt !== null,
    channelListingId: execution?.channelListingId ?? null,
    approvedByUserId: execution?.approvedByUserId ?? null,
    reviewPayloadHash: execution?.reviewPayloadHash ?? null,
    updatedAt: row.updatedAt,
    selectedThumbnailAssetId: row.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
  };
}

/** 쿠팡 윙 흐름이 다음 제출 때 다시 읽는 값. 없으면 쿠팡 칸을 비운다. */
function coupangAdapterValues(input: Record<string, unknown>): Record<string, unknown> | null {
  const values: Record<string, unknown> = {};
  if (typeof input.wingCategoryKey === 'string') values.wingCategoryKey = input.wingCategoryKey;
  if (input.wingProduct && typeof input.wingProduct === 'object' && !Array.isArray(input.wingProduct)) {
    values.wingProduct = input.wingProduct;
  }
  return Object.keys(values).length > 0 ? values : null;
}
