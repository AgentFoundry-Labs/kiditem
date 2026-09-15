import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type ChannelAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CoupangCredentialCryptoError,
  decryptCredential,
  encryptCredential,
  type EncryptedCredentialEnvelope,
  isEncryptedCredentialEnvelope,
} from '../../channels/domain/channel-credential-crypto';
import {
  ORDER_COLLECTION_MALLS,
  ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER,
  findOrderCollectionMall,
  orderCollectionMallAccountChannels,
  orderCollectionMallAccountFilter,
  orderCollectionMallAccountIdentity,
  pickOrderCollectionMallAccounts,
  type OrderCollectionMall,
  type OrderCollectionMallKey,
} from '../domain/order-collection-malls';

const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';

export interface OrderCollectionMallAccount {
  key: OrderCollectionMallKey;
  name: string;
  configured: boolean;
  enabled: boolean;
  loginId: string | null;
  supplierLoginId: string | null;
  hasPassword: boolean;
  siteUrl: string | null;
  memo: string | null;
  passwordUpdatedAt: string | null;
  updatedAt: string | null;
}

export interface UpdateOrderCollectionMallAccountInput {
  loginId?: unknown;
  supplierLoginId?: unknown;
  password?: unknown;
  siteUrl?: unknown;
  memo?: unknown;
  enabled?: unknown;
}

export interface OrderCollectionMallPassword {
  key: OrderCollectionMallKey;
  password: string | null;
}

/**
 * 주문 수집 몰 로그인. 몰마다의 로그인은 그 몰의 채널 계정 행(ADR-0012)의
 * `config.orderCollection` 에 두고, 몰 행을 만드는 곳은 이 서비스 하나다.
 */
@Injectable()
export class OrderCollectionMallAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<OrderCollectionMallAccount[]> {
    const { own, shared } = orderCollectionMallAccountChannels();
    const rows = await this.prisma.channelAccount.findMany({
      where: {
        organizationId,
        OR: [
          { channel: { in: own }, externalAccountId: { in: own } },
          { channel: { in: shared } },
        ],
      },
      orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
    });
    const byKey = pickOrderCollectionMallAccounts(rows);

