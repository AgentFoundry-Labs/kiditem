export const POST_PROMOTION_AI_TRIGGER_PORT = Symbol('POST_PROMOTION_AI_TRIGGER_PORT');

export interface PostPromotionAiTriggerPort {
  /**
   * Triggered by sourcing's promotion use-case after a master is created.
   * Enqueues detail-page + thumbnail AI generation with AI-domain-owned defaults.
   * Fire-and-forget: individual agent enqueue failures do not throw.
   */
  fireForMaster(masterId: string, organizationId: string): Promise<void>;
}
