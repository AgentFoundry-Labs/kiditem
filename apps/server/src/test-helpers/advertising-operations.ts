import type { Provider } from '@nestjs/common';
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
import { ordersOperationsApp } from './orders-operations';

/**
 * Advertising 키워드·경쟁사 kind(KID-362 K-a)를 실제 실행 계약(HTTP 경로 그대로)과 실제 owner·PG로 돌리는 시험 앱.
 * Channels 계정 포트는 이 조직의 쿠팡 계정 행을 본다(Channels 모듈 전체를 띄우지 않는다).
 */
export async function advertisingKeywordOperationsApp(prisma: PrismaClient, options: { providers?: Provider[] } = {}) {
  const accounts: Pick<ChannelAccountPort, 'listActive'> = {
    listActive: async (organizationId) =>
      (await prisma.channelAccount.findMany({ where: { organizationId, status: 'active' } })) as never,
  };
  return ordersOperationsApp(prisma, {
    owners: [WingTrackedProductsOperationOwner],
    providers: [
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
