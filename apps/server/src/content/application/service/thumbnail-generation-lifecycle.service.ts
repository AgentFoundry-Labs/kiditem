import { Inject, Injectable } from '@nestjs/common';
import type { ThumbnailEditorCandidate } from '../../domain/model/thumbnail-editor';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationAttemptChange,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/repository/thumbnail-generation-ledger.repository.port';

/**
 * 대표이미지 생성 job 의 상태 전이(KID-313 W3a). 전이 기록 표(`thumbnail_generation_events`)는 없다 — job 행의
 * 상태 · 시도 수 · 오류가 전부다. 성공은 후보 자산 쓰기와 같은 트랜잭션이다(저장소가 보장).
 */
@Injectable()
export class ThumbnailGenerationLifecycleService {
  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
  ) {}

  startAttempt(input: {
    organizationId: string;
    generationId: string;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    return this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
  }

  completeLegacyEdit(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: Record<string, unknown>;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    return this.ledger.replaceLegacyEditResult(input);
  }

  failRunningGeneration(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    return this.ledger.markGenerationFailed(input.generationId, input.organizationId, input.errorMessage);
  }

  async projectDirectSuccess(input: {
    organizationId: string;
    generationId: string;
    candidates: ThumbnailEditorCandidate[];
    projection: Record<string, unknown>;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const locked = await this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!locked) return null;
    return this.ledger.projectDirectSuccess(input);
  }

  async projectDirectFailure(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<ThumbnailGenerationAttemptChange | null> {
    const locked = await this.ledger.claimForDirectProjection({
      generationId: input.generationId,
      organizationId: input.organizationId,
    });
    if (!locked) return null;
    return this.ledger.projectDirectFailure(input);
  }
}
