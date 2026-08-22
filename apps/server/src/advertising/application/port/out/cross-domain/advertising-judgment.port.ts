/** Advertising's anti-corruption port for human-originated Agent OS judgment. */
export const ADVERTISING_JUDGMENT_PORT = Symbol('ADVERTISING_JUDGMENT_PORT');

export interface AdvertisingJudgmentPort {
  submit(input: {
    organizationId: string;
    actorUserId: string;
    objective: string;
    resourceRefs: readonly string[];
    idempotencyKey: string;
  }): Promise<{
    session: string;
    task: string;
    execution: string;
    operation: string;
  }>;
}
