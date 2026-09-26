import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import {
  findOrderCollectionMall,
  orderCollectionMallAccountChannels,
  orderCollectionMallAccountIdentity,
  pickOrderCollectionMallAccounts,
  type OrderCollectionMall,
  type OrderCollectionMallEntry,
  type OrderCollectionMallKey,
} from '../../../domain/account/mall-account-identity';
import { KiditemError, KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { ChannelAccountFactQueries } from '../../port/in/account/channel-account.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { UpdateMallListingProfileSchema, type UpdateCoupangAccountSettings } from '@kiditem/shared/channel-account';
import {
  LISTING_PROFILE_CONFIG_KEY,
  mergeMallListingProfile,
  readMallListingProfile,
} from '../../../domain/account/mall-listing-profile';
import type { ChannelAccountListRow } from '../../../domain/account/channel-account';
import type {
  ChannelAccountPort,
  LoginAccountKey,
  MallAccount,
  MallAccountPassword,
  UpdateMallAccountInput,
} from '../../port/in/account/channel-account.port';
import {
  LOGIN_ACCOUNT_MARKETS,
  type ChannelAccountPersistencePort,
  type MallAccountRecord,
  type MallAccountWrite,
} from '../../port/out/persistence/channel-account.persistence.port';
import type { ChannelCredentialsPort } from '../../port/out/credentials/channel-credentials.port';

const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';

/** Channels is the sole account management authority, including order-screen logins. */
export class ChannelAccountService implements ChannelAccountPort {
  constructor(
    private readonly persistence: ChannelAccountPersistencePort,
    private readonly credentials: ChannelCredentialsPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getCoupangSettings(organizationId: string) {
    return this.persistence.getCoupangSettings(organizationId);
  }

  upsertCoupangSettings(organizationId: string, input: UpdateCoupangAccountSettings) {
    return this.persistence.upsertCoupangSettings(organizationId, input);
  }

  claimProviderIdentity(transaction: OwnerTransaction, input: Parameters<ChannelAccountPort['claimProviderIdentity']>[1]) {
    return this.persistence.claimProviderIdentity(transaction, input);
  }

  readProviderIdentities(transaction: OwnerTransaction, input: Parameters<ChannelAccountFactQueries['readProviderIdentities']>[1]) {
    return this.persistence.readProviderIdentities(transaction, input);
  }

  findByIds(transaction: OwnerTransaction, input: Parameters<ChannelAccountFactQueries['findByIds']>[1]) {
    return this.persistence.findByIds(transaction, input);
  }

  resolveActiveProvider(transaction: OwnerTransaction, input: Parameters<ChannelAccountFactQueries['resolveActiveProvider']>[1]) {
    return this.persistence.resolveActiveProvider(transaction, input);
  }

  resolveMallIdentities(transaction: OwnerTransaction, input: Parameters<ChannelAccountFactQueries['resolveMallIdentities']>[1]) {
    return this.persistence.resolveMallIdentities(transaction, input);
  }

  assertProviderIdentity(transaction: OwnerTransaction, input: Parameters<ChannelAccountFactQueries['assertProviderIdentity']>[1]) {
    return this.persistence.assertProviderIdentity(transaction, input);
  }

  listActive(organizationId: string): Promise<ChannelAccountListRow[]> {
    return this.persistence.listActive(organizationId);
  }

  ensureRocketAccount(organizationId: string) {
    return this.persistence.ensureRocketAccount(organizationId);
  }

  async list(organizationId: string): Promise<MallAccount[]> {
    const rows = await this.persistence.listMallAccounts(organizationId);
    return toMallAccountList(rows, this.credentials);
  }

  async reorder(organizationId: string, mallKeys: unknown): Promise<MallAccount[]> {
    const orderedKeys = normalizeMallKeyOrder(mallKeys);
    const nextSortOrderByKey = new Map(orderedKeys.map((key, index) => [key, index]));

    const rows = await this.persistence.withMallAccounts(organizationId, async (accounts) => {
      const existingRows = await accounts.list();
      const byKey = pickOrderCollectionMallAccounts(existingRows);

      for (const mall of MALL_CHANNELS) {
        const existing = byKey.get(mall.key);
        if (!existing) continue;
        const nextSortOrder = nextSortOrderByKey.get(mall.key) ?? null;
        const existingConfig = toJsonRecord(existing.config);
        const orderCollection = readOrderCollectionConfig(existingConfig);
        if (readNumber(orderCollection.sortOrder) === nextSortOrder) continue;

        await accounts.save({
          operation: 'update',
          id: existing.id,
          config: {
            ...existingConfig,
            [ORDER_COLLECTION_CONFIG_KEY]: { ...orderCollection, sortOrder: nextSortOrder },
          },
        });
      }
      return accounts.list();
    });

    return toMallAccountList(rows, this.credentials);
  }

  async update(
    organizationId: string,
    mallKey: string,
    input: UpdateMallAccountInput,
  ): Promise<MallAccount> {
    const mall = findLoginAccount(mallKey);
    const loginId = trimToNullable(input.loginId);
    const supplierLoginId = trimToNullable(input.supplierLoginId);
    const password = trimToOptional(input.password);
    const siteUrl = trimToNullable(input.siteUrl);
    const memo = trimToNullable(input.memo);
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;
    const identity = orderCollectionMallAccountIdentity(mall);

    const saved = await this.persistence.withMallAccounts(organizationId, async (accounts) => {
      const rows = await accounts.list();
      const existing = pickLoginAccount(rows, mall);
      if (!existing && identity.kind === 'shared') {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', {
          details: { reason: 'SHARED_CHANNEL_ACCOUNT_MISSING' },
          message: `${mall.name} 로그인은 ${identity.channel} 채널 계정에 저장합니다. 그 채널 계정을 먼저 연결하세요.`,
        });
      }

      const existingConfig = toJsonRecord(existing?.config);
      const existingOrderCollection = readOrderCollectionConfig(existingConfig);
      const encryptedPassword = encryptPassword(password, existingOrderCollection.password, this.credentials);
      const passwordUpdatedAt = password
        ? this.now().toISOString()
        : readString(existingOrderCollection.passwordUpdatedAt);
      const config = {
        ...existingConfig,
        [ORDER_COLLECTION_CONFIG_KEY]: {
          ...existingOrderCollection,
          version: 1,
          enabled,
          loginId,
          supplierLoginId,
          password: encryptedPassword,
          passwordUpdatedAt,
          siteUrl,
          memo,
          sortOrder: readNumber(existingOrderCollection.sortOrder),
        },
      };

      const write: MallAccountWrite = existing
        ? identity.kind === 'own'
          ? {
            operation: 'update',
            id: existing.id,
            name: mall.name,
            status: enabled ? 'configured' : 'paused',
            config,
          }
          : { operation: 'update', id: existing.id, config }
        : {
            operation: 'create',
            channel: identity.channel,
            externalAccountId: identity.kind === 'own' ? identity.externalAccountId : null,
            name: mall.name,
            status: enabled ? 'configured' : 'paused',
            config,
          };

      return accounts.save(write);
    });

    return toMallAccount(mall.key, mall.name, saved, this.credentials);
  }

  async updateListingProfile(organizationId: string, mallKey: string, input: unknown): Promise<MallAccount> {
    const mall = findMall(mallKey);
    const parsed = UpdateMallListingProfileSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // 영어 zod 문장은 운영자에게 보내지 않는다 — 틀린 칸 이름만 싣는다.
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        message: `등록 기본값 입력이 올바르지 않습니다${issue ? `(${issue.path.join('.') || '본문'})` : ''}.`,
      });
    }

    const saved = await this.persistence.withMallAccounts(organizationId, async (accounts) => {
      const rows = await accounts.list();
      const existing = pickOrderCollectionMallAccounts(rows).get(mall.key) ?? null;
      if (!existing) {
        throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
      }
      const existingConfig = toJsonRecord(existing.config);
      const config = {
        ...existingConfig,
        [LISTING_PROFILE_CONFIG_KEY]: mergeMallListingProfile(readMallListingProfile(existingConfig), parsed.data),
      };
      return accounts.save({ operation: 'update', id: existing.id, config });
    });

    return toMallAccount(mall.key, mall.name, saved, this.credentials);
  }

  /** 자동 로그인에 쓰는 저장 자격(아이디·공급사 아이디·평문 비밀번호). 몰과 쿠팡 윙(KID-377)이 같은 모양이다. */
  async getPassword(organizationId: string, mallKey: string): Promise<MallAccountPassword> {
    const mall = findLoginAccount(mallKey);
    const rows = await this.persistence.listMallAccounts(organizationId);
    const existing = pickLoginAccount(rows, mall);
    const orderCollection = readOrderCollectionConfig(toJsonRecord(existing?.config));
    const login = {
      key: mall.key,
      loginId: readString(orderCollection.loginId),
      supplierLoginId: readString(orderCollection.supplierLoginId),
    };
    if (!this.credentials.isEncrypted(orderCollection.password)) {
      return { ...login, password: null };
    }

    try {
      return { ...login, password: this.credentials.decrypt(orderCollection.password) };
    } catch (error) {
      mapCredentialKeyError(error);
    }
  }
}

