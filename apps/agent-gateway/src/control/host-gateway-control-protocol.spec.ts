import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Native Gateway control protocol ownership', () => {
  it('keeps main as a Gateway configuration/signal adapter and puts one poll/outbox lifecycle in the native session', () => {
    const main = readFileSync(resolve(import.meta.dirname, '..', 'main.ts'), 'utf8');
    const session = readFileSync(resolve(import.meta.dirname, 'native-gateway-control-session.ts'), 'utf8');

    expect(main).toContain('NativeGatewayControlSession');
    expect(main).toContain('GatewayCommandDispatcher');
    expect(main).toContain('GatewayEventOutbox');
    expect(main).not.toContain('NativeRunnerControlSession');
    expect(session).toContain('GatewayControlTransport');
    expect(session).not.toContain('lease');
    expect(session).toContain('onPollLoss');
  });

  it('wires one provider-owned Claude session store for history, resume checks, and deletion', () => {
    const main = readFileSync(resolve(import.meta.dirname, '..', 'main.ts'), 'utf8');

    expect(main).toContain('ClaudeProviderSessionStore');
    expect(main).toContain('sessions: claudeSessions');
    expect(main).not.toContain('ClaudeProviderSessionHistoryReader');
  });

  it('wires one installation-local preference store with the descriptor state root and no listener', () => {
    const main = readFileSync(resolve(import.meta.dirname, '..', 'main.ts'), 'utf8');

    expect(main).toContain('ConversationPreferenceStore');
    expect(main).toContain('new ConversationPreferenceStore({ stateRoot: config.stateRoot, platform })');
    expect(main).toContain('preferences });');
    expect(main).not.toContain('listen(');
  });
});
