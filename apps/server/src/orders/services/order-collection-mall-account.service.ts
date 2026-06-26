import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CoupangCredentialCryptoError,
  decryptCredential,
  encryptCredential,
  type EncryptedCredentialEnvelope,
  isEncryptedCredentialEnvelope,
} from '../../channels/domain/channel-credential-crypto';

const ORDER_COLLECTION_CHANNEL = 'order_collection';
const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';

const ORDER_COLLECTION_MALLS = [
  { key: 'one-polaris', name: '원폴라리스' },
  { key: 'icecream-mall', name: '아이스크림몰' },
  { key: 'kidkids', name: '키드키즈' },
  { key: 'kidsnote', name: '키즈노트' },
  { key: 'haebub-mall', name: '해법몰' },
  { key: 'onch', name: '온채널' },
  { key: 'kkomangse', name: '꼬망세' },
  { key: 'art09', name: '아트공구' },
  { key: 'tekville-edu', name: '테크빌교육' },
  { key: 'benepia-mul', name: '베네피아물' },
] as const;

type OrderCollectionMallKey = (typeof ORDER_COLLECTION_MALLS)[number]['key'];

export interface OrderCollectionMallAccount {
  key: OrderCollectionMallKey;
  name: string;
  configured: boolean;
  enabled: boolean;
  loginId: string | null;
  hasPassword: boolean;
  siteUrl: string | null;
  memo: string | null;
  passwordUpdatedAt: string | null;
  updatedAt: string | null;
}

export interface UpdateOrderCollectionMallAccountInput {
  loginId?: unknown;
  password?: unknown;
  siteUrl?: unknown;
  memo?: unknown;
  enabled?: unknown;
}

export interface OrderCollectionMallPassword {
  key: OrderCollectionMallKey;
  password: string | null;
}

@Injectable()
export class OrderCollectionMallAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<OrderCollectionMallAccount[]> {
    const rows = await this.prisma.channelAccount.findMany({
      where: {
        organizationId,
        channel: ORDER_COLLECTION_CHANNEL,
        externalAccountId: { in: ORDER_COLLECTION_MALLS.map((mall) => mall.key) },
      },
      orderBy: { name: 'asc' },
    });
    const byKey = new Map(rows.map((row) => [row.externalAccountId, row]));

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
    const password = trimToOptional(input.password);
    const siteUrl = trimToNullable(input.siteUrl);
    const memo = trimToNullable(input.memo);
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;

    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: ORDER_COLLECTION_CHANNEL,
        externalAccountId: mall.key,
      },
    });
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
        password: nextPassword ? envelopeToJson(nextPassword) : null,
        passwordUpdatedAt,
        siteUrl,
        memo,
      },
    } satisfies Prisma.InputJsonObject;

    const saved = existing
      ? await this.prisma.channelAccount.update({
          where: { id: existing.id },
          data: {
            name: mall.name,
            status: enabled ? 'configured' : 'paused',
            config: nextConfig,
          },
        })
      : await this.prisma.channelAccount.create({
          data: {
            organizationId,
            channel: ORDER_COLLECTION_CHANNEL,
            name: mall.name,
            externalAccountId: mall.key,
            status: enabled ? 'configured' : 'paused',
            isPrimary: false,
            config: nextConfig,
          },
        });

    return toMallAccount(mall.key, mall.name, saved);
  }

  async getPassword(
    organizationId: string,
    mallKey: string,
  ): Promise<OrderCollectionMallPassword> {
    const mall = findMall(mallKey);
    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: ORDER_COLLECTION_CHANNEL,
        externalAccountId: mall.key,
      },
    });
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
}

function findMall(mallKey: string): (typeof ORDER_COLLECTION_MALLS)[number] {
  const mall = ORDER_COLLECTION_MALLS.find((item) => item.key === mallKey);
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
  const hasPassword = isEncryptedCredentialEnvelope(config.password);

  return {
    key,
    name,
    configured: Boolean(loginId && hasPassword),
    enabled: readBoolean(config.enabled, true),
    loginId,
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