type LoginAccountEntry = OrderCollectionMallEntry & { key: LoginAccountKey };

/** 저장 로그인을 두는 계정: 주문 수집 몰, 또는 로그인만 두는 마켓 행(쿠팡 윙, KID-377). */
function findLoginAccount(key: string): LoginAccountEntry {
  const mall = findOrderCollectionMall(key);
  if (mall) return mall;
  const market = LOGIN_ACCOUNT_MARKETS.find((entry) => entry.key === key);
  if (!market) throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '지원하지 않는 몰입니다.' });
  return market;
}

/**
 * 그 계정의 행. 몰은 몰 규칙대로, 로그인만 두는 마켓은 고르는 순서(대표 계정 먼저)의 연결된(`active`) 첫 마켓 행 —
 * 연결이 끊긴 윙 행에 로그인을 두거나 거기서 읽지 않는다.
 */
function pickLoginAccount<T extends MallAccountRecord>(rows: readonly T[], entry: LoginAccountEntry): T | null {
  if (findOrderCollectionMall(entry.key)) return pickOrderCollectionMallAccounts(rows).get(entry.key as OrderCollectionMallKey) ?? null;
  return rows.find((row) => row.channel === entry.sharedAccountChannel && row.status === 'active') ?? null;
}

function findMall(mallKey: string): OrderCollectionMall {
  const mall = findOrderCollectionMall(mallKey);
  if (!mall) throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '지원하지 않는 몰입니다.' });
  return mall;
}

