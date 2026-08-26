import type {
  AgentConversationKey,
  ConversationPreferences,
  ConversationRuntime,
  ConversationSummary,
  GatewayReadiness,
} from './conversation-api';

export type TurnPreferenceSelection = {
  model: string | null;
  reasoningEffort: string | null;
  needsReview: boolean;
};

type Pair = { model: string; reasoningEffort: string };
type ReadyGateway = Extract<GatewayReadiness, { ready: true }>;

/** Chooses only an explicitly saved, currently supported model-effort pair. */
export function selectTurnPreference({
  conversation,
  draftContext,
  runtime,
  preferences,
  readiness,
}: {
  conversation: ConversationSummary | null;
  draftContext: AgentConversationKey | null;
  runtime: ConversationRuntime | null;
  preferences: ConversationPreferences | null | undefined;
  readiness: GatewayReadiness[] | null | undefined;
}): TurnPreferenceSelection {
  if (!runtime || !readiness) return { model: null, reasoningEffort: null, needsReview: false };

  const context = conversation?.agentKey ?? draftContext;
  const preference = preferences?.contexts[context ?? 'general']?.[runtime];
  const lastPair = conversation?.lastModel && conversation.lastReasoningEffort
    ? { model: conversation.lastModel, reasoningEffort: conversation.lastReasoningEffort }
    : null;

  if (lastPair && isSupportedConversationPair({ runtime, readiness, ...lastPair })) {
    return { ...lastPair, needsReview: false };
  }
  if (preference && isSupportedConversationPair({ runtime, readiness, ...preference })) {
    return { ...preference, needsReview: false };
  }

  return {
    model: null,
    reasoningEffort: null,
    needsReview: Boolean(lastPair || preference),
  };
}

/** Validates the pair as one unit; callers must never combine two source pairs. */
export function isSupportedConversationPair({
  runtime,
  model,
  reasoningEffort,
  readiness,
}: {
  runtime: ConversationRuntime | null;
  model: string | null;
  reasoningEffort: string | null;
  readiness: GatewayReadiness[] | null | undefined;
}): boolean {
  if (!runtime || !model || !reasoningEffort || !readiness) return false;
  const gateway = readiness.find((candidate): candidate is ReadyGateway => (
    candidate.runtime === runtime && candidate.ready
  ));
  return Boolean(gateway?.readiness.modelReasoningEfforts.some((candidate) => (
    candidate.model === model && candidate.reasoningEfforts.includes(reasoningEffort)
  )));
}

export function readyGatewayForRuntime(
  runtime: ConversationRuntime | null,
  readiness: GatewayReadiness[] | null | undefined,
): ReadyGateway | null {
  if (!runtime || !readiness) return null;
  return readiness.find((candidate): candidate is ReadyGateway => (
    candidate.runtime === runtime && candidate.ready
  )) ?? null;
}
