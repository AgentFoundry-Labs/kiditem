export const AI_GENERATION_CANCELLATION_PORT = Symbol(
  'AiGenerationCancellationPort',
);

export interface AiGenerationCancellationTargetResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  preserved: boolean;
}

export interface AiDirectJobCancellationTargetResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  jobId: string;
  preserved: boolean;
}

export interface AiGenerationCancellationPort {
  /** AI 상세 생성(`generated` 상세 페이지)을 멈춘다. `generationId` 는 그 상세 페이지 id. */
  cancelDetailPageGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<AiGenerationCancellationTargetResult>;

  cancelThumbnailGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<AiGenerationCancellationTargetResult>;

  cancelImageEditJob(input: {
    organizationId: string;
    jobId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<AiDirectJobCancellationTargetResult>;
}
