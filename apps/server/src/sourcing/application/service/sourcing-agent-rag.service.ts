import { Inject, Injectable } from '@nestjs/common';
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

const DEFAULT_RAG_DAYS = 7;
const MAX_RAG_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  ) {}

  async rebuild(organizationId: string, rawDays?: number): Promise<SourcingAgentRagRebuildResult> {
    const days = normalizeDays(rawDays);
    const generatedAt = new Date().toISOString();
    const sourceSnapshots = await this.loadSourceSnapshots(organizationId, days);
    const index = buildSourcingAgentRagIndex({ snapshots: sourceSnapshots });
    const payload = createRagSnapshotPayload({
      days,
      generatedAt,
      index,
    });

    await this.snapshots.upsert({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
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
    const current = await this.loadTodayIndex(input.organizationId);
    const indexState = current ?? await this.rebuildAndLoad(input.organizationId, days);
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
  ): Promise<{ index: SourcingAgentRagIndex; generatedAt: string }> {
    const generatedAt = new Date().toISOString();
    const sourceSnapshots = await this.loadSourceSnapshots(organizationId, days);
    const index = buildSourcingAgentRagIndex({ snapshots: sourceSnapshots });
    await this.snapshots.upsert({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
      payload: createRagSnapshotPayload({ days, generatedAt, index }),
    });
    return { index, generatedAt };
  }

  private async loadTodayIndex(
    organizationId: string,
  ): Promise<{ index: SourcingAgentRagIndex; generatedAt: string } | null> {
    const row = await this.snapshots.find({
      organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(new Date()),
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
    const groups = await Promise.all(
      SOURCING_AGENT_RAG_SOURCE_SCOPES.map((scope) => this.snapshots.listRecent({
        organizationId,
        scope,
        fromBusinessDate,
        toBusinessDate,
        limit: days,
      })),
    );

    return groups
      .flat()
      .map(toRagSourceSnapshot)
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
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
