/**
 * Slim-core workflow node-type allowlist.
 *
 * MUST stay in lockstep with the executor registration list in
 * `./builtin.ts`. Catalog entries that reference any other node type are
 * hidden from listings (read side) and rejected at install time
 * (write side).
 *
 * Generic DB/HTTP/transform/Agent/LLM executors are intentionally absent.
 * LLM work starts in Agent OS, which may call deterministic workflow
 * capabilities. Domain-specific deterministic executors must be registered in
 * `builtin.ts` BEFORE being added here.
 *
 * Both consumers — `MarketplaceCatalogService` (read-side filter) and
 * `MarketplaceInstallService` (write-side rejection) — share this
 * single source of truth so the lockstep invariant cannot drift.
 */
export const ALLOWED_WORKFLOW_NODE_TYPES: ReadonlySet<string> = new Set([
  'trigger.manual',
  'trigger.schedule',
  'condition.evaluate',
  'notification.alert',
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
