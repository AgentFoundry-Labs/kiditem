import { Inject, Injectable } from '@nestjs/common';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  type ChannelAccountListRow,
  CoupangAccountConfigurationError,
  type ChannelAccountRepositoryPort,
  type CoupangCredentials,
} from '../port/out/repository/channel-account.repository.port';
import { CoupangCredentialCryptoError } from '../../domain/channel-credential-crypto';

export { CoupangAccountConfigurationError };

@Injectable()
export class ChannelAccountService {
  constructor(
    @Inject(CHANNEL_ACCOUNT_REPOSITORY_PORT)
    private readonly repository: ChannelAccountRepositoryPort,
  ) {}

  getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings> {
    return this.repository.getCoupangSettings(organizationId);
  }

  upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings> {
    return this.repository.upsertCoupangSettings(organizationId, input);
  }

  resolveCoupangCredentials(organizationId: string): Promise<CoupangCredentials> {
    return this.repository.resolveCoupangCredentials(organizationId);
  }

  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow> {
    return this.repository.ensureRocketAccount(organizationId);
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
