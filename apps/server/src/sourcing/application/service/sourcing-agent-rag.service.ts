import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
import {
  buildSourcingAgentRagAnswer,
  buildSourcingAgentRagIndex,
  isSourcingAgentRagIndexPayload,
  retrieveSourcingAgentRag,
  SOURCING_AGENT_RAG_GENERATOR_VERSION,
  SOURCING_AGENT_RAG_INDEX_VERSION,
  SOURCING_AGENT_RAG_SOURCE_SCOPES,
  type SourcingAgentRagIndex,
  type SourcingAgentRagQueryResult,
  type SourcingAgentRagSourceScope,
  type SourcingAgentRagSourceSnapshot,
} from '../../domain/sourcing-agent-rag';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
  type SourcingInterestTargetRecord,
  type SourcingInterestTargetRepositoryPort,
} from '../port/out/repository/sourcing-interest-target.repository.port';

const DEFAULT_RAG_DAYS = 7;
const MAX_RAG_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RAG_PROJECTION_VERSION = 'sourcing-agent-rag.v2';

export interface SourcingAgentRagRebuildResult {
  generatedAt: string;
  documentCount: number;
  sourceSnapshotCount: number;
  sourceScopes: SourcingAgentRagSourceScope[];
}

export interface SourcingAgentRagQueryServiceResult extends SourcingAgentRagQueryResult {
  index: SourcingAgentRagRebuildResult;
}

@Injectable()
export class SourcingAgentRagService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
    @Inject(SOURCING_INTEREST_TARGET_REPOSITORY_PORT)
    private readonly interests: SourcingInterestTargetRepositoryPort,
  ) {}

  async rebuild(organizationId: string, rawDays?: number): Promise<SourcingAgentRagRebuildResult> {
    const days = normalizeDays(rawDays);
    const generatedAt = new Date().toISOString();
    const sourceSnapshots = await this.loadSourceSnapshots(organizationId, days);
    const index = buildSourcingAgentRagIndex({ snapshots: sourceSnapshots });
    const inputHash = ragInputHash(days, sourceSnapshots);
    const payload = createRagSnapshotPayload({
      days,
      generatedAt,
      index,
    });

    await this.snapshots.upsert({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
      projectionVersion: RAG_PROJECTION_VERSION,
      inputHash,
      payload,
    });

    return toRebuildResult(index, generatedAt);
  }

  async query(input: {
    organizationId: string;
    message: string;
    topK?: number;
    days?: number;
  }): Promise<SourcingAgentRagQueryServiceResult> {
    const message = input.message.trim();
    const days = normalizeDays(input.days);
    const sourceSnapshots = await this.loadSourceSnapshots(input.organizationId, days);
    const inputHash = ragInputHash(days, sourceSnapshots);
    const current = await this.loadTodayIndex(input.organizationId, inputHash);
    const indexState = current ?? await this.rebuildAndLoad(
      input.organizationId,
      days,
      sourceSnapshots,
      inputHash,
    );
    const contexts = retrieveSourcingAgentRag({
      index: indexState.index,
      query: message,
      topK: input.topK,
    });
    const result = buildSourcingAgentRagAnswer({
      query: message,
      contexts,
      index: indexState.index,
    });

    return {
      ...result,
      index: toRebuildResult(indexState.index, indexState.generatedAt),
    };
  }

  private async rebuildAndLoad(
    organizationId: string,
    days: number,
    sourceSnapshots: SourcingAgentRagSourceSnapshot[],
    inputHash: string,
  ): Promise<{ index: SourcingAgentRagIndex; generatedAt: string }> {
    const generatedAt = new Date().toISOString();
    const index = buildSourcingAgentRagIndex({ snapshots: sourceSnapshots });
    await this.snapshots.upsert({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
      projectionVersion: RAG_PROJECTION_VERSION,
      inputHash,
      payload: createRagSnapshotPayload({ days, generatedAt, index }),
    });
    return { index, generatedAt };
  }

  private async loadTodayIndex(
    organizationId: string,
    inputHash: string,
  ): Promise<{ index: SourcingAgentRagIndex; generatedAt: string } | null> {
    const row = await this.snapshots.find({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
      projectionVersion: RAG_PROJECTION_VERSION,
      inputHash,
    });
    if (!row || !isSourcingAgentRagIndexPayload(row.payload)) return null;
    return {
      index: row.payload.result,
      generatedAt: row.payload.meta.generatedAt,
    };
  }

  private async loadSourceSnapshots(
    organizationId: string,
    days: number,
  ): Promise<SourcingAgentRagSourceSnapshot[]> {
    const toBusinessDate = kstBusinessDate(new Date());
    const fromBusinessDate = new Date(toBusinessDate.getTime() - (days - 1) * ONE_DAY_MS);
    const [groups, interests] = await Promise.all([
      Promise.all(
        SOURCING_AGENT_RAG_SOURCE_SCOPES.map((scope) =>
          scope === 'interest_tracking'
            ? []
            : this.snapshots.listRecent({
                organizationId,
                scope,
                fromBusinessDate,
                toBusinessDate,
                limit: days,
              }),
        ),
      ),
      this.interests.list(organizationId),
    ]);

    return [
      ...groups.flat().map(toRagSourceSnapshot),
      toInterestTargetSnapshot(interests, toBusinessDate),
    ].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }
}

