import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import type {
  AttemptMcpActionsPort,
  AttemptMcpBinding,
} from '../../../application/port/in/mcp/attempt-mcp-actions.port';
import { attemptMcpToolResult, AttemptMcpToolResultSchema } from './attempt-mcp-tool-result';
import { AttemptMcpWireInputSchemas } from './attempt-mcp-wire-contract';

/** Creates one modern MCP instance bound to an already admitted Attempt. */
export function createKidItemAgentOsMcpServer(
  actions: AttemptMcpActionsPort,
  binding: AttemptMcpBinding,
  invocationId = randomUUID(),
): McpServer {
  const capturedBinding = immutableBinding(binding);
  const server = new McpServer({ name: 'kiditem-attempt-mcp', version: '2.0.0' });

  server.registerTool('capability_catalog_search', {
    description: 'Discover bounded public capability manifests and strict inputs.',
    inputSchema: AttemptMcpWireInputSchemas.capability_catalog_search,
    outputSchema: AttemptMcpToolResultSchema,
  }, (input) => attemptMcpToolResult(() => actions.catalog({
    binding: capturedBinding,
    query: input.query,
  })));

  server.registerTool('capability_invoke', {
    description: 'Invoke one discovered capability with exact strict input.',
    inputSchema: AttemptMcpWireInputSchemas.capability_invoke,
    outputSchema: AttemptMcpToolResultSchema,
  }, (input) => attemptMcpToolResult(() => actions.invoke({
    invocationId,
    binding: capturedBinding,
    capabilityKey: input.capabilityKey,
    input: input.input,
  })));

  registerInvocationTools(server, actions, capturedBinding);
  server.registerTool('delegate_to_agent', {
    description: 'Delegate a state-changing cross-domain capability to its selected owning Agent.',
    inputSchema: AttemptMcpWireInputSchemas.delegate_to_agent,
    outputSchema: AttemptMcpToolResultSchema,
  }, (input) => attemptMcpToolResult(() => actions.delegate({
    binding: capturedBinding,
    targetAgentKey: input.targetAgentKey,
    objective: input.objective,
    ...(input.capabilityKey === undefined ? {} : {
      capabilityKey: input.capabilityKey,
      input: input.input,
    }),
  })));
  registerChildTools(server, actions, capturedBinding);

  return server;
}

function registerInvocationTools(
  server: McpServer,
  actions: AttemptMcpActionsPort,
  binding: AttemptMcpBinding,
): void {
  for (const action of ['status', 'wait', 'result'] as const) {
    server.registerTool(`invocation_${action}`, {
      description: 'Read or bounded-wait for this Attempt’s exact durable mutation result.',
      inputSchema: AttemptMcpWireInputSchemas[`invocation_${action}`],
      outputSchema: AttemptMcpToolResultSchema,
    }, (input) => attemptMcpToolResult(() => actions.invocation({
      binding,
      action,
      invocationId: input.invocationId,
    })));
  }
}

function registerChildTools(
  server: McpServer,
  actions: AttemptMcpActionsPort,
  binding: AttemptMcpBinding,
): void {
  for (const action of ['status', 'wait', 'result', 'message', 'interrupt'] as const) {
    server.registerTool(`child_${action}`, {
      description: 'Inspect, wait for, or control an exact delegated child Task.',
      inputSchema: AttemptMcpWireInputSchemas[`child_${action}`],
      outputSchema: AttemptMcpToolResultSchema,
    }, (input) => attemptMcpToolResult(() => actions.child({
      binding,
      action,
      childTaskId: input.childTaskId,
      ...(input.message === undefined ? {} : { message: input.message }),
    })));
  }
}

function immutableBinding(binding: AttemptMcpBinding): AttemptMcpBinding {
  const copy: AttemptMcpBinding = {
    ...binding,
    capabilityKeys: Object.freeze([...binding.capabilityKeys]),
  };
  Object.freeze(copy);
  return copy;
}
