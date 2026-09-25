import { Inject, Injectable } from '@nestjs/common';
import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import {
  CHANNEL_ACCOUNT_PORT,
  type ChannelAccountPort,
} from '../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { OrderMallAccount, OrderMallAccountPort } from '../../../application/port/out/persistence/order-mall-account.port';

/** 몰 계정 찾기 — 옛 attempt begin(`findMallAccount`)과 같은 규칙: 레지스트리의 몰 + Channels의 몰 식별. */
@Injectable()
export class OrderMallAccountPersistenceAdapter implements OrderMallAccountPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
  ) {}

  async resolveMallAccount(input: { organizationId: string; mallKey: string }): Promise<OrderMallAccount | null> {
    const mall = MALL_CHANNELS.find((entry) => entry.key === input.mallKey);
    if (!mall) return null;
    const [identity] = await this.prisma.$transaction((tx) =>
      this.channelAccounts.resolveMallIdentities(ownerTransaction(tx), { organizationId: input.organizationId, mallKeys: [mall.key] }),
    );
    return identity ? { channelAccountId: identity.accountId, mallKey: mall.key, mallName: mall.name } : null;
  }
}
