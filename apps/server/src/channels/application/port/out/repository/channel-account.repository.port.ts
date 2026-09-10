import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';

export const CHANNEL_ACCOUNT_REPOSITORY_PORT = Symbol('CHANNEL_ACCOUNT_REPOSITORY_PORT');

export interface ChannelAccountListRow {
  id: string;
  channel: string;
  name: string;
  externalAccountId: string | null;
  vendorId: string | null;
  sellerId: string | null;
  isPrimary: boolean;
}

export interface ChannelAccountRepositoryPort {
  getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings>;

  upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings>;

  listActive(organizationId: string): Promise<ChannelAccountListRow[]>;

  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow>;

  getPrimaryCoupangAccountId(organizationId: string): Promise<string | null>;
}