function normalizeDays(days: number | undefined): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_RAG_DAYS;
  return Math.max(1, Math.min(MAX_RAG_DAYS, Math.floor(days)));
}

function toRagSourceSnapshot(row: SourcingWorkspaceSnapshotRow): SourcingAgentRagSourceSnapshot {
  return {
    id: row.id,
    scope: row.scope as SourcingAgentRagSourceScope,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toInterestTargetSnapshot(
  targets: SourcingInterestTargetRecord[],
  businessDate: Date,
): SourcingAgentRagSourceSnapshot {
  const updatedAt = targets.reduce(
    (latest, target) => latest > target.updatedAt ? latest : target.updatedAt,
    new Date(0),
  );
  return {
    id: `interest-targets:${hashStableJson(targets.map((target) => [target.id, target.version]))}`,
    scope: 'interest_tracking',
    businessDate: businessDate.toISOString().slice(0, 10),
    payload: {
      version: 1,
      input: { trackingWindowDays: 1 },
      result: {
        targets: targets.map((target) => ({
          id: target.id,
          type: target.targetType,
          label: target.label,
          source: target.sourceKeys[0] ?? 'manual',
          keyword: target.keyword,
          category: target.category,
          productId: target.productId,
          itemId: target.itemId,
          vendorItemId: target.vendorItemId,
          productName: target.productName,
        })),
        observations: [],
      },
      meta: {
        generatedAt: updatedAt.toISOString(),
        generationSource: 'server',
        generatorVersion: 'sourcing-interest-target.v1',
      },
    },
    updatedAt: updatedAt.toISOString(),
  };
}

function ragInputHash(days: number, snapshots: SourcingAgentRagSourceSnapshot[]): string {
  return hashStableJson({
    days,
    sourceSnapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      scope: snapshot.scope,
      businessDate: snapshot.businessDate,
      updatedAt: snapshot.updatedAt,
    })),
  });
}

function hashStableJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createRagSnapshotPayload(input: {
  days: number;
  generatedAt: string;
  index: SourcingAgentRagIndex;
}) {
  return {
    version: SOURCING_AGENT_RAG_INDEX_VERSION,
    input: {
      days: input.days,
      sourceScopes: [...SOURCING_AGENT_RAG_SOURCE_SCOPES],
      documentLimit: input.index.documents.length,
    },
    result: input.index,
    meta: {
      generatedAt: input.generatedAt,
      generationSource: 'scheduled',
      generatorVersion: SOURCING_AGENT_RAG_GENERATOR_VERSION,
    },
  };
}

function toRebuildResult(index: SourcingAgentRagIndex, generatedAt: string): SourcingAgentRagRebuildResult {
  return {
    generatedAt,
    documentCount: index.stats.documentCount,
    sourceSnapshotCount: index.stats.sourceSnapshotCount,
    sourceScopes: index.stats.sourceScopes,
  };
}
