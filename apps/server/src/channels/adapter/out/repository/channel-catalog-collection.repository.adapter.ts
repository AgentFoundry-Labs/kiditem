import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelCatalogCollectionChunkRecord,
  ChannelCatalogCollectionRepositoryPort,
  ChannelCatalogCollectionRunRecord,
  ChannelCatalogCollectionWithChunks,
} from '../../../application/port/out/repository/channel-catalog-collection.repository.port';

const CHANNEL = 'coupang';
const SOURCE = 'coupang_wing_catalog_browser';
const PAGE_TYPE = 'catalog_full_snapshot';

type StartInput = Parameters<ChannelCatalogCollectionRepositoryPort['startOrResume']>[0];
type OwnedRunInput = Parameters<
  ChannelCatalogCollectionRepositoryPort['getOwnedRunWithChunks']
>[0];
type PutChunkInput = Parameters<ChannelCatalogCollectionRepositoryPort['putChunk']>[0];
type ErrorInput = Parameters<
  ChannelCatalogCollectionRepositoryPort['recordRecoverableError']
>[0];

type LockedRun = {
  id: string;
  status: string;
};

@Injectable()
export class ChannelCatalogCollectionRepositoryAdapter
implements ChannelCatalogCollectionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async startOrResume(input: StartInput): Promise<ChannelCatalogCollectionRunRecord> {
    await this.assertActiveWingAccount(input.organizationId, input.channelAccountId);

    const existing = await this.findByClientRunKey(input);
    if (existing) return existing;

    try {
      return await this.prisma.channelScrapeRun.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          clientRunKey: input.clientRunKey,
          channel: CHANNEL,
          source: SOURCE,
          pageType: PAGE_TYPE,
          status: 'running',
          parserVersion: input.collectorVersion,
          metaJson: {
            phase: 'discovery',
            collectorVersion: input.collectorVersion,
            createdBy: input.userId,
          },
        },
        select: runSelect,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.findByClientRunKey(input);
      if (!raced) throw error;
      return raced;
    }
  }

  async getOwnedRunWithChunks(
    input: OwnedRunInput,
  ): Promise<ChannelCatalogCollectionWithChunks> {
    const run = await this.prisma.channelScrapeRun.findFirst({
      where: ownedRunWhere(input),
      select: {
        ...runSelect,
        chunks: {
          orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
          select: chunkSelect,
        },
      },
    });
    if (!run) throw new NotFoundException('Coupang catalog collection run not found');
    return run;
  }

  async putChunk(
    input: PutChunkInput,
  ): Promise<{ stored: boolean; chunk: ChannelCatalogCollectionChunkRecord }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedRun[]>`
        SELECT id, status
        FROM channel_scrape_runs
        WHERE id = ${input.runId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND channel_account_id = ${input.channelAccountId}::uuid
          AND channel = ${CHANNEL}
          AND source = ${SOURCE}
        FOR UPDATE
      `;
      const run = locked[0];
      if (!run) {
        throw new NotFoundException('Coupang catalog collection run not found');
      }
      if (run.status !== 'running') {
        throw new ConflictException(
          `Cannot write a chunk after collection is ${run.status}`,
        );
      }

      const existing = await tx.channelScrapeChunk.findFirst({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: input.runId,
          kind: input.kind,
          sequence: input.sequence,
        },
        select: chunkSelect,
      });
      if (existing) {
        if (existing.checksum !== input.checksum) {
          throw new ConflictException(
            'Chunk coordinate already exists with a different checksum',
          );
        }
        return { stored: false, chunk: existing };
      }

      const chunk = await tx.channelScrapeChunk.create({
        data: {
          organizationId: input.organizationId,
          scrapeRunId: input.runId,
          kind: input.kind,
          sequence: input.sequence,
          checksum: input.checksum,
          itemCount: input.itemCount,
          payload: input.payload as Prisma.InputJsonValue,
        },
        select: chunkSelect,
      });
      await tx.channelScrapeRun.update({
        where: { id: input.runId },
        data: {
          rowCount: { increment: input.itemCount },
          errorJson: Prisma.DbNull,
        },
      });
      return { stored: true, chunk };
    });
  }

  async recordRecoverableError(input: ErrorInput): Promise<ChannelCatalogCollectionRunRecord> {
    return this.updateRunningRun(input, {
      errorCount: { increment: 1 },
      errorJson: input.error as Prisma.InputJsonValue,
    });
  }

  async markFailed(input: ErrorInput): Promise<ChannelCatalogCollectionRunRecord> {
    return this.updateRunningRun(input, {
      status: 'failed',
      finishedAt: new Date(),
      errorCount: { increment: 1 },
      errorJson: input.error as Prisma.InputJsonValue,
    });
  }

  private async updateRunningRun(
    input: ErrorInput,
    data: Prisma.ChannelScrapeRunUpdateManyMutationInput,
  ): Promise<ChannelCatalogCollectionRunRecord> {
    const updated = await this.prisma.channelScrapeRun.updateMany({
      where: { ...ownedRunWhere(input), status: 'running' },
      data,
    });
    if (updated.count === 0) {
      const current = await this.prisma.channelScrapeRun.findFirst({
        where: ownedRunWhere(input),
        select: runSelect,
      });
      if (!current) {
        throw new NotFoundException('Coupang catalog collection run not found');
      }
      throw new ConflictException(
        `Cannot update a collection after it is ${current.status}`,
      );
    }
    const run = await this.prisma.channelScrapeRun.findFirst({
      where: ownedRunWhere(input),
      select: runSelect,
    });
    if (!run) throw new NotFoundException('Coupang catalog collection run not found');
    return run;
  }

  private findByClientRunKey(input: StartInput) {
    return this.prisma.channelScrapeRun.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        source: SOURCE,
        clientRunKey: input.clientRunKey,
      },
      select: runSelect,
    });
  }

  private async assertActiveWingAccount(
    organizationId: string,
    channelAccountId: string,
  ): Promise<void> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: channelAccountId, organizationId, status: 'active' },
      select: { channel: true, externalAccountId: true, vendorId: true },
    });
    if (!account) throw new NotFoundException('Active channel account not found');
    if (account.channel !== CHANNEL) {
      throw new BadRequestException(
        'Coupang Wing catalog collection requires a channel=coupang account',
      );
    }
    const externalAccountId = account.externalAccountId?.trim();
    if (!externalAccountId) {
      throw new BadRequestException(
        'Coupang channel account requires a canonical externalAccountId',
      );
    }
    if (account.vendorId?.trim() && account.vendorId.trim() !== externalAccountId) {
      throw new ConflictException(
        'Coupang channel account vendorId conflicts with externalAccountId',
      );
    }
  }
}

const runSelect = {
  id: true,
  organizationId: true,
  channelAccountId: true,
  clientRunKey: true,
  status: true,
  rowCount: true,
  errorCount: true,
  startedAt: true,
  finishedAt: true,
  metaJson: true,
  errorJson: true,
  sourceImportRunId: true,
} as const;

const chunkSelect = {
  id: true,
  kind: true,
  sequence: true,
  checksum: true,
  itemCount: true,
  payload: true,
} as const;

function ownedRunWhere(input: {
  organizationId: string;
  channelAccountId: string;
  runId: string;
}) {
  return {
    id: input.runId,
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    channel: CHANNEL,
    source: SOURCE,
  } as const;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
