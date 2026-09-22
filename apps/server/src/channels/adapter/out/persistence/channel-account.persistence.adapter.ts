import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import {
  ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER,
  orderCollectionMallAccountChannels,
  pickOrderCollectionMallAccounts,
} from '../../../domain/account/mall-account-identity';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import type { ChannelAccountListRow } from '../../../domain/account/channel-account';
import type {
  ChannelAccountPersistencePort,
  MallAccountRecord,
  MallAccountTransaction,
  MallAccountWrite,
} from '../../../application/port/out/persistence/channel-account.persistence.port';

const CHANNEL_ACCOUNT_LIST_SELECT = {
  id: true,
  channel: true,
  name: true,
  externalAccountId: true,
  vendorId: true,
  sellerId: true,
  isPrimary: true,
} as const;

const MALL_ACCOUNT_SELECT = {
  id: true,
  channel: true,
  name: true,
  externalAccountId: true,
  status: true,
  config: true,
  updatedAt: true,
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
export class ChannelAccountPersistenceAdapter implements ChannelAccountPersistencePort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping?: ChannelsProductMappingGenerationPort,
  ) {}
  private requireProductMapping(): ChannelsProductMappingGenerationPort {
    if (!this.productMapping) throw new Error('Products mapping generation owner is unavailable');
    return this.productMapping;
  }


  async readProviderIdentities(
    transaction: OwnerTransaction,
    input: { organizationId: string; channel: string; accountIds?: readonly string[] },
  ) {
    if (input.accountIds?.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    return tx.channelAccount.findMany({
      where: {
        organizationId: input.organizationId,
        channel: input.channel,
        ...(input.accountIds ? { id: { in: [...input.accountIds] } } : {}),
      },
      select: { id: true, externalAccountId: true, vendorId: true, status: true },
    });
  }

  async findByIds(
    transaction: OwnerTransaction,
    input: { organizationId: string; accountIds: readonly string[] },
  ) {
    if (input.accountIds.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    return tx.channelAccount.findMany({
      where: { organizationId: input.organizationId, id: { in: [...input.accountIds] } },
      select: { id: true, name: true, channel: true, status: true },
    });
  }

  async resolveActiveProvider(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      channel: string;
      accountId?: string;
      primaryOnly?: boolean;
    },
  ) {
    const tx = ownerTransactionClient(transaction);
    const account = await tx.channelAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        channel: input.channel,
        status: 'active',
        ...(input.accountId ? { id: input.accountId } : {}),
        ...(input.primaryOnly === true ? { isPrimary: true } : {}),
      },
      orderBy: input.accountId
        ? undefined
        : [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, channel: true, externalAccountId: true, vendorId: true },
    });
    return account;
  }

  async claimProviderIdentity(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      accountId: string;
      channel: 'coupang' | 'rocket';
      expectedVendorId: string | null;
      vendorId: string;
    },
  ): Promise<void> {
    const vendorId = input.vendorId.trim();
    if (!vendorId) throw new BadRequestException('Provider vendor identity is required.');

    const tx = ownerTransactionClient(transaction);
    if (input.channel === 'coupang') await lockProductMapping(tx, input.organizationId);

    const where = {
      id: input.accountId,
      organizationId: input.organizationId,
      channel: input.channel,
      status: 'active',
    } as const;
    const account = await tx.channelAccount.findFirst({
      where,
      select: { vendorId: true, externalAccountId: true },
    });
    if (!account) throw new NotFoundException('Active provider account not found.');

    const storedVendorId = account.vendorId?.trim() ?? '';
    const storedExternalId = account.externalAccountId?.trim() ?? '';
    if ([storedVendorId, storedExternalId].some((identity) => identity && identity !== vendorId)) {
      throw new ConflictException('Provider account already has a different identity.');
    }
    if (storedVendorId === vendorId) return;
    if (account.vendorId !== input.expectedVendorId) {
      throw new ConflictException('Provider account identity changed before claim.');
    }

    const claimed = await tx.channelAccount.updateMany({
      where: { ...where, vendorId: input.expectedVendorId },
      data: { vendorId },
    });
    if (claimed.count !== 1) {
      const current = await tx.channelAccount.findFirst({
        where,
        select: { vendorId: true, externalAccountId: true },
      });
      if (
        current?.vendorId?.trim() === vendorId &&
        (!current.externalAccountId?.trim() || current.externalAccountId.trim() === vendorId)
      ) {
        return;
      }
      throw new ConflictException('Provider account identity changed before claim.');
    }

    if (input.channel === 'coupang') {
      await this.requireProductMapping().advance(tx, input.organizationId);
    }
  }

  async resolveMallIdentities(
    transaction: OwnerTransaction,
    input: { organizationId: string; mallKeys?: readonly string[] },
  ) {
    const requested = input.mallKeys === undefined ? null : new Set(input.mallKeys);
    const malls = MALL_CHANNELS.filter((mall) => requested === null || requested.has(mall.key));
    if (malls.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    const { own, shared } = orderCollectionMallAccountChannels();
    const rows = await tx.channelAccount.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { channel: { in: own }, externalAccountId: { in: own } },
          { channel: { in: shared } },
        ],
      },
      orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
      select: { id: true, channel: true, externalAccountId: true },
    });
    const byKey = pickOrderCollectionMallAccounts(rows);
    return malls.flatMap((mall) => {
      const account = byKey.get(mall.key);
      return account ? [{ mallKey: mall.key, accountId: account.id }] : [];
    });
  }

  async assertProviderIdentity(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      accountId: string;
      channel: string;
      expectedVendorId: string;
    },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const account = await tx.channelAccount.findFirst({
      where: {
        id: input.accountId,
        organizationId: input.organizationId,
        channel: input.channel,
        status: 'active',
      },
      select: { id: true, externalAccountId: true, vendorId: true },
    });
    const vendorId = account?.vendorId?.trim() || account?.externalAccountId?.trim();
    if (vendorId !== input.expectedVendorId) {
      throw new ConflictException('Provider account is no longer active or its identity changed.');
    }
  }

  listMallAccounts(organizationId: string): Promise<MallAccountRecord[]> {
    return this.prisma.channelAccount.findMany({
      where: mallAccountWhere(organizationId),
      orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
      select: MALL_ACCOUNT_SELECT,
    });
  }

  withMallAccounts<T>(
    organizationId: string,
    work: (accounts: MallAccountTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `order-collection-mall-account:${organizationId}`;
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;

      const accounts: MallAccountTransaction = {
        list: () => tx.channelAccount.findMany({
          where: mallAccountWhere(organizationId),
          orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
          select: MALL_ACCOUNT_SELECT,
        }),
        save: async (input) => saveMallAccount(tx, organizationId, input),
      };
      return work(accounts);
    });
  }

  async getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId, channel: 'coupang', isPrimary: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!account) {
      return { configured: false, vendorId: null, status: null, updatedAt: null };
    }
    const vendorId = account.vendorId ?? account.externalAccountId;
    return {
      configured: Boolean(vendorId && account.status === 'active'),
      vendorId: vendorId ?? null,
      status: account.status,
      updatedAt: account.updatedAt,
    };
  }

  async upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings> {
    const vendorId = input.vendorId.trim();
    await this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, organizationId);
      const mappingBefore = await readCoupangAccountMappingBasis(tx, organizationId);
      const target = await tx.channelAccount.findFirst({
        where: {
          organizationId,
          channel: 'coupang',
          OR: [{ externalAccountId: vendorId }, { vendorId }],
        },
      });
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
          where: { id: target.id, organizationId, channel: 'coupang' },
          data: { name: target.name || '쿠팡 Wing', status: 'active', isPrimary: true },
        });
        await tx.channelAccount.updateMany({
          where: { organizationId, channel: 'coupang', id: { not: target.id } },
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
          where: { organizationId, channel: 'coupang', id: { not: created.id } },
          data: { isPrimary: false },
        });
      }

      const mappingAfter = await readCoupangAccountMappingBasis(tx, organizationId);
      if (mappingBasisChanged(mappingBefore, mappingAfter)) {
        await this.requireProductMapping().advance(tx, organizationId);
      }
    });
    return this.getCoupangSettings(organizationId);
  }

  listActive(organizationId: string): Promise<ChannelAccountListRow[]> {
    return this.prisma.channelAccount.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ channel: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
      select: CHANNEL_ACCOUNT_LIST_SELECT,
    });
  }

  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `rocket-account-bootstrap:${organizationId}`;
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;

      const coupangAccount = await tx.channelAccount.findFirst({
        where: { organizationId, channel: 'coupang', status: 'active', isPrimary: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { externalAccountId: true, vendorId: true },
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
          OR: [{ externalAccountId: vendorId }, { vendorId }],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { ...CHANNEL_ACCOUNT_LIST_SELECT, status: true },
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
            where: { id_organizationId: { id: existing.id, organizationId } },
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
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId, channel: 'coupang', isPrimary: true, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return account?.id ?? null;
  }
}

function mallAccountWhere(organizationId: string) {
  const { own, shared } = orderCollectionMallAccountChannels();
  return {
    organizationId,
    OR: [
      { channel: { in: own }, externalAccountId: { in: own } },
      { channel: { in: shared } },
    ],
  };
}

async function saveMallAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: MallAccountWrite,
): Promise<MallAccountRecord> {
  if (input.operation === 'update') {
    return tx.channelAccount.update({
      where: { id_organizationId: { id: input.id, organizationId } },
      data: {
        ...(input.channel === undefined ? {} : { channel: input.channel }),
        ...(input.externalAccountId === undefined ? {} : { externalAccountId: input.externalAccountId }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.status === undefined ? {} : { status: input.status }),
        config: input.config as Prisma.InputJsonObject,
      },
      select: MALL_ACCOUNT_SELECT,
    });
  }
  return tx.channelAccount.create({
    data: {
      organizationId,
      channel: input.channel,
      externalAccountId: input.externalAccountId,
      name: input.name,
      status: input.status,
      isPrimary: false,
      config: input.config as Prisma.InputJsonObject,
    },
    select: MALL_ACCOUNT_SELECT,
  });
}
