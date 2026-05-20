export const AI_GENERATION_CANCELLATION_PORT = Symbol(
  'AiGenerationCancellationPort',
);

export interface AiGenerationCancellationTargetResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  operationKey: string | null;
  preserved: boolean;
}

export interface AiDirectJobCancellationTargetResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  jobId: string;
  operationKey: string | null;
  preserved: boolean;
}

export interface AiGenerationCancellationPort {
  cancelContentGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
    notifyProductGenerationParent?: boolean;
  }): Promise<AiGenerationCancellationTargetResult>;

  cancelThumbnailGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
    notifyProductGenerationParent?: boolean;
  }): Promise<AiGenerationCancellationTargetResult>;

  cancelImageEditJob(input: {
    organizationId: string;
    jobId: string;
    actorUserId: string | null;
    reason: string;
  }): Promise<AiDirectJobCancellationTargetResult>;
}
