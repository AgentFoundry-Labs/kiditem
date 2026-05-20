import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  type ChannelAccountRepositoryPort,
} from '../port/out/repository/channel-account.repository.port';

@Injectable()
export class ChannelAccountQueryService {
  constructor(
    @Inject(CHANNEL_ACCOUNT_REPOSITORY_PORT)
    private readonly repository: ChannelAccountRepositoryPort,
  ) {}

  listActive(organizationId: string) {
    return this.repository.listActive(organizationId);
  }
}
