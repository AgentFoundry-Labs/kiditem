import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  CoupangDirectCapture,
  CoupangDirectOrderCollectionPort,
} from '../../in/coupang-direct-order-collection.port';

/** 직배송 원장 조합(Prisma). 실행 확인(성공·kind·계정)은 서비스가 실행 계약으로 먼저 한다. */
export interface CoupangDirectOrderCollectionTransactionPort
extends Omit<CoupangDirectOrderCollectionPort, 'planOperation' | 'readCapture'> {
  /** 활성 로켓 계정이면 true. */
  isActiveRocketAccount(input: { organizationId: string; channelAccountId: string }): Promise<boolean>;
  readCapture(input: { organizationId: string; operationId: string }): Promise<CoupangDirectCapture>;
  publishCapture(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; capture: CoupangDirectCapture },
  ): ReturnType<CoupangDirectOrderCollectionPort['publishCapture']>;
}

export const COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT',
);
