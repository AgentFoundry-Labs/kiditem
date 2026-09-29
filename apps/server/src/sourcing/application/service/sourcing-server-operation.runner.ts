import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemError, KiditemInvalidValueError, operatorErrorText } from '@kiditem/shared/errors';
import type { OperationView } from '@kiditem/shared/operation';
import {
  SOURCING_SERVER_CHUNK_KIND,
  type SourcingServerKind,
  type SourcingServerScope,
} from '@kiditem/shared/sourcing-operation';
import { OPERATION_PORT, type OperationPort } from '../../../common/operation/application/port/in/operation.port';
import { SourceRecordDuplicateError } from '../../domain/source-record-admission';
import type { AuthorizedCollectionOutput, SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_SERVER_OPERATION_REPOSITORY_PORT,
  type SourcingCurrentSourcePublication,
  type SourcingServerOperationRecord,
  type SourcingServerOperationRepositoryPort,
  type SourcingSourceTarget,
} from '../port/out/repository/sourcing-server-operation.repository.port';
import { encodeSourceOutput, type SourceOutputHead } from './sourcing-server-output.codec';
import { ALREADY_COLLECTED_CODE } from './source-record-refusal';

export type SourcingSourceAttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

/**
 * 화면·Agent가 읽는 서버 구동 수집 한 번의 모양(옛 attempt 응답 그대로, KID-389). `attemptId`는 실행 id다.
 * 현재 완결(`latestComplete`)은 발행 행에서 만들어 `attemptId`가 그 발행의 `operationId`다.
 */
export interface SourcingSourceAttempt {
  attemptId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  state: SourcingSourceAttemptState;
  expiresAt: Date;
  plan: Record<string, unknown>;
  planChecksum: string;
  contentChecksum: string | null;
  acceptedCount: number;
  warnings?: string[];
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  /** URL 수집이 입장시킨 원본 기록과 같은 커밋에서 만든 그 초안. */
  scrapeUrlResult?: { sourceRecordId: string; salesProductId: string };
  /** 1688 검색: 대상 하나의 결과(성공·실패 모두 실행 result에 남는다). */
  unitResult?: Record<string, unknown>;
}

export interface SourcingSourceStatus {
  ready: boolean;
  latestAttempt: SourcingSourceAttempt | null;
  latestComplete: SourcingSourceAttempt | null;
  actualCutoffAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/** begin 결과. `created`가 false면 같은 요청의 재전송(또는 같은 멱등 키의 실행)이라 IO를 다시 하지 않는다. */
export interface SourcingServerRun {
  attempt: SourcingSourceAttempt;
  created: boolean;
  token: string | null;
}

export type SourcingServerScopeInput = Omit<SourcingServerScope, 'requestIdempotencyKey'>;

const PLAN_INCOMPLETE_CODE = 'SOURCE_PLAN_INCOMPLETE';
const PLAN_INCOMPLETE_MESSAGE = '수집이 요청한 범위를 다 채우지 못해 저장하지 않았습니다.';
const EXPIRED_TEXT = operatorErrorText({ code: 'ATTEMPT_EXPIRED' });

/**
 * 서버 구동 소싱 수집의 실행 계약 쓰기·읽기(KID-389). 서비스가 요청 안에서 `begin` → 공급자 IO → `complete`
 * (`source_output` 청크 → finish succeeded) 또는 `fail`(finish failed)을 부른다. 워커·claim·재시도는 없다.
 * 범위를 다 채우지 못한 출력(rejected>0)은 발행하지 않고 failed로 닫되 실패 단위 결과를 실행 result에 남긴다.
 */
@Injectable()
export class SourcingServerOperationRunner {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Inject(SOURCING_SERVER_OPERATION_REPOSITORY_PORT) private readonly reads: SourcingServerOperationRepositoryPort,
  ) {}

