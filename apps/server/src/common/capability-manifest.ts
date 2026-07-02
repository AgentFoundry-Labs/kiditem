export const CAPABILITY_KINDS = [
  'resource',
  'tool',
  'workflow',
  'sink',
] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export type CapabilityEffect =
  | 'read'
  | 'browser'
  | 'external_io'
  | 'external_write'
  | 'db_write'
  | 'job_enqueue'
  | 'llm'
  | 'cost';

export type CapabilityApproval = 'none' | 'on_write' | 'always';
export type CapabilityIdempotency = 'none' | 'recommended' | 'required';
export type CapabilityVisibility = 'agent' | 'workflow' | 'both';

export interface CapabilityEntrypoint {
  type: 'incoming_port';
  token: string;
}

export interface CapabilityManifest {
  key: string;
  ownerDomain: string;
  kind: CapabilityKind;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  effects: readonly CapabilityEffect[];
  approval: CapabilityApproval;
  idempotency: CapabilityIdempotency;
  visibility: CapabilityVisibility;
  entrypoint: CapabilityEntrypoint;
}

export function defineCapabilities<const T extends readonly CapabilityManifest[]>(
  capabilities: T,
): T {
  return capabilities;
}
