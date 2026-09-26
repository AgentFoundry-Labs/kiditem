import { Inject, Injectable } from '@nestjs/common';
import type { OrderCollectionTodayOrders } from '@kiditem/shared/order-collection-source';
import {
  COUPANG_DIRECTSHIP_KIND,
  MALL_ORDERS_KIND,
  OrdersCaptureResultSchema,
} from '@kiditem/shared/orders-operations';
import { addDays, kstDayStart } from '../../../../common/kst';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import { readCompletedImportRowCountsByScope } from '../../../../core/read/source-import-run.reader';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { OrderCollectionTodayOrdersPort } from '../../../application/port/in/order-collection-today-orders.port';

/** 실행 계약으로 옮긴 주문 수집 kind. result.rowCount가 그 수집의 주문 수다. */
const OPERATION_KINDS = [MALL_ORDERS_KIND, COUPANG_DIRECTSHIP_KIND];
/**
 * 아직 옛 attempt 경로에 남은 원천 — 아직 옮기지 않은 몰(나머지 몰이 옮겨질 때까지)과 옛 directship run. 이 목록은 여기 한 곳이다.
 */
const LEGACY_SOURCE_TYPES = ['order_collection_mall', 'coupang_direct_order_capture'] as const;
/** 몰 키가 계획에 없는 원천은 그 원천 자체가 한 몰이다. */
const DIRECTSHIP_MALL_KEY = 'coupang-direct';
const MALL_KEY_BY_LEGACY_SOURCE_TYPE: Readonly<Record<string, string>> = {
  coupang_direct_order_capture: DIRECTSHIP_MALL_KEY,
};
/** 오늘 성공한 실행을 찾을 때 훑는 최근 성공 수. 몰 스무 곳을 하루에 여러 번 걷어도 넉넉하다. */
const RECENT_SCAN = 200;

/**
 * 오늘 주문 capability. 수집(실행·옛 run)마다 그 수집이 실어 온 주문 수를 적어 두고, 여기서는 **몰마다 오늘 마지막
 * 수집 한 번만** 센다(같은 몰을 두 번 걷어도 주문이 불어나지 않는다). directship은 로켓 계정마다 마지막 한 번.
 * 한 몰에 오늘 실행과 옛 run(옮긴 몰의 수동 업로드는 아직 옛 경로다)이 함께 있으면 늦게 시작한 쪽이 그 몰의 수다. 오늘 수집이 하나도 없으면 `total`은 null(0은 "걷었는데 없었다"). 실행 표는 실행 계약의 reader로만 읽는다.
 */
@Injectable()
export class OrderCollectionTodayOrdersAdapter implements OrderCollectionTodayOrdersPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  async readTodayOrders(input: { organizationId: string; now?: Date }): Promise<OrderCollectionTodayOrders> {
    const from = kstDayStart(input.now ?? new Date());
    const to = addDays(from, 1);
    /** 몰 칸마다 오늘 마지막 수집(실행이든 옛 run이든 늦게 시작한 쪽)의 수. */
    const latest = new Map<string, { count: number; at: Date }>();

    const { operations } = await this.operations.list(input.organizationId, {
      kinds: OPERATION_KINDS,
      status: 'succeeded',
      limit: RECENT_SCAN,
    });
    const counted = new Set<string>();
    const operationTotals = new Map<string, { count: number; at: Date }>();
    // reader는 최근 시작한 것부터 준다 — 범위(몰·directship 계정)마다 처음 만난 것이 오늘 마지막 수집이다.
    for (const operation of operations) {
      const startedAt = new Date(operation.startedAt);
      if (startedAt < from || startedAt >= to) continue;
      const result = OrdersCaptureResultSchema.safeParse(operation.result);
      if (!result.success) continue;
      const mallKey = operation.kind === MALL_ORDERS_KIND ? operation.plan?.mallKey : DIRECTSHIP_MALL_KEY;
      if (typeof mallKey !== 'string' || !mallKey) continue;
      const scope = operation.kind === MALL_ORDERS_KIND
        ? `mall:${mallKey}`
        : `directship:${String(operation.plan?.channelAccountId ?? '')}`;
      if (counted.has(scope)) continue;
      counted.add(scope);
      const current = operationTotals.get(mallKey);
      operationTotals.set(mallKey, {
        count: (current?.count ?? 0) + result.data.rowCount,
        at: current && current.at > startedAt ? current.at : startedAt,
      });
    }
    for (const [mallKey, entry] of operationTotals) latest.set(mallKey, entry);

    const legacy = await readCompletedImportRowCountsByScope(this.prisma, {
      organizationId: input.organizationId,
      sourceTypes: LEGACY_SOURCE_TYPES,
      from,
      to,
    });
    for (const row of legacy ?? []) {
      const mallKey = row.mallKey ?? MALL_KEY_BY_LEGACY_SOURCE_TYPE[row.sourceType];
      if (!mallKey) continue;
      const current = latest.get(mallKey);
      if (!current || row.createdAt > current.at) latest.set(mallKey, { count: row.rowCount, at: row.createdAt });
    }
    const byMall: Record<string, number> = Object.fromEntries([...latest].map(([mallKey, entry]) => [mallKey, entry.count]));

    const counts = Object.values(byMall);
    return { total: counts.length === 0 ? null : counts.reduce((sum, count) => sum + count, 0), byMall };
  }
}
