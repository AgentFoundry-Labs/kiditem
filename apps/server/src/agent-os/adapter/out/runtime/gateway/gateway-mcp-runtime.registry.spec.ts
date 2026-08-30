import { describe, expect, it } from 'vitest';
import {
  GatewayMcpActiveTurnConflictError,
  GatewayMcpActiveTurnInactiveError,
  GatewayMcpProcessRegistrationConflictError,
  GatewayMcpTransportInvalidError,
  GatewayMcpRuntimeRegistry,
} from './gateway-mcp-runtime.registry';

const OWNER = {
  installationId: 'installation-1',
  gatewayInstanceId: 'gateway-1',
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
};
const TOKEN = 'A'.repeat(43);

describe('GatewayMcpRuntimeRegistry', () => {
  it('keeps one registered process token across independent conversations while resolving only their active turn', () => {
    let sequence = 0;
    const registry = new GatewayMcpRuntimeRegistry(() => `execution-${++sequence}`);

    expect(registry.registerProcess({
      installationId: OWNER.installationId,
      gatewayInstanceId: OWNER.gatewayInstanceId,
      mcpTransportToken: TOKEN,
    })).toBe(true);
    expect(registry.registerProcess({
      installationId: OWNER.installationId,
      gatewayInstanceId: OWNER.gatewayInstanceId,
      mcpTransportToken: TOKEN,
    })).toBe(false);
    expect(() => registry.registerProcess({
      installationId: OWNER.installationId,
      gatewayInstanceId: OWNER.gatewayInstanceId,
      mcpTransportToken: 'C'.repeat(43),
    })).toThrow(GatewayMcpProcessRegistrationConflictError);

    const sourcing = registry.activateTurn({ ...OWNER, conversationId: 'conversation-sourcing', turnId: 'turn-1' });
    const merchandising = registry.activateTurn({ ...OWNER, conversationId: 'conversation-merchandising', turnId: 'turn-1' });

    expect(registry.resolveActive(TOKEN, 'conversation-sourcing')).toEqual(sourcing);
    expect(registry.resolveActive(TOKEN, 'conversation-merchandising')).toEqual(merchandising);
    expect(sourcing.executionId).not.toBe(merchandising.executionId);
    expect(() => registry.resolveActive(TOKEN, 'conversation-idle')).toThrow(GatewayMcpActiveTurnInactiveError);
  });

  it('keeps an exact retry idempotent, creates a fresh execution for the next turn, and ignores a stale terminal', () => {
    let sequence = 0;
    const registry = new GatewayMcpRuntimeRegistry(() => `execution-${++sequence}`);
    registry.registerProcess({ ...OWNER, mcpTransportToken: TOKEN });

    const first = registry.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });
    expect(registry.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' })).toEqual(first);
    expect(() => registry.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-2' }))
      .toThrow(GatewayMcpActiveTurnConflictError);

    registry.deactivateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });
    const second = registry.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-2' });
    registry.deactivateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });

    expect(second.executionId).not.toBe(first.executionId);
    expect(registry.resolveActive(TOKEN, 'conversation-1')).toEqual(second);
  });

  it('rejects a previous process token and clears every active turn on replacement or disconnect', () => {
    const registry = new GatewayMcpRuntimeRegistry(() => 'execution-1');
    registry.registerProcess({ ...OWNER, mcpTransportToken: TOKEN });
    registry.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });

    const replacementToken = 'B'.repeat(43);
    expect(registry.registerProcess({
      ...OWNER,
      gatewayInstanceId: 'gateway-2',
      mcpTransportToken: replacementToken,
    })).toBe(true);
    expect(() => registry.authenticate(TOKEN)).toThrow(GatewayMcpTransportInvalidError);
    expect(() => registry.resolveActive(replacementToken, 'conversation-1')).toThrow(GatewayMcpActiveTurnInactiveError);

    registry.activateTurn({ ...OWNER, gatewayInstanceId: 'gateway-2', conversationId: 'conversation-2', turnId: 'turn-1' });
    registry.disconnect('gateway-2');
    expect(() => registry.authenticate(replacementToken)).toThrow(GatewayMcpTransportInvalidError);
    expect(() => registry.resolveActive(replacementToken, 'conversation-2')).toThrow(GatewayMcpTransportInvalidError);
  });

  it('rebuilds empty API process memory from the next authenticated poll registration without storing a session', () => {
    const beforeRestart = new GatewayMcpRuntimeRegistry();
    beforeRestart.registerProcess({ ...OWNER, mcpTransportToken: TOKEN });
    beforeRestart.activateTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });

    const afterRestart = new GatewayMcpRuntimeRegistry();
    expect(() => afterRestart.authenticate(TOKEN)).toThrow(GatewayMcpTransportInvalidError);
    expect(afterRestart.registerProcess({ ...OWNER, mcpTransportToken: TOKEN })).toBe(true);
    expect(afterRestart.authenticate(TOKEN)).toEqual({
      installationId: OWNER.installationId,
      gatewayInstanceId: OWNER.gatewayInstanceId,
    });
    expect(() => afterRestart.resolveActive(TOKEN, 'conversation-1')).toThrow(GatewayMcpActiveTurnInactiveError);
  });
});
