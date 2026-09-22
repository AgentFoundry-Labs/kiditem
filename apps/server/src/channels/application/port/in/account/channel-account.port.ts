import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { MallChannelKey } from '@kiditem/shared/channel-registry';
import type { CoupangAccountSettings, UpdateCoupangAccountSettings } from '@kiditem/shared/channel-account';
import type { ChannelAccountListRow } from '../../../../domain/account/channel-account';

export const CHANNEL_ACCOUNT_PORT = Symbol('CHANNEL_ACCOUNT_PORT');

export interface MallAccount {
  channelAccountId: string | null;
  key: MallChannelKey;
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

export interface UpdateMallAccountInput {
  loginId?: unknown;
  supplierLoginId?: unknown;
  password?: unknown;
  siteUrl?: unknown;
  memo?: unknown;
  enabled?: unknown;
}

export interface MallAccountPassword {
  key: MallChannelKey;
  password: string | null;
}

export interface ChannelAccountFactQueries {
  readProviderIdentities(transaction: OwnerTransaction, input: { organizationId: string; channel: string; accountIds?: readonly string[] }): Promise<Array<{ id: string; externalAccountId: string | null; vendorId: string | null; status: string }>>;
  findByIds(transaction: OwnerTransaction, input: { organizationId: string; accountIds: readonly string[] }): Promise<Array<{ id: string; name: string; channel: string; status: string }>>;
  resolveActiveProvider(transaction: OwnerTransaction, input: { organizationId: string; channel: string; accountId?: string; primaryOnly?: boolean }): Promise<{ id: string; channel: string; externalAccountId: string | null; vendorId: string | null } | null>;
  resolveMallIdentities(transaction: OwnerTransaction, input: { organizationId: string; mallKeys?: readonly string[] }): Promise<Array<{ mallKey: string; accountId: string }>>;
  assertProviderIdentity(transaction: OwnerTransaction, input: { organizationId: string; accountId: string; channel: string; expectedVendorId: string }): Promise<void>;
}

export interface ChannelAccountPort extends ChannelAccountFactQueries {
  claimProviderIdentity(transaction: OwnerTransaction, input: { organizationId: string; accountId: string; channel: 'coupang' | 'rocket'; expectedVendorId: string | null; vendorId: string }): Promise<void>;
  listActive(organizationId: string): Promise<ChannelAccountListRow[]>;
  list(organizationId: string): Promise<MallAccount[]>;
  reorder(organizationId: string, mallKeys: unknown): Promise<MallAccount[]>;
  update(organizationId: string, mallKey: string, input: UpdateMallAccountInput): Promise<MallAccount>;
  getPassword(organizationId: string, mallKey: string): Promise<MallAccountPassword>;
  getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings>;
  upsertCoupangSettings(organizationId: string, input: UpdateCoupangAccountSettings): Promise<CoupangAccountSettings>;
  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow>;
}
