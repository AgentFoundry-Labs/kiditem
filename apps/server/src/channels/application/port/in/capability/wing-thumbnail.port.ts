export const CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT = Symbol(
  'CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT',
);

export interface ChannelsWingThumbnailCapabilityPort {
  submitWingThumbnail(input: {
    organizationId: string;
    generationId: string;
    triggeredByUserId?: string | null;
  }): Promise<{ success: boolean; screenshotPath: string | null }>;
}