function toMallAccountList(
  rows: readonly MallAccountRecord[],
  credentials: ChannelCredentialsPort,
): MallAccount[] {
  const byKey = pickOrderCollectionMallAccounts(rows);
  return MALL_CHANNELS.map((mall, catalogIndex) => ({
    catalogIndex,
    account: toMallAccount(mall.key, mall.name, byKey.get(mall.key) ?? null, credentials),
  }))
    .sort((left, right) =>
      (left.account.sortOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.account.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || left.catalogIndex - right.catalogIndex)
    .map(({ account }) => account);
}

function toMallAccount(
  key: LoginAccountKey,
  name: string,
  account: Pick<MallAccountRecord, 'id' | 'config' | 'updatedAt'> | null,
  credentials: ChannelCredentialsPort,
): MallAccount {
  const orderCollection = readOrderCollectionConfig(toJsonRecord(account?.config));
  const loginId = readString(orderCollection.loginId);
  const supplierLoginId = readString(orderCollection.supplierLoginId);
  const hasPassword = credentials.isEncrypted(orderCollection.password);
  return {
    key,
    name,
    channelAccountId: account?.id ?? null,
    configured: Boolean(loginId && hasPassword && (key !== 'art09' || supplierLoginId)),
    enabled: readBoolean(orderCollection.enabled, true),
    loginId,
    supplierLoginId,
    hasPassword,
    siteUrl: readString(orderCollection.siteUrl),
    memo: readString(orderCollection.memo),
    passwordUpdatedAt: readString(orderCollection.passwordUpdatedAt),
    sortOrder: readNumber(orderCollection.sortOrder),
    listingProfile: readMallListingProfile(account?.config),
    updatedAt: account?.updatedAt.toISOString() ?? null,
  };
}

function normalizeMallKeyOrder(value: unknown): OrderCollectionMallKey[] {
  if (!Array.isArray(value)) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '몰 순서는 배열이어야 합니다.' });
  }
  const keys: OrderCollectionMallKey[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '몰 키는 문자열이어야 합니다.' });
    }
    const key = findMall(entry).key;
    if (seen.has(key)) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '몰 순서에 같은 몰이 두 번 들어 있습니다.' });
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function encryptPassword(
  password: string | undefined,
  existingPassword: unknown,
  credentials: ChannelCredentialsPort,
): Record<string, unknown> | null {
  if (!password) return credentials.isEncrypted(existingPassword) ? toJsonRecord(existingPassword) : null;
  try {
    return credentials.encrypt(password);
  } catch (error) {
    mapCredentialKeyError(error);
  }
}

function mapCredentialKeyError(error: unknown): never {
  if (error instanceof Error && error.name === 'CoupangCredentialCryptoError') {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CREDENTIAL_KEY_MISSING' }, cause: error });
  }
  throw error;
}

function trimToOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function trimToNullable(value: unknown): string | null {
  return trimToOptional(value) ?? null;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readOrderCollectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  return toJsonRecord(config[ORDER_COLLECTION_CONFIG_KEY]);
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
