import { BadRequestException } from '@nestjs/common';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';

export const CHANNEL_ACCOUNT_REPOSITORY_PORT = Symbol('CHANNEL_ACCOUNT_REPOSITORY_PORT');
export const COUPANG_CREDENTIALS_PORT = Symbol('COUPANG_CREDENTIALS_PORT');

export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

export class CoupangAccountConfigurationError extends BadRequestException {}

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

  resolveCoupangCredentials(organizationId: string): Promise<CoupangCredentials>;

  listActive(organizationId: string): Promise<ChannelAccountListRow[]>;

  getPrimaryCoupangAccountId(organizationId: string): Promise<string | null>;
}

export interface CoupangCredentialsPort {
  resolveCoupangCredentials(organizationId: string): Promise<CoupangCredentials>;
}
