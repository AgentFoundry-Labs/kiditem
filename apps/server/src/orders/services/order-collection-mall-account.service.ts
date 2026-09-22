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
import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import {
  ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER,
  findOrderCollectionMall,
  orderCollectionMallAccountChannels,
  orderCollectionMallAccountFilter,
  orderCollectionMallAccountIdentity,
  pickOrderCollectionMallAccounts,
  type OrderCollectionMall,
  type OrderCollectionMallKey,
} from '../domain/order-collection-malls';
import {
  ONE_POLARIS_MALL_KEY,
  isOnePolarisSellpiaTemplate,
  type OnePolarisSellpiaTemplate,
} from '../domain/one-polaris-sellpia-order';

const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';
/** 원폴라리스 셀피아 양식 표가 사는 `config.orderCollection` 안의 칸. */
const SELLPIA_TEMPLATE_KEY = 'sellpiaTemplate';

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
  /** 주문수집 화면 카드 순서. null 이면 카탈로그 기본 순서. */
  sortOrder: number | null;
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

    // 저장된 순서가 먼저, 없으면 카탈로그 순서. 같은 순번은 카탈로그 순서로 안정 정렬.
    return MALL_CHANNELS.map((mall, catalogIndex) => ({
      catalogIndex,
      account: toMallAccount(mall.key, mall.name, byKey.get(mall.key) ?? null),
    }))
      .sort((left, right) =>
        (left.account.sortOrder ?? Number.MAX_SAFE_INTEGER)
          - (right.account.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || left.catalogIndex - right.catalogIndex)
      .map(({ account }) => account);
  }

  /**
   * 주문수집 화면 카드 순서를 저장한다.
   *
   * 보내온 키는 0..n-1 순번을 받고, 빠진 키는 순번을 비워 카탈로그 기본 순서로
   * 되돌아간다. 카탈로그에 몰이 새로 늘어도 예전 화면이 보낸 목록이 거부되지
   * 않도록 부분 목록을 허용한다.
   *
   * 순서는 이미 있는 계정 행에만 담는다. 행이 없는 몰은 미설정이고(ADR-0012), 순서를
   * 담으려고 행을 만들면 그 몰이 설정된 몰로 보여 수집 대상 · 연결된 몰 수에 들어간다.
   * 그런 몰은 카탈로그 순서로 뒤에 선다.
   */
  async reorder(
    organizationId: string,
    mallKeys: unknown,
  ): Promise<OrderCollectionMallAccount[]> {
    const orderedKeys = normalizeMallKeyOrder(mallKeys);
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
    const nextSortOrderByKey = new Map(orderedKeys.map((key, index) => [key, index]));

    const writes = MALL_CHANNELS.flatMap((mall) => {
      const existing = byKey.get(mall.key);
      if (!existing) return [];
      const nextSortOrder = nextSortOrderByKey.get(mall.key) ?? null;
      const existingConfig = toJsonRecord(existing.config);
      const existingOrderConfig = readOrderCollectionConfig(existingConfig);
      if (readNumber(existingOrderConfig.sortOrder) === nextSortOrder) return [];
      const nextConfig = {
        ...existingConfig,
        [ORDER_COLLECTION_CONFIG_KEY]: {
          ...(existingOrderConfig as Prisma.InputJsonObject),
          sortOrder: nextSortOrder,
        },
      } satisfies Prisma.InputJsonObject;
      return [{ existing, nextConfig }];
    });
    if (writes.length === 0) return this.list(organizationId);

    await this.prisma.$transaction(
      writes.map(({ existing, nextConfig }) =>
        this.prisma.channelAccount.update({
          where: { id_organizationId: { id: existing.id, organizationId } },
          data: { config: nextConfig },
        })),
    );
    return this.list(organizationId);
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
        // 계정 저장이 카드 순서를 지우지 않도록 그대로 넘긴다.
        sortOrder: readNumber(existingOrderConfig.sortOrder),
        // 원폴라리스 셀피아 양식 표도 계정 저장이 지우지 않는다.
        ...carrySellpiaTemplate(existingOrderConfig),
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

  /**
   * 원폴라리스 셀피아 양식(주소록 · 단가 표). 메일 주문 엑셀을 변환할 때 이 표로 전화 · 주소 ·
   * 공급단가를 채운다. 몰 계정 행 `config.orderCollection.sellpiaTemplate` 에 둔다 — 그 몰의
   * 설정이고, 이 행에 쓰는 곳은 이 서비스 하나다. 저장된 것이 없거나 모양이 아니면 null.
   */
  async readOnePolarisSellpiaTemplate(
    organizationId: string,
  ): Promise<OnePolarisSellpiaTemplate | null> {
    const mall = findMall(ONE_POLARIS_MALL_KEY);
    const existing = await this.findAccountRow(organizationId, mall);
    const template = readOrderCollectionConfig(toJsonRecord(existing?.config))[SELLPIA_TEMPLATE_KEY];
    return isOnePolarisSellpiaTemplate(template) ? template : null;
  }

  /** 양식 표를 바꿔 끼운다. 로그인 · 순서 같은 다른 설정은 그대로 둔다. */
  async saveOnePolarisSellpiaTemplate(
    organizationId: string,
    template: OnePolarisSellpiaTemplate,
  ): Promise<OnePolarisSellpiaTemplate> {
    const mall = findMall(ONE_POLARIS_MALL_KEY);
    const identity = orderCollectionMallAccountIdentity(mall);
    if (identity.kind !== 'own') throw new Error('ORDER_COLLECTION_SHARED_ACCOUNT_MISSING');
    const existing = await this.findAccountRow(organizationId, mall);
    const existingConfig = toJsonRecord(existing?.config);
    const existingOrderConfig = readOrderCollectionConfig(existingConfig);
    const nextConfig = {
      ...existingConfig,
      [ORDER_COLLECTION_CONFIG_KEY]: {
        version: 1,
        ...(existingOrderConfig as Prisma.InputJsonObject),
        [SELLPIA_TEMPLATE_KEY]: JSON.parse(JSON.stringify(template)) as Prisma.InputJsonObject,
      },
    } satisfies Prisma.InputJsonObject;

    if (existing) {
      await this.prisma.channelAccount.update({
        where: { id_organizationId: { id: existing.id, organizationId } },
        data: { config: nextConfig },
      });
    } else {
      // 양식만 먼저 올린 조직에도 몰 행이 있어야 표가 붙는다. 로그인은 비워 둔다.
      await this.prisma.channelAccount.create({
        data: {
          organizationId,
          channel: identity.channel,
          name: mall.name,
          externalAccountId: identity.externalAccountId,
          status: 'configured',
          isPrimary: false,
          config: nextConfig,
        },
      });
    }
    return template;
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
    sortOrder: readNumber(config.sortOrder),
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

/** 계정 저장이 `config.orderCollection` 을 통째로 다시 쓰므로, 양식 표는 따로 실어 넘긴다. */
function carrySellpiaTemplate(orderConfig: Record<string, unknown>): Prisma.InputJsonObject {
  const template = orderConfig[SELLPIA_TEMPLATE_KEY];
  return template === undefined || template === null
    ? {}
    : { [SELLPIA_TEMPLATE_KEY]: template as Prisma.InputJsonValue };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeMallKeyOrder(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('몰 순서는 배열이어야 합니다.');
  }
  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new BadRequestException('몰 키는 문자열이어야 합니다.');
    }
    const key = findMall(entry).key;
    if (keys.includes(key)) {
      throw new BadRequestException('몰 순서에 같은 몰이 두 번 들어 있습니다.');
    }
    keys.push(key);
  }
  return keys;
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
