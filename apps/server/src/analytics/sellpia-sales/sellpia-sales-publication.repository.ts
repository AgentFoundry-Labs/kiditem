import { Injectable } from '@nestjs/common';
import type { SellpiaSalesResult } from '@kiditem/shared/sellpia-operations';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { parseBusinessDate } from '../../common/kst';
import type { OwnerTransaction } from '../../common/owner-transaction';
import { ownerTransactionClient } from '../../prisma/owner-transaction';
import type { SellpiaSalesLedgerRow } from './domain/sellpia-sales-operation';

export const SELLPIA_SALES_ALERT_DEDUPE_KEY = 'source:sellpia_sales_daily';
const INSERT_CHUNK_SIZE = 1_000;

/**
 * 셀피아 매출 원장(`SellpiaSalesDailySnapshot`) 쓰기 — 실행 `analytics.sellpia_sales`의 finish 트랜잭션 안에서만 부른다
 * (ADR-0025). 창 바꿔 쓰기: 창 안의 줄(옛 run 줄 포함)을 모두 지우고 이 실행의 줄을 넣는다. 트랜잭션을 열지 않는다.
 */
@Injectable()
export class SellpiaSalesPublicationRepository {
  constructor(private readonly alerts: SourceFailureAlerts) {}

  async replaceWindow(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    window: { start: string; end: string };
    days: number;
    rows: SellpiaSalesLedgerRow[];
  }): Promise<SellpiaSalesResult> {
    const tx = ownerTransactionClient(transaction);
    await tx.sellpiaSalesDailySnapshot.deleteMany({
      where: {
        organizationId: input.organizationId,
        businessDate: { gte: dateOf(input.window.start), lte: dateOf(input.window.end) },
      },
    });
    const capturedAt = new Date();
    const data = input.rows.map((row) => ({
      organizationId: input.organizationId,
      operationId: input.operationId,
      businessDate: dateOf(row.businessDate),
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      channelGroup: row.channelGroup,
      revenueKrw: row.revenueKrw,
      qty: row.qty,
      costKrw: row.costKrw,
      capturedAt,
    }));
    for (let offset = 0; offset < data.length; offset += INSERT_CHUNK_SIZE) {
      await tx.sellpiaSalesDailySnapshot.createMany({ data: data.slice(offset, offset + INSERT_CHUNK_SIZE) });
    }
    await this.alerts.resolveSourceFailure(tx, {
      organizationId: input.organizationId,
      dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
      attemptId: input.operationId,
    });
    return { days: input.days, rows: data.length };
  }

  /** 재시도 없는 최종 실패: 원천 알림 하나(중단 코드는 알림 모듈이 거른다). 원장은 그대로다. */
  async recordFailure(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    errorCode: string;
    errorMessage: string | null;
  }): Promise<void> {
    await this.alerts.recordTerminalOutcome(ownerTransactionClient(transaction), {
      code: input.errorCode,
      organizationId: input.organizationId,
      sourceType: 'sellpia_sales_daily',
      attemptId: input.operationId,
      dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
      title: '셀피아 판매현황 수집 실패',
      message: input.errorMessage ?? input.errorCode,
      href: '/stock-ops',
    });
  }
}

function dateOf(value: string): Date {
  const date = parseBusinessDate(value);
  if (!date) throw new Error(`invalid business date ${value}`);
  return date;
}
