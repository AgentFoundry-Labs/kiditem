import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';
import {
  THUMBNAIL_GENERATION_EVENT_PORT,
  type AppendThumbnailGenerationEventInput,
  type ThumbnailGenerationEventPort,
} from '../port/out/event/thumbnail-generation-event.port';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationAttemptChange,
  type ThumbnailGenerationLedgerRepositoryPort,
  type ThumbnailGenerationStatusChange,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';

type LifecycleStatusInput = Omit<AppendThumbnailGenerationEventInput, 'eventType'> & {
  eventType?: Extract<
    AppendThumbnailGenerationEventInput['eventType'],
    'status_change' | 'phase_change'
  >;
};

@Injectable()
export class ThumbnailGenerationLifecycleService {
  private readonly logger = new Logger(ThumbnailGenerationLifecycleService.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    @Optional()
    @Inject(THUMBNAIL_GENERATION_EVENT_PORT)
    private readonly generationEvents: ThumbnailGenerationEventPort | null = null,
  ) {}

  async recordStatusChange(input: LifecycleStatusInput): Promise<void> {
    await this.appendGenerationEvent({
      ...input,
      eventType: input.eventType ?? 'status_change',
    });
    if (input.fromPhase !== input.toPhase) {
      await this.appendGenerationEvent({
        organizationId: input.organizationId,
        generationId: input.generationId,
        eventType: 'phase_change',
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        fromPhase: input.fromPhase,
        toPhase: input.toPhase,
        attemptNumber: input.attemptNumber,
        actorUserId: input.actorUserId,
        payload: input.payload,
      });
    }
  }

  async recordPhaseChange(
    input: Omit<AppendThumbnailGenerationEventInput, 'eventType'>,
  ): Promise<void> {
    if (input.fromPhase === input.toPhase) return;
    await this.appendGenerationEvent({
      ...input,
      eventType: 'phase_change',
    });
  }

  async markCancelled(input: {
    organizationId: string;
    generationId: string;
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationStatusChange | null> {
    const change = await this.ledger.markGenerationCancelled(
      input.generationId,
      input.organizationId,
    );
    if (!change) return null;
    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: change.fromStatus,
      toStatus: 'cancelled',
      fromPhase: change.fromPhase,
      toPhase: null,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    return change;
  }

  async startAttempt(input: {
    organizationId: string;
    generationId: string;
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const locked = await this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!locked) return null;

    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: locked.fromStatus,
      toStatus: 'running',
      fromPhase: locked.fromPhase,
      toPhase: null,
      attemptNumber: locked.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    await this.appendGenerationEvent({
      organizationId: input.organizationId,
      generationId: input.generationId,
      eventType: 'attempt_started',
      fromStatus: locked.fromStatus,
      toStatus: 'running',
      fromPhase: locked.fromPhase,
      toPhase: null,
      attemptNumber: locked.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });

    return locked;
  }

  async completeLegacyEdit(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputImages: ThumbnailEditorInputImage[];
    inputMeta: unknown;
    editAnalysis: Parameters<
      ThumbnailGenerationLedgerRepositoryPort['replaceLegacyEditResult']
    >[0]['editAnalysis'];
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const completed = await this.ledger.replaceLegacyEditResult({
      generationId: input.generationId,
      organizationId: input.organizationId,
      candidates: input.candidates,
      inputImages: input.inputImages,
      inputMeta: input.inputMeta,
      editAnalysis: input.editAnalysis,
    });
    if (!completed) return null;

    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: completed.fromStatus,
      toStatus: 'succeeded',
      fromPhase: completed.fromPhase,
      toPhase: 'ready',
      attemptNumber: completed.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    await this.appendGenerationEvent({
      organizationId: input.organizationId,
      generationId: input.generationId,
      eventType: 'attempt_finished',
      fromStatus: completed.fromStatus,
      toStatus: 'succeeded',
      fromPhase: completed.fromPhase,
      toPhase: 'ready',
      attemptNumber: completed.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });

    return completed;
  }

  async failRunningGeneration(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const failed = await this.ledger.markGenerationFailed(
      input.generationId,
      input.organizationId,
      input.errorMessage,
    );
    if (!failed) return null;

    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: failed.fromStatus,
      toStatus: 'failed',
      fromPhase: failed.fromPhase,
      toPhase: null,
      attemptNumber: failed.attemptNumber,
      errorMessage: input.errorMessage,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    await this.appendGenerationEvent({
      organizationId: input.organizationId,
      generationId: input.generationId,
      eventType: 'error',
      fromStatus: failed.fromStatus,
      toStatus: 'failed',
      fromPhase: failed.fromPhase,
      toPhase: null,
      attemptNumber: failed.attemptNumber,
      errorMessage: input.errorMessage,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });

    return failed;
  }

  async projectDirectSuccess(input: {
    organizationId: string;
    generationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: unknown;
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const locked = await this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!locked) return null;

    const applied = await this.ledger.projectDirectSuccess({
      generationId: input.generationId,
      organizationId: input.organizationId,
      candidates: input.candidates,
      inputMeta: input.inputMeta,
    });
    if (!applied) return null;

    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: applied.fromStatus,
      toStatus: 'succeeded',
      fromPhase: applied.fromPhase,
      toPhase: 'ready',
      attemptNumber: applied.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    await this.appendGenerationEvent({
      organizationId: input.organizationId,
      generationId: input.generationId,
      eventType: 'attempt_finished',
      fromStatus: applied.fromStatus,
      toStatus: 'succeeded',
      fromPhase: applied.fromPhase,
      toPhase: 'ready',
      attemptNumber: applied.attemptNumber,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    return applied;
  }

  async projectDirectFailure(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
    actorUserId?: string | null;
    payload?: unknown | null;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const locked = await this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!locked) return null;

    const failed = await this.ledger.projectDirectFailure({
      generationId: input.generationId,
      organizationId: input.organizationId,
      errorMessage: input.errorMessage,
    });
    if (!failed) return null;

    await this.recordStatusChange({
      organizationId: input.organizationId,
      generationId: input.generationId,
      fromStatus: failed.fromStatus,
      toStatus: 'failed',
      fromPhase: failed.fromPhase,
      toPhase: null,
      attemptNumber: failed.attemptNumber,
      errorMessage: input.errorMessage,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    await this.appendGenerationEvent({
      organizationId: input.organizationId,
      generationId: input.generationId,
      eventType: 'error',
      fromStatus: failed.fromStatus,
      toStatus: 'failed',
      fromPhase: failed.fromPhase,
      toPhase: null,
      attemptNumber: failed.attemptNumber,
      errorMessage: input.errorMessage,
      actorUserId: input.actorUserId,
      payload: input.payload,
    });
    return failed;
  }

  private async appendGenerationEvent(input: AppendThumbnailGenerationEventInput): Promise<void> {
    if (!this.generationEvents) return;
    try {
      await this.generationEvents.append(input);
    } catch (err) {
      this.logger.warn(
        `ThumbnailGenerationEvent 기록 실패 (generationId=${input.generationId}, type=${input.eventType}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
