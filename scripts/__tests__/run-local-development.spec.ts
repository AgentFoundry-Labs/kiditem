import { describe, expect, it } from 'vitest';
import {
  orchestrateLocalDevelopment,
  startLocalServices,
} from '../run-local-development.mjs';

describe('local development orchestration', () => {
  it('runs setup, provider authentication, and services in order', async () => {
    const events: string[] = [];

    await orchestrateLocalDevelopment({
      setup: async () => { events.push('setup'); },
      authenticate: async () => { events.push('auth'); },
      startServices: async () => { events.push('services'); },
    });

    expect(events).toEqual(['setup', 'auth', 'services']);
  });

  it('does not authenticate or start services when setup fails', async () => {
    const events: string[] = [];

    await expect(orchestrateLocalDevelopment({
      setup: async () => { events.push('setup'); throw new Error('setup_failed'); },
      authenticate: async () => { events.push('auth'); },
      startServices: async () => { events.push('services'); },
    })).rejects.toThrow('setup_failed');
    expect(events).toEqual(['setup']);
  });

  it('does not start services when provider authentication fails', async () => {
    const events: string[] = [];

    await expect(orchestrateLocalDevelopment({
      setup: async () => { events.push('setup'); },
      authenticate: async () => { events.push('auth'); throw new Error('auth_failed'); },
      startServices: async () => { events.push('services'); },
    })).rejects.toThrow('auth_failed');
    expect(events).toEqual(['setup', 'auth']);
  });

  it('starts Core and Gateway with complete sibling cleanup policy', async () => {
    let received: { commands: unknown; options: unknown } | undefined;

    await startLocalServices({
      concurrentlyImpl: (commands, options) => {
        received = { commands, options };
        return { result: Promise.resolve([]) } as never;
      },
    });

    expect(received).toEqual({
      commands: [
        { command: 'npm run dev:core', name: 'core' },
        { command: 'npm run dev:gateway', name: 'gateway' },
      ],
      options: {
        prefix: 'name',
        prefixColors: ['cyan', 'magenta'],
        killOthersOn: ['failure', 'success'],
      },
    });
  });
});
