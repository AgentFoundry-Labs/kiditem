import { Inject, Injectable } from '@nestjs/common';
import type { OrderCollectionTodayOrders } from '@kiditem/shared/order-collection-source';
import {
  SELLPIA_ORDER_TRANSFER_KIND,
  SellpiaOrderTransferPlanSchema,
  SellpiaOrderTransferResultSchema,
} from '@kiditem/shared/orders-action-operations';
import { COUPANG_DIRECTSHIP_KIND, MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';
import { addDays, kstDayStart } from '../../../../common/kst';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import { readOperationsByPlan } from '../../../../common/operation/transaction/operations-by-plan';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { OrderCollectionTodayOrdersPort } from '../../../application/port/in/order-collection-today-orders.port';
import {
  countTodayOrders,
  type TodayCollectionOperation,
  type TodaySucceededTransfer,
} from '../../../domain/order-collection-today-orders';

/** 실행 계약으로 옮긴 주문 수집 kind. 로켓 PO는 몰 칸이 없어 세지 않는다. */
const OPERATION_KINDS = [MALL_ORDERS_KIND, COUPANG_DIRECTSHIP_KIND];
/** 오늘 성공한 실행을 찾을 때 훑는 최근 성공 수. 몰 스무 곳을 하루에 여러 번 걷어도 넉넉하다. */
const RECENT_SCAN = 200;

/**
 * 오늘 주문 capability(KID-234). 셈법은 `countTodayOrders`에 있다 — 여기서는 오늘 성공한 수집 실행(실행 계약의 reader)과
 * 그 실행들을 원천으로 가리키는 성공한 셀피아 전송(`readOperationsByPlan`, plan `sourceOperationId`)만 읽는다. 실행 표는
 * 계약 모듈의 reader로만 읽는다(ADR-0025). 실행 kind가 아닌 카카오 수집은 완료되지 않으므로 세지 않는다(KID-379).
 */
@Injectable()
export class OrderCollectionTodayOrdersAdapter implements OrderCollectionTodayOrdersPort {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    private readonly prisma: PrismaService,
  ) {}

  async readTodayOrders(input: { organizationId: string; now?: Date }): Promise<OrderCollectionTodayOrders> {
    const from = kstDayStart(input.now ?? new Date());
    const to = addDays(from, 1);
    const { operations } = await this.operations.list(input.organizationId, {
      kinds: OPERATION_KINDS,
      status: 'succeeded',
      limit: RECENT_SCAN,
    });
    const today: TodayCollectionOperation[] = operations
      .filter((operation) => {
        const startedAt = new Date(operation.startedAt);
        return startedAt >= from && startedAt < to;
      })
      .map((operation) => ({ id: operation.id, kind: operation.kind, plan: operation.plan ?? null, result: operation.result }));
    return countTodayOrders(today, await this.readTransfers(input.organizationId, today));
  }

  private async readTransfers(organizationId: string, sources: readonly TodayCollectionOperation[]): Promise<TodaySucceededTransfer[]> {
    const rows = await readOperationsByPlan(this.prisma, {
      organizationId,
      kinds: [SELLPIA_ORDER_TRANSFER_KIND],
      planContainsAny: sources.map((source) => ({ sourceOperationId: source.id })),
      statuses: ['succeeded'],
    });
    return rows.flatMap((row) => {
      const plan = SellpiaOrderTransferPlanSchema.safeParse(row.plan);
      const result = SellpiaOrderTransferResultSchema.safeParse(row.result);
      if (!plan.success || !result.success) return [];
      return [{ sourceOperationId: plan.data.sourceOperationId, transport: plan.data.transport, acceptedOrderNumbers: result.data.acceptedOrderNumbers }];
    });
  }
}
