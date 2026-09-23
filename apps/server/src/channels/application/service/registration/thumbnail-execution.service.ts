import type {
  ThumbnailExecutionListingChoice,
  ThumbnailExecutionPrepareResponse,
  ThumbnailExecutionReportRequest,
  ThumbnailExecutionResult,
  ThumbnailExecutionStatus,
} from '@kiditem/shared/thumbnail-execution';
import type { ChannelsThumbnailExecutionPort } from '../../port/in/thumbnail-execution.port';
import type { WingThumbnailRunnerPort } from '../../port/out/automation/wing-thumbnail-runner.port';
import type {
  ChannelRegistrableThumbnailPort,
  RegistrableThumbnail,
  ThumbnailImagePayload,
} from '../../port/out/content/registrable-thumbnail.port';
import type { ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import type {
  ThumbnailExecutionPersistencePort,
  ThumbnailExecutionRow,
} from '../../port/out/persistence/thumbnail-execution.persistence.port';
import { FactConflictError, FactInputError, FactNotFoundError } from '../../../../common/errors/fact-errors';
import {
  ChannelConflictError,
  ChannelInputError,
  ChannelNotFoundError,
  ChannelUnavailableError,
} from '../../../domain/exception/channel-business-error';
import { freezeProductRegistrationPayload, type RegistrationSubmissionJson } from '../../../domain/registration/registration-submission-payload';
import {
  THUMBNAIL_CONFIRMABLE_STATUSES,
  THUMBNAIL_REPORTABLE_STATUSES,
  resolveThumbnailAccount,
  thumbnailConfirmationTransition,
  thumbnailProductName,
  thumbnailReportTransition,
  thumbnailUpdateIdempotencyKey,
  type ThumbnailUpdatePayload,
} from '../../../domain/registration/thumbnail-update';

export const SERVER_AUTOMATION_BLOCKED_MESSAGE = '스테이징/운영 Wing 등록은 Chrome 확장 프로그램으로만 실행할 수 있습니다.';
const RECONCILIATION_PENDING = 'wing_registration_reconciliation_pending';
export const OPERATOR_NOT_APPLIED_MESSAGE = '운영자가 반영되지 않았다고 표시함';

const ACCOUNT_MESSAGES = {
  no_coupang_account: '쿠팡 계정이 없습니다',
  ambiguous_coupang_account: '쿠팡 계정이 여럿입니다 — listing을 고르세요',
  ambiguous_coupang_listing: '쿠팡 listing 이 여럿입니다 — listing을 고르세요',
} as const;

/**
 * 대표이미지 몰 반영의 소유자. Content 에서 승인 사진을 받아 실행 하나를 동결하고, 확장
 * 보고나 개발 서버 runner 결과로 그 실행을 끝낸다.
 */
export class ThumbnailExecutionService implements ChannelsThumbnailExecutionPort {
  constructor(
    private readonly content: ChannelRegistrableThumbnailPort,
    private readonly persistence: ThumbnailExecutionPersistencePort,
    private readonly runner: WingThumbnailRunnerPort,
    private readonly integrity: ChannelIntegrityPort,
  ) {}

  async prepare(input: {
    organizationId: string;
    requestedByUserId: string | null;
    generationId: string;
    channelListingId?: string;
  }): Promise<ThumbnailExecutionPrepareResponse> {
    const intent = await this.freezeIntent(input.organizationId, input.generationId, input.channelListingId ?? null);
    const created = await owned(() => this.persistence.createExecuting({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      channelAccountId: intent.channelAccountId,
      idempotencyKey: thumbnailUpdateIdempotencyKey({ generationId: input.generationId, ownerIdempotencyKey: null, nonce: globalThis.crypto.randomUUID() }),
      ownerIdempotencyKey: null,
      requestHash: intent.payloadHash,
      payload: intent.payload,
      payloadHash: intent.payloadHash,
    }));
    if (created.mode !== 'created') throw new ChannelConflictError('이 썸네일은 이미 반영 중입니다');
    return {
      executionId: created.executionId,
      generationId: input.generationId,
      productName: intent.payload.productName,
      image: { dataUrl: intent.image.dataUrl, filename: intent.image.filename, mimeType: intent.image.mimeType },
    };
  }

  async report(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
    report: ThumbnailExecutionReportRequest;
  }): Promise<ThumbnailExecutionResult> {
    const uploaded = input.report.outcome === 'uploaded_pending_save' ? input.report : null;
    return this.settle({
      organizationId: input.organizationId,
      executionId: input.executionId,
      transition: thumbnailReportTransition(input.report),
      acceptFrom: THUMBNAIL_REPORTABLE_STATUSES,
      screenshotPath: uploaded?.screenshotUrl ?? null,
      externalId: uploaded?.externalId ?? null,
    });
  }

  /** 운영자의 "반영됨으로 표시" — Wing 에서 저장한 것을 확인했다. 성공으로 가는 유일한 길이다. */
  confirmApplied(input: { organizationId: string; requestedByUserId: string | null; executionId: string }): Promise<ThumbnailExecutionResult> {
    return this.settle({
      organizationId: input.organizationId,
      executionId: input.executionId,
      transition: thumbnailConfirmationTransition(),
      acceptFrom: THUMBNAIL_CONFIRMABLE_STATUSES,
      screenshotPath: null,
      externalId: null,
    });
  }

  private async settle(input: Parameters<ThumbnailExecutionPersistencePort['applyReport']>[0]): Promise<ThumbnailExecutionResult> {
    const applied = await this.persistence.applyReport(input);
    if (applied.mode === 'not_found') throw new ChannelNotFoundError('썸네일 반영 실행을 찾을 수 없습니다');
    if (applied.mode === 'rejected') throw new ChannelConflictError(`이 실행은 지금 받을 수 없습니다(${applied.status})`);
    return toResult(applied.execution);
  }

  async runOnServer(input: {
    organizationId: string;
    requestedByUserId: string | null;
    generationId: string;
    owner: { ownerIdempotencyKey: string; requestHash: string } | null;
  }): Promise<ThumbnailExecutionResult> {
    // owner 키 재생이 먼저다: 운영 차단 · Content 읽기 · 계정 · 사진이 바뀌어도 기록된 영수증을 돌려준다.
    const { owner } = input;
    if (owner) {
      const recorded = await owned(() => this.persistence.findOwnerReplay({
        organizationId: input.organizationId,
        idempotencyKey: thumbnailUpdateIdempotencyKey({ generationId: input.generationId, ownerIdempotencyKey: owner.ownerIdempotencyKey, nonce: '' }),
        ownerIdempotencyKey: owner.ownerIdempotencyKey,
        requestHash: owner.requestHash,
        generationId: input.generationId,
      }));
      if (recorded) return replayReceipt(recorded);
    }
    if (this.runner.isBlocked()) throw new ChannelUnavailableError(SERVER_AUTOMATION_BLOCKED_MESSAGE);
    const intent = await this.freezeIntent(input.organizationId, input.generationId, null);
    const created = await owned(() => this.persistence.createExecuting({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      channelAccountId: intent.channelAccountId,
      idempotencyKey: thumbnailUpdateIdempotencyKey({
        generationId: input.generationId,
        ownerIdempotencyKey: input.owner?.ownerIdempotencyKey ?? null,
        nonce: globalThis.crypto.randomUUID(),
      }),
      ownerIdempotencyKey: input.owner?.ownerIdempotencyKey ?? null,
      requestHash: input.owner?.requestHash ?? intent.payloadHash,
      payload: intent.payload,
      payloadHash: intent.payloadHash,
    }));
    if (created.mode === 'live_conflict') throw new ChannelConflictError('이 썸네일은 이미 반영 중입니다');
    if (created.mode === 'replay') return replayReceipt(created.execution);

    let outcome: Awaited<ReturnType<WingThumbnailRunnerPort['upload']>>;
    try {
      outcome = await this.runner.upload({
        productName: intent.payload.productName,
        image: { dataUrl: intent.image.dataUrl, filename: intent.image.filename },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.persistence.applyReport({
        organizationId: input.organizationId,
        executionId: created.executionId,
        transition: thumbnailReportTransition({ outcome: 'uncertain', error: message.slice(0, 2_000) || 'Wing upload failed' }),
        acceptFrom: THUMBNAIL_REPORTABLE_STATUSES,
        screenshotPath: null,
        externalId: null,
      });
      throw error;
    }
    const applied = await this.persistence.applyReport({
      organizationId: input.organizationId,
      executionId: created.executionId,
      transition: thumbnailReportTransition(outcome.outcome === 'uploaded_pending_save'
        ? { outcome: 'uploaded_pending_save' }
        : { outcome: 'definitive_failure', error: outcome.error.slice(0, 2_000) || 'Unknown error' }),
      acceptFrom: THUMBNAIL_REPORTABLE_STATUSES,
      screenshotPath: outcome.outcome === 'uploaded_pending_save' ? outcome.screenshotPath : null,
      externalId: null,
    });
    if (applied.mode !== 'applied') throw new ChannelConflictError('Wing registration execution changed.');
    return toResult(applied.execution);
  }

  async listLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]> {
    const rows = await this.persistence.findLatest({ organizationId: input.organizationId, generationIds: [...new Set(input.generationIds)] });
    return rows.map((row) => ({
      generationId: row.generationId,
      executionId: row.id,
      status: row.status,
      providerOutcome: row.providerOutcome,
      checkedAt: (row.completedAt ?? row.updatedAt).toISOString(),
      error: row.lastErrorMessage,
      screenshotPath: row.screenshotPath,
    }));
  }

  async listingChoices(input: { organizationId: string; generationId: string }): Promise<ThumbnailExecutionListingChoice[]> {
    const thumbnail = await this.content.read(input);
    const listings = await this.persistence.findListingChoices({
      organizationId: input.organizationId,
      salesProductId: thumbnail.salesProductId,
      workspaceListingId: thumbnail.channelListingId,
    });
    return listings.map((listing) => ({
      channelListingId: listing.id,
      channelName: listing.channelName,
      channelAccountName: listing.channelAccountName,
      externalId: listing.externalId,
    }));
  }

  async resend(input: { organizationId: string; executionId: string }): Promise<ThumbnailExecutionPrepareResponse> {
    const live = await this.persistence.readLivePayload(input);
    if (live.mode === 'not_found') throw new ChannelNotFoundError('썸네일 반영 실행을 찾을 수 없습니다');
    if (live.mode === 'finished') throw new ChannelConflictError(`이 실행은 이미 끝났습니다(${live.status})`);
    const { payload } = live;
    const image = await this.content.loadImage({ organizationId: input.organizationId, generationId: payload.generationId, url: payload.image.url });
    if (payload.image.sha256 !== 'legacy' && image.sha256 !== payload.image.sha256) {
      throw new ChannelConflictError('사진이 바뀌어 같은 반영을 다시 보낼 수 없습니다 — 반영 안 됨으로 표시한 뒤 새로 올리세요');
    }
    return {
      executionId: input.executionId,
      generationId: payload.generationId,
      productName: payload.productName,
      image: { dataUrl: image.dataUrl, filename: image.filename, mimeType: image.mimeType },
    };
  }

  markNotApplied(input: { organizationId: string; requestedByUserId: string | null; executionId: string }): Promise<ThumbnailExecutionResult> {
    return this.report({ ...input, report: { outcome: 'definitive_failure', error: OPERATOR_NOT_APPLIED_MESSAGE } });
  }

  async dismissFailed(input: { organizationId: string; generationId: string }): Promise<{ dismissed: boolean }> {
    return { dismissed: await this.persistence.dismissLatestFailed(input) };
  }

  private async freezeIntent(organizationId: string, generationId: string, requestedListingId: string | null): Promise<{
    channelAccountId: string;
    payload: ThumbnailUpdatePayload;
    payloadHash: string;
    image: ThumbnailImagePayload;
  }> {
    const thumbnail: RegistrableThumbnail = await this.content.read({ organizationId, generationId });
    const evidence = await owned(() => this.persistence.readAccountEvidence({
      organizationId,
      pickedListingId: requestedListingId,
      workspaceListingId: thumbnail.channelListingId,
      salesProductId: thumbnail.salesProductId,
    }));
    const account = resolveThumbnailAccount(evidence);
    if (!account.ok) throw new ChannelInputError({ message: ACCOUNT_MESSAGES[account.reason], code: account.reason });
    const productName = thumbnailProductName(evidence.listingChannelName, thumbnail.workspaceDisplayName);
    if (!productName) throw new ChannelInputError('쿠팡 등록 상품명을 찾을 수 없습니다');
    const image = await this.content.loadImage({ organizationId, generationId, url: thumbnail.image.url });
    const frozen = freezeProductRegistrationPayload({
      kind: 'thumbnail_update',
      generationId,
      contentWorkspaceId: thumbnail.contentWorkspaceId,
      salesProductId: thumbnail.salesProductId,
      channelListingId: evidence.channelListingId,
      productName,
      image: { url: thumbnail.image.url, assetId: thumbnail.image.assetId, sha256: image.sha256 },
    } satisfies ThumbnailUpdatePayload as unknown as RegistrationSubmissionJson, (value) => this.integrity.sha256(value));
    return {
      channelAccountId: account.channelAccountId,
      payload: frozen.payload as unknown as ThumbnailUpdatePayload,
      payloadHash: frozen.hash,
      image,
    };
  }
}

/** 올리고 운영자 확인을 기다리는 실행은 그 영수증을 돌려준다. 결과 자체를 모르는 실행만 503 이다. */
function replayReceipt(execution: ThumbnailExecutionRow): ThumbnailExecutionResult {
  if (execution.status === 'reconciling' && execution.lastErrorCode === 'thumbnail_outcome_unknown') {
    throw new ChannelUnavailableError(RECONCILIATION_PENDING);
  }
  if (execution.status === 'executing') throw new ChannelUnavailableError(RECONCILIATION_PENDING);
  return toResult(execution);
}

function toResult(row: ThumbnailExecutionRow): ThumbnailExecutionResult {
  const success = row.status === 'succeeded';
  return {
    generationId: row.generationId,
    executionId: row.id,
    success,
    status: row.status,
    screenshotPath: row.screenshotPath,
    ...(success ? {} : { error: row.lastErrorMessage ?? 'Wing upload failed' }),
  };
}

/** 저장소의 fact 오류를 Channels 업무 오류로 옮긴다(HTTP 로는 필터가 옮긴다). */
async function owned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FactNotFoundError) throw new ChannelNotFoundError(error.message);
    if (error instanceof FactConflictError) throw new ChannelConflictError(error.message);
    if (error instanceof FactInputError) throw new ChannelInputError(error.message);
    throw error;
  }
}
