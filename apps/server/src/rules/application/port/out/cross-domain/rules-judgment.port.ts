/** Rules' anti-corruption port for human-originated threshold judgment. */
export const RULES_JUDGMENT_PORT = Symbol('RULES_JUDGMENT_PORT');

export interface RulesJudgmentPort {
  submit(input: {
    organizationId: string;
    actorUserId: string;
    objective: string;
    idempotencyKey: string;
  }): Promise<{
    session: string;
    task: string;
    execution: string;
    operation: string;
  }>;
}
