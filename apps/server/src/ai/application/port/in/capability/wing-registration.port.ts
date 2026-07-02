export const AI_WING_REGISTRATION_CAPABILITY_PORT = Symbol(
  'AI_WING_REGISTRATION_CAPABILITY_PORT',
);

export interface SubmitWingThumbnailInput {
  organizationId: string;
  generationId: string;
  triggeredByUserId?: string | null;
}

export interface SubmitWingThumbnailResult {
  success: boolean;
  screenshotPath: string | null;
}

export interface AiWingRegistrationCapabilityPort {
  submitWingThumbnail(
    input: SubmitWingThumbnailInput,
  ): Promise<SubmitWingThumbnailResult>;
}