    return ORDER_COLLECTION_MALLS.map((mall) => {
      const account = byKey.get(mall.key);
      return toMallAccount(mall.key, mall.name, account ?? null);
    });
  }

  async update(
    organizationId: string,
    mallKey: string,
    input: UpdateOrderCollectionMallAccountInput,
  ): Promise<OrderCollectionMallAccount> {
    const mall = findMall(mallKey);
    const loginId = trimToNullable(input.loginId);
    const supplierLoginId = trimToNullable(input.supplierLoginId);
    const password = trimToOptional(input.password);
    const siteUrl = trimToNullable(input.siteUrl);
    const memo = trimToNullable(input.memo);
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;

    const identity = orderCollectionMallAccountIdentity(mall);
    const existing = await this.findAccountRow(organizationId, mall);
    // 공유 마켓 행은 그 마켓의 연결이 만든다. 로그인을 저장하려고 마켓 행을 지어내지 않는다.
    if (!existing && identity.kind === 'shared') {
      throw new BadRequestException(
        `${mall.name} 로그인은 ${identity.channel} 채널 계정에 저장합니다. 그 채널 계정을 먼저 연결하세요.`,
      );
    }
    const existingConfig = toJsonRecord(existing?.config);
    const existingOrderConfig = readOrderCollectionConfig(existingConfig);
    const existingPassword = existingOrderConfig.password;
    const nextPassword = encryptPassword(password, existingPassword);
    const passwordUpdatedAt = password
      ? new Date().toISOString()
      : readString(existingOrderConfig.passwordUpdatedAt);

    const nextConfig = {
      ...existingConfig,
      [ORDER_COLLECTION_CONFIG_KEY]: {
        version: 1,
        enabled,
        loginId,
        supplierLoginId,
        password: nextPassword ? envelopeToJson(nextPassword) : null,
        passwordUpdatedAt,
        siteUrl,
        memo,
      },
    } satisfies Prisma.InputJsonObject;

    let saved: ChannelAccount;
    if (existing) {
      saved = await this.prisma.channelAccount.update({
        where: { id_organizationId: { id: existing.id, organizationId } },
        // 공유 마켓 행의 이름·상태는 그 마켓의 것이다(로켓 발주·직배송이 `active` 를 읽는다).
        // 로그인 설정만 더한다.
        data: identity.kind === 'own'
          ? { name: mall.name, status: enabled ? 'configured' : 'paused', config: nextConfig }
          : { config: nextConfig },
      });
    } else {
      if (identity.kind !== 'own') throw new Error('ORDER_COLLECTION_SHARED_ACCOUNT_MISSING');
      saved = await this.prisma.channelAccount.create({
        data: {
          organizationId,
          channel: identity.channel,
          name: mall.name,
          externalAccountId: identity.externalAccountId,
          status: enabled ? 'configured' : 'paused',
          isPrimary: false,
          config: nextConfig,
        },
      });
    }

    return toMallAccount(mall.key, mall.name, saved);
  }

  async getPassword(
    organizationId: string,
    mallKey: string,
  ): Promise<OrderCollectionMallPassword> {
    const mall = findMall(mallKey);
    const existing = await this.findAccountRow(organizationId, mall);
    const config = readOrderCollectionConfig(toJsonRecord(existing?.config));
    const encryptedPassword = config.password;

    if (!isEncryptedCredentialEnvelope(encryptedPassword)) {
      return { key: mall.key, password: null };
    }

    try {
      return {
        key: mall.key,
        password: decryptCredential(encryptedPassword),
      };
    } catch (err) {
      if (err instanceof CoupangCredentialCryptoError) {
        throw new BadRequestException('채널 계정 암호화 키가 필요합니다.');
      }
      throw err;
    }
  }

  private findAccountRow(organizationId: string, mall: OrderCollectionMall) {
    return this.prisma.channelAccount.findFirst({
      where: { organizationId, ...orderCollectionMallAccountFilter(mall) },
      orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
    });
  }
}

function findMall(mallKey: string): OrderCollectionMall {
  const mall = findOrderCollectionMall(mallKey);
  if (!mall) throw new BadRequestException('지원하지 않는 몰입니다.');
  return mall;
}

function toMallAccount(
  key: OrderCollectionMallKey,
  name: string,
  account: { config: Prisma.JsonValue | null; updatedAt: Date } | null,
): OrderCollectionMallAccount {
  const config = readOrderCollectionConfig(toJsonRecord(account?.config));
  const loginId = readString(config.loginId);
  const supplierLoginId = readString(config.supplierLoginId);
  const hasPassword = isEncryptedCredentialEnvelope(config.password);

  return {
    key,
    name,
    configured: Boolean(loginId && hasPassword && (key !== 'art09' || supplierLoginId)),
    enabled: readBoolean(config.enabled, true),
    loginId,
    supplierLoginId,
    hasPassword,
    siteUrl: readString(config.siteUrl),
    memo: readString(config.memo),
    passwordUpdatedAt: readString(config.passwordUpdatedAt),
    updatedAt: account?.updatedAt.toISOString() ?? null,
  };
}

function trimToOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function trimToNullable(value: unknown): string | null {
  return trimToOptional(value) ?? null;
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.JsonObject;
}

function readOrderCollectionConfig(config: Prisma.JsonObject): Record<string, unknown> {
  const value = config[ORDER_COLLECTION_CONFIG_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function envelopeToJson(envelope: EncryptedCredentialEnvelope): Prisma.InputJsonObject {
  return {
    version: envelope.version,
    algorithm: envelope.algorithm,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    tag: envelope.tag,
  };
}

function encryptPassword(
  password: string | undefined,
  existingPassword: unknown,
): EncryptedCredentialEnvelope | null {
  if (!password) {
    return isEncryptedCredentialEnvelope(existingPassword) ? existingPassword : null;
  }

  try {
    return encryptCredential(password);
  } catch (err) {
    if (err instanceof CoupangCredentialCryptoError) {
      throw new BadRequestException('채널 계정 암호화 키가 필요합니다.');
    }
    throw err;
  }
}
