import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { currentBusinessDate } from '../../domain/business-date';
import {
  WING_TRACKED_PRODUCT_REPOSITORY_PORT,
  type WingTrackedProductRepositoryPort,
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

  /** 카탈로그 검색 결과 중 추적 중인 상품들의 오늘 지표를 스냅샷으로 적재. */
  async ingestSnapshots(
    items: IngestWingSnapshotItem[],
    organizationId: string,
  ): Promise<{ captured: number }> {
    const capturedAt = new Date();
    const businessDate = currentBusinessDate();
    const captured = await this.repo.upsertSnapshotsByProductId(
      items.map((item) => ({
        productId: item.productId,
        businessDate,
        sourceKeyword: item.sourceKeyword ?? null,
        capturedAt,
        ...snapshotValues(item),
      })),
      organizationId,
    );
    return { captured };
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
