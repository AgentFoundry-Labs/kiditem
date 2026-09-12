import { Inject, Injectable } from '@nestjs/common';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  type ChannelAccountListRow,
  type ChannelAccountRepositoryPort,
} from '../port/out/repository/channel-account.repository.port';

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

  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow> {
    return this.repository.ensureRocketAccount(organizationId);
  }
}
