export const INTERACTION_PRODUCT_ANALYTICS_PORT = Symbol('INTERACTION_PRODUCT_ANALYTICS_PORT');

export type InteractionAnalyticsSurface = 'global_panel' | 'agent_os_workspace';
export type InteractionAnalyticsOutcome = 'completed' | 'failed' | 'cancelled';
export type InteractionRendererKind =
  | 'metric_group'
  | 'notice'
  | 'resource_list'
  | 'comparison'
  | 'navigation'
  | 'suggested_replies';

export interface InteractionRunFinishedAnalyticsInput {
  readonly event: 'interaction_run_finished';
  readonly organizationId: string;
  readonly sessionId: string;
  readonly executionId: string;
  readonly agentDefinitionKey: string;
  readonly surface: InteractionAnalyticsSurface;
  readonly durationMs: number;
  readonly outcome: InteractionAnalyticsOutcome;
  readonly rendererKinds: readonly InteractionRendererKind[];
}

export interface InteractionRunFinishedAnalyticsEvent {
  readonly event: 'interaction_run_finished';
  readonly organizationHash: string;
  readonly sessionId: string;
  readonly executionId: string;
  readonly agentDefinitionKey: string;
  readonly surface: InteractionAnalyticsSurface;
  readonly durationMs: number;
  readonly outcome: InteractionAnalyticsOutcome;
  readonly rendererKinds: readonly InteractionRendererKind[];
}

export interface InteractionProductAnalyticsPort {
  record(input: InteractionRunFinishedAnalyticsInput): Promise<boolean>;
}
