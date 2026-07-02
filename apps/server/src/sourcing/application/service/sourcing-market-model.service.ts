import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  buildSourcingMarketModel,
  isSourcingMarketModelPayload,
  SOURCING_MARKET_MODEL_GENERATOR_VERSION,
  SOURCING_MARKET_MODEL_SOURCE_SCOPES,
  SOURCING_MARKET_MODEL_VERSION,
  type SourcingMarketModelResult,
  type SourcingMarketModelSourceScope,
  type SourcingMarketModelSourceSnapshot,
} from '../../domain/sourcing-market-model';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';

const DEFAULT_MODEL_DAYS = 7;
const MAX_MODEL_DAYS = 30;
const DEFAULT_MODEL_LIMIT = 120;
const MAX_MODEL_LIMIT = 240;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SourcingMarketModelServiceResult {
  generatedAt: string;
  result: SourcingMarketModelResult;
}

@Injectable()
export class SourcingMarketModelService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async run(input: {
    organizationId: string;
    days?: number;
    limit?: number;
  }): Promise<SourcingMarketModelServiceResult> {
    const days = normalizeDays(input.days);
    const limit = normalizeLimit(input.limit);
    const generatedAt = new Date().toISOString();
    const sourceSnapshots = await this.loadSourceSnapshots(input.organizationId, days);
    const result = buildSourcingMarketModel({ snapshots: sourceSnapshots, limit });

    await this.snapshots.upsert({
      organizationId: input.organizationId,
      scope: 'sourcing_market_model',
      businessDate: kstBusinessDate(new Date()),
      payload: createMarketModelSnapshotPayload({ days, limit, generatedAt, result }),
    });

    return { generatedAt, result };
  }

  async latestOrRun(input: {
    organizationId: string;
    days?: number;
    limit?: number;
  }): Promise<SourcingMarketModelServiceResult> {
    const current = await this.loadTodayModel(input.organizationId);
    if (current) return current;
    return this.run(input);
  }

  private async loadTodayModel(organizationId: string): Promise<SourcingMarketModelServiceResult | null> {
    const row = await this.snapshots.find({
      organizationId,
      scope: 'sourcing_market_model',
      businessDate: kstBusinessDate(new Date()),
    });
    if (!row || !isSourcingMarketModelPayload(row.payload)) return null;
    return {
      generatedAt: row.payload.meta.generatedAt,
      result: row.payload.result,
    };
  }

  private async loadSourceSnapshots(
    organizationId: string,
    days: number,
  ): Promise<SourcingMarketModelSourceSnapshot[]> {
    const toBusinessDate = kstBusinessDate(new Date());
    const fromBusinessDate = new Date(toBusinessDate.getTime() - (days - 1) * ONE_DAY_MS);
    const groups = await Promise.all(
      SOURCING_MARKET_MODEL_SOURCE_SCOPES.map((scope) => this.snapshots.listRecent({
        organizationId,
        scope,
        fromBusinessDate,
        toBusinessDate,
        limit: days,
      })),
    );

    return groups
      .flat()
      .map(toMarketModelSourceSnapshot)
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }
}

function normalizeDays(days: number | undefined): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_MODEL_DAYS;
  return Math.max(1, Math.min(MAX_MODEL_DAYS, Math.floor(days)));
}

function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_MODEL_LIMIT;
  return Math.max(1, Math.min(MAX_MODEL_LIMIT, Math.floor(limit)));
}

function toMarketModelSourceSnapshot(row: SourcingWorkspaceSnapshotRow): SourcingMarketModelSourceSnapshot {
  return {
    id: row.id,
    scope: row.scope as SourcingMarketModelSourceScope,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function createMarketModelSnapshotPayload(input: {
  days: number;
  limit: number;
  generatedAt: string;
  result: SourcingMarketModelResult;
}) {
  return {
    version: SOURCING_MARKET_MODEL_VERSION,
    input: {
      days: input.days,
      sourceScopes: [...SOURCING_MARKET_MODEL_SOURCE_SCOPES],
      candidateLimit: input.limit,
    },
    result: input.result,
    meta: {
      generatedAt: input.generatedAt,
      generationSource: 'scheduled',
      generatorVersion: SOURCING_MARKET_MODEL_GENERATOR_VERSION,
    },
  };
}
