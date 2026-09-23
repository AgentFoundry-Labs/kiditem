import type {
  ThumbnailExecutionListingChoice,
  ThumbnailExecutionPrepareResponse,
  ThumbnailExecutionReportRequest,
  ThumbnailExecutionResult,
  ThumbnailExecutionStatus,
  ThumbnailAccountResolutionReason,
} from '@kiditem/shared/thumbnail-execution';
import type { ChannelsThumbnailExecutionPort } from '../../port/in/thumbnail-execution.port';
import type { RepresentativeImageRunnerPort } from '../../port/out/automation/representative-image-runner.port';
import type { ChannelAdapterRegistryPort } from '../../port/out/channel/channel-adapter.port';
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
  THUMBNAIL_UPDATE_IDEMPOTENCY_PREFIX,
  resolveThumbnailAccount,
  thumbnailConfirmationTransition,
  thumbnailProductName,
  thumbnailReportTransition,
  thumbnailUpdateIdempotencyKey,
  type ThumbnailUpdatePayload,
  type ThumbnailUpdateSubject,
} from '../../../domain/registration/thumbnail-update';

export const SERVER_AUTOMATION_BLOCKED_MESSAGE = '스테이징/운영에서는 대표이미지를 Chrome 확장 프로그램으로만 반영할 수 있습니다.';
const RECONCILIATION_PENDING = 'representative_image_reconciliation_pending';
const UPLOAD_FAILED = 'representative image upload failed';
const LISTING_BUSY_MESSAGE = '이 listing 에 반영 중인 대표이미지가 있습니다';
const LIVE_MESSAGE = '이 대표이미지는 이미 반영 중입니다';
export const OPERATOR_NOT_APPLIED_MESSAGE = '운영자가 반영되지 않았다고 표시함';

const ACCOUNT_MESSAGES = {
  no_account: '대표이미지를 반영할 수 있는 계정이 없습니다',
  ambiguous_account: '대표이미지를 반영할 수 있는 계정이 여럿입니다 — listing을 고르세요',
  ambiguous_listing: '대표이미지를 반영할 listing 이 여럿입니다 — listing을 고르세요',
} as const satisfies Record<ThumbnailAccountResolutionReason, string>;

/**
 * 대표이미지 몰 반영의 소유자. Content 에서 판매 상품의 대표이미지 자산을 받아 실행 하나를 동결하고, 확장
 * 보고나 개발 서버 runner 결과로 그 실행을 끝낸다. 실행의 정체는 (판매 상품, 계정, 자산)이다(KID-313 W3a).
 */
export class ThumbnailExecutionService implements ChannelsThumbnailExecutionPort {
  constructor(
    private readonly content: ChannelRegistrableThumbnailPort,
    private readonly persistence: ThumbnailExecutionPersistencePort,
    private readonly adapters: ChannelAdapterRegistryPort,
    private readonly integrity: ChannelIntegrityPort,
  ) {}

