import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { CapabilityInvocationService } from '../../../application/service/capability-invocation.service';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../../domain/catalog/final-capability.catalog';
import {
  capabilityDefinitionToCatalogEntry,
  CapabilityInvokeInputSchema,
  CapabilityInvokeOutputSchema,
  CAPABILITY_MCP_TOOL_NAMES,
  CapabilityResultReceiptWireSchema,
  MCP_JSON_SCHEMA_DIALECT,
} from './capability-mcp-wire-contract';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

describe('Capability MCP v2 wire contract', () => {
  it('keeps the exact four-tool surface and a strict transport envelope separate from owner business input', () => {
    expect(CAPABILITY_MCP_TOOL_NAMES).toEqual([
      'capability_catalog_search',
      'capability_invoke',
      'invocation_status',
      'readiness_probe',
    ]);
    expect(CapabilityInvokeInputSchema.safeParse({
      capabilityKey: 'sourcing.inspect',
      input: { keyword: 'blocks' },
    }).success).toBe(true);
    expect(CapabilityInvokeInputSchema.safeParse({
      capabilityKey: 'sourcing.inspect',
      input: {},
      unexpected: true,
    }).success).toBe(false);
    expect(CapabilityResultReceiptWireSchema.safeParse({
      summary: 'completed',
      resourceRefs: [],
      operationRefs: [],
    }).success).toBe(false);
  });

  it('advertises strict owner schemas as JSON Schema 2020-12 and has the owner revalidate business input/output', async () => {
    const sourceDefinition = FINAL_CAPABILITY_DEFINITIONS.find(
      ({ key }) => key === 'sourcing.ingestCandidate',
    );
    expect(sourceDefinition).toBeDefined();
    const catalog = capabilityDefinitionToCatalogEntry(sourceDefinition!);
    expect(catalog.inputSchema).toMatchObject({
      $schema: MCP_JSON_SCHEMA_DIALECT,
      additionalProperties: false,
    });
    expect(catalog.outputSchema).toMatchObject({
      $schema: MCP_JSON_SCHEMA_DIALECT,
      additionalProperties: false,
    });
    expect(JSON.stringify(catalog)).not.toContain('draft-07');
    expect(JSON.stringify(catalog)).not.toContain('#/definitions/');

    const definition = {
      key: 'sourcing.inspectStrict',
      ownerDomain: 'sourcing' as const,
      ownerInputPort: 'sourcing.inspectStrict',
      description: 'test only',
      inputSchema: z.object({ query: z.string() }).strict(),
      outputSchema: z.object({ answer: z.string() }).strict(),
      effects: ['read'] as const,
      approvalRisk: 'none' as const,
      idempotency: 'recommended' as const,
    };
    const owner = { capabilityKey: definition.key, invoke: async () => ({ answer: 'ok', leaked: true }) };
    const service = new CapabilityInvocationService(
      { admit: async () => { throw new Error('reads do not admit'); } } as never,
      {
        resolveDefinition: (key: string) => key === definition.key ? definition : null,
        resolveImplementation: (key: string) => key === definition.key ? owner : null,
      } as never,
    );

    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-1',
      capabilityKey: definition.key,
      input: { query: 'blocks', unexpected: true },
    })).rejects.toMatchObject({ code: 'CAPABILITY_INPUT_INVALID' });
    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-1',
      capabilityKey: definition.key,
      input: { query: 'blocks' },
    })).rejects.toMatchObject({ code: 'OWNER_RESULT_AMBIGUOUS' });
  });

  it('allows metadata omission only for reads and requires requestKey plus actingAgentKey for mutations', async () => {
    const mutation = {
      key: 'sourcing.writeStrict',
      ownerDomain: 'sourcing' as const,
      ownerInputPort: 'sourcing.writeStrict',
      description: 'test only',
      inputSchema: z.object({ title: z.string() }).strict(),
      outputSchema: z.object({ id: z.string() }).strict(),
      effects: ['db_write'] as const,
      approvalRisk: 'low' as const,
      idempotency: 'required' as const,
    };
    const service = new CapabilityInvocationService(
      { admit: async () => { throw new Error('not reached'); } } as never,
      {
        resolveDefinition: () => mutation,
        resolveImplementation: () => ({ capabilityKey: mutation.key, invoke: async () => ({ id: 'x' }) }),
      } as never,
    );
    const base = {
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-1',
      capabilityKey: mutation.key,
      input: { title: 'Draft' },
    };

    await expect(service.invoke(base)).rejects.toMatchObject({ code: 'REQUEST_KEY_REQUIRED' });
    await expect(service.invoke({ ...base, requestKey: 'draft-1' }))
      .rejects.toMatchObject({ code: 'ACTING_AGENT_REQUIRED' });
  });

  it('allows owner output only for a non-durable read, never a durable mutation receipt', () => {
    const result = {
      summary: 'Thumbnail registration completed.',
      resourceRefs: [],
      output: { screenshotPath: '/tmp/host-only/wing-capture.png' },
    };
    const mutation = {
      kind: 'completed' as const,
      invocation: {
        id: '00000000-0000-4000-8000-000000000003',
        status: 'succeeded' as const,
        approvalStatus: 'not_required' as const,
        retryWithSameRequestKey: false,
      },
      result,
    };

    expect(CapabilityInvokeOutputSchema.safeParse(mutation).success).toBe(false);
    expect(CapabilityInvokeOutputSchema.safeParse({ ...mutation, invocation: null }).success).toBe(true);
  });
});
