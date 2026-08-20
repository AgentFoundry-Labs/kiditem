import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdvertisingTrackedWingProductsInputSchema,
  sourcingWingCatalogKeywordIdentity,
} from '@kiditem/shared/sourcing';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import { currentBusinessDate } from '../../domain/business-date';
import {
  WING_TRACKED_PRODUCT_REPOSITORY_PORT,
  type WingTrackedProductRepositoryPort,
  type WingTrackedHistory,
  type WingTrackedProductWithLatest,
  type WingTrackedSnapshotRow,
  type WingTrackedSnapshotValues,
} from '../port/out/repository/wing-tracked-product.repository.port';

/** 컨트롤러가 지표 매핑에 쓰는 스냅샷 값 타입. */
export type WingTrackedSnapshotValuesInput = WingTrackedSnapshotValues;

export interface AddWingTrackedProductInput extends WingTrackedSnapshotValues {
  productId: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName: string;
  imagePath?: string | null;
  brandName?: string | null;
  categoryHierarchy?: string | null;
  sourceKeyword?: string | null;
}

export interface IngestWingSnapshotItem extends WingTrackedSnapshotValues {
  productId: string;
  sourceKeyword?: string | null;
}

@Injectable()
export class WingTrackedProductService {
  constructor(
    @Inject(WING_TRACKED_PRODUCT_REPOSITORY_PORT)
    private readonly repo: WingTrackedProductRepositoryPort,
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
  ) {}

  list(organizationId: string): Promise<WingTrackedProductWithLatest[]> {
    return this.repo.list(organizationId);
  }

  /** 추적 등록 + 등록 시점 지표를 오늘 스냅샷으로 저장. */
  async addTracker(
    input: AddWingTrackedProductInput,
    organizationId: string,
  ): Promise<WingTrackedProductWithLatest> {
    const tracker = await this.repo.upsertByProductId(
      {
        productId: input.productId,
        itemId: input.itemId,
        vendorItemId: input.vendorItemId,
        productName: input.productName,
        imagePath: input.imagePath,
        brandName: input.brandName,
        categoryHierarchy: input.categoryHierarchy,
        sourceKeyword: input.sourceKeyword,
      },
      organizationId,
    );
    const capturedAt = new Date();
    await this.repo.upsertSnapshotsByProductId(
      [
        {
          productId: input.productId,
          businessDate: currentBusinessDate(),
          sourceKeyword: input.sourceKeyword ?? null,
          capturedAt,
          ...snapshotValues(input),
        },
      ],
      organizationId,
    );
    const rows = await this.repo.list(organizationId);
    return rows.find((row) => row.id === tracker.id) ?? { ...tracker, latestSnapshot: null };
  }

  async ingestBrowserSnapshots(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    items: IngestWingSnapshotItem[];
  }): Promise<{ captured: number; ignored: number }> {
    return this.attemptVerifier.withActiveBrowserAttemptFence({
      organizationId: input.organizationId,
      runId: input.operationRunId,
      expectedOperationKey: 'advertising.refresh_tracked_wing_products',
      attemptToken: input.attemptToken,
    }, async (attempt, transaction) => {
      const operationInput = AdvertisingTrackedWingProductsInputSchema.safeParse(
        attempt.input,
      );
      if (!operationInput.success) {
        throw new ConflictException('tracked_wing_operation_input_invalid');
      }
      const allowedProductIds = new Set(operationInput.data.trackedProductIds);
      const allowedKeywords = new Set(
        operationInput.data.keywords.map(sourcingWingCatalogKeywordIdentity),
      );
      if (input.items.some((item) =>
        !allowedProductIds.has(item.productId)
        || !item.sourceKeyword
        || !allowedKeywords.has(sourcingWingCatalogKeywordIdentity(item.sourceKeyword)))) {
        throw new ConflictException('tracked_wing_operation_input_mismatch');
      }
      const capturedAt = new Date();
      const businessDate = currentBusinessDate();
      return this.repo.upsertSnapshotsByProductIdInAttempt(
        transaction,
        input.items.map((item) => ({
          productId: item.productId,
          businessDate,
          sourceKeyword: item.sourceKeyword ?? null,
          capturedAt,
          ...snapshotValues(item),
        })),
        input.organizationId,
      );
    });
  }

  async remove(id: string, organizationId: string): Promise<{ id: string }> {
    const removed = await this.repo.delete(id, organizationId);
    return { id: removed.id };
  }

  async getHistory(
    id: string,
    days: number,
    organizationId: string,
  ): Promise<{ trackedProductId: string; productName: string; points: WingTrackedSnapshotRow[] }> {
    const tracker = await this.repo.findById(id, organizationId);
    if (!tracker) throw new NotFoundException('Wing tracked product not found');
    const points = await this.repo.findHistory(id, organizationId, days);
    return { trackedProductId: id, productName: tracker.productName, points };
  }

  async getBulkHistory(
    days: number,
    organizationId: string,
  ): Promise<{ items: WingTrackedHistory[] }> {
    const items = await this.repo.findBulkHistory(organizationId, days);
    return { items };
  }
}

function snapshotValues(input: WingTrackedSnapshotValues): WingTrackedSnapshotValues {
  return {
    salePriceKrw: input.salePriceKrw,
    ratingCount: input.ratingCount,
    ratingAverage: input.ratingAverage,
    pvLast28Day: input.pvLast28Day,
    salesLast28d: input.salesLast28d,
    estimatedRevenue28d: input.estimatedRevenue28d,
    conversionRate28d: input.conversionRate28d,
  };
}
