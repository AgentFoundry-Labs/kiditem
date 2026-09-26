import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { WingTrackedProductsPlan, WingTrackedProductsResult } from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { businessDateKey, currentBusinessDate, parseBusinessDate } from '../../../common/kst';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import { assembleWingTrackedCaptures, planWingTrackedProducts } from '../../domain/wing-tracked-products-operation';
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
    const tracker = await this.repo.registerWithInitialSnapshot(input, organizationId);
    const rows = await this.repo.list(organizationId);
    return rows.find((row) => row.id === tracker.id) ?? { ...tracker, latestSnapshot: null };
  }

  /**
   * 추적 상품 수집 실행의 계획(`advertising.wing_tracked_products`, KID-362): 오늘 업무일과 지금 켜진 추적 대상을 고정한다.
   * 계정 확인은 owner가 한다.
   */
  async planOperation(input: {
    organizationId: string;
    channelAccountId: string;
    keywords: readonly string[];
  }): Promise<WingTrackedProductsPlan> {
    const targets = await this.repo.listEnabledTargets(input.organizationId);
    return planWingTrackedProducts({
      channelAccountId: input.channelAccountId,
      businessDate: businessDateKey(currentBusinessDate()),
      keywords: input.keywords,
      targets,
    });
  }

  /** finish 트랜잭션에서 키워드 청크를 추적 상품 지표로 모아 그 업무일 스냅샷을 쓴다. */
  async publishOperation(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    plan: WingTrackedProductsPlan;
    chunks: readonly OperationStagedChunk[];
  }): Promise<WingTrackedProductsResult> {
    const captures = assembleWingTrackedCaptures(input.plan, input.chunks);
    const businessDate = parseBusinessDate(input.plan.businessDate);
    if (!businessDate) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'invalid_business_date' } });
    const { captured } = await this.repo.publishOperationSnapshots(tx, {
      organizationId: input.organizationId,
      operationId: input.operationId,
      businessDate,
      plannedTargets: input.plan.products,
      captures,
    });
    return {
      businessDate: input.plan.businessDate,
      expectedProductCount: input.plan.products.length,
      capturedProductCount: captured,
    };
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
    if (!tracker) throw new KiditemNotFoundError('NOT_FOUND', { details: { trackedProductId: id } });
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
