import type { Provider, Type } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../channels/application/port/in/account/channel-account.port';
import { WingTrackedProductsOperationOwner } from '../advertising/adapter/in/operation/wing-tracked-products-operation-owner';
import { WingTrackedProductRepositoryAdapter } from '../advertising/adapter/out/repository/wing-tracked-product.repository.adapter';
import { WING_TRACKED_PRODUCT_REPOSITORY_PORT } from '../advertising/application/port/out/repository/wing-tracked-product.repository.port';
import { WingTrackedProductService } from '../advertising/application/service/wing-tracked-product.service';
import { SourceFailureAlerts } from '../alerts/alerts.service';
import { AdvertisingSourceAlertAdapter } from '../advertising/adapter/out/repository/advertising-source-alert.adapter';
import { ADVERTISING_SOURCE_ALERT_PORT } from '../advertising/application/port/out/repository/advertising-source-alert.port';
import { WingRankOperationOwner } from '../advertising/adapter/in/operation/wing-rank-operation-owner';
import { KeywordSerpOperationOwner } from '../advertising/adapter/in/operation/keyword-serp-operation-owner';
import { KeywordRankIngestHandler } from '../advertising/application/service/keyword-rank-ingest.handler';
import { KeywordRankRepositoryAdapter } from '../advertising/adapter/out/repository/keyword-rank.repository.adapter';
import { KEYWORD_RANK_REPOSITORY_PORT } from '../advertising/application/port/out/repository/keyword-rank.repository.port';
import { KeywordRankService } from '../advertising/application/service/keyword-rank.service';
import { WingSalesRankIngestHandler } from '../advertising/application/service/wing-sales-rank-ingest.handler';
import { channelFactTestPorts } from './channel-fact-ports';
import { ordersOperationsApp } from './orders-operations';

/**
 * Advertising 키워드·경쟁사 kind(KID-362 K-a)를 실제 실행 계약(HTTP 경로 그대로)과 실제 owner·PG로 돌리는 시험 앱.
 * Channels 계정 포트는 이 조직의 쿠팡 계정 행을 본다(Channels 모듈 전체를 띄우지 않는다).
 */
export async function advertisingKeywordOperationsApp(prisma: PrismaClient, options: { providers?: Provider[]; controllers?: Type<unknown>[] } = {}) {
  const accounts: Pick<ChannelAccountPort, 'listActive'> = {
    listActive: async (organizationId) =>
      (await prisma.channelAccount.findMany({ where: { organizationId, status: 'active' } })) as never,
  };
  const channelFacts = channelFactTestPorts(prisma as never);
  const keywordRank = new KeywordRankRepositoryAdapter(channelFacts.listings, channelFacts.recipes, prisma as never);
  return ordersOperationsApp(prisma, {
    owners: [WingTrackedProductsOperationOwner, WingRankOperationOwner, KeywordSerpOperationOwner],
    controllers: options.controllers,
    providers: [
      { provide: KEYWORD_RANK_REPOSITORY_PORT, useValue: keywordRank },
      KeywordRankService,
      WingSalesRankIngestHandler,
      KeywordRankIngestHandler,
      { provide: CHANNEL_ACCOUNT_PORT, useValue: accounts },
      { provide: ADVERTISING_SOURCE_ALERT_PORT, useValue: new AdvertisingSourceAlertAdapter(new SourceFailureAlerts(prisma as never)) },
      WingTrackedProductService,
      { provide: WING_TRACKED_PRODUCT_REPOSITORY_PORT, useValue: new WingTrackedProductRepositoryAdapter(prisma as never) },
      ...(options.providers ?? []),
    ],
  });
}

/** 조직의 켜진 쿠팡 계정 하나. */
export async function seedCoupangAccount(prisma: PrismaClient, organizationId: string): Promise<string> {
  const account = await prisma.channelAccount.create({
    data: { organizationId, channel: 'coupang', name: `쿠팡 ${randomUUID().slice(0, 6)}`, externalAccountId: randomUUID(), status: 'active' },
  });
  return account.id;
}
