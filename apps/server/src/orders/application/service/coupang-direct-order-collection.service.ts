import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CoupangDirectOrderCollectionRequestSchema,
} from '@kiditem/shared/coupang-direct-order';
import type {
  CoupangDirectOrderCollectionPort,
} from '../port/in/coupang-direct-order-collection.port';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
  type CoupangDirectOrderCollectionTransactionPort,
} from '../port/out/transaction/coupang-direct-order-collection.transaction.port';

@Injectable()
export class CoupangDirectOrderCollectionService
implements CoupangDirectOrderCollectionPort {
  constructor(
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT)
    private readonly transactions: CoupangDirectOrderCollectionTransactionPort,
  ) {}

  async collect(input: Parameters<CoupangDirectOrderCollectionPort['collect']>[0]) {
    const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse(input.request);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Coupang direct order collection',
        errors: parsed.error.flatten(),
      });
    }
    const selected = parsed.data.pos.filter(({ transport }) =>
      transport === parsed.data.transport);
    // 발주 상세(품목) 수집이 실패한 발주는 품목이 비어 적재·정산 대상이 없다.
    // 배치 전체를 막지 말고 유효 발주만 적재하되, 전부 비었으면 사실대로 알린다.
    const collectable = selected.filter(({ items }) => items.length > 0);
    if (selected.length > 0 && collectable.length === 0) {
      throw new BadRequestException(
        '쿠팡 발주 상세(품목)를 수집하지 못했습니다. 확장에서 발주를 다시 수집한 뒤 시도해주세요.',
      );
    }
    const request = { ...parsed.data, pos: collectable };
    return this.transactions.collect({ ...input, request });
  }
}
