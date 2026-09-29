import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SaveSourcingKeywordPreferenceCommand,
  SaveSourcingKeywordPreferenceResult,
  SourcingKeywordPreferenceRecord,
  SourcingKeywordPreferenceRepositoryPort,
} from '../../../application/port/out/repository/sourcing-keyword-preference.repository.port';

@Injectable()
export class SourcingKeywordPreferenceRepositoryAdapter
  implements SourcingKeywordPreferenceRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<SourcingKeywordPreferenceRecord[]> {
    const rows = await this.prisma.sourcingKeywordPreference.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { keywordNormalized: 'asc' }],
      take: 1_000,
    });
    return rows.map(toRecord);
  }

  async save(
    command: SaveSourcingKeywordPreferenceCommand,
  ): Promise<SaveSourcingKeywordPreferenceResult> {
    if (command.expectedVersion === 0) {
      try {
        const row = await this.prisma.sourcingKeywordPreference.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            keywordNormalized: command.keywordNormalized,
            displayKeyword: command.displayKeyword,
            excluded: command.excluded,
            version: 1,
          },
        });
        return { kind: 'saved', preference: toRecord(row) };
      } catch (error: unknown) {
        if (!isUniqueConstraint(error)) throw error;
        const current = await this.find(command);
        return { kind: 'version_conflict', currentVersion: current?.version ?? 0 };
      }
    }

    const updated = await this.prisma.sourcingKeywordPreference.updateMany({
      where: {
        organizationId: command.organizationId,
        keywordNormalized: command.keywordNormalized,
        version: command.expectedVersion,
      },
      data: {
        displayKeyword: command.displayKeyword,
        excluded: command.excluded,
        version: { increment: 1 },
      },
    });
    const current = await this.find(command);
    if (updated.count === 0 || !current) {
      return { kind: 'version_conflict', currentVersion: current?.version ?? 0 };
    }
    return { kind: 'saved', preference: current };
  }

  private async find(command: SaveSourcingKeywordPreferenceCommand) {
    const row = await this.prisma.sourcingKeywordPreference.findUnique({
      where: {
        organizationId_keywordNormalized: {
          organizationId: command.organizationId,
          keywordNormalized: command.keywordNormalized,
        },
      },
    });
    return row ? toRecord(row) : null;
  }
}

function toRecord(row: {
  displayKeyword: string;
  excluded: boolean;
  version: number;
  updatedAt: Date;
}): SourcingKeywordPreferenceRecord {
  return {
    keyword: row.displayKeyword,
    excluded: row.excluded,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
