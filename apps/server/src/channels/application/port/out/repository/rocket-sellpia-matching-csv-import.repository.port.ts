import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { ParsedRocketSellpiaMatchingCsvRow } from '../documents/channel-document.models';
import type { CatalogChanges } from './channel-catalog-publication.port';

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT',
);

/** 로켓 매칭 CSV kind의 Channels 원장 쓰기. `publishMatchingCsv`는 실행 계약의 finish 트랜잭션 안에서만 부른다. */
export interface RocketSellpiaMatchingCsvImportRepositoryPort {
  /** 조직의 활성 로켓 계정인가. 아니면 KidItem 오류로 멈춘다. */
  assertRocketAccount(scope: { organizationId: string; channelAccountId: string }): Promise<void>;
  publishMatchingCsv(
    tx: OwnerTransaction,
    input: {
      organizationId: string;
      channelAccountId: string;
      operationId: string;
      rows: ParsedRocketSellpiaMatchingCsvRow[];
    },
  ): Promise<CatalogChanges>;
}
