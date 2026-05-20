import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelAccountRepositoryPort,
  CoupangCredentials,
  CoupangCredentialsPort,
} from '../../../application/port/out/repository/channel-account.repository.port';
import { CoupangAccountConfigurationError } from '../../../application/port/out/repository/channel-account.repository.port';
import {
  CoupangCredentialCryptoError,
  decryptCredential,
  encryptCredential,
  type EncryptedCredentialEnvelope,
  isEncryptedCredentialEnvelope,
} from '../../../domain/channel-credential-crypto';

function toJsonRecord(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.JsonObject;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimToOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function maskAccessKey(accessKey: string | undefined): string | null {
  if (!accessKey) return null;
  if (accessKey.length <= 8) return '********';
  return `${accessKey.slice(0, 4)}********${accessKey.slice(-4)}`;
}

function readCredentialsConfig(config: Record<string, unknown>) {
  return toRecord(config.coupangCredentials);
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

function stripLegacyCredentialKeys(
  config: Prisma.JsonObject,
): Record<string, Prisma.InputJsonValue | null> {
  const next: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === 'accessKey' || key === 'secretKey') continue;
    next[key] = value as Prisma.InputJsonValue | null;
  }
  return next;
}

@Injectable()
export class ChannelAccountRepositoryAdapter
  implements ChannelAccountRepositoryPort, CoupangCredentialsPort
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
        accessKeyMasked: null,
        hasAccessKey: false,
        hasSecretKey: false,
        status: null,
        updatedAt: null,
      } satisfies CoupangAccountSettings;
    }

    const credentials = readCredentialsConfig(toJsonRecord(account.config));
    const hasAccessKey = isEncryptedCredentialEnvelope(credentials.accessKey);
    const hasSecretKey = isEncryptedCredentialEnvelope(credentials.secretKey);
    const accessKeyMasked =
      typeof credentials.accessKeyMasked === 'string'
        ? credentials.accessKeyMasked
        : null;
    const vendorId = account.vendorId ?? account.externalAccountId;

    return {
      configured: Boolean(vendorId && hasAccessKey && hasSecretKey && account.status === 'active'),
      vendorId: vendorId ?? null,
      accessKeyMasked,
      hasAccessKey,
      hasSecretKey,
      status: account.status,
      updatedAt: account.updatedAt,
    } satisfies CoupangAccountSettings;
  }

  async upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings> {
    const vendorId = input.vendorId.trim();
    const nextAccessKey = trimToOptional(input.accessKey);
    const nextSecretKey = trimToOptional(input.secretKey);

    await this.prisma.$transaction(async (tx) => {
      const primary = await tx.channelAccount.findFirst({
        where: { organizationId, channel: 'coupang', isPrimary: true },
        orderBy: { updatedAt: 'desc' },
      });
      const sameVendor = await tx.channelAccount.findFirst({
        where: { organizationId, channel: 'coupang', externalAccountId: vendorId },
      });
      const target = sameVendor ?? primary;
      const existingConfig = toJsonRecord(target?.config);
      const existingCredentials = readCredentialsConfig(existingConfig);
      const accessKey =
        nextAccessKey ??
        (isEncryptedCredentialEnvelope(existingCredentials.accessKey)
          ? decryptCredential(existingCredentials.accessKey)
          : undefined);
      const secretKey =
        nextSecretKey ??
        (isEncryptedCredentialEnvelope(existingCredentials.secretKey)
          ? decryptCredential(existingCredentials.secretKey)
          : undefined);

      if (!accessKey) {
        throw new BadRequestException('쿠팡 Access Key를 입력하세요.');
      }
      if (!secretKey) {
        throw new BadRequestException('쿠팡 Secret Key를 입력하세요.');
      }

      const nextConfig = stripLegacyCredentialKeys(existingConfig);
      nextConfig.coupangCredentials = {
        version: 1,
        accessKey: envelopeToJson(encryptCredential(accessKey)),
        secretKey: envelopeToJson(encryptCredential(secretKey)),
        accessKeyMasked: maskAccessKey(accessKey),
      };

      if (target) {
        await tx.channelAccount.updateMany({
          where: {
            id: target.id,
            organizationId,
            channel: 'coupang',
          },
          data: {
            channel: 'coupang',
            name: target.name || '쿠팡 Wing',
            externalAccountId: vendorId,
            vendorId,
            status: 'active',
            isPrimary: true,
            config: nextConfig as Prisma.InputJsonObject,
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
        return;
      }

      const created = await tx.channelAccount.create({
        data: {
          organizationId,
          channel: 'coupang',
          name: '쿠팡 Wing',
          externalAccountId: vendorId,
          vendorId,
          status: 'active',
          isPrimary: true,
          config: nextConfig as Prisma.InputJsonObject,
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
    });

    return this.getCoupangSettings(organizationId);
  }

  async resolveCoupangCredentials(organizationId: string): Promise<CoupangCredentials> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
    });

    const config = readCredentialsConfig(toJsonRecord(account?.config));
    const vendorId = account?.vendorId ?? account?.externalAccountId ?? null;
    const accessKey = isEncryptedCredentialEnvelope(config.accessKey)
      ? decryptCredential(config.accessKey)
      : null;
    const secretKey = isEncryptedCredentialEnvelope(config.secretKey)
      ? decryptCredential(config.secretKey)
      : null;

    if (!vendorId || !accessKey || !secretKey) {
      throw new CoupangAccountConfigurationError(
        '쿠팡 API 설정이 필요합니다. 설정 화면에서 Vendor ID, Access Key, Secret Key를 저장하세요.',
      );
    }

    return { vendorId, accessKey, secretKey };
  }

  listActive(organizationId: string) {
    return this.prisma.channelAccount.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ channel: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        channel: true,
        name: true,
        externalAccountId: true,
        vendorId: true,
        sellerId: true,
        isPrimary: true,
      },
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

export function isCoupangAccountConfigurationError(error: unknown): boolean {
  return error instanceof CoupangAccountConfigurationError;
}

export function isCoupangCredentialResolutionError(error: unknown): boolean {
  return (
    error instanceof CoupangAccountConfigurationError ||
    error instanceof CoupangCredentialCryptoError
  );
}
