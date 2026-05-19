export const THUMBNAIL_GENERATION_EVENT_PORT = Symbol('THUMBNAIL_GENERATION_EVENT_PORT');

export type ThumbnailGenerationEventType =
  | 'status_change'
  | 'phase_change'
  | 'attempt_started'
  | 'attempt_finished'
  | 'error';

export interface AppendThumbnailGenerationEventInput {
  organizationId: string;
  generationId: string;
  eventType: ThumbnailGenerationEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromPhase?: string | null;
  toPhase?: string | null;
  attemptNumber?: number | null;
  errorMessage?: string | null;
  payload?: unknown | null;
  actorUserId?: string | null;
  occurredAt?: Date;
}

export interface ThumbnailGenerationEventPort {
  append(input: AppendThumbnailGenerationEventInput): Promise<void>;
}
