import { USABLE_CHANNEL_ACCOUNT_STATUSES } from '../../../domain/account/channel-account-usability';
import { Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { RocketSellpiaMatchingCsvImportRepositoryPort } from '../../../application/port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE } from '../../../domain/collection/catalog-source-identity';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { rocketMatchingCsvRowsToCatalogProducts } from './rocket-sellpia-matching-csv.catalog';

/**
 * 로켓 매칭 CSV kind(KID-363)의 Channels 원장 쓰기. 반영 출처는 `lastOperationId`(성공한 실행)로
 * 남긴다. 계정 겹침은 실행 잠금(`account:<id>`)이 막는다.
 */
@Injectable()
export class RocketSellpiaMatchingCsvImportRepositoryAdapter implements RocketSellpiaMatchingCsvImportRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async assertRocketAccount(scope: { organizationId: string; channelAccountId: string }): Promise<void> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: scope.channelAccountId, organizationId: scope.organizationId, status: { in: [...USABLE_CHANNEL_ACCOUNT_STATUSES] } },
      select: { channel: true },
    });
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    if (account.channel !== 'rocket') {
      throw new KiditemInvalidValueError('CHANNELS_ACCOUNT_INVALID', { details: { reason: 'matching_csv_requires_rocket' } });
    }
  }

  async publishMatchingCsv(
    transaction: OwnerTransaction,
    input: Parameters<RocketSellpiaMatchingCsvImportRepositoryPort['publishMatchingCsv']>[1],
  ) {
    const identities = await upsertChannelCatalogIdentities(ownerTransactionClient(transaction), {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      lastOperationId: input.operationId,
      rawSource: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
      // 매칭 CSV 에는 판매가·모델번호 칸이 없다.
      unobservedOptionFields: ['salePrice', 'modelNumber'],
      products: rocketMatchingCsvRowsToCatalogProducts(input.rows),
    });
    return identities.changes;
  }
}
