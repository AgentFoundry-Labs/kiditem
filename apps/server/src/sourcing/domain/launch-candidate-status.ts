/** Gate result a launch candidate freezes for compliance, quality and IP review. */
export const SOURCING_GATE_STATUSES = ['not_evaluated', 'unknown', 'passed', 'blocked'] as const;
export type SourcingGateStatus = (typeof SOURCING_GATE_STATUSES)[number];

/** Whether a launch candidate's landed cost and profit are known. */
export const SOURCING_ECONOMICS_STATUSES = ['unknown', 'known', 'blocked'] as const;
export type SourcingEconomicsStatus =
  (typeof SOURCING_ECONOMICS_STATUSES)[number];
