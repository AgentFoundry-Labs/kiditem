import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../../channels/application/port/in/listing/channel-listing-query.port';
import { Inject,  Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { DashboardFindingsRepositoryPort } from '../../../application/port/out/repository/dashboard-findings.repository.port';

@Injectable()
export class DashboardFindingsRepositoryAdapter implements DashboardFindingsRepositoryPort {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,private readonly prisma: PrismaService) {}

  readRegistrationFailures(organizationId: string) {
    return this.prisma.$transaction(
      (tx) => this.channelListings.readRegistrationFailureCounts(ownerTransaction(tx), { organizationId }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
