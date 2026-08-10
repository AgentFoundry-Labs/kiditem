import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
import {
  buildSourcingAgentRagAnswer,
  buildSourcingAgentRagIndex,
  isSourcingAgentRagIndexPayload,
  matchedSourcingAgentRagTerms,
  retrieveSourcingAgentRag,
  SOURCING_AGENT_RAG_GENERATOR_VERSION,
  SOURCING_AGENT_RAG_INDEX_VERSION,
  SOURCING_AGENT_RAG_SOURCE_SCOPES,
  type SourcingAgentRagDocument,
  type SourcingAgentRagIndex,
  type SourcingAgentRagQueryResult,
  type SourcingAgentRagSourceScope,
  type SourcingAgentRagSourceSnapshot,
} from '../../domain/sourcing-agent-rag';
import { canonicalJson } from '../../domain/sourcing-stable-json';
import type { SourcingWorkspaceEvidenceResult } from '../port/in/capability/sourcing-agent-workspace-capability.port';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
  type SourcingInterestTargetRecord,
  type SourcingInterestTargetRepositoryPort,
} from '../port/out/repository/sourcing-interest-target.repository.port';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRunGraph,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_VALIDATION_REPOSITORY_PORT,
  type SourcingValidationItemRecord,
  type SourcingValidationRepositoryPort,
} from '../port/out/repository/sourcing-validation.repository.port';

const DEFAULT_RAG_DAYS = 7;
const MAX_RAG_DAYS = 30;
const RAG_PROJECTION_VERSION = 'sourcing-rag.v3';
const RAG_SCHEMA_VERSION = 'sourcing-rag.v3' as const;
const RAG_CACHE_TTL_MS = 15 * 60 * 1_000;

export interface SourcingAgentRagRebuildResult {
  generatedAt: string;
  documentCount: number;
  sourceSnapshotCount: number;
  sourceScopes: SourcingAgentRagSourceScope[];
}

export interface SourcingAgentRagQueryServiceResult extends SourcingAgentRagQueryResult {
  index: SourcingAgentRagRebuildResult;
}

export function sourcingRagInputHash(input: {
  organizationId: string;
  days: number;
  recommendationRunId: string | null;
  interestVersions: Array<[id: string, version: number]>;
  validationVersions: Array<[episodeId: string, updatedAt: string]>;
  schemaVersion: typeof RAG_SCHEMA_VERSION;
}): string {
  return createHash('sha256').update(canonicalJson({
    ...input,
    interestVersions: [...input.interestVersions].sort(([left], [right]) => left.localeCompare(right)),
    validationVersions: [...input.validationVersions].sort(([left], [right]) => left.localeCompare(right)),
  })).digest('hex');
}

