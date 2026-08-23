/** API startup recovery for same-process CopilotKit runs.
 *
 * Only durable work records are reconciled. No provider request, CLI process,
 * or detached runtime is recreated after an API process restart.
 */
export const AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION = Symbol(
  "AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION",
);

export interface AgentAguiStartupRecoveryTransactionPort {
  failInterruptedInlineAguiRuns(input: { limit: number }): Promise<number>;
}