  async begin(input: {
    organizationId: string;
    userId: string | null;
    kind: SourcingServerKind;
    scope: SourcingServerScopeInput;
    requestIdempotencyKey: string;
    /** 계약 멱등 키(없으면 요청 키). 섀도는 KST 날짜 키로 하루 1회를 막는다. */
    operationIdempotencyKey?: string;
  }): Promise<SourcingServerRun> {
    const requestIdempotencyKey = boundedKey(input.requestIdempotencyKey);
    const replay = await this.replay({
      organizationId: input.organizationId,
      kind: input.kind,
      sourceKey: input.scope.sourceKey,
      requestIdempotencyKey,
      requestFingerprint: input.scope.requestFingerprint,
    });
    if (replay) return { attempt: replay, created: false, token: null };
    const begun = await this.operations.begin(input.organizationId, {
      kind: input.kind,
      scope: { ...input.scope, requestIdempotencyKey },
      idempotencyKey: input.operationIdempotencyKey ?? requestIdempotencyKey,
    }, { userId: input.userId });
    return { attempt: toAttempt(fromView(begun.operation)), created: !begun.reused, token: begun.reused ? null : begun.token };
  }

  /**
   * 같은 요청 멱등 키로 이미 연 실행(재전송). 요청 내용(지문)이 다르면 계약과 같은 `idempotency_key_reused`로 거절한다.
   * begin 전에 따로 부르는 곳(URL 수집)은 재전송이면 이미 수집한 원본 확인보다 먼저 그 실행을 돌려준다.
   */
  async replay(input: {
    organizationId: string;
    kind: SourcingServerKind;
    sourceKey: string;
    requestIdempotencyKey: string;
    requestFingerprint: string;
  }): Promise<SourcingSourceAttempt | null> {
    const replay = await this.reads.findByRequestKey({
      organizationId: input.organizationId,
      kind: input.kind,
      sourceKey: input.sourceKey,
      requestIdempotencyKey: boundedKey(input.requestIdempotencyKey),
    });
    if (!replay) return null;
    if (replay.plan.requestFingerprint !== input.requestFingerprint) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'idempotency_key_reused' } });
    }
    return toAttempt(replay);
  }

  /** 원장 출력을 청크로 싣고 finish(succeeded). rejected>0이면 발행 없이 failed로 닫는다(실패 단위 결과 보존). */
  async complete(
    organizationId: string,
    run: SourcingServerRun,
    output: AuthorizedCollectionOutput,
    head: SourceOutputHead,
  ): Promise<SourcingSourceAttempt> {
    const fenced = this.fenced(organizationId, run);
    if (output.rejectedCount > 0) {
      return this.fail(organizationId, run, PLAN_INCOMPLETE_CODE, PLAN_INCOMPLETE_MESSAGE, failedResult(run, output, head));
    }
    try {
      for (const [index, payload] of encodeSourceOutput(output, head).entries()) {
        await this.operations.putChunk({
          ...fenced,
          chunkKind: SOURCING_SERVER_CHUNK_KIND,
          sequence: index + 1,
          request: { checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload },
        });
      }
      const finished = await this.operations.finish({ ...fenced, request: { outcome: 'succeeded' } });
      return toAttempt(fromView(finished.operation));
    } catch (error) {
      const failed = await this.operations.finish({
        ...fenced,
        request: { outcome: 'failed', errorCode: errorCodeOf(error), errorMessage: errorText(error), result: failedResult(run, output, head) },
      }).catch(() => null);
      // 이미 수집한 원본(409로 기존 초안을 알린다)과 뜻밖의 오류는 호출자에게 그대로 던진다.
      if (!failed || error instanceof SourceRecordDuplicateError || !(error instanceof KiditemError)) throw error;
      return toAttempt(fromView(failed.operation));
    }
  }

  async fail(
    organizationId: string,
    run: SourcingServerRun,
    code: string,
    message: string,
    result?: Record<string, unknown>,
  ): Promise<SourcingSourceAttempt> {
    try {
      const finished = await this.operations.finish({
        ...this.fenced(organizationId, run),
        request: { outcome: 'failed', errorCode: code, errorMessage: message.slice(0, 2_000), ...(result ? { result } : {}) },
      });
      return toAttempt(fromView(finished.operation));
    } catch (error) {
      // 이미 닫힌 실행(완료 시도가 먼저 failed로 닫았거나 임대가 끝남)이면 그 끝을 그대로 돌려준다.
      const current = await this.operations.get(organizationId, run.attempt.attemptId);
      if (current && ['succeeded', 'failed', 'cancelled'].includes(current.status)) return toAttempt(fromView(current));
      throw error;
    }
  }

  /** 원장 writer가 받는 permit: 실행 id가 원장의 `operationId`다(확장 kind와 같다). */
  permit(organizationId: string, run: SourcingServerRun): SourcingCollectionPermit {
    return {
      runId: run.attempt.attemptId,
      organizationId,
      sourceKey: run.attempt.sourceKey,
      scopeKey: run.attempt.scopeKey,
      targetKey: run.attempt.targetKey,
      leaseToken: '',
      generation: 1,
      leaseExpiresAt: run.attempt.expiresAt,
    };
  }

  /** 실행 하나(이 kind들 것만). 다른 조직·다른 kind·없는 id면 null. */
  async read(organizationId: string, attemptId: string, kinds: readonly SourcingServerKind[]): Promise<SourcingSourceAttempt | null> {
    const view = await this.operations.get(organizationId, attemptId);
    if (!view || !(kinds as readonly string[]).includes(view.kind)) return null;
    return toAttempt(fromView(view));
  }

  /**
   * 원천·대상 상태: 최신 실행(실패 포함)과 현재 발행. `ready`는 현재 발행의 plan 지문이 지금 plan과 같을 때만이다.
   * 옛 run 시절 발행은 실행이 없어 `latestAttempt` 없이 `latestComplete`만 나온다.
   */
  async readSourceStatus(input: SourcingSourceTarget & { kinds: readonly SourcingServerKind[]; currentPlanChecksum: string }): Promise<SourcingSourceStatus> {
    const target = { organizationId: input.organizationId, sourceKey: input.sourceKey, scopeKey: input.scopeKey, targetKey: input.targetKey };
    const [latest, publication] = await Promise.all([
      this.reads.latestForTarget({ ...target, kinds: input.kinds }),
      this.reads.currentPublication(target),
    ]);
    const latestAttempt = latest ? toAttempt(latest) : null;
    const latestComplete = publication ? publicationAttempt(publication) : null;
    return {
      ready: latestComplete !== null && latestComplete.planChecksum === input.currentPlanChecksum,
      latestAttempt,
      latestComplete,
      actualCutoffAt: publication ? publication.windowEndAt ?? publication.completedAt : null,
      errorCode: latestAttempt?.state === 'FAILED' ? latestAttempt.errorCode : null,
      errorMessage: latestAttempt?.state === 'FAILED' ? latestAttempt.errorMessage : null,
    };
  }

  private fenced(organizationId: string, run: SourcingServerRun) {
    if (!run.token) throw new Error('A replayed server source run has no operation token.');
    return { organizationId, operationId: run.attempt.attemptId, token: run.token };
  }
}

