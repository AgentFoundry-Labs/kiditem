export const AGENT_CATALOG_PORT = Symbol('AGENT_CATALOG_PORT');
/** Catalog management is an HTTP-driving capability, never a controller-owned service. */
export interface AgentCatalogPort {
  listDefinitions(): unknown;
  listSkills(): unknown;
  listInstances(input: { organizationId: string }): unknown;
  listInstanceToolPolicies(input: { organizationId: string; agentInstanceId: string }): Promise<unknown>;
  createInstance(input: Record<string, unknown>): unknown;
  updateInstance(input: Record<string, unknown>): Promise<unknown>;
  upsertInstanceToolPolicy(input: Record<string, unknown>): Promise<unknown>;
}
