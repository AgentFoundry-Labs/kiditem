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
    const request = {
      ...parsed.data,
      pos: parsed.data.pos.filter(({ transport }) =>
        transport === parsed.data.transport),
    };
    if (request.pos.length === 0) {
      throw new BadRequestException(
        '선택한 운송유형의 쿠팡 발주확정 신규 주문이 없습니다.',
      );
    }
    return this.transactions.collect({ ...input, request });
  }
}