/** 발행하지 못하고 닫는 실행의 result: 건수와 (1688 검색이면) 대상 하나의 결과를 남긴다. */
function failedResult(run: SourcingServerRun, output: AuthorizedCollectionOutput, head: SourceOutputHead): Record<string, unknown> {
  const unitResult = output.qualityReport.unitResult;
  return {
    sourceKey: run.attempt.sourceKey,
    scopeKey: run.attempt.scopeKey,
    targetKey: run.attempt.targetKey,
    discoveredCount: output.discoveredCount,
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: output.rejectedCount,
    contentChecksum: head.contentChecksum,
    ...(isRecord(unitResult) ? { unitResult } : {}),
  };
}

function fromView(view: OperationView): SourcingServerOperationRecord {
  return {
    id: view.id,
    kind: view.kind,
    status: view.status,
    plan: view.plan ?? {},
    result: view.result,
    errorCode: view.errorCode,
    errorMessage: view.errorMessage,
    startedAt: new Date(view.startedAt),
    finishedAt: view.finishedAt ? new Date(view.finishedAt) : null,
    expiresAt: new Date(view.expiresAt),
  };
}

function stateOf(status: string): SourcingSourceAttemptState {
  if (status === 'succeeded') return 'COMPLETE';
  return status === 'failed' || status === 'cancelled' ? 'FAILED' : 'RUNNING';
}

