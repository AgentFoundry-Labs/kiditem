import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { readRegistrationFailureCounts } from '../../../../../channels/read/registration-execution.reader';
import type { DashboardFindingsRepositoryPort } from '../../../application/port/out/repository/dashboard-findings.repository.port';

@Injectable()
export class DashboardFindingsRepositoryAdapter implements DashboardFindingsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  readRegistrationFailures(organizationId: string) {
    return this.prisma.$transaction(
      (tx) => readRegistrationFailureCounts(tx, { organizationId }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