  async prepare(input: {
    organizationId: string;
    requestedByUserId: string | null;
    salesProductId: string;
    assetId?: string;
    channelListingId?: string;
  }): Promise<ThumbnailExecutionPrepareResponse> {
    const intent = await this.freezeIntent({
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      requestedAssetId: input.assetId ?? null,
      requestedListingId: input.channelListingId ?? null,
    });
    const created = await owned(() => this.persistence.createExecuting({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      channelAccountId: intent.channelAccountId,
      idempotencyKey: thumbnailUpdateIdempotencyKey({ subject: intent.subject, ownerIdempotencyKey: null, nonce: globalThis.crypto.randomUUID() }),
      ownerIdempotencyKey: null,
      requestHash: intent.payloadHash,
      payload: intent.payload,
      payloadHash: intent.payloadHash,
    }));
    if (created.mode === 'listing_conflict') throw new ChannelConflictError(LISTING_BUSY_MESSAGE);
    if (created.mode !== 'created') throw new ChannelConflictError(LIVE_MESSAGE);
    return {
      executionId: created.executionId,
      salesProductId: intent.payload.salesProductId,
      assetId: intent.payload.assetId,
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

  /** 운영자의 "반영됨으로 표시" — 몰 관리자에서 저장한 것을 확인했다. 성공으로 가는 유일한 길이다. */
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
    salesProductId: string;
    assetId?: string | null;
    owner: { ownerIdempotencyKey: string; requestHash: string } | null;
  }): Promise<ThumbnailExecutionResult> {
    // owner 키 재생이 먼저다: 운영 차단 · Content 읽기 · 계정 · 사진이 바뀌어도 기록된 영수증을 돌려준다.
    const { owner } = input;
    if (owner) {
      const recorded = await owned(() => this.persistence.findOwnerReplay({
        organizationId: input.organizationId,
        idempotencyKey: `${THUMBNAIL_UPDATE_IDEMPOTENCY_PREFIX}${owner.ownerIdempotencyKey}`,
        ownerIdempotencyKey: owner.ownerIdempotencyKey,
        requestHash: owner.requestHash,
        salesProductId: input.salesProductId,
      }));
      if (recorded) return replayReceipt(recorded);
    }
    const intent = await this.freezeIntent({
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      requestedAssetId: input.assetId ?? null,
      requestedListingId: null,
    });
    // runner 는 그 계정 채널의 어댑터가 들고 있다. 없거나 운영에서 막혔으면 실행을 만들지 않는다.
    const runner = this.adapters.get(intent.channel).representativeImage;
    if (!runner || runner.isBlocked()) throw new ChannelUnavailableError(SERVER_AUTOMATION_BLOCKED_MESSAGE);
    const created = await owned(() => this.persistence.createExecuting({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      channelAccountId: intent.channelAccountId,
      idempotencyKey: thumbnailUpdateIdempotencyKey({
        subject: intent.subject,
        ownerIdempotencyKey: input.owner?.ownerIdempotencyKey ?? null,
        nonce: globalThis.crypto.randomUUID(),
      }),
      ownerIdempotencyKey: input.owner?.ownerIdempotencyKey ?? null,
      requestHash: input.owner?.requestHash ?? intent.payloadHash,
      payload: intent.payload,
      payloadHash: intent.payloadHash,
    }));
    if (created.mode === 'live_conflict') throw new ChannelConflictError(LIVE_MESSAGE);
    if (created.mode === 'listing_conflict') throw new ChannelConflictError(LISTING_BUSY_MESSAGE);
    if (created.mode === 'replay') return replayReceipt(created.execution);

    let outcome: Awaited<ReturnType<RepresentativeImageRunnerPort['upload']>>;
    try {
      outcome = await runner.upload({
        listing: { externalListingId: intent.listingExternalId, productName: intent.payload.productName },
        image: { dataUrl: intent.image.dataUrl, filename: intent.image.filename },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.persistence.applyReport({
        organizationId: input.organizationId,
        executionId: created.executionId,
        transition: thumbnailReportTransition({ outcome: 'uncertain', error: message.slice(0, 2_000) || UPLOAD_FAILED }),
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
    if (applied.mode !== 'applied') throw new ChannelConflictError('representative image execution changed.');
    return toResult(applied.execution);
  }

  async listLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]> {
    const rows = await this.persistence.findLatest({ organizationId: input.organizationId, salesProductIds: [...new Set(input.salesProductIds)] });
    return rows.map((row) => ({
      salesProductId: row.salesProductId,
      assetId: row.assetId,
      executionId: row.id,
      status: row.status,
      providerOutcome: row.providerOutcome,
      checkedAt: (row.completedAt ?? row.updatedAt).toISOString(),
      error: row.lastErrorMessage,
      screenshotPath: row.screenshotPath,
    }));
  }

  async listingChoices(input: { organizationId: string; salesProductId: string }): Promise<ThumbnailExecutionListingChoice[]> {
    const listings = await this.persistence.findListingChoices(input);
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
    const image = await this.content.loadImage({ organizationId: input.organizationId, assetId: payload.assetId });
    if (image.sha256 !== payload.image.sha256) {
      throw new ChannelConflictError('사진이 바뀌어 같은 반영을 다시 보낼 수 없습니다 — 반영 안 됨으로 표시한 뒤 새로 올리세요');
    }
    return {
      executionId: input.executionId,
      salesProductId: payload.salesProductId,
      assetId: payload.assetId,
      productName: payload.productName,
      image: { dataUrl: image.dataUrl, filename: image.filename, mimeType: image.mimeType },
    };
  }

  markNotApplied(input: { organizationId: string; requestedByUserId: string | null; executionId: string }): Promise<ThumbnailExecutionResult> {
    return this.report({ ...input, report: { outcome: 'definitive_failure', error: OPERATOR_NOT_APPLIED_MESSAGE } });
  }

  async dismissFailed(input: { organizationId: string; salesProductId: string }): Promise<{ dismissed: boolean }> {
    return { dismissed: await this.persistence.dismissLatestFailed(input) };
  }

  /**
   * 실행 하나를 얼린다: 판매 상품의 계정 · listing 을 정하고, 올릴 자산을 고른다(요청의 자산 → 그 계정 등록
   * 대상이 고른 자산 → 작업공간의 현재 대표이미지). 자산은 Content 가 그 판매 상품의 것인지 확인한다.
   */
  private async freezeIntent(input: {
    organizationId: string;
    salesProductId: string;
    requestedAssetId: string | null;
    requestedListingId: string | null;
  }): Promise<{
    channelAccountId: string;
    channel: string;
    listingExternalId: string | null;
    subject: ThumbnailUpdateSubject;
    payload: ThumbnailUpdatePayload;
    payloadHash: string;
    image: ThumbnailImagePayload;
  }> {
    const { organizationId, salesProductId } = input;
    const evidence = await owned(() => this.persistence.readAccountEvidence({
      organizationId,
      pickedListingId: input.requestedListingId,
      salesProductId,
    }));
    const account = resolveThumbnailAccount(evidence);
    if (!account.ok) throw new ChannelInputError({ message: ACCOUNT_MESSAGES[account.reason], code: account.reason });
    const productName = thumbnailProductName(evidence.listingChannelName, evidence.salesProductName);
    if (!productName) throw new ChannelInputError('몰 등록 상품명을 찾을 수 없습니다');
    const selectedThumbnailAssetId = input.requestedAssetId
      ?? await this.persistence.findTargetThumbnailAssetId({ organizationId, salesProductId, channelAccountId: account.channelAccountId });
    const thumbnail: RegistrableThumbnail = await this.content.read({ organizationId, salesProductId, selectedThumbnailAssetId });
    const image = await this.content.loadImage({ organizationId, assetId: thumbnail.assetId });
    const frozen = freezeProductRegistrationPayload({
      kind: 'thumbnail_update',
      salesProductId,
      assetId: thumbnail.assetId,
      contentWorkspaceId: thumbnail.contentWorkspaceId,
      channelListingId: evidence.channelListingId,
      productName,
      image: { url: thumbnail.image.url, sha256: image.sha256 },
    } satisfies ThumbnailUpdatePayload as unknown as RegistrationSubmissionJson, (value) => this.integrity.sha256(value));
    return {
      channelAccountId: account.channelAccountId,
      channel: evidence.channelByAccountId[account.channelAccountId]!,
      listingExternalId: evidence.listingExternalId,
      subject: { salesProductId, channelAccountId: account.channelAccountId, assetId: thumbnail.assetId },
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
    salesProductId: row.salesProductId,
    assetId: row.assetId,
    executionId: row.id,
    success,
    status: row.status,
    screenshotPath: row.screenshotPath,
    ...(success ? {} : { error: row.lastErrorMessage ?? UPLOAD_FAILED }),
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
