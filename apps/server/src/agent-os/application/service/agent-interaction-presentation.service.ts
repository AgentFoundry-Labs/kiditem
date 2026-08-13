import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InteractionUiResultSchema,
  NavigationResultSchema,
  type InteractionUiResult,
  type NavigationResult,
  type CanonicalResourceRef,
} from '@kiditem/shared/agent-interaction';
import { AgentOsBoundaryError } from '../../domain/agent-os.errors';

type InteractionActor = { organizationId: string; userId: string; sessionId: string | null };
type IssuedNavigation = InteractionActor & NavigationResult;
const NAVIGATION_TTL_MS = 5 * 60_000;
const MAX_OUTSTANDING_ACTIONS = 10_000;
const ROUTE_HREF = {
  dashboard: '/dashboard',
  agent_os: '/agent-os',
  sourcing_recommendations: '/sourcing-ai/recommendations',
  sourcing_candidate: '/sourcing-ai/recommendations',
  inventory_stock_ops: '/stock-ops',
} as const;

@Injectable()
export class AgentInteractionPresentationService {
  private readonly actions = new Map<string, IssuedNavigation>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly issueId: () => string = randomUUID,
    private readonly canAccessCurrentVersion: (
      actor: InteractionActor,
      resourceRef: CanonicalResourceRef,
    ) => boolean = () => false,
  ) {}

  present(actor: InteractionActor, raw: unknown): InteractionUiResult {
    if (!raw || typeof raw !== 'object' || (raw as { kind?: unknown }).kind !== 'navigation') {
      return InteractionUiResultSchema.parse(raw);
    }
    const input = raw as Record<string, unknown>;
    const provisional = NavigationResultSchema.parse({
      ...input,
      actionId: this.issueId(),
      expiresAt: new Date(this.clock().getTime() + NAVIGATION_TTL_MS).toISOString(),
    });
    const permittedKeys = new Set(['kind', 'routeKey', 'resourceRef', 'label', 'disabledReason', 'textFallback']);
    if (Object.keys(input).some((key) => !permittedKeys.has(key))) {
      throw new AgentOsBoundaryError('INTERACTION_PRESENTATION_INVALID');
    }
    if (!this.hasValidResourceScope(provisional)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_RESOURCE_INVALID');
    }
    this.pruneExpiredActions();
    if (this.actions.size >= MAX_OUTSTANDING_ACTIONS) {
      const oldest = this.actions.keys().next().value;
      if (oldest) this.actions.delete(oldest);
    }
    this.actions.set(provisional.actionId, { ...actor, ...provisional });
    return provisional;
  }

  authorize(actor: InteractionActor, actionId: string): { href: string } {
    const action = this.actions.get(actionId);
    if (!action || action.organizationId !== actor.organizationId || action.userId !== actor.userId) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    if (new Date(action.expiresAt).getTime() <= this.clock().getTime()) {
      this.actions.delete(actionId);
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_EXPIRED');
    }
    if (action.disabledReason) throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    if (!this.hasValidResourceScope(action)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    if (action.resourceRef && !this.canAccessCurrentVersion(actor, action.resourceRef)) {
      throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    }
    const href = ROUTE_HREF[action.routeKey as keyof typeof ROUTE_HREF];
    if (!href) throw new AgentOsBoundaryError('INTERACTION_NAVIGATION_NOT_AUTHORIZED');
    return { href };
  }

  private hasValidResourceScope(action: NavigationResult): boolean {
    if (action.routeKey === 'sourcing_candidate') {
      return action.resourceRef?.kind === 'sourcing_candidate' && action.resourceRef.version !== null;
    }
    return action.resourceRef === null;
  }

  private pruneExpiredActions(): void {
    const now = this.clock().getTime();
    for (const [actionId, action] of this.actions) {
      if (new Date(action.expiresAt).getTime() <= now) this.actions.delete(actionId);
    }
  }
}
