import { describe, expect, it, vi } from 'vitest';
import { createPostgresGlobalSetup } from '../postgres-global-setup';

type StartedPostgres = {
  getConnectionUri: () => string;
  stop: () => Promise<void>;
};

function createStartedPostgres(databaseUrl: string) {
  const stop = vi.fn(async () => undefined);
  const container: StartedPostgres = {
    getConnectionUri: () => databaseUrl,
    stop,
  };

  return { container, stop };
}

describe('Postgres integration global setup orchestration', () => {
  it('starts exactly once and pushes the schema before providing the database URL', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const events: string[] = [];
    const { container } = createStartedPostgres(databaseUrl);
    const startPostgres = vi.fn(async () => container);
    const pushSchema = vi.fn(async (url: string) => {
      events.push(`push:${url}`);
    });
    const provide = vi.fn((key: 'databaseUrl', value: string) => {
      events.push(`provide:${key}:${value}`);
    });

    await createPostgresGlobalSetup({ startPostgres, pushSchema })({ provide });

    expect(startPostgres).toHaveBeenCalledTimes(1);
    expect(pushSchema).toHaveBeenCalledWith(databaseUrl);
    expect(provide).toHaveBeenCalledWith('databaseUrl', databaseUrl);
    expect(events).toEqual([
      `push:${databaseUrl}`,
      `provide:databaseUrl:${databaseUrl}`,
    ]);
  });

  it('stops the container and does not provide a URL when schema setup fails', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const { container, stop } = createStartedPostgres(databaseUrl);
    const setupError = new Error('schema push failed');
    const provide = vi.fn();
    const setup = createPostgresGlobalSetup({
      startPostgres: vi.fn(async () => container),
      pushSchema: vi.fn(async () => {
        throw setupError;
      }),
    });

    await expect(setup({ provide })).rejects.toBe(setupError);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(provide).not.toHaveBeenCalled();
  });

  it('preserves schema setup and cleanup errors when both operations fail', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const { container } = createStartedPostgres(databaseUrl);
    const setupError = new Error('schema push failed');
    const cleanupError = new Error('container stop failed');
    const stop = vi.fn(async () => {
      throw cleanupError;
    });
    container.stop = stop;
    const provide = vi.fn();
    const setup = createPostgresGlobalSetup({
      startPostgres: vi.fn(async () => container),
      pushSchema: vi.fn(async () => {
        throw setupError;
      }),
    });

    let thrown: unknown;
    try {
      await setup({ provide });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([setupError, cleanupError]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(provide).not.toHaveBeenCalled();
  });

  it('returns a teardown that stops the started container', async () => {
    const { container, stop } = createStartedPostgres(
      'postgresql://kiditem_test:secret@localhost:6543/kiditem_test',
    );
    const setup = createPostgresGlobalSetup({
      startPostgres: vi.fn(async () => container),
      pushSchema: vi.fn(),
    });

    const teardown = await setup({ provide: vi.fn() });
    expect(stop).not.toHaveBeenCalled();

    await teardown();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