export function toAttempt(record: SourcingServerOperationRecord): SourcingSourceAttempt {
  const state = stateOf(record.status);
  const result = record.result ?? {};
  const expired = state === 'FAILED' && record.errorCode === 'OPERATION_FENCE_LOST' && record.errorMessage === 'expired';
  const scrapeUrlResult = scrapeResult(result.scrapeUrlResult);
  const warnings = stringList(result.warnings);
  return {
    attemptId: record.id,
    sourceKey: String(record.plan.sourceKey ?? ''),
    scopeKey: String(record.plan.scopeKey ?? ''),
    targetKey: String(record.plan.targetKey ?? ''),
    state,
    expiresAt: record.expiresAt,
    plan: record.plan,
    planChecksum: String(record.plan.planChecksum ?? ''),
    contentChecksum: typeof result.contentChecksum === 'string' ? result.contentChecksum : null,
    acceptedCount: typeof result.acceptedCount === 'number' ? result.acceptedCount : 0,
    ...(warnings ? { warnings } : {}),
    errorCode: expired ? 'ATTEMPT_EXPIRED' : record.errorCode,
    errorMessage: expired ? EXPIRED_TEXT : record.errorMessage,
    // 성공은 발행 행과 같은 완료 시각(finalize가 result에 싣는다), 실패는 실행이 닫힌 시각.
    completedAt: state === 'RUNNING' ? null
      : state === 'COMPLETE' && typeof result.completedAt === 'string' ? new Date(result.completedAt) : record.finishedAt,
    ...(state === 'COMPLETE' && scrapeUrlResult ? { scrapeUrlResult } : {}),
    ...(isRecord(result.unitResult) ? { unitResult: result.unitResult } : {}),
  };
}

function publicationAttempt(publication: SourcingCurrentSourcePublication): SourcingSourceAttempt {
  const quality = publication.qualityReport;
  const scrapeUrlResult = scrapeResult(quality.scrapeUrlResult);
  const warnings = stringList(quality.warnings);
  return {
    attemptId: publication.operationId,
    sourceKey: publication.sourceKey,
    scopeKey: publication.scopeKey,
    targetKey: publication.targetKey,
    state: 'COMPLETE',
    expiresAt: publication.completedAt,
    plan: publication.plan,
    planChecksum: typeof quality.planChecksum === 'string' ? quality.planChecksum : '',
    contentChecksum: publication.contentChecksum,
    acceptedCount: publication.acceptedCount,
    ...(warnings ? { warnings } : {}),
    errorCode: null,
    errorMessage: null,
    completedAt: publication.completedAt,
    ...(scrapeUrlResult ? { scrapeUrlResult } : {}),
  };
}

/** 요청 멱등 키: 비었으면 거절, 계약 상한(128자)을 넘으면 같은 키가 늘 같은 값이 되도록 SHA-256으로 줄인다. */
export function boundedKey(value: string): string {
  const key = value.trim();
  if (!key) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'idempotency_key_required' } });
  return key.length <= 128 ? key : createHash('sha256').update(key).digest('hex');
}

function errorCodeOf(error: unknown): string {
  if (error instanceof SourceRecordDuplicateError) return ALREADY_COLLECTED_CODE;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'SOURCE_COLLECTION_FAILED';
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

function scrapeResult(value: unknown): { sourceRecordId: string; salesProductId: string } | undefined {
  const result = value as { sourceRecordId?: unknown; salesProductId?: unknown } | null | undefined;
  return typeof result?.sourceRecordId === 'string' && typeof result.salesProductId === 'string'
    ? { sourceRecordId: result.sourceRecordId, salesProductId: result.salesProductId }
    : undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
