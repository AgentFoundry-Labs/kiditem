import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * How long an interactive transaction waits for a pooled connection and how
 * long it may run, unless the call names its own budget.
 *
 * Prisma's own defaults are two and five seconds. A dashboard endpoint opens
 * several repeatable-read transactions at once on the adapter's pool of ten
 * connections while a running collection holds connections of its own, so a
 * read queued behind them for two seconds failed with P2028 and answered 500.
 * These are the budgets most owner transactions already pass explicitly.
 */
export const DEFAULT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL!;
    const adapter = new PrismaPg({ connectionString });
    super({ adapter, transactionOptions: DEFAULT_TRANSACTION_OPTIONS });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
