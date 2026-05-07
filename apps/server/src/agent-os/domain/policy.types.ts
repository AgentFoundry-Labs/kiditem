import type {
  AgentAuthorizationDecision,
  AgentToolPolicyEffect,
} from './agent-os.types';

export interface EffectiveToolPolicy {
  toolId: string;
  toolKey: string;
  effect: AgentToolPolicyEffect;
  source: 'blueprint' | 'instance' | 'missing';
  approvalMode: 'none' | 'admin' | 'self';
  dryRunMode: 'optional' | 'required' | 'disabled';
  constraints: Record<string, unknown>;
}

export interface AuthorizeToolUseInput {
  organizationId: string;
  agentInstanceId: string;
  toolKey: string;
  requestId?: string | null;
  runId?: string | null;
  requestedByActorType?: string | null;
  requestedByActorId?: string | null;
  requestedByUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  context?: Record<string, unknown>;
}

export interface AuthorizeToolUseResult {
  decision: AgentAuthorizationDecision;
  reasonCode: string;
  reason: string;
  policy: EffectiveToolPolicy;
}

export function resolveToolPolicy(
  blueprint: Pick<EffectiveToolPolicy, 'effect' | 'approvalMode' | 'dryRunMode' | 'constraints'> | null,
  instance: Pick<EffectiveToolPolicy, 'effect' | 'approvalMode' | 'dryRunMode' | 'constraints'> | null,
  toolId: string,
  toolKey: string,
): EffectiveToolPolicy {
  if (instance) {
    return {
      toolId,
      toolKey,
      effect: instance.effect,
      source: 'instance',
      approvalMode: instance.approvalMode,
      dryRunMode: instance.dryRunMode,
      constraints: instance.constraints,
    };
  }
  if (blueprint) {
    return {
      toolId,
      toolKey,
      effect: blueprint.effect,
      source: 'blueprint',
      approvalMode: blueprint.approvalMode,
      dryRunMode: blueprint.dryRunMode,
      constraints: blueprint.constraints,
    };
  }
  return {
    toolId,
    toolKey,
    effect: 'deny',
    source: 'missing',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  };
}

export function decidePolicy(
  policy: EffectiveToolPolicy,
): { decision: AgentAuthorizationDecision; reasonCode: string; reason: string } {
  if (policy.effect === 'allow') {
    return {
      decision: 'allowed',
      reasonCode: 'policy_allow',
      reason: `Tool ${policy.toolKey} allowed by ${policy.source} policy.`,
    };
  }
  if (policy.effect === 'approval_required') {
    return {
      decision: 'approval_required',
      reasonCode: 'policy_approval_required',
      reason: `Tool ${policy.toolKey} requires human approval (${policy.approvalMode}).`,
    };
  }
  return {
    decision: 'denied',
    reasonCode: policy.source === 'missing' ? 'policy_missing' : 'policy_deny',
    reason:
      policy.source === 'missing'
        ? `Tool ${policy.toolKey} has no policy; denied by default.`
        : `Tool ${policy.toolKey} denied by ${policy.source} policy.`,
  };
}
