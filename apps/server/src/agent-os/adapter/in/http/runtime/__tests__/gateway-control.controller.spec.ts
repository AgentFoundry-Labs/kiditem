import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import { GatewayControlController } from '../gateway-control.controller';
import { GatewayEventSequenceError } from '../../../../out/runtime/gateway/gateway-event-handler.service';
import { GatewayProcessRegistrationMissingError } from '../../../../out/runtime/gateway/gateway-command.queue';
import {
  GatewayInstallationBearerService,
  GatewayInstallationUnauthorizedError,
} from '../../../../out/runtime/gateway/gateway-installation-bearer.service';

const POLL = {
  kind: 'poll' as const,
  gatewayInstanceId: 'gateway-1',
  platform: 'macos' as const,
  mcpTransportToken: 'A'.repeat(43),
  runtimeTrain: GATEWAY_RUNTIME_TRAIN,
};

describe('GatewayControlController', () => {
  it('acknowledges a new Gateway claim immediately before accepting startup events', async () => {
    const auth = { require: vi.fn() };
    const queue = {
      claim: vi.fn(() => true),
      poll: vi.fn(async () => new Promise<never>(() => undefined)),
      disconnect: vi.fn(),
    };
    const readiness = { clear: vi.fn() };
    const controller = new GatewayControlController(
      auth as never,
      queue as never,
      { handle: vi.fn() } as never,
      readiness as never,
    );

    await expect(controller.poll(
      POLL,
      { headers: {}, once: vi.fn(), off: vi.fn() } as never,
      { writableEnded: false, once: vi.fn() } as never,
    )).resolves.toEqual({ commands: [], apiRuntimeRegistered: true });
    expect(queue.poll).not.toHaveBeenCalled();
    expect(readiness.clear).toHaveBeenCalledOnce();
  });

  it('accepts only the installation bearer, routes a bounded poll, and acknowledges retry-safe events', async () => {
    const auth = { require: vi.fn() };
    const queue = { claim: vi.fn(() => false), poll: vi.fn(async () => ({ commands: [] })), disconnect: vi.fn() };
    const events = { handle: vi.fn(() => ({ eventSeq: 1, accepted: true as const })) };
    const readiness = { clear: vi.fn() };
    const controller = new GatewayControlController(auth as never, queue as never, events as never, readiness as never);
    const request = { headers: { authorization: `Bearer ${'a'.repeat(43)}` }, once: vi.fn(), off: vi.fn() };
    const response = { writableEnded: false, once: vi.fn() };

    await expect(controller.poll(POLL, request as never, response as never)).resolves.toEqual({ commands: [] });
    await expect(controller.event({ gatewayInstanceId: 'gateway-1', eventSeq: 1, events: [{ kind: 'command.ack', commandId: 'command-1' }] }, request as never))
      .resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(auth.require).toHaveBeenCalledWith(request.headers);
    expect(queue.claim).toHaveBeenCalledWith(POLL);
    expect(events.handle).toHaveBeenCalledOnce();
  });

  it('fails closed before queue access when the installation bearer is absent or invalid', async () => {
    const auth = { require: vi.fn(() => { throw new GatewayInstallationUnauthorizedError(); }) };
    const controller = new GatewayControlController(auth as never, { claim: vi.fn(), poll: vi.fn(), disconnect: vi.fn() } as never, { handle: vi.fn() } as never, { clear: vi.fn() } as never);

    await expect(controller.poll(POLL, { headers: {}, once: vi.fn(), off: vi.fn() } as never, { writableEnded: false, once: vi.fn() } as never))
      .rejects.toMatchObject({ status: 401 } satisfies Partial<UnauthorizedException>);
  });

  it('maps an API-restarted event sequence to terminal control conflict rather than retryable 500', async () => {
    const auth = { require: vi.fn() };
    const events = { handle: vi.fn(() => { throw new GatewayEventSequenceError(); }) };
    const controller = new GatewayControlController(auth as never, { claim: vi.fn(), poll: vi.fn(), disconnect: vi.fn() } as never, events as never, { clear: vi.fn() } as never);
    const request = { headers: { authorization: `Bearer ${'a'.repeat(43)}` } };

    await expect(controller.event({ gatewayInstanceId: 'gateway-1', eventSeq: 2, events: [{ kind: 'command.ack', commandId: 'command-1' }] }, request as never))
      .rejects.toMatchObject({ status: 409 });
  });

  it('labels only an unregistered Gateway process event as recoverable by a fresh poll', async () => {
    const auth = { require: vi.fn() };
    const events = { handle: vi.fn(() => { throw new GatewayProcessRegistrationMissingError(); }) };
    const controller = new GatewayControlController(auth as never, { claim: vi.fn(), poll: vi.fn(), disconnect: vi.fn() } as never, events as never, { clear: vi.fn() } as never);
    const request = { headers: { authorization: `Bearer ${'a'.repeat(43)}` } };

    await expect(controller.event({ gatewayInstanceId: 'gateway-1', eventSeq: 2, events: [{ kind: 'command.ack', commandId: 'command-1' }] }, request as never))
      .rejects.toMatchObject({ status: 409, message: 'gateway_process_registration_missing' });
  });
});

describe('GatewayInstallationBearerService', () => {
  it('uses timing-safe installation bearer validation and never treats a browser bearer as a session token', () => {
    const auth = new GatewayInstallationBearerService({ token: 'a'.repeat(43), installationId: 'installation-1' });
    expect(auth.require({ authorization: `Bearer ${'a'.repeat(43)}` })).toBe('installation-1');
    expect(() => auth.require({ authorization: `Bearer ${'b'.repeat(43)}` })).toThrow(GatewayInstallationUnauthorizedError);
    expect(() => auth.require({})).toThrow(GatewayInstallationUnauthorizedError);
  });
});
