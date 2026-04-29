/**
 * Slim-core workflow node-type allowlist for the Marketplace catalog.
 *
 * MUST stay in lockstep with the executor registration list in
 * `apps/server/src/workflows/executors/builtin.ts`. Catalog entries that
 * reference any other node type are hidden from listings (read side) and
 * rejected at install time (write side).
 *
 * Generic DB/HTTP/transform executors are intentionally absent. AI/LLM
 * work is delegated through `agent_task.create` only. Domain-specific
 * executors (e.g. coupang.orders.fetch) must be registered in
 * `builtin.ts` BEFORE being added here.
 *
 * Both consumers — `MarketplaceService` (read-side filter) and
 * `MarketplaceInstallService` (write-side rejection in
 * `automation/application/service/`) — share this single source of
 * truth so the lockstep invariant cannot drift.
 */
export const ALLOWED_WORKFLOW_NODE_TYPES: ReadonlySet<string> = new Set([
  'trigger.manual',
  'trigger.schedule',
  'condition.evaluate',
  'notification.alert',
  'agent_task.create',
]);

export function collectInvalidNodeTypes(nodesJson: unknown): string[] {
  if (!Array.isArray(nodesJson)) return ['<missing nodesJson>'];
  const invalid: string[] = [];
  for (const node of nodesJson) {
    const type = (node as { type?: unknown })?.type;
    if (typeof type !== 'string' || !ALLOWED_WORKFLOW_NODE_TYPES.has(type)) {
      invalid.push(typeof type === 'string' ? type : '<missing type>');
    }
  }
  return [...new Set(invalid)];
}

export function isWorkflowCatalogSlimCoreCompatible(item: { nodesJson: unknown }): boolean {
  return collectInvalidNodeTypes(item.nodesJson).length === 0;
}
