import { createHash } from 'node:crypto';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import {
  WING_TRAFFIC_DAY_CHUNK_KIND,
  WING_TRAFFIC_KIND,
  WING_TRAFFIC_PERIOD_CHUNK_KIND,
  WING_TRAFFIC_ROWS_CHUNK_KIND,
  WingTrafficPlanSchema,
  type WingTrafficRow,
} from '@kiditem/shared/advertising-operations';
import { WingTrafficOperationOwner } from '../advertising/adapter/in/operation/wing-daily-operation-owners';
import { WingTrafficOperationRepository } from '../advertising/adapter/out/repository/wing-traffic-operation.repository';
import { SourceFailureAlerts } from '../alerts/alerts.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT, type OperationPort } from '../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import { channelFactTestPorts } from './channel-fact-ports';

type Summary = { visitors: number; views: number; cartAdds: number; orders: number; salesQty: number; revenue: number; providerConversionRate: number | null };

type DayValues = Omit<Summary, 'providerConversionRate'> & { providerConversionRate?: number | null };

/**
 * 실제 실행 계약과 실제 owner로 `advertising.wing_traffic`을 한 번 돌린다(begin → 청크 → finish). 원장 읽기 테스트가
 * 옛 source owner 대신 쓴다. 날마다 옵션 `vendorItemId` 하나에 그 날 값을 싣고, 계정 요약도 같은 값이다.
 */
export async function wingTrafficOperations(prisma: PrismaClient) {
  const ports = channelFactTestPorts(prisma as never);
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      OperationOwnerRegistry,
      OperationService,
      { provide: OPERATION_PORT, useExisting: OperationService },
      { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
      {
        provide: WingTrafficOperationOwner,
        useValue: new WingTrafficOperationOwner(
          new WingTrafficOperationRepository(ports.accounts, ports.listings, prisma as never, new SourceFailureAlerts(prisma as never)),
        ),
      },
    ],
  }).compile();
  await module.init();
  const operations = module.get<OperationPort>(OPERATION_PORT);
  const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  async function collect(input: {
    organizationId: string;
    channelAccountId: string;
    startDate: string;
    endDate: string;
    dailyValues: DayValues;
    vendorItemId?: string;
  }): Promise<{ operationId: string }> {
    const begun = await operations.begin(input.organizationId, {
      kind: WING_TRAFFIC_KIND,
      scope: { channelAccountId: input.channelAccountId, startDate: input.startDate, endDate: input.endDate },
    });
    const plan = WingTrafficPlanSchema.parse(begun.operation.plan);
    const summary = { providerConversionRate: null, ...input.dailyValues };
    const sequences = new Map<string, number>();
    const put = async (chunkKind: string, payload: unknown[]) => {
      const sequence = (sequences.get(chunkKind) ?? 0) + 1;
      sequences.set(chunkKind, sequence);
      await operations.putChunk({
        organizationId: input.organizationId,
        operationId: begun.operation.id,
        token: begun.token,
        chunkKind,
        sequence,
        request: { checksum: checksum(payload), payload },
      });
    };
    for (const businessDate of plan.expectedDates) {
      const row: WingTrafficRow = {
        businessDate,
        vendorItemId: input.vendorItemId ?? '1001',
        productId: null,
        visitors: summary.visitors,
        views: summary.views,
        cartAdds: summary.cartAdds,
        orders: summary.orders,
        salesQty: summary.salesQty,
        revenue: summary.revenue,
      };
      await put(WING_TRAFFIC_ROWS_CHUNK_KIND, [row]);
      await put(WING_TRAFFIC_DAY_CHUNK_KIND, [{
        businessDate, pages: 1, rows: 1, explicitEmpty: false, capturedAt: `${businessDate}T01:00:00.000Z`, accountSummary: summary,
      }]);
    }
    const days = plan.expectedDates.length;
    await put(WING_TRAFFIC_PERIOD_CHUNK_KIND, [{
      startDate: plan.startDate,
      endDate: plan.endDate,
      capturedAt: `${plan.endDate}T02:00:00.000Z`,
      accountSummary: {
        visitors: summary.visitors * days,
        views: summary.views * days,
        cartAdds: summary.cartAdds * days,
        orders: summary.orders * days,
        salesQty: summary.salesQty * days,
        revenue: summary.revenue * days,
        providerConversionRate: summary.providerConversionRate,
      },
    }]);
    await operations.finish({
      organizationId: input.organizationId,
      operationId: begun.operation.id,
      token: begun.token,
      request: { outcome: 'succeeded' },
    });
    return { operationId: begun.operation.id };
  }

  return { collect, close: () => module.close() };
}
