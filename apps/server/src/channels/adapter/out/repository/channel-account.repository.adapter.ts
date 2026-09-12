import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelAccountRepositoryPort,
} from '../../../application/port/out/repository/channel-account.repository.port';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';

const CHANNEL_ACCOUNT_LIST_SELECT = {
  id: true,
  channel: true,
  name: true,
  externalAccountId: true,
  vendorId: true,
  sellerId: true,
  isPrimary: true,
} as const;

type CoupangAccountMappingBasis = Array<{
  id: string;
  externalAccountId: string | null;
  vendorId: string | null;
  status: string;
}>;

async function readCoupangAccountMappingBasis(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<CoupangAccountMappingBasis> {
  return tx.channelAccount.findMany({
    where: { organizationId, channel: 'coupang' },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      externalAccountId: true,
      vendorId: true,
      status: true,
    },
  });
}

function mappingBasisChanged(
  before: CoupangAccountMappingBasis,
  after: CoupangAccountMappingBasis,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

@Injectable()
export class ChannelAccountRepositoryAdapter
  implements ChannelAccountRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!account) {
      return {
        configured: false,
        vendorId: null,
        status: null,
        updatedAt: null,
      } satisfies CoupangAccountSettings;
    }

    const vendorId = account.vendorId ?? account.externalAccountId;

    return {
      configured: Boolean(vendorId && account.status === 'active'),
      vendorId: vendorId ?? null,
      status: account.status,
      updatedAt: account.updatedAt,
    } satisfies CoupangAccountSettings;
  }

  async upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings> {
    const vendorId = input.vendorId.trim();

    await this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, organizationId);
      const mappingBefore = await readCoupangAccountMappingBasis(tx, organizationId);
      const sameVendor = await tx.channelAccount.findFirst({
        where: {
          organizationId,
          channel: 'coupang',
          OR: [
            { externalAccountId: vendorId },
            { vendorId },
          ],
        },
      });
      const target = sameVendor;
      if (target) {
        const persistedIdentities = [target.externalAccountId, target.vendorId]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));
        if (persistedIdentities.some((identity) => identity !== vendorId)) {
          throw new ConflictException(
            '쿠팡 스토어 식별자가 충돌합니다. 기존 계정의 Vendor ID는 변경할 수 없습니다.',
          );
        }
      }
      if (target) {
        await tx.channelAccount.updateMany({
          where: {
            id: target.id,
            organizationId,
            channel: 'coupang',
          },
          data: {
            name: target.name || '쿠팡 Wing',
            status: 'active',
            isPrimary: true,
          },
        });
        await tx.channelAccount.updateMany({
          where: {
            organizationId,
            channel: 'coupang',
            id: { not: target.id },
          },
          data: { isPrimary: false },
        });
      } else {
        const created = await tx.channelAccount.create({
          data: {
            organizationId,
            channel: 'coupang',
            name: '쿠팡 Wing',
            externalAccountId: vendorId,
            vendorId,
            status: 'active',
            isPrimary: true,
          },
          select: { id: true },
        });
        await tx.channelAccount.updateMany({
          where: {
            organizationId,
            channel: 'coupang',
            id: { not: created.id },
          },
          data: { isPrimary: false },
        });
      }

      const mappingAfter = await readCoupangAccountMappingBasis(tx, organizationId);
      if (mappingBasisChanged(mappingBefore, mappingAfter)) {
        await advanceProductMappingGeneration(tx, organizationId);
      }
    });

    return this.getCoupangSettings(organizationId);
  }

  listActive(organizationId: string) {
    return this.prisma.channelAccount.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ channel: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
      select: CHANNEL_ACCOUNT_LIST_SELECT,
    });
  }

  ensureRocketAccount(organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `rocket-account-bootstrap:${organizationId}`;
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;

      const coupangAccount = await tx.channelAccount.findFirst({
        where: {
          organizationId,
          channel: 'coupang',
          status: 'active',
          isPrimary: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          externalAccountId: true,
          vendorId: true,
        },
      });
      if (!coupangAccount) {
        throw new NotFoundException('쿠팡 익스텐션에서 감지된 계정 정보가 없습니다.');
      }

      const identities = [...new Set([
        coupangAccount.externalAccountId?.trim(),
        coupangAccount.vendorId?.trim(),
      ].filter((value): value is string => Boolean(value)))];
      if (identities.length === 0) {
        throw new NotFoundException('쿠팡 익스텐션에서 Vendor ID를 확인하지 못했습니다.');
      }
      if (identities.length > 1) {
        throw new ConflictException('쿠팡 계정의 Vendor ID가 서로 충돌합니다.');
      }
      const vendorId = identities[0]!;

      const existing = await tx.channelAccount.findFirst({
        where: {
          organizationId,
          channel: 'rocket',
          OR: [
            { externalAccountId: vendorId },
            { vendorId },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          ...CHANNEL_ACCOUNT_LIST_SELECT,
          status: true,
        },
      });
      if (existing) {
        const persistedIdentities = [...new Set([
          existing.externalAccountId?.trim(),
          existing.vendorId?.trim(),
        ].filter((value): value is string => Boolean(value)))];
        if (persistedIdentities.some((identity) => identity !== vendorId)) {
          throw new ConflictException('기존 로켓 계정의 Vendor ID가 쿠팡 계정과 충돌합니다.');
        }
        if (existing.status !== 'active') {
          throw new ConflictException('중지된 로켓 계정은 자동으로 다시 활성화하지 않습니다.');
        }

        const missingIdentity = {
          ...(existing.externalAccountId ? {} : { externalAccountId: vendorId }),
          ...(existing.vendorId ? {} : { vendorId }),
        };
        if (Object.keys(missingIdentity).length > 0) {
          return tx.channelAccount.update({
            where: {
              id_organizationId: {
                id: existing.id,
                organizationId,
              },
            },
            data: missingIdentity,
            select: CHANNEL_ACCOUNT_LIST_SELECT,
          });
        }
        const { status: _status, ...account } = existing;
        return account;
      }

      return tx.channelAccount.create({
        data: {
          organizationId,
          channel: 'rocket',
          name: '쿠팡 로켓',
          externalAccountId: vendorId,
          vendorId,
          status: 'active',
          isPrimary: false,
        },
        select: CHANNEL_ACCOUNT_LIST_SELECT,
      });
    });
  }

  async getPrimaryCoupangAccountId(organizationId: string): Promise<string | null> {
    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return channelAccount?.id ?? null;
  }
}