@Injectable()
export class SourcingAgentRagService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
    @Inject(SOURCING_INTEREST_TARGET_REPOSITORY_PORT)
    private readonly interests: SourcingInterestTargetRepositoryPort,
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendations: SourcingRecommendationRepositoryPort,
    @Inject(SOURCING_VALIDATION_REPOSITORY_PORT)
    private readonly validations: SourcingValidationRepositoryPort,
  ) {}

  async rebuild(organizationId: string, rawDays?: number): Promise<SourcingAgentRagRebuildResult> {
    const days = normalizeDays(rawDays);
    const corpus = await this.loadCorpus(organizationId, days);
    const generatedAt = new Date();
    const index = buildSourcingAgentRagIndex({ snapshots: corpus.snapshots });
    await this.writeIndex({ organizationId, days, inputHash: corpus.inputHash, index, generatedAt });
    return toRebuildResult(index, generatedAt.toISOString());
  }

  async query(input: {
    organizationId: string;
    message: string;
    topK?: number;
    days?: number;
  }): Promise<SourcingAgentRagQueryServiceResult> {
    const message = input.message.trim();
    const days = normalizeDays(input.days);
    const corpus = await this.loadCorpus(input.organizationId, days);
    const current = await this.loadTodayIndex(input.organizationId, corpus.inputHash);
    const indexState = current ?? await this.rebuildAndLoad({
      organizationId: input.organizationId,
      days,
      inputHash: corpus.inputHash,
      snapshots: corpus.snapshots,
    });
    const contexts = retrieveSourcingAgentRag({
      index: indexState.index,
      query: message,
      topK: input.topK,
    });
    const result = buildSourcingAgentRagAnswer({ query: message, contexts, index: indexState.index });
    return {
      ...result,
      index: toRebuildResult(indexState.index, indexState.generatedAt),
    };
  }

  /** Shared normalized corpus for dashboard assistant and future Agent OS use. */
  async loadDocuments(input: {
    organizationId: string;
    days?: number;
  }): Promise<SourcingAgentRagDocument[]> {
    const corpus = await this.loadCorpus(input.organizationId, normalizeDays(input.days));
    return buildSourcingAgentRagIndex({ snapshots: corpus.snapshots }).documents;
  }

  async retrieveWorkspaceEvidence(input: {
    organizationId: string;
    query: string;
    topK?: number;
    days?: number;
  }): Promise<SourcingWorkspaceEvidenceResult> {
    const query = input.query.trim();
    const corpus = await this.loadCorpus(
      input.organizationId,
      normalizeDays(input.days),
    );
    const index = buildSourcingAgentRagIndex({ snapshots: corpus.snapshots });
    const matches = retrieveSourcingAgentRag({
      index,
      query,
      topK: input.topK,
    });
    return {
      inputHash: corpus.inputHash,
      documentCount: index.stats.documentCount,
      documents: matches.map(({ document, score }) => ({
        documentId: document.id,
        title: document.title,
        text: document.text,
        sourceScope: document.sourceScope,
        sourceDate: document.sourceDate,
        sourceSnapshotId: document.sourceSnapshotId,
        matchedTerms: matchedSourcingAgentRagTerms(document, query),
        score,
        metadata: document.metadata,
      })),
      dataGaps: matches.length === 0 ? ['workspace_evidence_not_found'] : [],
    };
  }

  private async rebuildAndLoad(input: {
    organizationId: string;
    days: number;
    inputHash: string;
    snapshots: SourcingAgentRagSourceSnapshot[];
  }): Promise<{ index: SourcingAgentRagIndex; generatedAt: string }> {
    const generatedAt = new Date();
    const index = buildSourcingAgentRagIndex({ snapshots: input.snapshots });
    await this.writeIndex({
      organizationId: input.organizationId,
      days: input.days,
      inputHash: input.inputHash,
      index,
      generatedAt,
    });
    return { index, generatedAt: generatedAt.toISOString() };
  }

  private async writeIndex(input: {
    organizationId: string;
    days: number;
    inputHash: string;
    index: SourcingAgentRagIndex;
    generatedAt: Date;
  }): Promise<void> {
    await this.snapshots.upsert({
      organizationId: input.organizationId,
      scope: 'sourcing_agent_rag',
      businessDate: kstBusinessDate(input.generatedAt),
      projectionVersion: RAG_PROJECTION_VERSION,
      inputHash: input.inputHash,
      expiresAt: new Date(input.generatedAt.getTime() + RAG_CACHE_TTL_MS),
      payload: createRagSnapshotPayload({
        days: input.days,
        generatedAt: input.generatedAt.toISOString(),
        index: input.index,
      }),
    });
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
    if (
      !row
      || !row.expiresAt
      || row.expiresAt.getTime() <= Date.now()
      || !isSourcingAgentRagIndexPayload(row.payload)
    ) {
      return null;
    }
    return {
      index: row.payload.result,
      generatedAt: row.payload.meta.generatedAt,
    };
  }

  private async loadCorpus(
    organizationId: string,
    days: number,
  ): Promise<{ snapshots: SourcingAgentRagSourceSnapshot[]; inputHash: string }> {
    const now = new Date();
    const [run, interests] = await Promise.all([
      this.recommendations.findLatest({ organizationId, now }),
      this.interests.list(organizationId),
    ]);
    const validationItems = run
      ? (await this.validations.listForRun({
          organizationId,
          recommendationRunId: run.id,
          limit: 100,
        })).items
      : [];
    const inputHash = sourcingRagInputHash({
      organizationId,
      days,
      recommendationRunId: run?.id ?? null,
      interestVersions: interests.map((target) => [target.id, target.version]),
      validationVersions: validationItems.map((item) => [
        item.episodeId,
        item.updatedAt.toISOString(),
      ]),
      schemaVersion: RAG_SCHEMA_VERSION,
    });
    const businessDate = kstBusinessDate(now);
    const snapshots = [
      ...(run ? [toRecommendationSnapshot(run)] : []),
      toInterestTargetSnapshot(interests, businessDate),
      ...(run ? [toValidationSnapshot(run, validationItems)] : []),
    ].sort((left, right) => bDate(right).localeCompare(bDate(left)) || left.id.localeCompare(right.id));
    return { snapshots, inputHash };
  }
}

function normalizeDays(days: number | undefined): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_RAG_DAYS;
  return Math.max(1, Math.min(MAX_RAG_DAYS, Math.floor(days)));
}

function toRecommendationSnapshot(run: SourcingRecommendationRunGraph): SourcingAgentRagSourceSnapshot {
  return {
    id: `recommendation-run:${run.id}`,
    scope: 'recommendation_run',
    businessDate: run.businessDate.toISOString().slice(0, 10),
    payload: {
      result: {
        rows: run.items.map((item) => {
          const source = recordValue(item.sourceSnapshot);
          const coupang = recordValue(source.coupang);
          return {
            itemKey: item.itemKey,
            productId: item.matchedCoupangProductId,
            productName: item.displayName,
            title: item.displayName,
            primaryKeyword: stringValue(source.keyword),
            keywords: stringsValue(source.sourceKeywords),
            grade: item.grade,
            score: item.score,
            reasons: item.reasonCodes,
            risks: item.riskCodes,
            salesLast28d: numberValue(coupang.salesLast28d ?? source.salesLast28d),
            ratingCount: numberValue(coupang.ratingCount ?? source.ratingCount),
            salePrice: numberValue(coupang.salePriceKrw ?? source.salePriceKrw),
          };
        }),
      },
    },
    updatedAt: (run.completedAt ?? run.generatedAt).toISOString(),
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
    scope: 'interest_targets',
    businessDate: businessDate.toISOString().slice(0, 10),
    payload: {
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
    },
    updatedAt: updatedAt.toISOString(),
  };
}

function toValidationSnapshot(
  run: SourcingRecommendationRunGraph,
  items: SourcingValidationItemRecord[],
): SourcingAgentRagSourceSnapshot {
  const versionHash = hashStableJson(items.map((item) => [item.episodeId, item.updatedAt.toISOString()]));
  const updatedAt = items.reduce(
    (latest, item) => latest > item.updatedAt ? latest : item.updatedAt,
    run.completedAt ?? run.generatedAt,
  );
  return {
    id: `validation:${run.id}:${versionHash}`,
    scope: 'validation',
    businessDate: run.businessDate.toISOString().slice(0, 10),
    payload: {
      result: {
        items: items.map(({ updatedAt: _updatedAt, ...item }) => item),
      },
    },
    updatedAt: updatedAt.toISOString(),
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
      generationSource: 'server',
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

function hashStableJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function bDate(snapshot: SourcingAgentRagSourceSnapshot): string {
  return snapshot.businessDate;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringsValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
    : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
