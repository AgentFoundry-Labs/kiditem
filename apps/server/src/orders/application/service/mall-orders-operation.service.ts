import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk } from '@kiditem/shared/operation';
import { orderCollectionOrderCount } from '@kiditem/shared/order-collection-source';
import {
  MALL_ORDERS_KIND,
  MallOrdersResultSchema,
  type MallOrdersResult,
} from '@kiditem/shared/orders-operations';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import {
  ORDER_OPERATION_CAPTURE_PORT,
  type OrderOperationCapturePort,
  type OrderOperationCaptureSource,
} from '../port/in/order-operation-capture.port';
import {
  ORDER_MALL_ACCOUNT_PORT,
  type OrderMallAccountPort,
} from '../port/out/persistence/order-mall-account.port';
import {
  icecreamContinuation,
  mallOrdersCapture,
  mallOrdersCoverage,
  mallOrdersScope,
  readMallOrdersPlan,
  type IcecreamContinuation,
  type MallOrdersPlan,
} from '../../domain/mall-orders-operation';
import { OrderCollectionService, type OrderCollectionConversion } from './order-collection.service';

/** 실행 id로 다시 변환한 결과. 주문이 없던 수집은 `conversion`이 null(파일 없음). */
export interface MallOrdersOperationConversion {
  operationId: string;
  artifactId: string;
  mallKey: string;
  conversion: OrderCollectionConversion | null;
}

/**
 * 몰 주문 수집(ADR-0025 kind `orders.mall_orders`, KID-359 H3). 확장이 몰 관리자 화면에서 읽은 주문을 `order_rows`
 * 청크로 올리면 finish 트랜잭션에서 옛 변환 라우트가 받던 본문 그대로 보관 캡처(`OrderCollectionArtifact.operationId`)로
 * 남기고, 그 캡처를 변환해 주문 수를 `result.rowCount`로 적는다 — "적지 않으면 성공한 수집도 0 건으로 남아 대시보드의
 * '오늘 주문' 이 모자라게 센다"(사장님 2026-09-21). 셈법은 `orderCollectionOrderCount` 하나다(2026-09-22 63 대 82).
 * 변환 파일은 보관하지 않고, 화면이 실행 id로 다시 변환해 받는다.
 */
@Injectable()
export class MallOrdersOperationService {
  constructor(
    @Inject(ORDER_OPERATION_CAPTURE_PORT) private readonly captures: OrderOperationCapturePort,
    @Inject(ORDER_MALL_ACCOUNT_PORT) private readonly accounts: OrderMallAccountPort,
    private readonly conversions: OrderCollectionService,
  ) {}

  /** scope 검증 + 그 몰의 주문 수집 계정 확인. 잠금은 그 계정(`account:<id>`) — 같은 몰 로그인은 한 실행만. */
  async plan(organizationId: string, scope: unknown): Promise<OperationPlanResult> {
    const parsed = mallOrdersScope(scope);
    const account = await this.accounts.resolveMallAccount({ organizationId, mallKey: parsed.mallKey });
    if (!account || account.channelAccountId.toLowerCase() !== parsed.channelAccountId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'mall_account_mismatch', mallKey: parsed.mallKey, channelAccountId: parsed.channelAccountId },
      });
    }
    const plan: MallOrdersPlan = {
      channelAccountId: parsed.channelAccountId,
      mallKey: parsed.mallKey,
      mallName: account.mallName,
      collectionDate: parsed.collectionDate,
      collectionMode: parsed.collectionMode,
      ...(parsed.selectionMode ? { selectionMode: parsed.selectionMode } : {}),
      ...(parsed.seenRowKeys ? { seenRowKeys: [...parsed.seenRowKeys] } : {}),
    };
    // 수집일이 있으면 그날이 이 실행의 업무일 창이다 — 주문 사실 리더가 몰 적용 범위를 창으로 찾는다.
    return {
      lockKeys: [accountLockKey(parsed.channelAccountId)],
      plan,
      ...(parsed.collectionDate ? { window: { start: parsed.collectionDate, end: parsed.collectionDate } } : {}),
    };
  }

  async finalize(
    transaction: OwnerTransaction,
    context: { organizationId: string; operationId: string; plan: unknown },
    chunks: readonly OperationStagedChunk[],
  ): Promise<MallOrdersResult> {
    const plan = readMallOrdersPlan(context.plan);
    const capture = mallOrdersCapture(plan, chunks);
    await this.captures.store(transaction, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      source: capture.source,
    });
    const conversion = capture.captured === 0 ? null : await this.convert(plan, capture.source);
    const rowCount = conversion ? orderCollectionOrderCount(conversion) ?? 0 : 0;
    const coverage = mallOrdersCoverage(plan);
    return MallOrdersResultSchema.parse({
      rowCount,
      mallKey: plan.mallKey,
      captured: capture.captured,
      ...(coverage ? { coverage } : {}),
      ...(capture.masked !== undefined ? { masked: capture.masked } : {}),
      ...(capture.orderNumbers ? { orderNumbers: capture.orderNumbers } : {}),
    });
  }

  /**
   * 성공한 실행의 캡처를 다시 변환한다(변환 라우트·재생 라우트의 본문 `operationId`). `mallKey`를 주면 그 몰의 실행이어야
   * 한다. 주문이 없던 수집은 파일 없이 돌려준다.
   */
  async convertOperation(input: { organizationId: string; operationId: string; mallKey?: string }): Promise<MallOrdersOperationConversion> {
    const { operation, capture } = await this.captures.readSucceeded({
      organizationId: input.organizationId,
      operationId: input.operationId,
      kind: MALL_ORDERS_KIND,
    });
    const plan = readMallOrdersPlan(operation.plan);
    if (input.mallKey !== undefined && input.mallKey !== plan.mallKey) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'mall_mismatch', operationId: input.operationId, mallKey: input.mallKey },
      });
    }
    const result = MallOrdersResultSchema.safeParse(operation.result);
    const conversion = result.success && result.data.captured === 0 ? null : await this.convert(plan, capture);
    return { operationId: operation.id, artifactId: capture.artifactId, mallKey: plan.mallKey, conversion };
  }

  /** 성공한 아이스크림몰 실행의 continuation(배송 색인·본 행 키 — 화면이 이어 쓴다). */
  async readContinuation(input: { organizationId: string; operationId: string }): Promise<IcecreamContinuation> {
    const { operation, capture } = await this.captures.readSucceeded({
      organizationId: input.organizationId,
      operationId: input.operationId,
      kind: MALL_ORDERS_KIND,
    });
    return icecreamContinuation(readMallOrdersPlan(operation.plan).mallKey, capture.bytes);
  }

  /**
   * 캡처를 변환한다. 변환기가 "신규 주문 없음"(`NO_NEW_ORDERS`, 예: 그날 주문이 아닌 행만 있는 파일)이라 하면 실패가
   * 아니라 변환할 것이 없는 것이다(null) — 옛 경로가 이 날을 실패한 몰로 적던 것을 되풀이하지 않는다. 다른 변환 오류는
   * 그대로 던진다(finalize에서는 실행이 실패한다).
   */
  private async convert(plan: MallOrdersPlan, source: OrderOperationCaptureSource): Promise<OrderCollectionConversion | null> {
    try {
      return await this.conversions.convertRetainedSource(plan.mallKey, plan.collectionDate, source);
    } catch (error) {
      if (isNoNewOrders(error)) return null;
      throw error;
    }
  }
}

function isNoNewOrders(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && (response as { code?: unknown }).code === 'NO_NEW_ORDERS';
}
