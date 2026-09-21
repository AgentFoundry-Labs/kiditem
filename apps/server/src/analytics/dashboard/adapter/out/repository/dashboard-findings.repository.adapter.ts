import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { readRejectedListingCounts } from '../../../../../channels/read/mall-listing-errors.reader';
import type {
  DashboardFindingsRepositoryPort,
  RejectedListingCount,
} from '../../../application/port/out/repository/dashboard-findings.repository.port';

@Injectable()
export class DashboardFindingsRepositoryAdapter implements DashboardFindingsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  readRejectedListings(organizationId: string): Promise<RejectedListingCount[]> {
    return this.prisma.$transaction((tx) => readRejectedListingCounts(tx, organizationId));
  }
}
